"use client";

import { useContext, useEffect, useMemo } from "react";
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

  // Memoised so the effect below has a stable dependency. Without a client
  // this builds a fresh logger, and a new object every render would re-run the
  // effect on every render for no reason.
  const logger = useMemo(
    () => context.client?.logger ?? createLogger(),
    [context.client],
  );

  const mergedContext = { ...context.context, ...flagContext };

  /**
   * Resolves the flag, and does nothing else.
   *
   * Evaluated against the data this render was produced from, so the value
   * shown and the update that caused it can never disagree.
   */
  const value =
    !context.client || context.isLoading
      ? undefined
      : evaluateFlag(context.flagsData[key], mergedContext);

  /**
   * Reports what the caller cannot see, after the render rather than during it.
   *
   * Rendering must be a pure calculation. React re-renders on its own schedule
   * -- a parent updating, an unrelated state change, StrictMode running the
   * render twice on purpose to expose exactly this -- so a render that writes
   * to the console produces a number of warnings that reflects React's
   * scheduling rather than anything that went wrong. The output was bounded
   * only because the logger deduplicates.
   *
   * The unknown-key warning waits for loading to finish. Reporting earlier
   * would name every flag on every page load, when the only thing wrong is
   * that the answer has not arrived yet.
   */
  useEffect(() => {
    if (!context.client) {
      logger.error(
        "no-provider",
        `useFlag("${key}") was called outside FlagwardProvider, so it can only ` +
          "return undefined. Wrap the tree in <FlagwardProvider>.",
      );
      return;
    }

    if (context.isLoading || value !== undefined) return;

    logger.warn(
      `unknown-flag:${key}`,
      `Flag "${key}" is not in this environment, so it reads as undefined. ` +
        "Check the key, and that the flag exists in the environment this " +
        "API key belongs to.",
    );
  }, [context.client, context.isLoading, value, key, logger]);

  return {
    value,
    isLoading: context.isLoading,
    error: context.error,
  };
}
