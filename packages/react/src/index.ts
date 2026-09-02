// The framework-agnostic core, re-exported so a consumer of this package never
// has to install @flagward/core to reach the client, the evaluator or the types.
export {
  FlagwardClient,
  evaluateFlag,
  toFlagMap,
} from "@flagward/core";
export type {
  Condition,
  Flag,
  FlagData,
  FlagDataMap,
  FlagMap,
  FlagwardClientOptions,
  LogLevel,
  Logger,
  Rule,
  UserContext,
} from "@flagward/core";

// Provider
export { FlagwardProvider } from "./provider.js";
export type { FlagwardProviderProps } from "./provider.js";

// Hooks
export { useFlag } from "./useFlag.js";
export type { UseFlagResult } from "./useFlag.js";
export { useFlags } from "./useFlags.js";
export type { UseFlagsResult } from "./useFlags.js";

// The version this adapter registers with
export { SDK_VERSION } from "./version.js";
