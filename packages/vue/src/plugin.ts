import { ref, shallowRef, type App, type Plugin } from "vue";
import {
  FlagwardClient,
  type FlagDataMap,
  type LogLevel,
  type UserContext,
} from "@flagward/core";
import { FLAGWARD } from "./context.js";
import { SDK_VERSION } from "./version.js";

/**
 * How this adapter names itself at registration.
 *
 * Not yet one of the server's stored choices, which is why the dashboard shows
 * it as its own row rather than folding it into JavaScript. It is named here so
 * that, once the server records adapters, a Vue application is already
 * distinguishable from a React one without changing what anybody installed.
 */
const SDK_TYPE = "VUE";

export interface FlagwardPluginOptions {
  apiKey: string;
  host?: string;
  /** Attributes every flag is evaluated against, unless a call overrides them. */
  context?: UserContext;
  /** How much the SDK reports to the console. Defaults to "warn". */
  logLevel?: LogLevel;
}

/**
 * Installs Flagward on a Vue application.
 *
 * ```ts
 * createApp(App).use(flagward({ apiKey })).mount("#app")
 * ```
 *
 * One client per application, reached by the composables from anywhere in the
 * tree. Nothing has to be wrapped, which is the point: a feature flag is asked
 * for wherever the decision is made, not where somebody remembered to put a
 * provider.
 */
export function flagward(options: FlagwardPluginOptions): Plugin {
  return {
    install(app: App) {
      const client = new FlagwardClient({
        apiKey: options.apiKey,
        host: options.host,
        logLevel: options.logLevel,
        sdkType: SDK_TYPE,
        sdkVersion: SDK_VERSION,
      });

      const flagsData = shallowRef<FlagDataMap>({});
      const isLoading = ref(true);
      const error = ref<Error | null>(null);

      const unsubscribe = client.subscribe((snapshot) => {
        flagsData.value = snapshot;
        // Flags arriving means the client is talking to the server again.
        // Leaving a past failure in place would keep every consumer that checks
        // `error` showing a problem that is over.
        error.value = null;
      });

      client
        .init()
        .then(() => {
          flagsData.value = client.snapshot;
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
          error.value = err instanceof Error ? err : new Error(String(err));
        })
        .finally(() => {
          // Outside the success path on purpose: a startup that failed is
          // exactly when the stream and the connectivity watcher matter most.
          client.connect();
          isLoading.value = false;
        });

      app.provide(FLAGWARD, {
        client,
        flagsData,
        isLoading,
        error,
        context: options.context ?? {},
      });

      app.onUnmount(() => {
        unsubscribe();
        client.destroy();
      });
    },
  };
}
