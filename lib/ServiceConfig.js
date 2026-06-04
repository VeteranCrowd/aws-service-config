/*
******************* DO NOT EDIT THIS NOTICE *****************
This code and all related intellectual property is owned by
Veteran Crowd Rewards, LLC. It is not to be disclosed, copied
or used without written permission.
*************************************************************
*/

// npm imports
import { APIGateway } from '@aws-sdk/client-api-gateway';
import Ajv from 'ajv';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import createError from 'http-errors';
import _ from 'lodash';
import { OpenAPIClientAxios } from 'openapi-client-axios';
import path from 'path';

const configSchema = {
  type: 'object',
  patternProperties: {
    '^[\\w-]+$': {
      type: 'object',
      properties: {
        apiSubdomain: { type: 'string' },
        apiVersion: { type: 'string' },
        envMap: { type: 'object', additionalProperties: { type: 'string' } },
        openapiPath: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

// Fix #6: Lazily cached APIGateway client (one per region).
let apiGatewayClient;
function getApiGatewayClient() {
  if (!apiGatewayClient) {
    apiGatewayClient = new APIGateway({
      region: process.env.AWS_DEFAULT_REGION,
    });
  }
  return apiGatewayClient;
}

// Fix #7: Cached AJV validator — no need to recompile on every instantiation.
const validate = new Ajv({ strictRequired: true }).compile(configSchema);

// SOLID #6: Namespace globals to avoid collision.
function getGlobalCache() {
  if (!global.__serviceConfig) {
    global.__serviceConfig = { serviceMap: {}, apiKeyCache: {} };
  }
  return global.__serviceConfig;
}

// SOLID #5: Logo pre-processing extracted from handler.
// Candidate for full extraction to caller (e.g. aws-service) in the future.
function transformLogoRequest(data, config) {
  if (!_.isString(data?.logo)) return { data, config };

  const localData = { ...data };
  localData.logo = fs.createReadStream(
    path.join(process.env.LAMBDA_TASK_ROOT, data.logo)
  );

  const localConfig = _.defaultsDeep(
    { headers: { 'Content-Type': 'multipart/form-data' } },
    config
  );

  return { data: localData, config: localConfig };
}

export class ServiceConfig {
  #config;
  #logger;

  constructor(config = {}, logger = console) {
    this.#logger = logger;

    if (!validate(config))
      throw new Error(`Invalid config: ${validate.errors}`);

    this.#config = config;
  }

  // DRY #1: Single helper that validates serviceToken and returns the config entry.
  #getServiceConfig(serviceToken) {
    const entry = this.#config[serviceToken];
    if (!entry) throw new Error(`Unknown serviceToken '${serviceToken}'.`);
    return entry;
  }

  // DRY #2: Resolve env from config envMap.
  #resolveEnv(serviceToken) {
    const { envMap = {} } = this.#getServiceConfig(serviceToken);
    return envMap[process.env.ENV] ?? process.env.ENV;
  }

  // DRY #4: Shared handler implementation for getServiceEndpointHandler and getLibEndpoint.
  static #executeEndpointHandler({
    backoffOptions,
    serviceConfig,
    transformRequest,
    transformResponse,
  }) {
    return async (
      { config, data, operationId, params, serviceToken },
      context,
      logger
    ) => {
      const endpoint = await ServiceConfig.getEndpoint({
        backoffOptions,
        logger,
        operationId,
        serviceConfig,
        serviceToken,
      });

      // Apply optional request transform (e.g. logo pre-processing).
      const transformed = transformRequest
        ? transformRequest({ config, data, params })
        : { config, data, params };

      const response = await endpoint(transformed);

      return transformResponse(response);
    };
  }

  static getServiceEndpointHandler({ serviceConfig, backoffOptions }) {
    return ServiceConfig.#executeEndpointHandler({
      backoffOptions,
      serviceConfig,
      transformRequest: ({ config, data, params }) => {
        const { data: localData, config: localConfig } = transformLogoRequest(
          data,
          config
        );
        return { config: localConfig, data: localData, params };
      },
      transformResponse: (response) => {
        if (response.status >= 400) {
          const { data: responseData, status, statusText } = response;
          throw createError(
            status,
            JSON.stringify({ status, statusText, data: responseData })
          );
        }
        return response.data;
      },
    });
  }

  static getLibEndpoint({ backoffOptions, serviceConfig }) {
    return ServiceConfig.#executeEndpointHandler({
      backoffOptions,
      serviceConfig,
      transformResponse: (response) => _.omit(response, 'config', 'request'),
    });
  }

  static async getEndpoint({
    backoffOptions,
    defaults: {
      config: defaultConfig,
      data: defaultData,
      params: defaultParams,
    } = {},
    logger = console,
    operationId,
    serviceConfig,
    serviceToken,
  }) {
    const cache = getGlobalCache();

    // Validate serviceToken.
    if (!serviceConfig[serviceToken])
      throw new Error(`Unknown serviceToken '${serviceToken}'.`);

    // Fix #2 (TOCTOU) & #7 (reuse instances): Cache the PROMISE, not the
    // result, so concurrent callers share the same in-flight request.
    if (!cache.serviceMap[serviceToken]) {
      const instance = new ServiceConfig(serviceConfig, logger);
      const clientPromise = instance
        .getClient(serviceToken, backoffOptions)
        .catch((err) => {
          // Fix #4: On rejection, delete the cached promise so the next call
          // retries instead of permanently caching a rejected promise.
          delete cache.serviceMap[serviceToken];
          throw err;
        });
      cache.serviceMap[serviceToken] = clientPromise;
    }

    // Fix #4: Let errors propagate — no silent undefined return.
    const client = await cache.serviceMap[serviceToken];

    // Validate operationId.
    if (!client[operationId])
      throw new Error(
        `Unknown operationId '${operationId}' for serviceToken '${serviceToken}'.`
      );

    // Return endpoint.
    return async ({ config, data, params } = {}) => {
      return await client[operationId](
        params || defaultParams
          ? _.defaultsDeep(params ?? {}, defaultParams ?? {})
          : undefined,
        data || defaultData
          ? _.defaultsDeep(data ?? {}, defaultData ?? {})
          : undefined,
        config || defaultConfig
          ? _.defaultsDeep(config ?? {}, defaultConfig ?? {})
          : undefined
      );
    };
  }

  async getClient(serviceToken, backoffOptions = {}) {
    const definition = this.getOpenapiUrl(serviceToken);
    this.#logger.debug(`Getting '${serviceToken}' client at ${definition}...`);

    // Fix #4: Remove try/catch — let errors propagate so Lambda init fails
    // and the instance gets recycled.
    const apiKey = await this.getApiKey(serviceToken);

    const api = new OpenAPIClientAxios({
      definition,
      axiosConfigDefaults: {
        baseURL: this.getBaseUrl(serviceToken),
        headers: { 'X-Api-Key': apiKey },
      },
    });

    // Fix #5: Bind api.getClient so 'this' is not lost.
    const client = await backOff(() => api.getClient(), backoffOptions);

    this.#logger.debug(`Got '${serviceToken}' client.`);

    return client;
  }

  async getApiKey(serviceToken) {
    const cache = getGlobalCache();

    const stackName = this.getStackName(serviceToken);

    if (cache.apiKeyCache[stackName]) {
      return cache.apiKeyCache[stackName];
    }

    this.#logger.debug(`Getting API Key for '${stackName}'...`);

    // Fix #1 & #6: Use cached APIGateway client and wrap in backOff for retry.
    const gateway = getApiGatewayClient();
    const { items: apiKeys } = await backOff(
      () =>
        gateway.getApiKeys({
          includeValues: true,
          nameQuery: stackName,
        }),
      {
        jitter: 'full',
        numOfAttempts: 5,
      }
    );

    if (!apiKeys.length) {
      throw new Error(`Unable to find API Key '${stackName}'.`);
    }

    this.#logger.debug(`Got API Key for '${stackName}'.`);

    cache.apiKeyCache[stackName] = apiKeys[0].value;
    return apiKeys[0].value;
  }

  getBaseUrl(serviceToken) {
    const { apiSubdomain, apiVersion } = this.#getServiceConfig(serviceToken);
    const env = this.#resolveEnv(serviceToken);

    // Supports transition to GHA deployments. Remove other option when complete.
    if (process.env.ENV_DOMAIN)
      return `https://${apiSubdomain}.${process.env.ENV_DOMAIN}/${serviceToken}-${apiVersion}`;

    return `https://${apiSubdomain}.${
      process.env.ROOT_DOMAIN
    }/${serviceToken}-${apiVersion}${
      env === process.env.PROD_ENV_TOKEN ? '' : `-${env}`
    }`;
  }

  getOpenapiUrl(serviceToken) {
    const { openapiPath } = this.#getServiceConfig(serviceToken);

    return `${this.getBaseUrl(serviceToken)}/${openapiPath}`;
  }

  getStackName(serviceToken) {
    const { apiSubdomain, apiVersion } = this.#getServiceConfig(serviceToken);
    const env = this.#resolveEnv(serviceToken);

    return `${apiSubdomain}-${serviceToken}-${apiVersion}-${env}`;
  }
}
