/// <reference types="vitest/config" />
/**
 * Phase 1 focused access-contract gate.
 *
 * Run via:
 *   scripts/run_phase1_access_contract_gate.sh
 *   npm run test:phase1-access-contract
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { PHASE1_ACCESS_CONTRACT_INCLUDE } from "./vitest.phase1AccessContract.include";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [...PHASE1_ACCESS_CONTRACT_INCLUDE],
    testTimeout: 30_000,
  },
});
