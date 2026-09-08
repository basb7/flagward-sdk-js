// The framework-agnostic core, re-exported so a consumer of this package
// never has to install @flagward/core to reach the client, the evaluator or
// the types.
export { evaluateFlag, FlagwardClient, toFlagMap } from "@flagward/core";
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

// Lifecycle
export { createFlagward } from "./createFlagward.js";
export type { FlagwardOptions, FlagwardState } from "./createFlagward.js";
export { getFlagward, setFlagward } from "./context.js";
export type { MaybeStore } from "./store.js";

// Consumption via context
export { useFlag } from "./useFlag.js";
export { useFlags } from "./useFlags.js";

// Consumption against an explicit state -- the manual/SSR escape hatch
export { flagStore } from "./flagStore.js";
export type { FlagState, UseFlagResult } from "./flagStore.js";
export { flagsStore } from "./flagsStore.js";
export type { FlagsState, UseFlagsResult } from "./flagsStore.js";

// The version this adapter registers with
export { SDK_VERSION } from "./version.js";
