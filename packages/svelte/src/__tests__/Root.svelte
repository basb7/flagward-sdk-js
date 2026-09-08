<script lang="ts">
  import { setFlagward } from "../context.js";
  import type { FlagwardOptions } from "../createFlagward.js";

  export let apiKey: string;
  export let host: FlagwardOptions["host"] = undefined;
  export let context: FlagwardOptions["context"] = undefined;

  setFlagward({ apiKey, host, context });
</script>

<slot />
