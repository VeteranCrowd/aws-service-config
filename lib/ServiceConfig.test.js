/*
******************* DO NOT EDIT THIS NOTICE *****************
This code and all related intellectual property is owned by
Veteran Crowd Rewards, LLC. It is not to be disclosed, copied
or used without written permission.
*************************************************************
*/

/* eslint-env mocha */
/* eslint-disable import/no-named-as-default-member */

import { expect } from 'chai';
import sinon from 'sinon';
import { APIGateway } from '@aws-sdk/client-api-gateway';
import fs from 'fs-extra';

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
    process.env.ENV_DOMAIN = 'dev.veterancrowd.com';
    delete global.__serviceConfig;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('constructor', function () {
    it('should create a new instance with default config', function () {
      const sc = new ServiceConfig();
      expect(sc).to.be.an.instanceof(ServiceConfig);
    });

    it('should fail with invalid config', function () {
      expect(() => new ServiceConfig(0)).to.throw();
    });
  });

  describe('getApiKey', function () {
    it('should fetch and return the API key', async function () {
      const stub = sinon
        .stub(APIGateway.prototype, 'getApiKeys')
        .resolves({ items: [{ value: 'test-api-key-123' }] });

      const sc = new ServiceConfig(config);
      const key = await sc.getApiKey('merchant');

      expect(key).to.equal('test-api-key-123');
      expect(stub.calledOnce).to.be.true;
      expect(stub.firstCall.args[0]).to.deep.include({
        includeValues: true,
        nameQuery: 'api-merchant-v0-dev',
      });
    });

    it('should return cached value on second call (no duplicate AWS calls)', async function () {
      const stub = sinon
        .stub(APIGateway.prototype, 'getApiKeys')
        .resolves({ items: [{ value: 'cached-key' }] });

      const sc = new ServiceConfig(config);
      await sc.getApiKey('merchant');
      const key2 = await sc.getApiKey('merchant');

      expect(key2).to.equal('cached-key');
      expect(stub.calledOnce).to.be.true;
    });

    it('should throw when API key not found (empty array)', async function () {
      sinon
        .stub(APIGateway.prototype, 'getApiKeys')
        .resolves({ items: [] });

      const sc = new ServiceConfig(config);

      try {
        await sc.getApiKey('merchant');
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.message).to.include("Unable to find API Key 'api-merchant-v0-dev'");
      }
    });

    it('should cache under global.__serviceConfig.apiKeyCache by stack name', async function () {
      sinon
        .stub(APIGateway.prototype, 'getApiKeys')
        .resolves({ items: [{ value: 'global-cached' }] });

      const sc = new ServiceConfig(config);
      await sc.getApiKey('merchant');

      expect(global.__serviceConfig.apiKeyCache['api-merchant-v0-dev']).to.equal(
        'global-cached'
      );
    });

    it('should retry on transient errors via backOff', async function () {
      const stub = sinon.stub(APIGateway.prototype, 'getApiKeys');
      stub.onFirstCall().rejects(new Error('throttle'));
      stub.onSecondCall().resolves({ items: [{ value: 'retry-key' }] });

      const sc = new ServiceConfig(config);
      const key = await sc.getApiKey('merchant');

      expect(key).to.equal('retry-key');
      expect(stub.callCount).to.equal(2);
    });
  });

  describe('getClient', function () {
    it('should call getApiKey with the serviceToken', async function () {
      const apiKeyStub = sinon
        .stub(ServiceConfig.prototype, 'getApiKey')
        .resolves('fake-key');

      // Stub the whole getClient to verify it delegates to getApiKey.
      // OpenAPIClientAxios instance mocking is not feasible in ESM without
      // module-level interception, so we verify integration via getEndpoint tests.
      const sc = new ServiceConfig(config);

      let apiKeyCalled = false;
      apiKeyStub.callsFake(async (token) => {
        apiKeyCalled = true;
        expect(token).to.equal('merchant');
        throw new Error('stop after getApiKey');
      });

      try {
        await sc.getClient('merchant');
      } catch (e) {
        expect(e.message).to.equal('stop after getApiKey');
      }

      expect(apiKeyCalled).to.be.true;
    });

    it('should propagate errors from getApiKey (no silent catch)', async function () {
      sinon
        .stub(ServiceConfig.prototype, 'getApiKey')
        .rejects(new Error('key error'));

      const sc = new ServiceConfig(config);

      try {
        await sc.getClient('merchant');
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.message).to.equal('key error');
      }
    });
  });

  describe('getEndpoint', function () {
    let getClientStub;
    let mockClient;

    beforeEach(function () {
      mockClient = {
        doSomething: sinon.stub().resolves({ data: 'result' }),
      };
      getClientStub = sinon
        .stub(ServiceConfig.prototype, 'getClient')
        .resolves(mockClient);
    });

    it('should cache client promise per serviceToken on global.__serviceConfig.serviceMap', async function () {
      await ServiceConfig.getEndpoint({
        operationId: 'doSomething',
        serviceConfig: config,
        serviceToken: 'merchant',
      });

      expect(global.__serviceConfig.serviceMap).to.have.property('merchant');

      await ServiceConfig.getEndpoint({
        operationId: 'doSomething',
        serviceConfig: config,
        serviceToken: 'merchant',
      });

      expect(getClientStub.calledOnce).to.be.true;
    });

    it('should share the same promise for concurrent calls (TOCTOU fix)', async function () {
      await Promise.all([
        ServiceConfig.getEndpoint({
          operationId: 'doSomething',
          serviceConfig: config,
          serviceToken: 'merchant',
        }),
        ServiceConfig.getEndpoint({
          operationId: 'doSomething',
          serviceConfig: config,
          serviceToken: 'merchant',
        }),
      ]);

      expect(getClientStub.calledOnce).to.be.true;
    });

    it('should evict cached promise on rejection so next call retries', async function () {
      getClientStub.restore();
      const stub = sinon.stub(ServiceConfig.prototype, 'getClient');
      stub.onFirstCall().rejects(new Error('fail'));
      stub.onSecondCall().resolves(mockClient);

      try {
        await ServiceConfig.getEndpoint({
          operationId: 'doSomething',
          serviceConfig: config,
          serviceToken: 'merchant',
        });
      } catch (e) {
        // expected
      }

      // Cache should have been evicted; next call retries
      const ep = await ServiceConfig.getEndpoint({
        operationId: 'doSomething',
        serviceConfig: config,
        serviceToken: 'merchant',
      });

      expect(stub.calledTwice).to.be.true;
      expect(typeof ep).to.equal('function');
    });

    it('should throw for unknown serviceToken', async function () {
      try {
        await ServiceConfig.getEndpoint({
          operationId: 'doSomething',
          serviceConfig: config,
          serviceToken: 'nonexistent',
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.message).to.include("Unknown serviceToken 'nonexistent'");
      }
    });

    it('should throw for unknown operationId', async function () {
      try {
        await ServiceConfig.getEndpoint({
          operationId: 'nonexistentOp',
          serviceConfig: config,
          serviceToken: 'merchant',
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.message).to.include("Unknown operationId 'nonexistentOp'");
      }
    });

    it('should return a callable endpoint that passes through params/data/config', async function () {
      const ep = await ServiceConfig.getEndpoint({
        operationId: 'doSomething',
        serviceConfig: config,
        serviceToken: 'merchant',
      });

      await ep({
        params: { id: 1 },
        data: { name: 'test' },
        config: { timeout: 5000 },
      });

      expect(mockClient.doSomething.calledOnce).to.be.true;
      const args = mockClient.doSomething.firstCall.args;
      expect(args[0]).to.deep.include({ id: 1 });
      expect(args[1]).to.deep.include({ name: 'test' });
      expect(args[2]).to.deep.include({ timeout: 5000 });
    });
  });

  describe('getServiceEndpointHandler', function () {
    let getEndpointStub;
    let mockEndpoint;

    beforeEach(function () {
      mockEndpoint = sinon.stub();
      getEndpointStub = sinon
        .stub(ServiceConfig, 'getEndpoint')
        .resolves(mockEndpoint);
    });

    it('should call getEndpoint and execute the returned function', async function () {
      mockEndpoint.resolves({ status: 200, data: { success: true } });

      const handler = ServiceConfig.getServiceEndpointHandler({
        serviceConfig: config,
      });

      const result = await handler({
        serviceToken: 'merchant',
        operationId: 'doSomething',
        params: { id: 1 },
        data: { name: 'test' },
      });

      expect(getEndpointStub.calledOnce).to.be.true;
      expect(mockEndpoint.calledOnce).to.be.true;
      expect(result).to.deep.equal({ success: true });
    });

    it('should clone data and set Content-Type when data.logo is a string', async function () {
      const fakeStream = { pipe: sinon.stub() };
      sinon.stub(fs, 'createReadStream').returns(fakeStream);
      process.env.LAMBDA_TASK_ROOT = '/tmp';

      mockEndpoint.resolves({ status: 200, data: { ok: true } });

      const handler = ServiceConfig.getServiceEndpointHandler({
        serviceConfig: config,
      });

      const originalData = { logo: 'images/logo.png', name: 'test' };
      await handler({
        serviceToken: 'merchant',
        operationId: 'doSomething',
        data: originalData,
      });

      // Original data must NOT be mutated
      expect(originalData.logo).to.equal('images/logo.png');
      expect(typeof originalData.logo).to.equal('string');

      // Endpoint should receive transformed data
      const callArgs = mockEndpoint.firstCall.args[0];
      expect(callArgs.data.logo).to.equal(fakeStream);
      expect(callArgs.config.headers['Content-Type']).to.equal(
        'multipart/form-data'
      );
    });

    it('should throw createError on 4xx response', async function () {
      mockEndpoint.resolves({
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'bad' },
      });

      const handler = ServiceConfig.getServiceEndpointHandler({
        serviceConfig: config,
      });

      try {
        await handler({
          serviceToken: 'merchant',
          operationId: 'doSomething',
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect(e.status).to.equal(400);
      }
    });

    it('should return response.data on success', async function () {
      mockEndpoint.resolves({ status: 200, data: { items: [1, 2, 3] } });

      const handler = ServiceConfig.getServiceEndpointHandler({
        serviceConfig: config,
      });

      const result = await handler({
        serviceToken: 'merchant',
        operationId: 'doSomething',
      });

      expect(result).to.deep.equal({ items: [1, 2, 3] });
    });
  });

  describe('getLibEndpoint', function () {
    let getEndpointStub;
    let mockEndpoint;

    beforeEach(function () {
      mockEndpoint = sinon.stub();
      getEndpointStub = sinon
        .stub(ServiceConfig, 'getEndpoint')
        .resolves(mockEndpoint);
    });

    it('should call getEndpoint and execute the returned function', async function () {
      mockEndpoint.resolves({
        status: 200,
        data: { items: [1] },
        headers: {},
        config: { url: 'http://example.com' },
        request: {},
      });

      const handler = ServiceConfig.getLibEndpoint({ serviceConfig: config });

      await handler({
        serviceToken: 'merchant',
        operationId: 'doSomething',
      });

      expect(getEndpointStub.calledOnce).to.be.true;
      expect(mockEndpoint.calledOnce).to.be.true;
    });

    it('should return response without config/request properties', async function () {
      mockEndpoint.resolves({
        status: 200,
        data: { items: [1] },
        headers: { 'content-type': 'application/json' },
        config: { url: 'http://example.com' },
        request: { socket: {} },
      });

      const handler = ServiceConfig.getLibEndpoint({ serviceConfig: config });

      const result = await handler({
        serviceToken: 'merchant',
        operationId: 'doSomething',
      });

      expect(result).to.not.have.property('config');
      expect(result).to.not.have.property('request');
      expect(result).to.have.property('data');
      expect(result).to.have.property('status');
      expect(result).to.have.property('headers');
    });
  });

  describe('envMap', function () {
    it('should override ENV value via envMap in getBaseUrl', function () {
      const envMapConfig = {
        merchant: {
          apiSubdomain: 'api',
          apiVersion: 'v0',
          openapiPath: 'doc/openapi',
          envMap: { dev: 'development' },
        },
      };

      delete process.env.ENV_DOMAIN;
      const sc = new ServiceConfig(envMapConfig);
      const url = sc.getBaseUrl('merchant');

      expect(url).to.equal(
        'https://api.veterancrowd.com/merchant-v0-development'
      );
    });

    it('should override ENV value via envMap in getStackName', function () {
      const envMapConfig = {
        merchant: {
          apiSubdomain: 'api',
          apiVersion: 'v0',
          openapiPath: 'doc/openapi',
          envMap: { dev: 'development' },
        },
      };

      const sc = new ServiceConfig(envMapConfig);
      const stackName = sc.getStackName('merchant');

      expect(stackName).to.equal('api-merchant-v0-development');
    });

    it('should fall back to ENV when envMap has no matching entry', function () {
      const envMapConfig = {
        merchant: {
          apiSubdomain: 'api',
          apiVersion: 'v0',
          openapiPath: 'doc/openapi',
          envMap: { staging: 'stg' },
        },
      };

      const sc = new ServiceConfig(envMapConfig);
      const stackName = sc.getStackName('merchant');

      expect(stackName).to.equal('api-merchant-v0-dev');
    });
  });

  describe('getBaseUrl', function () {
    it('should return dev base url', function () {
      const sc = new ServiceConfig(config);

      expect(sc.getBaseUrl('merchant')).to.equal(
        'https://api.dev.veterancrowd.com/merchant-v0'
      );
    });

    it('should return prod base url', function () {
      process.env.ENV = 'prod';
      delete process.env.ENV_DOMAIN;
      const sc = new ServiceConfig(config);

      expect(sc.getBaseUrl('user')).to.equal(
        'https://api2.veterancrowd.com/user-v1'
      );
    });
  });

  describe('getOpenapiUrl', function () {
    it('should return dev openapi url', function () {
      const sc = new ServiceConfig(config);

      expect(sc.getOpenapiUrl('merchant')).to.equal(
        'https://api.dev.veterancrowd.com/merchant-v0/doc/openapi'
      );
    });

    it('should return prod openapi url', function () {
      process.env.ENV = 'prod';
      delete process.env.ENV_DOMAIN;
      const sc = new ServiceConfig(config);

      expect(sc.getOpenapiUrl('user')).to.equal(
        'https://api2.veterancrowd.com/user-v1/doc/openapi2'
      );
    });
  });

  describe('getStackName', function () {
    it('should return dev stack name', function () {
      const sc = new ServiceConfig(config);

      expect(sc.getStackName('merchant')).to.equal('api-merchant-v0-dev');
    });

    it('should return prod stack name', function () {
      process.env.ENV = 'prod';
      const sc = new ServiceConfig(config);

      expect(sc.getStackName('user')).to.equal('api2-user-v1-prod');
    });
  });
});
