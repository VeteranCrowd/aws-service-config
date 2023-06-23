// Configure Cognito client.
import AWSXray from 'aws-xray-sdk';
import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
const cognitoIdentityProvider = AWSXray.captureAWSv3Client(
  new CognitoIdentityProvider({
    region: process.env.AWS_DEFAULT_REGION,
  })
);

export default async (event) =>
  (
    (
      await cognitoIdentityProvider.adminGetUser({
        UserPoolId: process.env.USER_POOL_ID,
        Username: event.requestContext.authorizer.claims['cognito:username'],
      })
    ).UserAttributes.find(
      (attribute) => attribute.Name === 'dev:custom:userId'
    ) ?? {}
  ).Value;
