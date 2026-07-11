/**
 * Paid Pro pipeline-integration tests that exceed Vitest's default 5s timeout under
 * full-suite CPU contention. Scoped to files with measured harness-timeout migrations only.
 */
export const PAID_PRO_PIPELINE_LONG_INCLUDE = [
  "src/components/agreements/qa/paidProHardening/**/*.test.ts",
  "src/components/agreements/paidProTest349JsonParseDegradedProRender.test.ts",
  "src/components/agreements/paidProTest358JsonParseRetry502PreservesRecovery.test.ts",
  "src/components/agreements/paidProTest418AcceptedThenRejectedSoT.test.ts",
  "src/components/agreements/paidProTest424JourneyQa.test.ts",
  "src/components/agreements/paidProTest426RecoveryWorkflow.test.ts",
  "src/components/agreements/paidProTest427GenesisDogSimulation.test.ts",
  "src/components/agreements/paidProTest428UxOverlay.test.ts",
  "src/components/agreements/paidProTest429FourPartyNorthStarRegression.test.ts",
  "src/components/agreements/paidProTest448BrandLicensingOrchestration.test.ts",
  "src/components/agreements/paidProTest517ServerDocumentTextAlias.test.ts",
] as const;

export const PAID_PRO_PIPELINE_LONG_TEST_TIMEOUT_MS = 10_000;
