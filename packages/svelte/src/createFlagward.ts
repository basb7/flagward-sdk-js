import { get, writable, type Readable } from "svelte/store";
import {
  evaluateFlag,
  FlagwardClient,
  type FlagDataMap,
  type LogLevel,
  type UserContext,
} from "@flagward/core";
import { isReadable, type MaybeStore } from "./store.js";
import { SDK_VERSION } from "./version.js";

/**
 * How this adapter names itself at registration.
 *
 * Not yet one of the server's stored choices, which is why the dashboard
 * shows it as its own row rather than folding it into JavaScript. It is
 * named here so that, once the server records adapters, a Svelte application
 * is already distinguishable from a Vue, Solid or React one without changing
 * what anybody installed.
 */
const SDK_TYPE = "SVELTE";

export interface FlagwardState {
  client: FlagwardClient;
  flagsData: Readable<FlagDataMap>;
  isLoading: Readable<boolean>;
  error: Readable<Error | null>;
  /**
   * Held unresolved. The attributes an application targets on -- the plan,
   * the country, whether anybody is signed in -- change while it runs, so
   * resolving this once here would answer every later evaluation with what
   * was true when the client was built.
   */
  context: MaybeStore<UserContext>;
  /** Resolve one flag right now, outside any reactive graph. */
  getFlag: (key: string, flagContext?: UserContext) => boolean | undefined;
  destroy: () => void;
}

export interface FlagwardOptions {
  apiKey: string;
  host?: string;
  /**
   * Attributes every flag is evaluated against, unless a call overrides them.
   *
   * Takes a store as readily as a plain object, so the signed-in user's
   * attributes can be handed over once and stay current.
   */
  context?: MaybeStore<UserContext>;
  /** How much the SDK reports to the console. Defaults to "warn". */
  logLevel?: LogLevel;
}

/** Reads a context held either plain or behind a store, right now. */
function currentContext(value: MaybeStore<UserContext>): UserContext {
  return isReadable<UserContext>(value) ? get(value) : value;
}

/**
 * Builds one Flagward client and the stores every store-returning function in
 * this package reads from.
 *
 * Uses no lifecycle function of Svelte's own -- no onDestroy, no onMount,
 * nothing that only works inside a component -- so it is callable from
 * anywhere a plain function can run: a module, a SvelteKit `load`, a test.
 * The caller then owns `destroy()`, because nothing here can call it on
 * their behalf outside a component. `setFlagward` is the thin wrapper that
 * adds that lifecycle wiring for the common case of calling this from a root
 * component.
 */
export function createFlagward(options: FlagwardOptions): FlagwardState {
  const client = new FlagwardClient({
    apiKey: options.apiKey,
    host: options.host,
    logLevel: options.logLevel,
    sdkType: SDK_TYPE,
    sdkVersion: SDK_VERSION,
  });

  const appContext = options.context ?? {};

  const flagsData = writable<FlagDataMap>({});
  const isLoading = writable(true);
  const error = writable<Error | null>(null);

  const unsubscribe = client.subscribe((snapshot) => {
    flagsData.set(snapshot);
    // Flags arriving means the client is talking to the server again.
    // Leaving a past failure in place would keep every consumer that reads
    // `error` showing a problem that is over.
    error.set(null);
  });

  client
    .init()
    .then(() => {
      flagsData.set(client.snapshot);
    })
    .catch((err: unknown) => {
      // Startup failing is never fatal to the application: it still renders
      // and every flag reads as undefined, so each caller's own fallback
      // decides what the user sees.
      client.logger.warn(
        "init-failed",
        "Could not load flags, so every flag falls back to undefined and " +
          "your own defaults apply. The cause is reported above.",
      );
      error.set(err instanceof Error ? err : new Error(String(err)));
    })
    .finally(() => {
      // Outside the success path on purpose: a startup that failed is
      // exactly when the stream and the connectivity watcher matter most.
      client.connect();
      isLoading.set(false);
    });

  return {
    client,
    // Typed as Readable, never wrapped in readonly() from svelte/store: a
    // Writable is structurally assignable to a Readable, so the type alone
    // gives every consumer a read-only view with zero runtime cost, and
    // nothing here depends on which Svelte version's svelte/store happens to
    // export a readonly() helper.
    flagsData,
    isLoading,
    error,
    context: appContext,
    getFlag(key: string, flagContext?: UserContext): boolean | undefined {
      const resolved = evaluateFlag(get(flagsData)[key], {
        ...currentContext(appContext),
        ...flagContext,
      });

      if (resolved === undefined) {
        client.logger.warn(
          `unknown-flag:${key}`,
          `Flag "${key}" is not in this environment, so it reads as undefined. ` +
            "Check the key, and that the flag exists in the environment this " +
            "API key belongs to.",
        );
      }

      return resolved;
    },
    destroy() {
      unsubscribe();
      client.destroy();
    },
  };
}
