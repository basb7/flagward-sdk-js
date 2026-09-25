import { describe, it, expect } from "vitest";
import { evaluateVariant } from "../evaluation";
import type { FlagData } from "../types";

const baseVariants = [
  { name: "control", percentage_allocation: 50, is_control: true },
  { name: "treatment", percentage_allocation: 50, is_control: false },
];

function multivariateFlag(overrides: Partial<FlagData> = {}): FlagData {
  return {
    key: "checkout-flow",
    is_enabled: true,
    flag_type: "MULTIVARIATE",
    variants: baseVariants,
    overridden: false,
    rules: [],
    ...overrides,
  };
}

describe("evaluateVariant - not applicable", () => {
  it("returns undefined for a missing flag", () => {
    expect(evaluateVariant(undefined, {})).toBeUndefined();
  });

  it("returns undefined for a disabled flag", () => {
    expect(evaluateVariant(multivariateFlag({ is_enabled: false }), {})).toBeUndefined();
  });

  it("returns undefined for an overridden flag (override forces a bool, no variant)", () => {
    expect(
      evaluateVariant(multivariateFlag({ overridden: true, variants: [], rules: [] }), {}),
    ).toBeUndefined();
  });

  it("returns undefined for a BOOLEAN flag", () => {
    expect(
      evaluateVariant(multivariateFlag({ flag_type: "BOOLEAN", variants: [] }), {}),
    ).toBeUndefined();
  });

  it("returns undefined for a MULTIVARIATE flag with no variants", () => {
    expect(evaluateVariant(multivariateFlag({ variants: [] }), {})).toBeUndefined();
  });
});

describe("evaluateVariant - global split (no matching rule)", () => {
  it("splits deterministically by hash bucket, matching the shared vectors", () => {
    // hashBucket("user-1", "checkout-flow") = 9.36 -> falls in [0, 50) -> control
    expect(evaluateVariant(multivariateFlag(), { user_id: "user-1" })).toBe("control");
    // hashBucket("user-0", "checkout-flow") = 77.41 -> falls in [50, 100) -> treatment
    expect(evaluateVariant(multivariateFlag(), { user_id: "user-0" })).toBe("treatment");
  });

  it("returns the control variant name when user_id is missing", () => {
    expect(evaluateVariant(multivariateFlag(), {})).toBe("control");
  });

  it("falls back to the last variant when the bucket exceeds the cumulative allocation", () => {
    const flag = multivariateFlag({
      variants: [
        { name: "control", percentage_allocation: 1, is_control: true },
        { name: "treatment", percentage_allocation: 1, is_control: false },
      ],
    });
    // Any real bucket except an extremely unlucky one exceeds 2% cumulative.
    expect(evaluateVariant(flag, { user_id: "user-0" })).toBe("treatment");
  });
});

describe("evaluateVariant - per-rule rollout", () => {
  it("returns rollout_variant directly when rollout_percentage is null (documented default 100)", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: null,
          conditions: [],
        },
      ],
    });

    expect(evaluateVariant(flag, {})).toBe("treatment");
  });

  it("returns rollout_variant directly when rollout_percentage is >= 100", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: 100,
          conditions: [],
        },
      ],
    });

    expect(evaluateVariant(flag, {})).toBe("treatment");
  });

  it("falls through to the global split when rollout_variant is null", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: null,
          rollout_percentage: 50,
          conditions: [],
        },
      ],
    });

    // hashBucket("user-1", "checkout-flow") = 9.36 -> control, from the global split
    expect(evaluateVariant(flag, { user_id: "user-1" })).toBe("control");
  });

  it("returns the control variant when the rule matches but user_id is missing", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: 50,
          conditions: [],
        },
      ],
    });

    expect(evaluateVariant(flag, {})).toBe("control");
  });

  it("sends the user to rollout_variant when under its own hash bucket", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: 20,
          conditions: [],
        },
      ],
    });

    // hashBucket("user-1", "checkout-flow") = 9.36 < 20
    expect(evaluateVariant(flag, { user_id: "user-1" })).toBe("treatment");
  });

  it("falls through to the global split when over the rule's own hash bucket", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: 5,
          conditions: [],
        },
      ],
    });

    // hashBucket("user-1", "checkout-flow") = 9.36, not < 5 -> break to global
    // split, which for user-1 (9.36) lands in [0, 50) -> control.
    expect(evaluateVariant(flag, { user_id: "user-1" })).toBe("control");
  });

  it("only considers the first matching rule, by ascending priority", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 2,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: null,
          conditions: [{ attribute: "plan", operator: "EQUALS", value: "free" }],
        },
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "control",
          rollout_percentage: null,
          conditions: [{ attribute: "plan", operator: "EQUALS", value: "pro" }],
        },
      ],
    });

    expect(evaluateVariant(flag, { plan: "pro" })).toBe("control");
    expect(evaluateVariant(flag, { plan: "free" })).toBe("treatment");
  });

  it("skips a non-matching rule and falls through to a later rule or the global split", () => {
    const flag = multivariateFlag({
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          rollout_variant: "treatment",
          rollout_percentage: null,
          conditions: [{ attribute: "plan", operator: "EQUALS", value: "pro" }],
        },
      ],
    });

    // No rule matches -> global split. hashBucket("user-1", ...) = 9.36 -> control.
    expect(evaluateVariant(flag, { plan: "free", user_id: "user-1" })).toBe("control");
  });
});

describe("PERCENTAGE_SPLIT condition (salted by the flag key)", () => {
  function flagWithSplitRule(expected: unknown): FlagData {
    return {
      key: "checkout-flow",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [{ attribute: "ignored", operator: "PERCENTAGE_SPLIT", value: expected }],
        },
      ],
    };
  }

  it("matches when the user's bucket falls under the expected percentage", async () => {
    const { evaluateFlag } = await import("../evaluation");
    // hashBucket("user-1", "checkout-flow") = 9.36
    expect(evaluateFlag(flagWithSplitRule(10), { user_id: "user-1" })).toBe(true);
    expect(evaluateFlag(flagWithSplitRule(9), { user_id: "user-1" })).toBe(false);
  });

  it("accepts a wrapped value like every other condition", async () => {
    const { evaluateFlag } = await import("../evaluation");
    expect(
      evaluateFlag(flagWithSplitRule({ type: "number", value: 10 }), { user_id: "user-1" }),
    ).toBe(true);
  });

  it("ignores the condition's attribute entirely", async () => {
    const { evaluateFlag } = await import("../evaluation");
    const flag = flagWithSplitRule(10);
    expect(evaluateFlag(flag, { user_id: "user-1", ignored: undefined })).toBe(true);
  });

  it("does not match when user_id is missing", async () => {
    const { evaluateFlag } = await import("../evaluation");
    expect(evaluateFlag(flagWithSplitRule(100), {})).toBe(false);
  });

  it("rejects a boolean expected value", async () => {
    const { evaluateFlag } = await import("../evaluation");
    expect(evaluateFlag(flagWithSplitRule(true), { user_id: "user-1" })).toBe(false);
  });

  it("rejects a non-numeric expected value", async () => {
    const { evaluateFlag } = await import("../evaluation");
    expect(evaluateFlag(flagWithSplitRule("50"), { user_id: "user-1" })).toBe(false);
  });

  it("rejects an out-of-range expected value", async () => {
    const { evaluateFlag } = await import("../evaluation");
    expect(evaluateFlag(flagWithSplitRule(150), { user_id: "user-1" })).toBe(false);
    expect(evaluateFlag(flagWithSplitRule(-1), { user_id: "user-1" })).toBe(false);
  });
});
