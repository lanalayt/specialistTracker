import type { PostConfirmationTriggerHandler } from "aws-lambda";

/**
 * Post-confirmation Lambda:
 * Fires after a user confirms their Cognito account.
 * Creates a User record in DynamoDB with teamId + role from custom attributes.
 *
 * TODO: Add to DynamoDB User table once schema is extended.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  const { userName, userAttributes } = event.request;
  const teamId = userAttributes["custom:teamId"] ?? null;
  const role = userAttributes["custom:role"] ?? "athlete";

  console.log(
    `[postConfirmation] User ${userName} confirmed. teamId=${teamId}, role=${role}`
  );

  // TODO: Use Amplify Data client to create User record
  // const client = generateClient<Schema>();
  // await client.models.User.create({ ... });

  return event;
};
