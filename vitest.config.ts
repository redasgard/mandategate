import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Match the application's tsconfig path alias when importing actual Next
// route modules in the integration tests. No test-only stubs of auth.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
