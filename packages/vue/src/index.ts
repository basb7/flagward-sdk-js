// The framework-agnostic core, re-exported so a consumer of this package never
// has to install @flagward/core to reach the client, the evaluator or the types.
export { FlagwardClient, evaluateFlag, evaluateVariant, toFlagMap } from "@flagward/core";
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
  Variant,
} from "@flagward/core";

// Plugin
export { flagward } from "./plugin.js";
export type { FlagwardPluginOptions } from "./plugin.js";

// Composables
export { useFlag } from "./useFlag.js";
export type { UseFlagResult } from "./useFlag.js";
export { useFlags } from "./useFlags.js";
export type { UseFlagsResult } from "./useFlags.js";
export { useVariant } from "./useVariant.js";
export type { UseVariantResult } from "./useVariant.js";

// The version this adapter registers with
export { SDK_VERSION } from "./version.js";
