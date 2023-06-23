// npm imports
import middy from '@middy/core';
import cors from '@middy/http-cors';
import httpErrorHandler from '@middy/http-error-handler';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';

// lib imports
import wrapInternalHandler from './wrapInternalHandler.js';
import validateEndpointHandler from './validateEndpointHandler.js';

export default (handler, { eventSchema, responseSchema } = {}) =>
  validateEndpointHandler(
    middy(wrapInternalHandler(handler))
      .use(httpErrorHandler())
      .use(
        httpResponseSerializer({
          serializers: [
            {
              regex: /^application\/json$/,
              serializer: ({ body }) => JSON.stringify(body),
            },
          ],
          defaultContentType: 'application/json',
        })
      )
      .use(httpEventNormalizer())
      .use(
        cors({
          // Sets Access-Control-Allow-Credentials
          credentials: true,
          // Sets Access-Control-Allow-Origin to current origin.
          getOrigin: (incomingOrigin) => incomingOrigin,
        })
      )
      .use(httpJsonBodyParser({ disableContentTypeError: true })),
    {
      eventSchema,
      responseSchema,
    }
  );
