import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { createLogger, evaluateFlag, type UserContext } from "@flagward/core";
import { FLAGWARD } from "./context.js";

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

  const logger = state.client.logger;

  return {
    // Evaluated from the snapshot the render was produced from, so the value
    // shown and the update that caused it can never disagree.
    value: computed(() => {
      if (state.isLoading.value) return undefined;

      // Resolved inside the computed, not outside: reading through toValue is
      // what registers the dependency, so a context that changes re-evaluates
      // the flag. Spreading a ref instead would copy Vue's internals and drop
      // every attribute, silently -- the rule simply never matches.
      const resolved = evaluateFlag(state.flagsData.value[key], {
        ...toValue(state.context),
        ...toValue(flagContext),
      });

      if (resolved === undefined) {
        logger.warn(
          `unknown-flag:${key}`,
          `Flag "${key}" is not in this environment, so it reads as undefined. ` +
            "Check the key, and that the flag exists in the environment this " +
            "API key belongs to.",
        );
      }

      return resolved;
    }),
    isLoading: computed(() => state.isLoading.value),
    error: computed(() => state.error.value),
  };
}
