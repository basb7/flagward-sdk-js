import { createComponent, createSignal, onCleanup, type JSX } from "solid-js";
import {
  FlagwardClient,
  type FlagDataMap,
  type LogLevel,
  type UserContext,
} from "@flagward/core";
import { FlagwardContext, type MaybeAccessor } from "./context.js";
import { SDK_VERSION } from "./version.js";

/**
 * How this adapter names itself at registration.
 *
 * Not yet one of the server's stored choices, which is why the dashboard shows
 * it as its own row rather than folding it into JavaScript. It is named here
 * so that, once the server records adapters, a Solid application is already
 * distinguishable from a Vue or a React one without changing what anybody
 * installed.
 */
const SDK_TYPE = "SOLID";

export interface FlagwardProviderProps {
  apiKey: string;
  host?: string;
  /**
   * Attributes every flag is evaluated against, unless a call overrides them.
   *
   * Takes a signal or a plain getter as readily as a plain object, so the
   * signed-in user's attributes can be handed over once and stay current.
   */
  context?: MaybeAccessor<UserContext>;
  /** How much the SDK reports to the console. Defaults to "warn". */
  logLevel?: LogLevel;
  children?: JSX.Element;
}

/**
 * Puts one Flagward client on the context, reached by useFlag and useFlags
 * from anywhere under it.
 *
 * ```ts
 * createComponent(FlagwardProvider, { apiKey, get children() { return app; } })
 * ```
 *
 * One client per subtree, which is normally one client for the whole
 * application. Nothing else has to be wrapped: a feature flag is asked for
 * wherever the decision is made, not where somebody remembered to nest a
 * consumer.
 */
export function FlagwardProvider(props: FlagwardProviderProps): JSX.Element {
  // Props are reactive in Solid, but the client is built once, so its
  // settings are read once here rather than through an accessor. Changing the
  // API key mid-flight would mean a different environment and a different
  // client entirely -- not something this component could migrate to safely,
  // so it is not something it tries to.
  const client = new FlagwardClient({
    apiKey: props.apiKey,
    host: props.host,
    logLevel: props.logLevel,
    sdkType: SDK_TYPE,
    sdkVersion: SDK_VERSION,
  });

  const [flagsData, setFlagsData] = createSignal<FlagDataMap>({});
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | null>(null);

  const unsubscribe = client.subscribe((snapshot) => {
    setFlagsData(snapshot);
    // Flags arriving means the client is talking to the server again. Leaving
    // a past failure in place would keep every consumer that reads `error`
    // showing a problem that is over.
    setError(null);
  });

  client
    .init()
    .then(() => {
      setFlagsData(client.snapshot);
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
      setError(err instanceof Error ? err : new Error(String(err)));
    })
    .finally(() => {
      // Outside the success path on purpose: a startup that failed is exactly
      // when the stream and the connectivity watcher matter most.
      client.connect();
      setIsLoading(false);
    });

  onCleanup(() => {
    unsubscribe();
    client.destroy();
  });

  return createComponent(FlagwardContext.Provider, {
    value: {
      client,
      flagsData,
      isLoading,
      error,
      context: props.context ?? {},
    },
    // A getter, not a value read up front: reading `props.children` eagerly
    // would evaluate it before this provider's context exists, which defeats
    // Solid's laziness and, for anything that reads the context on the way
    // in, would run before there is a context to read.
    get children() {
      return props.children;
    },
  });
}
