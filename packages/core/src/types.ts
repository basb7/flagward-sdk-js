export interface Condition {
  attribute: string;
  operator: string;
  value: unknown;
}

export interface Rule {
  priority: number;
  operator_logic: "AND" | "OR";
  /**
   * The variant this rule steers its own rollout share to, for a MULTIVARIATE
   * flag. `null` means the rule has no rollout of its own: a match falls
   * straight through to the flag's global percentage split.
   */
  rollout_variant?: string | null;
  /**
   * Share of matching users (0-100) sent to `rollout_variant`. `null` (or
   * `>= 100`) behaves like the documented default of 100: every user that
   * matches the rule gets `rollout_variant`, no hash needed.
   */
  rollout_percentage?: number | null;
  conditions: Condition[];
}

/** One variant of a MULTIVARIATE flag, in the server's split order. */
export interface Variant {
  name: string;
  percentage_allocation: number;
  /** The variant returned when there is no user id to bucket by. */
  is_control: boolean;
}

export interface Flag {
  key: string;
  name: string;
  is_enabled: boolean;
  flag_type: "BOOLEAN" | "MULTIVARIATE";
  variants: Variant[];
  rules: Rule[];
  overridden: boolean;
}

export interface FlagData {
  key: string;
  is_enabled: boolean;
  flag_type?: "BOOLEAN" | "MULTIVARIATE";
  variants?: Variant[];
  overridden?: boolean;
  rules: Rule[];
}

/**
 * The resolved boolean value of every flag in an environment.
 *
 * A MULTIVARIATE flag reads here as its enabled/disabled boolean (after any
 * override), the same value `evaluateFlag` returns for it -- use
 * `evaluateVariant` / `getVariant` for the variant name itself.
 */
export type FlagMap = Record<string, boolean>;
export type FlagDataMap = Record<string, FlagData>;
export type UserContext = Record<string, unknown>;
