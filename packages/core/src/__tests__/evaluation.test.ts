import { describe, it, expect } from "vitest";
import { evaluateFlag } from "../evaluation";
import type { FlagData } from "../types";

describe("evaluateFlag - condition values", () => {
  it("matches a wrapped condition value, the shape the server actually sends", () => {
    const flagData: FlagData = {
      key: "country-flag",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [
            { attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } },
          ],
        },
      ],
    };

    expect(evaluateFlag(flagData, { country: "US" })).toBe(true);
    expect(evaluateFlag(flagData, { country: "AR" })).toBe(false);
  });

  it("still matches a bare scalar value", () => {
    const flagData: FlagData = {
      key: "country-flag",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [{ attribute: "country", operator: "EQUALS", value: "US" }],
        },
      ],
    };

    expect(evaluateFlag(flagData, { country: "US" })).toBe(true);
    expect(evaluateFlag(flagData, { country: "AR" })).toBe(false);
  });

  it("still matches a bare array value for IN_LIST (arrays are not wrapper objects)", () => {
    const flagData: FlagData = {
      key: "countries-flag",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [{ attribute: "country", operator: "IN_LIST", value: ["AR", "US"] }],
        },
      ],
    };

    expect(evaluateFlag(flagData, { country: "AR" })).toBe(true);
    expect(evaluateFlag(flagData, { country: "MX" })).toBe(false);
  });

  it("treats a null attribute in context as missing, like the server's context.get", () => {
    const flagData: FlagData = {
      key: "country-flag",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [
            { attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } },
          ],
        },
      ],
    };

    expect(evaluateFlag(flagData, { country: null })).toBe(false);
  });

  it("treats a wrapped null value as missing, like the server's expected_value check", () => {
    const flagData: FlagData = {
      key: "country-flag",
      is_enabled: true,
      rules: [
        {
          priority: 1,
          operator_logic: "AND",
          conditions: [
            { attribute: "country", operator: "EQUALS", value: { type: "string", value: null } },
          ],
        },
      ],
    };

    expect(evaluateFlag(flagData, { country: "US" })).toBe(false);
  });
});
