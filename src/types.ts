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

export type FlagMap = Record<string, boolean | string>;
export type FlagDataMap = Record<string, FlagData>;
export type UserContext = Record<string, unknown>;
