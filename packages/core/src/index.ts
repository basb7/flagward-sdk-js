// Client
export { DEFAULT_SDK_TYPE, FlagwardClient } from "./client.js";
export type { FlagwardClientOptions } from "./client.js";

// Evaluation, as a pure function of flag data and a user context
export { evaluateFlag, toFlagMap } from "./evaluation.js";

// Console reporting
export { createLogger, resetLoggerState } from "./logger.js";

// The version this package reports at registration
export { SDK_VERSION } from "./version.js";
export type { LogLevel, Logger } from "./logger.js";

// Types
export type {
  Condition,
  Flag,
  FlagData,
  FlagDataMap,
  FlagMap,
  Rule,
  UserContext,
} from "./types.js";
