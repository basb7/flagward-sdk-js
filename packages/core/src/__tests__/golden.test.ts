import { describe, it, expect } from "vitest";
import { evaluateFlag, evaluateVariant } from "../evaluation";
import type { FlagData, Rule, UserContext } from "../types";
import golden from "./fixtures/core-0.3.0-answers.json";

/**
 * Pins evaluation to what the published @flagward/core 0.3.0 answered, across
 * every combination of flag type, enabled, overridden, rule shape and variant
 * set below. The fixture was recorded from the npm package, not from this
 * source, so a refactor that changes a value fails here even when every test
 * written against the new code still passes.
 *
 * Each pair of characters is one (flag, context): evaluateFlag then
 * evaluateVariant, as t(rue) / f(alse) / c(ontrol) / t(reatment) / - (undefined).
 */
const rule = (extra: Partial<Rule> = {}): Rule => ({
  priority: 1,
  operator_logic: "AND",
  conditions: [{ attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } }],
  ...extra,
});
const split: Rule = {
  priority: 2,
  operator_logic: "AND",
  conditions: [{ attribute: "x", operator: "PERCENTAGE_SPLIT", value: 30 }],
};
const variants = [
  { name: "control", percentage_allocation: 50, is_control: true },
  { name: "treatment", percentage_allocation: 50, is_control: false },
];
const ruleSets: Rule[][] = [
  [],
  [rule()],
  [rule(), split],
  [rule({ rollout_variant: "treatment", rollout_percentage: 20 })],
  [rule({ rollout_variant: "control", rollout_percentage: null })],
  [rule({ rollout_variant: null })],
];

const flags: FlagData[] = [];
for (const flag_type of ["BOOLEAN", "MULTIVARIATE", undefined] as const)
  for (const is_enabled of [true, false])
    for (const overridden of [true, false, undefined])
      for (const rules of ruleSets)
        for (const vs of [variants, [], undefined])
          flags.push({ key: "checkout-flow", flag_type, is_enabled, overridden, rules, variants: vs });

const contexts: UserContext[] = [{}, { country: "US" }, { country: "AR" }];
for (let i = 0; i < 20; i++) contexts.push({ user_id: `user-${i}`, country: i % 2 ? "US" : "AR" });

function encode(value: boolean | string | undefined): string {
  if (value === true) return "t";
  if (value === false) return "f";
  if (value === undefined) return "-";
  return value[0];
}

describe("evaluation matches @flagward/core 0.3.0", () => {
  it("covers the same matrix the fixture was recorded with", () => {
    expect([flags.length, contexts.length]).toEqual([golden.flags, golden.contexts]);
  });

  it("answers every combination the way 0.3.0 did", () => {
    let answers = "";
    for (const flag of flags)
      for (const context of contexts)
        answers += encode(evaluateFlag(flag, context)) + encode(evaluateVariant(flag, context));

    expect(answers).toBe(golden.answers);
  });
});
