import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// The plugin exists so the .svelte fixtures under src/__tests__ compile for
// the test run. It never touches the published build: tsc ignores .svelte
// files entirely, so a consumer who never runs this config never needs the
// Svelte compiler either.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    // Svelte's package.json only exposes its real client build behind the
    // "browser" condition; Node's default conditions resolve "svelte" and
    // "svelte/store" to the server build instead. That build is not a slower
    // stand-in -- component mounting throws outright there (SSR renders to a
    // string, it does not attach to the DOM), which is exactly what
    // @testing-library/svelte's render() needs to do against jsdom.
    conditions: ["browser"],
  },
  ssr: {
    // Vitest runs test files through Vite's SSR pipeline even under the
    // jsdom environment, and that pipeline reads this list instead of the
    // one above. Both have to name "browser" or half the module graph -- the
    // half loaded through the SSR path -- still resolves to the server build.
    resolve: {
      conditions: ["browser"],
    },
  },
});
