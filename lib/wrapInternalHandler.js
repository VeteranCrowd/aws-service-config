// Configure Sentry.
import { AWSLambda, setTag } from '@sentry/serverless';
setTag('service', process.env.SERVICE_NAME);
setTag('version', process.env.API_VERSION);

// Configure logger.
import { Logger } from '@karmaniverous/edge-logger';
const logger = new Logger({ maxLevel: process.env.LOG_LEVEL });

export default (handler) =>
  AWSLambda.wrapHandler(async (event, context, ...rest) => {
    logger.debug('*** EVENT ***', event);
    return await handler(event, context, ...rest);
  });
