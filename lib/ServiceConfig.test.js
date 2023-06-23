/* eslint-env mocha */

import { expect } from 'chai';
import _ from 'lodash';

import { ServiceConfig } from './index.js';

const config = {
  merchant: {
    apiSubdomain: 'api',
    apiVersion: 'v0',
    openapiPath: 'doc/openapi',
  },
  user: {
    apiSubdomain: 'api2',
    apiVersion: 'v1',
    openapiPath: 'doc/openapi2',
  },
};

process.env.AWS_DEFAULT_REGION = 'us-east-1';
process.env.PROD_ENV_TOKEN = 'prod';
process.env.ROOT_DOMAIN = 'veterancrowd.com';

describe('ServiceConfig', function () {
  beforeEach(function () {
    process.env.ENV = 'dev';
  });

  describe('constructor', function () {
    it('should create a new instance', function () {
      const serviceConfig = new ServiceConfig();

      expect(serviceConfig).to.be.an.instanceof(ServiceConfig);
    });

    it('should create a new instance with no config', function () {
      const serviceConfig = new ServiceConfig();

      expect(serviceConfig).to.be.an.instanceof(ServiceConfig);
    });

    it('should fail with invalid config', function () {
      expect(() => new ServiceConfig(0)).to.throw();
    });
  });

  describe('getApiKey', function () {
    it.skip('should return api key', async function () {
      const serviceConfig = new ServiceConfig(config);

      const apiKey = await serviceConfig.getApiKey('merchant');

      expect(apiKey).to.be.a('string');
    });
  });

  describe('getClient', function () {
    it.skip('should return api client', async function () {
      const serviceConfig = new ServiceConfig(config);

      const api = await serviceConfig.getClient('merchant');

      expect(api).to.haveOwnProperty('privateGetMerchant');

      const doc = (await api.publicGetDocOpenapi()).data;
      console.log(doc);
    });
  });

  describe('getBaseUrl', function () {
    it('should return dev base url', function () {
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getBaseUrl('merchant')).to.equal(
        'https://api.veterancrowd.com/merchant-v0-dev'
      );
    });

    it('should return prod base url', function () {
      process.env.ENV = 'prod';
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getBaseUrl('user')).to.equal(
        'https://api2.veterancrowd.com/user-v1'
      );
    });
  });

  describe('getOpenapiUrl', function () {
    it('should return dev openapi url', function () {
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getOpenapiUrl('merchant')).to.equal(
        'https://api.veterancrowd.com/merchant-v0-dev/doc/openapi'
      );
    });

    it('should return prod openapi url', function () {
      process.env.ENV = 'prod';
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getOpenapiUrl('user')).to.equal(
        'https://api2.veterancrowd.com/user-v1/doc/openapi2'
      );
    });
  });

  describe('getStackName', function () {
    it('should return dev stack name', function () {
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getStackName('merchant')).to.equal(
        'api-merchant-v0-dev'
      );
    });

    it('should return prod stack name', function () {
      process.env.ENV = 'prod';
      const serviceConfig = new ServiceConfig(config);

      expect(serviceConfig.getStackName('user')).to.equal('api2-user-v1-prod');
    });
  });

  describe('getServiceMap', function () {
    it.skip('should return service map', async function () {
      const config = {
        undefined: {
          apiSubdomain: 'api',
          apiVersion: 'v0',
          openapiPath: 'doc/openapi',
        },
        user: {
          apiSubdomain: 'api',
          apiVersion: 'v0',
          openapiPath: 'doc/openapi',
        },
      };

      const serviceMap = await ServiceConfig.getServiceMap(config);

      const mapTypes = _.mapValues(
        serviceMap,
        (service) => service.api?.constructor.name
      );

      expect(mapTypes).to.deep.equal({
        undefined: undefined,
        user: 'OpenAPIClientAxios',
      });
    });
  });
});
