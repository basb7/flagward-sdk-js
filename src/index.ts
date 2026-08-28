// Client
export { FlagwardClient } from "./client";
export type { FlagwardClientOptions } from "./client";

// Provider
export { FlagwardProvider } from "./provider";
export type { FlagwardProviderProps } from "./provider";

// Hooks
export { useFlag } from "./useFlag";
export type { UseFlagResult } from "./useFlag";
export { useFlags } from "./useFlags";
export type { UseFlagsResult } from "./useFlags";

// Evaluation, for callers that resolve a flag outside React
export { evaluateFlag, toFlagMap } from "./evaluation";

// Console reporting
export type { LogLevel, Logger } from "./logger";

// Types
export type {
  Condition,
  Flag,
  FlagData,
  FlagDataMap,
  FlagMap,
  Rule,
  UserContext,
} from "./types";
