/**
 * The store contract, and the two things this package needs to do with it.
 *
 * Kept apart from context.ts on purpose. These are general facts about
 * Svelte stores, true wherever a store is used, and nothing here knows that
 * Flagward exists. Leaving them next to the context wiring meant
 * createFlagward had to import from context.ts while context.ts imported
 * createFlagward back -- a cycle that happened to work, because both
 * references were only reached inside function bodies, but that told the
 * reader the two modules were one thing when they are not.
 */
import { readable, type Readable } from "svelte/store";

/** A value taken either plain or behind a store. */
export type MaybeStore<T> = T | Readable<T>;

/**
 * Duck-types the store contract: `.subscribe` is the entire contract
 * Svelte's own reactivity places on something before treating it as a store
 * -- `$store` and `derived` ask nothing else of it -- so it is all this
 * needs to decide whether a value already is one.
 */
export function isReadable<T>(value: unknown): value is Readable<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === "function"
  );
}

/**
 * Passes a store through untouched, and wraps a plain value in `readable`.
 * `derived` only accepts stores, and a caller should be able to hand over a
 * plain context object as readily as a store -- forcing every context into
 * a store just to satisfy `derived` would be ceremony most callers never
 * asked for.
 */
export function toReadable<T>(value: MaybeStore<T>): Readable<T> {
  return isReadable<T>(value) ? value : readable(value);
}
