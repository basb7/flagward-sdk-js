import {
  computed,
  getCurrentScope,
  inject,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from "vue";
import { createLogger, evaluateFlag, type UserContext } from "@flagward/core";
import { FLAGWARD, type FlagwardState } from "./context.js";

export interface UseFlagResult {
  /** The flag's value, or undefined while loading or if it does not exist. */
  value: ComputedRef<boolean | undefined>;
  isLoading: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
}

export function useFlag(
  key: string,
  flagContext?: MaybeRefOrGetter<UserContext>,
): UseFlagResult {
  const state = inject(FLAGWARD, null);

  if (!state) {
    createLogger().error(
      "no-plugin",
      `useFlag("${key}") was called in an application that never installed the ` +
        "plugin, so it can only return undefined. Add " +
        "app.use(flagward({ apiKey })) before mounting.",
    );

    return {
      value: computed(() => undefined),
      isLoading: computed(() => false),
      error: computed(() => null),
    };
  }

  /**
   * Resolves the flag, and does nothing else.
   *
   * Reading the context through toValue here, rather than capturing it once
   * outside, is what registers the dependency: a context that changes
   * re-evaluates the flag. Spreading a ref instead would copy Vue's internals
   * and drop every attribute, silently -- the rule simply never matches.
   */
  const value = computed(() => {
    if (state.isLoading.value) return undefined;

    return evaluateFlag(state.flagsData.value[key], {
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
 * Reports a key this environment does not have, once it is certain it does not.
 *
 * Deliberately not inside the computed above. A computed that writes to the
 * console is not a computed: it runs on Vue's schedule rather than the
 * caller's, it fires or does not depending on whether anybody read the value,
 * and nothing in `const { value } = useFlag(key)` suggests that reading has
 * consequences. Keeping the effect in an effect is what lets the value be read
 * anywhere, any number of times, with nothing happening.
 *
 * Waits for loading to finish. Reporting earlier would name every flag on
 * every page load, when the only thing wrong is that the answer has not
 * arrived yet.
 *
 * Only registered inside an effect scope. Called from a store or a route guard
 * with no scope to own it, a watcher would never be stopped, and a leaked
 * watcher is a worse trade than a missing console warning.
 */
function reportIfUnknown(
  key: string,
  value: ComputedRef<boolean | undefined>,
  state: FlagwardState,
): void {
  if (!getCurrentScope()) return;

  watch(
    [value, state.isLoading],
    ([resolved, loading]) => {
      if (loading || resolved !== undefined) return;

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
