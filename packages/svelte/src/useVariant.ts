import { readable } from "svelte/store";
import { createLogger, type UserContext } from "@flagward/core";
import { getFlagward } from "./context.js";
import type { MaybeStore } from "./store.js";
import { variantStore, type UseVariantResult } from "./variantStore.js";

export function useVariant(key: string, flagContext?: MaybeStore<UserContext>): UseVariantResult {
  const state = getFlagward();

  if (!state) {
    createLogger().error(
      "no-context",
      `useVariant("${key}") was called with no Flagward state on the context, ` +
        "so it can only return undefined. Call setFlagward({ apiKey }) in a " +
        "root component's <script>, for example a SvelteKit +layout.svelte.",
    );

    return readable({ value: undefined, isLoading: false, error: null });
  }

  return variantStore(state, key, flagContext);
}
