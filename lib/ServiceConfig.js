// npm imports
import { APIGateway } from '@aws-sdk/client-api-gateway';
import Ajv from 'ajv';
import { backOff } from 'exponential-backoff';
import createError from 'http-errors';
import _ from 'lodash';
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

  static getServiceEndpointHandler(
    serviceMap = {},
    serviceConfig = {},
    options
  ) {
    return async ({ config, data, operationId, params, serviceToken }) => {
      // If service failed to resolve on initialization...
      if (
        serviceMap[serviceToken]?.api?.constructor.name !== 'OpenAPIClientAxios'
      ) {
        // ...try to resolve it now.
        if (!serviceConfig[serviceToken])
          throw new Error(`Unknown serviceToken '${serviceToken}'.`);

        const singleMap = await ServiceConfig.getServiceMap(
          _.pick(serviceConfig, [serviceToken]),
          options
        );

        // If service still fails to resolve, throw an error.
        if (
          singleMap[serviceToken]?.api?.constructor.name !==
          'OpenAPIClientAxios'
        )
          throw new Error(`Unable to resolve '${serviceToken}' service.`);

        // Otherwise, cache resolved service.
        serviceMap[serviceToken] = singleMap[serviceToken];
      }

      // Invoke service operation.
      const response = await serviceMap[serviceToken][operationId](
        params,
        data,
        config
      );

      // If response is an error, throw it.
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

  static async getServiceMap(config, options = {}) {
    const serviceConfig = new ServiceConfig(config);
    const serviceTokens = _.keys(config);

    // Resolve & map all services.
    const clients = (
      await Promise.all(
        serviceTokens.map((serviceToken) =>
          serviceConfig.getClient(serviceToken, options)
        )
      )
    ).map(
      // If a service fails to resolve, map service config.
      (client, i) => (_.isEmpty(client) ? config[serviceTokens[i]] : client)
    );

    return _.fromPairs(_.zip(serviceTokens, clients));
  }

  static isMochaRunning(context = global) {
    return [
      'afterEach',
      'after',
      'beforeEach',
      'before',
      'describe',
      'it',
    ].every((fn) => context[fn] instanceof Function);
  }

  #validateServiceToken(serviceToken) {
    if (!this.#config[serviceToken])
      throw new Error(`Unknown serviceToken '${serviceToken}'.`);
  }

  async getClient(serviceToken, options = {}) {
    const definition = this.getOpenapiUrl(serviceToken);
    this.#logger.debug(`Getting '${serviceToken}' client at ${definition}...`);

    try {
      const api = new OpenAPIClientAxios({
        definition,
        axiosConfigDefaults: {
          baseURL: this.getBaseUrl(serviceToken),
          headers: { 'X-Api-Key': await this.getApiKey(serviceToken) },
        },
      });

      const client = await backOff(api.getClient, options);

      this.#logger.debug(`Got '${serviceToken}' client.`);

      return client;
    } catch ({ message }) {
      this.#logger.error(message);
      return {};
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
