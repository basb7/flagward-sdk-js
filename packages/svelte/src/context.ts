import { getContext, onDestroy, setContext } from "svelte";
import {
  createFlagward,
  type FlagwardOptions,
  type FlagwardState,
} from "./createFlagward.js";

/**
 * Symbol rather than a string, so this context key cannot collide with
 * another library's, whatever it decides to call itself. Same reasoning as
 * Vue's InjectionKey and Solid's dedicated Context object.
 */
const FLAGWARD = Symbol("flagward");

/**
 * Builds a Flagward client, puts it on the context, and ties its teardown to
 * this component's lifecycle.
 *
 * Must be called during component initialisation -- directly in a `<script>`
 * block, never inside a callback, a promise, or after an `await`. That is
 * the only moment Svelte's own setContext and onDestroy know which component
 * they belong to; called anywhere else, Svelte throws its own error, and
 * that is left to happen here rather than caught: a caught-and-silenced
 * failure would only mean the context is missing later, further from where
 * the call actually went wrong.
 */
export function setFlagward(options: FlagwardOptions): FlagwardState {
  const state = createFlagward(options);
  setContext(FLAGWARD, state);
  onDestroy(() => state.destroy());
  return state;
}

/**
 * Reads the state a parent component put on the context, or null.
 *
 * getContext throws outside a component, so that is caught here rather than
 * left to escape into whoever called useFlag or useFlags: it is what lets
 * those degrade to a reported, working default instead of crashing somebody
 * else's component tree over a missing setFlagward call.
 */
export function getFlagward(): FlagwardState | null {
  try {
    return getContext<FlagwardState>(FLAGWARD) ?? null;
  } catch {
    return null;
  }
}
