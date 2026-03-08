import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";

/**
 * Specialist Tracker — AWS Amplify Gen 2 Backend
 *
 * Resources:
 *  - auth: Cognito User Pool with coach/athlete groups
 *  - data: DynamoDB tables via Amplify Data (schema in ./data/resource.ts)
 *
 * To deploy locally:
 *   npx ampx sandbox
 *
 * To deploy to AWS:
 *   git push → Amplify Hosting auto-deploys via amplify.yml
 */
export const backend = defineBackend({
  auth,
  data,
});
