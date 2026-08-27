import { useContext, useEffect, useState } from "react";
import { EasyFlagsContext } from "./context";

interface UseFlagResult {
  value: boolean | string | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useFlag(key: string): UseFlagResult {
  const context = useContext(EasyFlagsContext);
  const [value, setValue] = useState<boolean | string | undefined>(undefined);

  useEffect(() => {
    if (!context.client) return;

    const evaluate = async () => {
      try {
        const result = await context.client!.evaluate(key);
        setValue(result);
      } catch {
        // Flag not found or error
      }
    };

    if (context.flags[key] !== undefined) {
      setValue(context.flags[key]);
    } else {
      evaluate();
    }
  }, [context.client, key, context.flags]);

  return {
    value,
    isLoading: context.isLoading,
    error: context.error,
  };
}
