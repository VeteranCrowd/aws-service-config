// npm imports
import createError from 'http-errors';
import _ from 'lodash';
import { OpenAPIClientAxios } from 'openapi-client-axios';

// Configure logger.
import { Logger } from '@karmaniverous/edge-logger';
const logger = new Logger({ maxLevel: process.env.LOG_LEVEL });

// AWS Xray instrumentation.
import AWSXray from 'aws-xray-sdk';
import http from 'http';
AWSXray.captureHTTPsGlobal(http);
import https from 'https';
AWSXray.captureHTTPsGlobal(https);
AWSXray.capturePromise();

// lib imports
import wrapInternalHandler from './wrapInternalHandler.js';

export const openapiEndpoint = async ({ data = {}, options = {} }) => {
  const {
    auth,
    definition,
    operationId,
    queryParams = [],
    config = {},
  } = options;

  if (!definition)
    throw new createError.BadRequest('Missing OpenAPI definition');

  if (!operationId)
    throw new createError.BadRequest('Missing OpenAPI operationId');

  if (auth) {
    switch (auth.type) {
      case 'apiKey': {
        config.headers = {
          ...(config.headers ?? {}),
          apiKey: auth.config.apiKey,
        };
        break;
      }
      default:
        throw new createError.BadRequest(
          `Unsupported OpenAPI auth type '${auth.type}'`
        );
    }
  }

  const client = await new OpenAPIClientAxios({ definition }).getClient();
  const response = await client[operationId](
    _.pick(data, queryParams),
    _.omit(data, queryParams),
    { ...config, validateStatus: null }
  );

  if (response.status >= 400) {
    logger.error([
      '*** AXIOS REQUEST DATA ***',
      data,
      '*** AXIOS REQUEST CONFIG ***',
      config,
      '*** AXIOS REQUEST RESPONSE ***',
      response,
    ]);

    const { data: responseData, status, statusText } = response;
    throw new createError(
      status,
      JSON.stringify({ status, statusText, data: responseData })
    );
  }

  return response.data;
};

export const openapiEndpointHandler = wrapInternalHandler(openapiEndpoint);
