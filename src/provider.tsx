import { useEffect, useState } from "react";
import { EasyFlagsClient } from "./client";
import { EasyFlagsContext, type EasyFlagsContextValue } from "./context";
import type { FlagMap, UserContext } from "./types";

interface EasyFlagsProviderProps {
  apiKey: string;
  host?: string;
  context?: UserContext;
  children: React.ReactNode;
}

export function EasyFlagsProvider({
  apiKey,
  host,
  context: userContext = {},
  children,
}: EasyFlagsProviderProps) {
  const [client] = useState(
    () => new EasyFlagsClient({ apiKey, host })
  );
  const [flags, setFlags] = useState<FlagMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initClient = async () => {
      try {
        await client.init();
        setFlags(client.cachedFlags);
        client.connect();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    initClient();

    const unsubscribe = client.subscribe((newFlags) => {
      setFlags(newFlags);
    });

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, [client]);

  const value: EasyFlagsContextValue = {
    client,
    flags,
    isLoading,
    error,
    context: userContext,
  };

  return (
    <EasyFlagsContext.Provider value={value}>
      {children}
    </EasyFlagsContext.Provider>
  );
}
