import { createContext, type Accessor } from "solid-js";
import type { FlagDataMap, FlagwardClient, UserContext } from "@flagward/core";

/**
 * A value taken either plain or behind a signal, the same shape Vue's adapter
 * calls MaybeRefOrGetter. Solid has no library-level helper for this -- a
 * signal already is a function, so the ambiguity is only ever "is this a
 * function or the value itself" -- which is exactly what `access` below
 * resolves.
 */
export type MaybeAccessor<T> = T | Accessor<T>;

/**
 * Solid's missing `toValue`. Vue ships one because a ref, a getter and a
 * plain value are three different shapes its reactivity system has to
 * unwrap; Solid only ever has two, a function or the value, so this is the
 * whole implementation. Defined once here rather than inlined everywhere a
 * context might be a plain object or a signal.
 */
export function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export interface FlagwardState {
  client: FlagwardClient;
  flagsData: Accessor<FlagDataMap>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  /**
   * Held unresolved, exactly as Vue's plugin holds a MaybeRefOrGetter: the
   * attributes an application targets on -- the plan, the country, whether
   * anybody is signed in -- change while it runs, so resolving this once at
   * setup would answer every later evaluation with what was true at startup.
   */
  context: MaybeAccessor<UserContext>;
}

/**
 * A Context object rather than a Symbol-keyed provide/inject pair, because
 * that is what Solid's own context API is built around. Not exported as a
 * default so a consumer always reaches it through useFlag/useFlags instead of
 * reading the context directly.
 */
export const FlagwardContext = createContext<FlagwardState>();
