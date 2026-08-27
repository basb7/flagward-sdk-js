import { useContext } from "react";
import { EasyFlagsContext } from "./context";
import type { UserContext } from "./types";

interface UseFlagResult {
  value: boolean | string | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useFlag(key: string, flagContext?: UserContext): UseFlagResult {
  const context = useContext(EasyFlagsContext);

  // Merge provider context with flag-specific context
  const mergedContext = { ...context.context, ...flagContext };

  let value: boolean | string | undefined;
  try {
    if (context.client && !context.isLoading) {
      value = context.client.evaluate(key, mergedContext);
    }
  } catch {
    // Flag not found
  }

  return {
    value,
    isLoading: context.isLoading,
    error: context.error,
  };
}
