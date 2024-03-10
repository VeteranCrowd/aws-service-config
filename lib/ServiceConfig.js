// npm imports
import { APIGateway } from '@aws-sdk/client-api-gateway';
import Ajv from 'ajv';
import { backOff } from 'exponential-backoff';
import createError from 'http-errors';
import { OpenAPIClientAxios } from 'openapi-client-axios';

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

export class ServiceConfig {
  #config;
  #logger;

  constructor(config = {}, logger = console) {
    this.#logger = logger;

    const validate = new Ajv({ strictRequired: true }).compile(configSchema);
    if (!validate(config))
      throw new Error(`Invalid config: ${validate.errors}`);

    this.#config = config;
  }

  static getServiceEndpointHandler({ serviceConfig, backoffOptions }) {
    return async ({ config, data, operationId, params, serviceToken }) => {
      const endpoint = await ServiceConfig.getEndpoint({
        backoffOptions,
        operationId,
        serviceConfig,
        serviceToken,
      });

      const response = await endpoint({ config, data, params });

      if (response.status >= 400) {
        const { data, status, statusText } = response;
        throw new createError(
          status,
          JSON.stringify({ status, statusText, data })
        );
      }

      // Otherwise, return response data.
      return response.data;
    };
  }

  static async getEndpoint({
    backoffOptions,
    operationId,
    serviceConfig,
    serviceToken,
  }) {
    // Create serviceMap if it doesn't exist.
    if (!global.serviceMap) global.serviceMap = {};

    // Validate serviceToken.
    if (!serviceConfig[serviceToken])
      throw new Error(`Unknown serviceToken '${serviceToken}'.`);

    // Create client if it doesn't exist.
    if (!global.serviceMap[serviceToken]) {
      global.serviceMap[serviceToken] = await new ServiceConfig(
        serviceConfig
      ).getClient(serviceToken, backoffOptions);
    }

    // Undefined client means environment variables not available yet, so return mocked endpoint.
    if (!global.serviceMap[serviceToken]) return async () => ({ data: {} });

    // Validate operationId.
    if (!global.serviceMap[serviceToken]?.[operationId])
      throw new Error(
        `Unknown operationId '${operationId}' for serviceToken '${serviceToken}'.`
      );

    // Return endpoint.
    return async ({ config, data, params } = {}) =>
      await global.serviceMap[serviceToken][operationId](params, data, config);
  }

  #validateServiceToken(serviceToken) {
    if (!this.#config[serviceToken])
      throw new Error(`Unknown serviceToken '${serviceToken}'.`);
  }

  async getClient(serviceToken, backoffOptions = {}) {
    const definition = this.getOpenapiUrl(serviceToken);
    this.#logger.debug(`Getting '${serviceToken}' client at ${definition}...`);

    try {
      const apiKey = await this.getApiKey(serviceToken);

      const api = new OpenAPIClientAxios({
        definition,
        axiosConfigDefaults: {
          baseURL: this.getBaseUrl(serviceToken),
          headers: { 'X-Api-Key': apiKey },
        },
      });

      const client = await backOff(api.getClient, backoffOptions);

      this.#logger.debug(`Got '${serviceToken}' client.`);

      return client;
    } catch (e) {
      this.#logger.error(
        `Error getting client for '${serviceToken}': ${e.message}`
      );
    }
  }

  async getApiKey(serviceToken) {
    const apiGateway = new APIGateway({
      region: process.env.AWS_DEFAULT_REGION,
    });

    const stackName = this.getStackName(serviceToken);
    this.#logger.debug(`Getting API Key for '${stackName}'...`);

    const { items: apiKeys } = await apiGateway.getApiKeys({
      includeValues: true,
      nameQuery: stackName,
    });

    if (!apiKeys.length) {
      throw new Error(`Unable to find API Key '${stackName}'.`);
    }

    this.#logger.debug(`Got API Key for '${stackName}'.`);

    return apiKeys[0].value;
  }

  getBaseUrl(serviceToken) {
    this.#validateServiceToken(serviceToken);

    const {
      apiSubdomain,
      apiVersion,
      envMap = {},
    } = this.#config[serviceToken];

    const env = envMap[process.env.ENV] ?? process.env.ENV;

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
    this.#validateServiceToken(serviceToken);

    const { openapiPath } = this.#config[serviceToken];

    return `${this.getBaseUrl(serviceToken)}/${openapiPath}`;
  }

  getStackName(serviceToken) {
    this.#validateServiceToken(serviceToken);

    const {
      apiSubdomain,
      apiVersion,
      envMap = {},
    } = this.#config[serviceToken];

    return `${apiSubdomain}-${serviceToken}-${apiVersion}-${
      envMap[process.env.ENV] ?? process.env.ENV
    }`;
  }
}
