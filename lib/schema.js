// npm imports
import createError from 'http-errors';
import _ from 'lodash';

// Configure logger.
import { Logger } from '@karmaniverous/edge-logger';
const logger = new Logger({ maxLevel: process.env.LOG_LEVEL });

// lib imports
import bodify from './bodify.js';
import wrapEndpointHandler from './wrapEndpointHandler.js';

export const bodifySchema = (schema) => ({
  type: 'object',
  properties: {
    body: schema,
  },
  required: ['body'],
});

export const openapiTransform = (
  doc,
  { excludeEndpoints, excludeTags, includeEndpoints, includeTags } = {}
) => {
  const result = _.cloneDeep(doc);

  // Validate params.
  if (excludeEndpoints && includeEndpoints)
    throw new createError.BadRequest('Cannot exclude and include endpoints');

  if (excludeTags && includeTags)
    throw new createError.BadRequest('Cannot exclude and include endpoints');

  // Conform params.
  if (excludeEndpoints) excludeEndpoints = excludeEndpoints.split('~');
  if (excludeTags) excludeTags = excludeTags.split('~');
  if (includeEndpoints) includeEndpoints = includeEndpoints.split('~');
  if (includeTags) includeTags = includeTags.split('~');

  result.paths = _.pickBy(
    _.mapValues(result.paths, (methods) =>
      _.mapValues(
        _.mapValues(
          _.pickBy(
            methods,
            (method) =>
              _.isPlainObject(method) &&
              !(
                excludeEndpoints &&
                _.intersection(excludeEndpoints, method.tags).length
              ) &&
              !(
                includeEndpoints &&
                !_.intersection(includeEndpoints, method.tags).length
              )
          )
        ),
        (method) => {
          if (method.tags) {
            if (excludeTags)
              method.tags = _.difference(method.tags, excludeTags);
            if (includeTags)
              method.tags = _.intersection(method.tags, includeTags);
          }
          return method;
        }
      )
    ),
    (methods) => _.size(methods)
  );

  if (result.tags && (excludeTags || includeTags))
    result.tags = result.tags.filter(({ name }) =>
      excludeTags
        ? !_.includes(excludeTags, name)
        : _.includes(includeTags, name)
    );

  return result;
};

export const openapiDocEndpointHandler = (doc) =>
  wrapEndpointHandler(
    async ({ queryStringParameters = {} }) => {
      logger.debug('*** OPENAPI DOC ***', doc);
      logger.debug('*** QUERY STRING PARAMS ***', queryStringParameters);

      const result = openapiTransform(doc, queryStringParameters);
      logger.debug('*** OPENAPI RESULT ***', result);

      return bodify(result);
    },
    {
      eventSchema: queryStringifySchema({
        excludeEndpoints: 'string',
        excludeTags: 'string',
        includeEndpoints: 'string',
        includeTags: 'string',
      }),
    }
  );

export const queryStringifySchema = (keyTypes) => {
  const [properties, required] = _.reduce(
    keyTypes,
    ([properties, required], type, key) => {
      const { r, t } = type.match(/^(?<r>\*?)(?<t>.*)/).groups;
      _.assign(properties, { [key]: { type: t } });
      if (r === '*') required.push(key);
      return [properties, required];
    },
    [{}, []]
  );

  return {
    type: 'object',
    properties: {
      queryStringParameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
    required: ['queryStringParameters'],
  };
};
