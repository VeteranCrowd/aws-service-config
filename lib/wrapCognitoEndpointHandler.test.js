/* eslint-env mocha */

import { expect } from 'chai';

import { wrapCognitoEndpointHandler } from './index.js';

describe('wrapCognitoEndpointHandler', function () {
  it('should wrap a cognito endpoint handler', async function () {
    const handler = async (event, context) => ({ event, context });

    expect(() => wrapCognitoEndpointHandler(handler)).to.not.throw();
  });
});
