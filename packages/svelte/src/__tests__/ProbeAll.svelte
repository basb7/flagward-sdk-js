<script lang="ts">
  import { useFlags } from "../useFlags.js";
  import type { MaybeStore } from "../store.js";
  import type { UserContext } from "@flagward/core";

  export let flagContext: MaybeStore<UserContext> | undefined = undefined;

  const all = useFlags(flagContext);
</script>

<p>loading:{$all.isLoading} flags:{JSON.stringify($all.flags)} error:{$all.error ? "yes" : "no"}</p>
