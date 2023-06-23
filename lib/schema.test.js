/* eslint-env mocha */

import { expect } from 'chai';

import { bodifySchema, queryStringifySchema } from './index.js';
import { openapiTransform } from './schema.js';
import membershipSchema from '../test/membership.openapi.json' assert { type: 'json' };

describe('schema', function () {
  beforeEach(function () {
    process.env.ENV = 'dev';
  });

  describe('bodifySchema', function () {
    it('works as expected', function () {
      const schema = { foo: 'bar' };

      expect(bodifySchema(schema)).to.deep.equal({
        type: 'object',
        properties: {
          body: schema,
        },
        required: ['body'],
      });
    });
  });

  describe('openapiTransform', function () {
    it.skip('works with no params', function () {
      const result = openapiTransform(membershipSchema, {
        includeEndpoints: 'Cognito',
      });

      expect(result).to.deep.equal({});
    });
  });

  describe('queryStringifySchema', function () {
    it('works with no required properties', function () {
      const keyTypes = {
        groupId: 'string',
        isArchived: 'boolean',
        limit: 'string',
        pageKeys: 'string',
        userId: 'string',
      };

      expect(queryStringifySchema(keyTypes)).to.deep.equal({
        type: 'object',
        properties: {
          queryStringParameters: {
            type: 'object',
            properties: {
              groupId: { type: 'string' },
              isArchived: { type: 'boolean' },
              limit: { type: 'string' },
              pageKeys: { type: 'string' },
              userId: { type: 'string' },
            },
            required: [],
            additionalProperties: false,
          },
        },
        required: ['queryStringParameters'],
      });
    });

    it('picks up required properties', function () {
      const keyTypes = {
        groupId: 'string',
        isArchived: '*boolean',
        limit: 'string',
        pageKeys: '*string',
        userId: 'string',
      };

      expect(queryStringifySchema(keyTypes)).to.deep.equal({
        type: 'object',
        properties: {
          queryStringParameters: {
            type: 'object',
            properties: {
              groupId: { type: 'string' },
              isArchived: { type: 'boolean' },
              limit: { type: 'string' },
              pageKeys: { type: 'string' },
              userId: { type: 'string' },
            },
            required: ['isArchived', 'pageKeys'],
            additionalProperties: false,
          },
        },
        required: ['queryStringParameters'],
      });
    });
  });
});
