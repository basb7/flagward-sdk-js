"use client";

import { useContext, useEffect, useMemo } from "react";
import { FlagwardContext } from "./context.js";
import { createLogger, evaluateVariant } from "@flagward/core";
import type { UserContext } from "@flagward/core";

export interface UseVariantResult {
  /** The variant's name, or undefined while loading, if the flag does not
   * exist, is not MULTIVARIATE, or is disabled/overridden. */
  value: string | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Resolves a MULTIVARIATE flag's variant. Same shape and lifecycle as
 * `useFlag`, just returning a variant name instead of a boolean -- see
 * `useFlag` for why the reporting sits in an effect rather than the render.
 */
export function useVariant(key: string, flagContext?: UserContext): UseVariantResult {
  const context = useContext(FlagwardContext);

  const logger = useMemo(
    () => context.client?.logger ?? createLogger(),
    [context.client],
  );

  const mergedContext = { ...context.context, ...flagContext };

  const value =
    !context.client || context.isLoading
      ? undefined
      : evaluateVariant(context.flagsData[key], mergedContext);

  useEffect(() => {
    if (!context.client) {
      logger.error(
        "no-provider",
        `useVariant("${key}") was called outside FlagwardProvider, so it can only ` +
          "return undefined. Wrap the tree in <FlagwardProvider>.",
      );
      return;
    }

    if (context.isLoading || value !== undefined) return;

    if (context.flagsData[key] === undefined) {
      logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
    }
    // A known flag that is not MULTIVARIATE, disabled, overridden, or has no
    // variants also resolves to undefined here -- that is documented
    // behaviour for evaluateVariant, not an unknown key, so it stays quiet.
  }, [context.client, context.isLoading, value, key, logger, context.flagsData]);

  return {
    value,
    isLoading: context.isLoading,
    error: context.error,
  };
}
