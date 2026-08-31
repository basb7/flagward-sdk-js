// Client
export { FlagwardClient } from "./client.js";
export type { FlagwardClientOptions } from "./client.js";

// Provider
export { FlagwardProvider } from "./provider.js";
export type { FlagwardProviderProps } from "./provider.js";

// Hooks
export { useFlag } from "./useFlag.js";
export type { UseFlagResult } from "./useFlag.js";
export { useFlags } from "./useFlags.js";
export type { UseFlagsResult } from "./useFlags.js";

// Evaluation, for callers that resolve a flag outside React
export { evaluateFlag, toFlagMap } from "./evaluation.js";

// Console reporting
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
