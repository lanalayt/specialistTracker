import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito User Pool with two groups:
 *  - coaches: full CRUD for their team data
 *  - athletes: read-only access, filtered to their own records
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["coaches", "athletes"],
  userAttributes: {
    // Store teamId and role as custom attributes
    "custom:teamId": {
      dataType: "String",
      mutable: true,
    },
    "custom:role": {
      dataType: "String",
      mutable: true,
    },
  },
  triggers: {
    // Lambda: runs after a user confirms their account
    // Creates the User record in DynamoDB with teamId + role
    postConfirmation: "./functions/postConfirmation/handler.ts",
  },
});
