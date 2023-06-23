// npm imports
import _ from 'lodash';

// lib imports
import getCognitoUserId from './getCognitoUserId.js';
import wrapEndpointHandler from './wrapEndpointHandler.js';

// Configure logger.
import { Logger } from '@karmaniverous/edge-logger';
const logger = new Logger({ maxLevel: process.env.LOG_LEVEL });

export default (handler, { eventSchema, responseSchema, getUser } = {}) =>
  wrapEndpointHandler(
    async (event, context) => {
      const userId = await getCognitoUserId(event);

      if (getUser) {
        const userResponse = await getUser({ userId });
        context.user = _.isArray(userResponse)
          ? userResponse[0]
          : userResponse.data?.[0];
      }
      context.user ??= { userId };

      logger.debug('*** USER CONTEXT ***', context.user);

      return await handler(event, context);
    },
    { eventSchema, responseSchema }
  );
