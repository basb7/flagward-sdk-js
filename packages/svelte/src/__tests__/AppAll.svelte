<script lang="ts">
  import Root from "./Root.svelte";
  import ProbeAll from "./ProbeAll.svelte";
  import type { FlagwardOptions } from "../createFlagward.js";
  import type { MaybeStore } from "../store.js";
  import type { UserContext } from "@flagward/core";

  export let apiKey: string;
  export let host: FlagwardOptions["host"] = undefined;
  export let context: FlagwardOptions["context"] = undefined;
  export let flagContext: MaybeStore<UserContext> | undefined = undefined;
</script>

<Root {apiKey} {host} {context}>
  <ProbeAll {flagContext} />
</Root>
