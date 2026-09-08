import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    // Without this, Vitest resolves solid-js's server (SSR) build under
    // Node's default export conditions, and every primitive created in a test
    // stops tracking: signals still return values but never notify, so an
    // update silently fails to schedule a re-render instead of raising an
    // error you could act on.
    conditions: ["development", "browser"],
  },
  ssr: {
    // Vitest transforms test files through Vite's SSR pipeline even under
    // the jsdom environment, and Vite 6+ reads the SSR resolve conditions
    // rather than the client ones above for that pipeline. Both are set so
    // solid-js resolves its client (dev) build under either code path.
    resolve: {
      conditions: ["development", "browser"],
    },
  },
});
