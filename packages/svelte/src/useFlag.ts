import { readable } from "svelte/store";
import { createLogger, type UserContext } from "@flagward/core";
import { getFlagward } from "./context.js";
import type { MaybeStore } from "./store.js";
import { flagStore, type UseFlagResult } from "./flagStore.js";

export function useFlag(key: string, flagContext?: MaybeStore<UserContext>): UseFlagResult {
  const state = getFlagward();

  if (!state) {
    createLogger().error(
      "no-context",
      `useFlag("${key}") was called with no Flagward state on the context, so ` +
        "it can only return undefined. Call setFlagward({ apiKey }) in a root " +
        "component's <script>, for example a SvelteKit +layout.svelte.",
    );

    return readable({ value: undefined, isLoading: false, error: null });
  }

  return flagStore(state, key, flagContext);
}
