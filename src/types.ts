export interface Condition {
  attribute: string;
  operator: string;
  value: unknown;
}

export interface Rule {
  priority: number;
  operator_logic: "AND" | "OR";
  conditions: Condition[];
}

export interface Flag {
  key: string;
  name: string;
  is_enabled: boolean;
  flag_type: "BOOLEAN" | "MULTIVARIATE";
  rules: Rule[];
}

export interface FlagData {
  key: string;
  is_enabled: boolean;
  rules: Rule[];
}

/**
 * The resolved value of every flag in an environment.
 *
 * Boolean today. MULTIVARIATE flags exist in the wire format but are not
 * evaluated yet, so typing this as `boolean | string` would make every caller
 * handle a case that cannot occur. It widens when multivariate lands.
 */
export type FlagMap = Record<string, boolean>;
export type FlagDataMap = Record<string, FlagData>;
export type UserContext = Record<string, unknown>;
