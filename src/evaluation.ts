/**
 * Flag evaluation, as a pure function of the flag's data and a user context.
 *
 * Kept separate from the client so a hook can evaluate against a snapshot held
 * in React state. A hook that reached into the client's mutable data would be
 * rendering from a source React does not track: the re-render is triggered by
 * a state update while the value comes from somewhere else, and the two can
 * disagree without anything reporting it.
 */
import type { Condition, FlagData, FlagMap, Rule, UserContext } from "./types.js";

function evaluateCondition(condition: Condition, context: UserContext): boolean {
  const attributeValue = context[condition.attribute];

  if (attributeValue === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "EQUALS":
      return attributeValue === condition.value;
    case "NOT_EQUALS":
      return attributeValue !== condition.value;
    case "GREATER_THAN":
      return Number(attributeValue) > Number(condition.value);
    case "LESS_THAN":
      return Number(attributeValue) < Number(condition.value);
    case "IN_LIST":
      return Array.isArray(condition.value) && condition.value.includes(attributeValue);
    case "CONTAINS":
      return String(attributeValue).includes(String(condition.value));
    default:
      return false;
  }
}

function evaluateRule(rule: Rule, context: UserContext): boolean {
  if (rule.conditions.length === 0) {
    return true;
  }

  if (rule.operator_logic === "AND") {
    return rule.conditions.every((c) => evaluateCondition(c, context));
  }

  return rule.conditions.some((c) => evaluateCondition(c, context));
}

/**
 * Resolve one flag. Returns undefined when the flag is not in the given data,
 * which the caller reads as "no opinion" and answers with its own fallback.
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

  if (!flagData.rules || flagData.rules.length === 0) {
    return true;
  }

  const sortedRules = [...flagData.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (evaluateRule(rule, context)) {
      return true;
    }
  }

  return false;
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
