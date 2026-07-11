/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {
  PAID_PRO_PIPELINE_LONG_INCLUDE,
  PAID_PRO_PIPELINE_LONG_TEST_TIMEOUT_MS,
} from "./vitest.paidProPipelineLong.config";

/** Standalone runner for the long-running Paid Pro pipeline project only (Level 4 validation). */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [...PAID_PRO_PIPELINE_LONG_INCLUDE],
    testTimeout: PAID_PRO_PIPELINE_LONG_TEST_TIMEOUT_MS,
  },
});
