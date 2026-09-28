/**
 * Flag evaluation, as a pure function of the flag's data and a user context.
 *
 * Kept separate from the client so a hook can evaluate against a snapshot held
 * in React state. A hook that reached into the client's mutable data would be
 * rendering from a source React does not track: the re-render is triggered by
 * a state update while the value comes from somewhere else, and the two can
 * disagree without anything reporting it.
 */
import { hashBucket } from "./hash.js";
import type { Condition, FlagData, FlagMap, Rule, UserContext, Variant } from "./types.js";

/**
 * Unwrap a stored condition value.
 *
 * The server stores condition values wrapped, e.g. `{"type": "string", "value": "US"}`,
 * and reads `condition.value.get("value")` at evaluation time
 * (`core_flags/services.py`). A bare scalar or array is left untouched -- an
 * array is never treated as a wrapper, so IN_LIST's `value: ["AR", "US"]`
 * still works.
 */
function unwrapConditionValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    return (value as { value: unknown }).value;
  }

  return value;
}

/**
 * Flagsmith-style `% Split`: the identity enters the segment only when its
 * deterministic bucket falls under the configured percentage.
 *
 * Mirrors `_evaluate_percentage_split` in `core_flags/services.py`. Needs no
 * trait -- the bucket comes from `user_id` alone, so the condition's
 * `attribute` is ignored. The salt is the flag's key: without a flag key (or
 * a `user_id`) there is no bucket to compute, and the identity does not enter.
 */
function evaluatePercentageSplit(condition: Condition, context: UserContext, flagKey: string): boolean {
  if (!flagKey) {
    return false;
  }

  const userId = context["user_id"];
  if (userId === undefined || userId === null) {
    return false;
  }

  const expected = unwrapConditionValue(condition.value);

  if (typeof expected === "boolean" || typeof expected !== "number" || Number.isNaN(expected)) {
    return false;
  }

  if (expected < 0 || expected > 100) {
    return false;
  }

  return hashBucket(userId, flagKey) < expected;
}

function evaluateCondition(condition: Condition, context: UserContext, flagKey: string): boolean {
  if (condition.operator === "PERCENTAGE_SPLIT") {
    return evaluatePercentageSplit(condition, context, flagKey);
  }

  // context[attr] is undefined for a missing key and null when the caller
  // passed one explicitly; the server's context.get(attribute) returns None
  // for both, so both read as "missing" here.
  const attributeValue = context[condition.attribute];

  if (attributeValue === undefined || attributeValue === null) {
    return false;
  }

  const expectedValue = unwrapConditionValue(condition.value);

  if (expectedValue === undefined || expectedValue === null) {
    return false;
  }

  switch (condition.operator) {
    case "EQUALS":
      return attributeValue === expectedValue;
    case "NOT_EQUALS":
      return attributeValue !== expectedValue;
    case "GREATER_THAN":
      return Number(attributeValue) > Number(expectedValue);
    case "LESS_THAN":
      return Number(attributeValue) < Number(expectedValue);
    case "IN_LIST":
      return Array.isArray(expectedValue) && expectedValue.includes(attributeValue);
    case "CONTAINS":
      return String(attributeValue).includes(String(expectedValue));
    default:
      return false;
  }
}

function evaluateRule(rule: Rule, context: UserContext, flagKey: string): boolean {
  if (rule.conditions.length === 0) {
    return true;
  }

  if (rule.operator_logic === "AND") {
    return rule.conditions.every((c) => evaluateCondition(c, context, flagKey));
  }

  return rule.conditions.some((c) => evaluateCondition(c, context, flagKey));
}

/**
 * Resolve one flag. Returns undefined when the flag is not in the given data,
 * which the caller reads as "no opinion" and answers with its own fallback.
 *
 * For a MULTIVARIATE flag this is a simplification, not the backend's
 * evaluation: the backend returns a variant name for MULTIVARIATE flags, but
 * this boolean API keeps returning `true` once the flag is enabled (after any
 * override) -- rules and rollouts only decide *which variant*, not whether
 * the flag itself reads as on. Use `evaluateVariant` / `getVariant` for the
 * variant name.
 */
export function evaluateFlag(
  flagData: FlagData | undefined,
  context: UserContext = {},
): boolean | undefined {
  if (!flagData) {
    return undefined;
  }

  if (!flagData.is_enabled) {
    return false;
  }

  if (flagData.flag_type === "MULTIVARIATE") {
    return true;
  }

  if (!flagData.rules || flagData.rules.length === 0) {
    return true;
  }

  const sortedRules = [...flagData.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (evaluateRule(rule, context, flagData.key)) {
      return true;
    }
  }

  return false;
}

/**
 * Assign a variant deterministically by the flag's global percentage
 * allocation, in the server's split order.
 *
 * Mirrors `_assign_by_percentage`: with no user id there is nothing to
 * bucket, so the control variant is returned; otherwise the bucket walks the
 * variants in order, landing on the first whose cumulative allocation exceeds
 * it, falling back to the last variant if none does (rounding can leave the
 * allocations short of 100).
 */
function assignByPercentage(
  variants: Variant[],
  userId: unknown,
  flagKey: string,
): string | undefined {
  if (userId === undefined || userId === null) {
    return variants.find((v) => v.is_control)?.name;
  }

  const bucket = hashBucket(userId, flagKey);

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.percentage_allocation;
    if (bucket < cumulative) {
      return variant.name;
    }
  }

  return variants[variants.length - 1]?.name;
}

/**
 * Resolve the variant of a MULTIVARIATE flag. Returns undefined when the flag
 * is missing, disabled, overridden (an override forces a boolean value
 * server-side, so there is no variant), not MULTIVARIATE, or has no variants.
 *
 * Mirrors `_evaluate_multivariate`: a matching rule with its own rollout wins
 * for the share of users under `rollout_percentage`; everyone else --
 * excluded from that rollout, matched a rule with no rollout of its own, or
 * matched no rule at all -- falls through to the flag's global percentage
 * split.
 */
export function evaluateVariant(
  flagData: FlagData | undefined,
  context: UserContext = {},
): string | undefined {
  if (!flagData || !flagData.is_enabled || flagData.overridden) {
    return undefined;
  }

  if (flagData.flag_type !== "MULTIVARIATE") {
    return undefined;
  }

  const variants = flagData.variants ?? [];
  if (variants.length === 0) {
    return undefined;
  }

  const userId = context["user_id"];
  const sortedRules = [...(flagData.rules ?? [])].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!evaluateRule(rule, context, flagData.key)) {
      continue;
    }

    if (rule.rollout_variant == null) {
      break;
    }

    if (rule.rollout_percentage == null || rule.rollout_percentage >= 100) {
      // null means "no percentage given", which behaves like the documented
      // default of 100: every bucket value satisfies "< 100", so no hash --
      // and no user_id -- is needed here.
      return rule.rollout_variant;
    }

    if (userId === undefined || userId === null) {
      return variants.find((v) => v.is_control)?.name;
    }

    if (hashBucket(userId, flagData.key) < rule.rollout_percentage) {
      return rule.rollout_variant;
    }

    break;
  }

  return assignByPercentage(variants, userId, flagData.key);
}

/** The boolean view of a set of flags, for callers that want the whole map. */
export function toFlagMap(
  flagsData: Record<string, FlagData>,
  context: UserContext = {},
): FlagMap {
  const flags: FlagMap = {};

  for (const [key, data] of Object.entries(flagsData)) {
    const value = evaluateFlag(data, context);
    if (value !== undefined) {
      flags[key] = value;
    }
  }

  return flags;
}
