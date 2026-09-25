import { derived, type Readable } from "svelte/store";
import { evaluateVariant, type UserContext } from "@flagward/core";
import { toReadable, type MaybeStore } from "./store.js";
import type { FlagwardState } from "./createFlagward.js";

export interface VariantState {
  /** The variant's name, or undefined while loading, if the flag does not
   * exist, is not MULTIVARIATE, or is disabled/overridden. */
  value: string | undefined;
  isLoading: boolean;
  error: Error | null;
}

export type UseVariantResult = Readable<VariantState>;

/**
 * Resolves one MULTIVARIATE flag's variant against a state built by
 * createFlagward or setFlagward. Same shape as `flagStore`, just returning a
 * variant name instead of a boolean -- see `flagStore` for why this is a
 * `derived` rather than a component-only effect.
 */
export function variantStore(
  state: FlagwardState,
  key: string,
  flagContext?: MaybeStore<UserContext>,
): UseVariantResult {
  return derived(
    [
      state.flagsData,
      state.isLoading,
      state.error,
      toReadable(state.context),
      toReadable(flagContext ?? {}),
    ],
    ([flagsData, isLoading, error, appContext, callContext]) => {
      const value = isLoading
        ? undefined
        : evaluateVariant(flagsData[key], { ...appContext, ...callContext });

      // Only a genuinely unknown key is reported -- a known flag that is not
      // MULTIVARIATE, disabled or overridden resolves to undefined for a
      // documented reason, not an unknown one.
      if (!isLoading && value === undefined && flagsData[key] === undefined) {
        state.client.logger.warn(
          `unknown-flag:${key}`,
          `Flag "${key}" is not in this environment, so it reads as undefined. ` +
            "Check the key, and that the flag exists in the environment this " +
            "API key belongs to.",
        );
      }

      return { value, isLoading, error };
    },
  );
}
