import {
  computed,
  getCurrentScope,
  inject,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from "vue";
import { createLogger, evaluateVariant, type UserContext } from "@flagward/core";
import { FLAGWARD, type FlagwardState } from "./context.js";

export interface UseVariantResult {
  /** The variant's name, or undefined while loading, if the flag does not
   * exist, is not MULTIVARIATE, or is disabled/overridden. */
  value: ComputedRef<string | undefined>;
  isLoading: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
}

/**
 * Resolves a MULTIVARIATE flag's variant. Same shape and reactivity as
 * `useFlag`, just returning a variant name instead of a boolean -- see
 * `useFlag` for why context is read through `toValue` here rather than
 * captured once outside.
 */
export function useVariant(
  key: string,
  flagContext?: MaybeRefOrGetter<UserContext>,
): UseVariantResult {
  const state = inject(FLAGWARD, null);

  if (!state) {
    createLogger().error(
      "no-plugin",
      `useVariant("${key}") was called in an application that never installed ` +
        "the plugin, so it can only return undefined. Add " +
        "app.use(flagward({ apiKey })) before mounting.",
    );

    return {
      value: computed(() => undefined),
      isLoading: computed(() => false),
      error: computed(() => null),
    };
  }

  const value = computed(() => {
    if (state.isLoading.value) return undefined;

    return evaluateVariant(state.flagsData.value[key], {
      ...toValue(state.context),
      ...toValue(flagContext),
    });
  });

  reportIfUnknown(key, value, state);

  return {
    value,
    isLoading: computed(() => state.isLoading.value),
    error: computed(() => state.error.value),
  };
}

/**
 * Reports a key this environment does not have, once it is certain it does
 * not -- and not a known flag that simply is not MULTIVARIATE, disabled or
 * overridden, which resolves to undefined for a documented reason rather than
 * an unknown one. See `useFlag`'s equivalent for why this lives in a watcher.
 */
function reportIfUnknown(
  key: string,
  value: ComputedRef<string | undefined>,
  state: FlagwardState,
): void {
  if (!getCurrentScope()) return;

  watch(
    [value, state.isLoading, state.flagsData],
    ([resolved, loading, flagsData]) => {
      if (loading || resolved !== undefined || flagsData[key] !== undefined) return;

      state.client.logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
    },
    { immediate: true },
  );
}
