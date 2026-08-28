import { describe, it, expect, beforeEach } from "vitest";
import { FlagwardClient } from "../client";

describe("FlagwardClient", () => {
  let client: FlagwardClient;

  beforeEach(() => {
    client = new FlagwardClient({
      apiKey: "test-key",
      host: "http://localhost:8000",
    });
  });

  describe("initialization", () => {
    it("should create client with options", () => {
      expect(client).toBeDefined();
    });

    it("should not be ready before init", () => {
      expect(client.isReady()).toBe(false);
    });
  });

  describe("evaluate - basic", () => {
    it("should throw error for non-existent flag", () => {
      expect(() => client.evaluate("nonexistent")).toThrow('Flag "nonexistent" not found');
    });

    it("should return false for disabled flag", () => {
      // Manually set flag data
      (client as any).flagsData = {
        "disabled-flag": {
          key: "disabled-flag",
          is_enabled: false,
          rules: [],
        },
      };

      expect(client.evaluate("disabled-flag")).toBe(false);
    });

    it("should return true for enabled flag without rules", () => {
      (client as any).flagsData = {
        "enabled-flag": {
          key: "enabled-flag",
          is_enabled: true,
          rules: [],
        },
      };

      expect(client.evaluate("enabled-flag")).toBe(true);
    });
  });

  describe("evaluate - conditions", () => {
    it("should evaluate EQUALS condition", () => {
      (client as any).flagsData = {
        "country-flag": {
          key: "country-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "country", operator: "EQUALS", value: "AR" }],
            },
          ],
        },
      };

      expect(client.evaluate("country-flag", { country: "AR" })).toBe(true);
      expect(client.evaluate("country-flag", { country: "US" })).toBe(false);
    });

    it("should evaluate NOT_EQUALS condition", () => {
      (client as any).flagsData = {
        "not-free-flag": {
          key: "not-free-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "plan", operator: "NOT_EQUALS", value: "free" }],
            },
          ],
        },
      };

      expect(client.evaluate("not-free-flag", { plan: "pro" })).toBe(true);
      expect(client.evaluate("not-free-flag", { plan: "free" })).toBe(false);
    });

    it("should evaluate GREATER_THAN condition", () => {
      (client as any).flagsData = {
        "age-flag": {
          key: "age-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "age", operator: "GREATER_THAN", value: 18 }],
            },
          ],
        },
      };

      expect(client.evaluate("age-flag", { age: 25 })).toBe(true);
      expect(client.evaluate("age-flag", { age: 15 })).toBe(false);
      expect(client.evaluate("age-flag", { age: 18 })).toBe(false);
    });

    it("should evaluate LESS_THAN condition", () => {
      (client as any).flagsData = {
        "young-flag": {
          key: "young-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "age", operator: "LESS_THAN", value: 65 }],
            },
          ],
        },
      };

      expect(client.evaluate("young-flag", { age: 30 })).toBe(true);
      expect(client.evaluate("young-flag", { age: 70 })).toBe(false);
    });

    it("should evaluate IN_LIST condition", () => {
      (client as any).flagsData = {
        "countries-flag": {
          key: "countries-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [
                { attribute: "country", operator: "IN_LIST", value: ["AR", "US", "BR"] },
              ],
            },
          ],
        },
      };

      expect(client.evaluate("countries-flag", { country: "AR" })).toBe(true);
      expect(client.evaluate("countries-flag", { country: "US" })).toBe(true);
      expect(client.evaluate("countries-flag", { country: "MX" })).toBe(false);
    });

    it("should evaluate CONTAINS condition", () => {
      (client as any).flagsData = {
        "email-flag": {
          key: "email-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [
                { attribute: "email", operator: "CONTAINS", value: "@gmail.com" },
              ],
            },
          ],
        },
      };

      expect(client.evaluate("email-flag", { email: "user@gmail.com" })).toBe(true);
      expect(client.evaluate("email-flag", { email: "user@yahoo.com" })).toBe(false);
    });

    it("should return false when attribute is missing", () => {
      (client as any).flagsData = {
        "missing-attr-flag": {
          key: "missing-attr-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "country", operator: "EQUALS", value: "AR" }],
            },
          ],
        },
      };

      expect(client.evaluate("missing-attr-flag", {})).toBe(false);
    });
  });

  describe("evaluate - rules", () => {
    it("should evaluate AND rule (all conditions must match)", () => {
      (client as any).flagsData = {
        "and-flag": {
          key: "and-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [
                { attribute: "country", operator: "EQUALS", value: "AR" },
                { attribute: "plan", operator: "EQUALS", value: "pro" },
              ],
            },
          ],
        },
      };

      expect(client.evaluate("and-flag", { country: "AR", plan: "pro" })).toBe(true);
      expect(client.evaluate("and-flag", { country: "AR", plan: "free" })).toBe(false);
      expect(client.evaluate("and-flag", { country: "US", plan: "pro" })).toBe(false);
    });

    it("should evaluate OR rule (at least one condition must match)", () => {
      (client as any).flagsData = {
        "or-flag": {
          key: "or-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "OR",
              conditions: [
                { attribute: "country", operator: "EQUALS", value: "AR" },
                { attribute: "country", operator: "EQUALS", value: "US" },
              ],
            },
          ],
        },
      };

      expect(client.evaluate("or-flag", { country: "AR" })).toBe(true);
      expect(client.evaluate("or-flag", { country: "US" })).toBe(true);
      expect(client.evaluate("or-flag", { country: "MX" })).toBe(false);
    });

    it("should evaluate rules by priority", () => {
      (client as any).flagsData = {
        "priority-flag": {
          key: "priority-flag",
          is_enabled: true,
          rules: [
            {
              priority: 2,
              operator_logic: "AND",
              conditions: [{ attribute: "plan", operator: "EQUALS", value: "free" }],
            },
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [{ attribute: "plan", operator: "EQUALS", value: "pro" }],
            },
          ],
        },
      };

      // Priority 1 (pro) should match first
      expect(client.evaluate("priority-flag", { plan: "pro" })).toBe(true);
      // Priority 1 doesn't match, but priority 2 (free) does
      expect(client.evaluate("priority-flag", { plan: "free" })).toBe(true);
    });

    it("should return true if no conditions in rule", () => {
      (client as any).flagsData = {
        "empty-conditions-flag": {
          key: "empty-conditions-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [],
            },
          ],
        },
      };

      expect(client.evaluate("empty-conditions-flag", {})).toBe(true);
    });
  });

  describe("context merging", () => {
    it("should merge provider context with flag context", () => {
      (client as any).flagsData = {
        "merged-flag": {
          key: "merged-flag",
          is_enabled: true,
          rules: [
            {
              priority: 1,
              operator_logic: "AND",
              conditions: [
                { attribute: "country", operator: "EQUALS", value: "AR" },
                { attribute: "plan", operator: "EQUALS", value: "pro" },
              ],
            },
          ],
        },
      };

      // Flag context overrides provider context
      const providerContext = { country: "AR", plan: "free" };
      const flagContext = { plan: "pro" };
      const mergedContext = { ...providerContext, ...flagContext };

      expect(client.evaluate("merged-flag", mergedContext)).toBe(true);
    });
  });

  describe("getFlag", () => {
    it("should return flag value", () => {
      (client as any).flagsData = {
        "test-flag": {
          key: "test-flag",
          is_enabled: true,
          rules: [],
        },
      };

      expect(client.getFlag("test-flag")).toBe(true);
    });

    it("should return undefined for non-existent flag", () => {
      expect(client.getFlag("nonexistent")).toBeUndefined();
    });
  });

  describe("cachedFlags", () => {
    it("should return copy of cached flags", () => {
      (client as any).flagsData = {
        "flag-1": { key: "flag-1", is_enabled: true, rules: [] },
        "flag-2": { key: "flag-2", is_enabled: false, rules: [] },
      };

      const flags = client.cachedFlags;
      expect(flags).toEqual({ "flag-1": true, "flag-2": false });
    });
  });
});
