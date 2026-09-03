import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import {
  createLogger,
  evaluateFlag,
  toFlagMap,
  type FlagMap,
  type UserContext,
} from "@flagward/core";
import { FLAGWARD } from "./context.js";

export interface UseFlagsResult {
  flags: ComputedRef<FlagMap>;
  isLoading: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
  /** Resolve one flag, optionally against attributes this call adds. */
  getFlag: (
    key: string,
    flagContext?: MaybeRefOrGetter<UserContext>,
  ) => boolean | undefined;
}

export function useFlags(): UseFlagsResult {
  const state = inject(FLAGWARD, null);

  if (!state) {
    createLogger().error(
      "no-plugin",
      "useFlags() was called in an application that never installed the " +
        "plugin, so it can only return an empty set. Add " +
        "app.use(flagward({ apiKey })) before mounting.",
    );

    return {
      flags: computed(() => ({})),
      isLoading: computed(() => false),
      error: computed(() => null),
      getFlag: () => undefined,
    };
  }

  const logger = state.client.logger;

  /**
   * Resolves one flag, and reports a key this environment does not have.
   *
   * Reporting inline here, where `useFlag` moved it into a watcher, is not an
   * inconsistency. This is a function the caller invokes: it runs when asked
   * to, exactly as often as it is asked, so a warning is a direct answer to a
   * direct question. A computed runs on Vue's schedule instead, which is why
   * the effect had to leave it.
   */
  const getFlag = (
    key: string,
    flagContext?: MaybeRefOrGetter<UserContext>,
  ): boolean | undefined => {
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
  };

  return {
    flags: computed(() => toFlagMap(state.flagsData.value, toValue(state.context))),
    isLoading: computed(() => state.isLoading.value),
    error: computed(() => state.error.value),
    getFlag,
  };
}
