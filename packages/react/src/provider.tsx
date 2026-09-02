import { useEffect, useState } from "react";
import { FlagwardClient } from "@flagward/core";
import type { FlagDataMap, LogLevel, UserContext } from "@flagward/core";
import { FlagwardContext, type FlagwardContextValue } from "./context.js";
import { SDK_VERSION } from "./version.js";

export interface FlagwardProviderProps {
  apiKey: string;
  host?: string;
  context?: UserContext;
  /** How much the SDK reports to the console. Defaults to "warn". */
  logLevel?: LogLevel;
  children: React.ReactNode;
}

export function FlagwardProvider({
  apiKey,
  host,
  context: userContext = {},
  logLevel,
  children,
}: FlagwardProviderProps) {
  const [client] = useState(
    () => new FlagwardClient({ apiKey, host, logLevel, sdkVersion: SDK_VERSION })
  );
  // The flag data lives in React state, not in the client's mutable field,
  // so what a hook renders is what triggered the render.
  const [flagsData, setFlagsData] = useState<FlagDataMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initClient = async () => {
      try {
        await client.init();
        setFlagsData(client.snapshot);
      } catch (err) {
        // Startup failing is never fatal to the host application: the tree
        // still renders and every flag reads as undefined, so each caller's
        // own fallback decides what the user sees.
        client.logger.warn(
          "init-failed",
          "Could not load flags, so every flag falls back to undefined and " +
            "your own defaults apply. The cause is reported above.",
        );
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        // Outside the try on purpose: a startup that failed is exactly when
        // the stream and the connectivity watcher matter most, and leaving
        // them behind the success path meant a client that started offline
        // could never recover.
        client.connect();
        setIsLoading(false);
      }
    };

    initClient();

    const unsubscribe = client.subscribe((snapshot) => {
      setFlagsData(snapshot);
      // Flags arriving means the client is talking to the server again. Leaving
      // a past failure in state would keep every consumer that checks `error`
      // showing a problem that is over.
      setError(null);
    });

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, [client]);

  const value: FlagwardContextValue = {
    client,
    flagsData,
    isLoading,
    error,
    context: userContext,
  };

  return (
    <FlagwardContext.Provider value={value}>
      {children}
    </FlagwardContext.Provider>
  );
}
