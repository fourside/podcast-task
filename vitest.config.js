import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // [https://github.com/m-radzikowski/aws-sdk-client-mock/issues/139]
    globals: true,
  },
});
