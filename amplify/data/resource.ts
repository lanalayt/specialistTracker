import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  // ─── Team ────────────────────────────────────────────────────────────────
  Team: a
    .model({
      name: a.string().required(),
      school: a.string(),
      // JSON blob: { enabledSports, customLabels, positions, distances }
      config: a.json(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── Athlete ─────────────────────────────────────────────────────────────
  Athlete: a
    .model({
      teamId: a.string().required(),
      name: a.string().required(),
      position: a.string(),
      userId: a.string(), // linked Cognito user if athlete has login
      active: a.boolean(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── Session ──────────────────────────────────────────────────────────────
  Session: a
    .model({
      teamId: a.string().required(),
      sport: a.enum(["KICKING", "PUNTING", "KICKOFF", "LONGSNAP"]),
      label: a.string(),
      date: a.datetime(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── FG Kick ──────────────────────────────────────────────────────────────
  FGKick: a
    .model({
      sessionId: a.string().required(),
      athleteId: a.string().required(),
      distance: a.integer(),
      position: a.string(), // LH/RH/LM/RM/M
      result: a.string(), // Y/XL/XR/XS
      score: a.integer(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── Punt ─────────────────────────────────────────────────────────────────
  Punt: a
    .model({
      sessionId: a.string().required(),
      athleteId: a.string().required(),
      type: a.string(), // REGULAR/POOCH/COFFIN_CORNER/RUGBY
      hash: a.string(), // LEFT/MIDDLE/RIGHT
      yards: a.integer(),
      ylDown: a.integer(),
      hangTime: a.float(),
      direction: a.string(), // LEFT/MIDDLE/RIGHT/OOB
      opponent: a.string(),
      score: a.integer(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── Kickoff ──────────────────────────────────────────────────────────────
  Kickoff: a
    .model({
      sessionId: a.string().required(),
      athleteId: a.string().required(),
      distance: a.integer(),
      hangTime: a.float(),
      landingZone: a.string(), // TB/1/2/3/4/5/OOB
      result: a.string(), // TB/RETURN/OOB
      returnYards: a.integer(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),

  // ─── Long Snap ────────────────────────────────────────────────────────────
  LongSnap: a
    .model({
      sessionId: a.string().required(),
      athleteId: a.string().required(),
      snapType: a.string(), // PUNT/FG/PAT
      time: a.float(), // snap time in seconds
      accuracy: a.string(), // ON_TARGET/HIGH/LOW/LEFT/RIGHT
      score: a.integer(),
    })
    .authorization((allow) => [
      allow.groups(["coaches"]).to(["create", "read", "update", "delete"]),
      allow.groups(["athletes"]).to(["read"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
