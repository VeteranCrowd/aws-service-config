// npm imports
import validator from '@middy/validator';
import { transpileSchema } from '@middy/validator/transpile';

export default (handler, { eventSchema, responseSchema } = {}) =>
  eventSchema || responseSchema
    ? handler.use(
        validator({
          ...(eventSchema
            ? {
                eventSchema: transpileSchema(eventSchema, {
                  coerceTypes: false,
                  useDefaults: false,
                }),
              }
            : {}),
          ...(responseSchema
            ? {
                responseSchema: transpileSchema(responseSchema, {
                  coerceTypes: false,
                  useDefaults: false,
                }),
              }
            : {}),
        })
      )
    : handler;
