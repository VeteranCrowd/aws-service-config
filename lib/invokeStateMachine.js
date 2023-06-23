// npm imports
import createError from 'http-errors';
import _ from 'lodash';

// Configure SFN client.
import AWSXray from 'aws-xray-sdk';
import { SFN } from '@aws-sdk/client-sfn';
const sfn = AWSXray.captureAWSv3Client(
  new SFN({
    region: process.env.AWS_DEFAULT_REGION,
  })
);

export default async ({
  dbClient,
  entity,
  entityManager,
  entityToken,
  failureStatus,
  input,
  stateMachineArn,
  updater,
}) => {
  try {
    await sfn.startExecution({
      stateMachineArn,
      input: JSON.stringify(input),
    });
  } catch (error) {
    if (dbClient) {
      // Update state.
      _.assign(entity, {
        error: error.message,
        ...(failureStatus ? { status: failureStatus } : {}),
        updated: Date.now(),
        updater,
      });

      // Persist state.
      await dbClient.putItem(
        process.env.STACK_NAME,
        entityManager.addKeys(entityToken, entity)
      );
    }

    throw new createError.InternalServerError(error.message);
  }
};
