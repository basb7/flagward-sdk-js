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

export interface FlagValue {
  key: string;
  value: boolean | string;
}

export type FlagMap = Record<string, boolean | string>;
