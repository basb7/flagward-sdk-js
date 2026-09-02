import { useContext } from "react";
import { FlagwardContext } from "./context.js";
import { createLogger, evaluateFlag } from "@flagward/core";
import type { UserContext } from "@flagward/core";

export interface UseFlagResult {
  /** The flag's value, or undefined while loading or if it does not exist. */
  value: boolean | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useFlag(key: string, flagContext?: UserContext): UseFlagResult {
  const context = useContext(FlagwardContext);
  const logger = context.client?.logger ?? createLogger();

  // Merge provider context with flag-specific context
  const mergedContext = { ...context.context, ...flagContext };

  let value: boolean | undefined;

  if (!context.client) {
    logger.error(
      "no-provider",
      `useFlag("${key}") was called outside FlagwardProvider, so it can only ` +
        "return undefined. Wrap the tree in <FlagwardProvider>.",
    );
  } else if (!context.isLoading) {
    // Evaluated against the data this render was produced from, so the value
    // shown and the update that caused it can never disagree.
    value = evaluateFlag(context.flagsData[key], mergedContext);

    if (value === undefined) {
      logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
    }
  }

  return {
    value,
    isLoading: context.isLoading,
    error: context.error,
  };
}
