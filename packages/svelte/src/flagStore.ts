import { derived, type Readable } from "svelte/store";
import { evaluateFlag, type UserContext } from "@flagward/core";
import { toReadable, type MaybeStore } from "./store.js";
import type { FlagwardState } from "./createFlagward.js";

export interface FlagState {
  /** The flag's value, or undefined while loading or if it does not exist. */
  value: boolean | undefined;
  isLoading: boolean;
  error: Error | null;
}

export type UseFlagResult = Readable<FlagState>;

/**
 * Resolves one flag against a state built by createFlagward or setFlagward.
 *
 * A derived over five sources, rather than a computed built from a getter:
 * `derived` is the store-level equivalent Svelte has, and reading every
 * input through it is what makes this work the same whether it is called
 * from a component or handed a state built by hand in a test or a SvelteKit
 * `load`.
 */
export function flagStore(
  state: FlagwardState,
  key: string,
  flagContext?: MaybeStore<UserContext>,
): UseFlagResult {
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
        : evaluateFlag(flagsData[key], { ...appContext, ...callContext });

      // Svelte 4 has no effect primitive outside a component, so there is no
      // separate place to put this the way the Vue and Solid adapters do,
      // moving it out of their computed/memo and into a watcher/effect. It
      // lands better than it looks: a derived body only runs while
      // something is subscribed, and Svelte unsubscribes when the component
      // reading `$flag` is destroyed, so the warning fires exactly when a
      // component is really reading the flag and stops when it stops. The
      // logger dedupes by key, so a component that re-renders does not
      // repeat it.
      if (!isLoading && value === undefined) {
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
