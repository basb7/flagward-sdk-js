<script lang="ts">
  import { useFlag } from "../useFlag.js";
  import type { MaybeStore } from "../store.js";
  import type { UserContext } from "@flagward/core";

  export let flagKey: string;
  export let flagContext: MaybeStore<UserContext> | undefined = undefined;

  const flag = useFlag(flagKey, flagContext);
</script>

<p>loading:{$flag.isLoading} value:{String($flag.value)} error:{$flag.error ? "yes" : "no"}</p>
