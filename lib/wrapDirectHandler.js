// npm imports
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// lib imports
import wrapInternalHandler from './wrapInternalHandler.js';
import validateEndpointHandler from './validateEndpointHandler.js';

export default (handler, { eventSchema, responseSchema } = {}) =>
  validateEndpointHandler(
    middy(wrapInternalHandler(handler)).use(httpErrorHandler()),
    {
      eventSchema,
      responseSchema,
    }
  );
