import { describe, it, expect } from "vitest";
import {
  evaluateFlag,
  evaluateFlagDetail,
  evaluateVariant,
  evaluateVariantDetail,
} from "../evaluation";
import type { FlagData, Rule, UserContext } from "../types";

const variants = [
  { name: "control", percentage_allocation: 50, is_control: true },
  { name: "treatment", percentage_allocation: 50, is_control: false },
];

const usRule: Rule = {
  priority: 1,
  operator_logic: "AND",
  conditions: [{ attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } }],
};

function booleanFlag(overrides: Partial<FlagData> = {}): FlagData {
  return { key: "new-checkout", is_enabled: true, flag_type: "BOOLEAN", rules: [], ...overrides };
}

// Hash vectors (see hash.test.ts): u-1 buckets at 77.92 and user-1 at 9.36
// for "checkout-flow".
function multivariateFlag(overrides: Partial<FlagData> = {}): FlagData {
  return {
    key: "checkout-flow",
    is_enabled: true,
    flag_type: "MULTIVARIATE",
    variants,
    overridden: false,
    rules: [],
    ...overrides,
  };
}

describe("evaluateFlagDetail", () => {
  it("returns undefined for a missing flag", () => {
    expect(evaluateFlagDetail(undefined, {})).toBeUndefined();
  });

  it("reads a disabled flag as DISABLED", () => {
    expect(evaluateFlagDetail(booleanFlag({ is_enabled: false }), {})).toEqual({
      value: false,
      reason: "DISABLED",
    });
  });

  it("reads an override as STATIC, whichever value it forces", () => {
    expect(evaluateFlagDetail(booleanFlag({ overridden: true, is_enabled: false }), {})).toEqual({
      value: false,
      reason: "STATIC",
    });
    expect(evaluateFlagDetail(booleanFlag({ overridden: true, is_enabled: true }), {})).toEqual({
      value: true,
      reason: "STATIC",
    });
  });

  it("reads an enabled flag with no rules as STATIC", () => {
    expect(evaluateFlagDetail(booleanFlag(), {})).toEqual({ value: true, reason: "STATIC" });
  });

  it("reads a matching rule as TARGETING_MATCH", () => {
    expect(evaluateFlagDetail(booleanFlag({ rules: [usRule] }), { country: "US" })).toEqual({
      value: true,
      reason: "TARGETING_MATCH",
    });
  });

  it("reads no matching rule as DEFAULT", () => {
    expect(evaluateFlagDetail(booleanFlag({ rules: [usRule] }), { country: "AR" })).toEqual({
      value: false,
      reason: "DEFAULT",
    });
  });

  it("reads an enabled MULTIVARIATE flag as STATIC true", () => {
    expect(evaluateFlagDetail(multivariateFlag(), { user_id: "u-1" })).toEqual({
      value: true,
      reason: "STATIC",
    });
  });
});

describe("evaluateVariantDetail", () => {
  it("returns undefined for a missing flag", () => {
    expect(evaluateVariantDetail(undefined, {})).toBeUndefined();
  });

  it("has no variant for a disabled flag", () => {
    expect(evaluateVariantDetail(multivariateFlag({ is_enabled: false }), {})).toEqual({
      value: undefined,
      reason: "DISABLED",
    });
  });

  it("has no variant for an override", () => {
    expect(
      evaluateVariantDetail(multivariateFlag({ overridden: true, variants: [] }), {}),
    ).toEqual({ value: undefined, reason: "STATIC" });
  });

  it("has no variant for a BOOLEAN flag or an empty variant set", () => {
    expect(evaluateVariantDetail(booleanFlag(), {})).toEqual({ value: undefined, reason: "DEFAULT" });
    expect(evaluateVariantDetail(multivariateFlag({ variants: [] }), {})).toEqual({
      value: undefined,
      reason: "DEFAULT",
    });
  });

  it("reads the global split as SPLIT", () => {
    expect(evaluateVariantDetail(multivariateFlag(), { user_id: "u-1" })).toEqual({
      value: "treatment",
      reason: "SPLIT",
    });
    expect(evaluateVariantDetail(multivariateFlag(), { user_id: "user-1" })).toEqual({
      value: "control",
      reason: "SPLIT",
    });
  });

  it("reads the control fallback with no user_id as DEFAULT", () => {
    expect(evaluateVariantDetail(multivariateFlag(), {})).toEqual({
      value: "control",
      reason: "DEFAULT",
    });
  });

  it("reads a full rule rollout as TARGETING_MATCH", () => {
    const flag = multivariateFlag({
      rules: [{ ...usRule, rollout_variant: "treatment", rollout_percentage: null }],
    });

    expect(evaluateVariantDetail(flag, { country: "US" })).toEqual({
      value: "treatment",
      reason: "TARGETING_MATCH",
    });
  });

  it("reads a partial rule rollout hit as TARGETING_MATCH", () => {
    const flag = multivariateFlag({
      rules: [{ ...usRule, rollout_variant: "treatment", rollout_percentage: 20 }],
    });

    expect(evaluateVariantDetail(flag, { country: "US", user_id: "user-1" })).toEqual({
      value: "treatment",
      reason: "TARGETING_MATCH",
    });
  });

  it("reads a partial rule rollout miss as SPLIT", () => {
    const flag = multivariateFlag({
      rules: [{ ...usRule, rollout_variant: "control", rollout_percentage: 20 }],
    });

    expect(evaluateVariantDetail(flag, { country: "US", user_id: "u-1" })).toEqual({
      value: "treatment",
      reason: "SPLIT",
    });
  });

  it("reads a partial rule rollout with no user_id as DEFAULT control", () => {
    const flag = multivariateFlag({
      rules: [{ ...usRule, rollout_variant: "treatment", rollout_percentage: 20 }],
    });

    expect(evaluateVariantDetail(flag, { country: "US" })).toEqual({
      value: "control",
      reason: "DEFAULT",
    });
  });

  it("reads a matched rule with no rollout of its own as SPLIT", () => {
    const flag = multivariateFlag({ rules: [{ ...usRule, rollout_variant: null }] });

    expect(evaluateVariantDetail(flag, { country: "US", user_id: "u-1" })).toEqual({
      value: "treatment",
      reason: "SPLIT",
    });
  });
});

describe("detail parity", () => {
  const flags: FlagData[] = [
    booleanFlag(),
    booleanFlag({ is_enabled: false }),
    booleanFlag({ overridden: true, is_enabled: true }),
    booleanFlag({ rules: [usRule] }),
    multivariateFlag(),
    multivariateFlag({ is_enabled: false }),
    multivariateFlag({ variants: [] }),
    multivariateFlag({ rules: [{ ...usRule, rollout_variant: "treatment", rollout_percentage: 20 }] }),
    multivariateFlag({ rules: [{ ...usRule, rollout_variant: "control", rollout_percentage: null }] }),
    multivariateFlag({ rules: [{ ...usRule, rollout_variant: null }] }),
  ];
  const contexts: UserContext[] = [
    {},
    { country: "US" },
    { country: "AR" },
    { country: "US", user_id: "u-1" },
    { country: "US", user_id: "user-1" },
    { user_id: "u-1" },
  ];

  it("returns the same values as evaluateFlag and evaluateVariant", () => {
    for (const flag of flags) {
      for (const context of contexts) {
        expect(evaluateFlagDetail(flag, context)?.value).toBe(evaluateFlag(flag, context));
        expect(evaluateVariantDetail(flag, context)?.value).toBe(evaluateVariant(flag, context));
      }
    }
  });
});
