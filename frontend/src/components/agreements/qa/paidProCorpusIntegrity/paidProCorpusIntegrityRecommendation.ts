export type PaidProIntegrityRecommendation = "NO ACTION REQUIRED" | "MONITOR" | "FIX REQUIRED";

/** Pre-hydration authoritative bodies are shorter than review render; not actionable drift. */
const EXPECTED_INFORMATIONAL_DRIFT_SURFACES = new Set([
  "sourceOfTruth",
  "finalAcceptedCorpus",
]);

export function unexpectedInformationalHashDrift(
  informationalHashDrift: readonly string[] | undefined,
): string[] {
  return (informationalHashDrift ?? []).filter((line) => {
    const surface = line.match(/^(\w+) hash/)?.[1];
    return !surface || !EXPECTED_INFORMATIONAL_DRIFT_SURFACES.has(surface);
  });
}

export function deriveIntegrityRecommendation(args: {
  duplicateSectionIssues: string[];
  unexpectedHashDrift: string[];
  informationalHashDrift?: string[];
  copyPathMismatch: boolean;
  visibleTextChangedAfterGuard: boolean;
  safeGuardrailEvents: number;
  unsafeGuardrailEvents: number;
}): PaidProIntegrityRecommendation {
  if (
    args.duplicateSectionIssues.length > 0 ||
    args.copyPathMismatch ||
    args.visibleTextChangedAfterGuard ||
    args.unsafeGuardrailEvents > 0
  ) {
    return "FIX REQUIRED";
  }
  const actionableInformational = unexpectedInformationalHashDrift(args.informationalHashDrift);
  if (
    args.unexpectedHashDrift.length > 0 ||
    actionableInformational.length > 0 ||
    args.safeGuardrailEvents > 0
  ) {
    return "MONITOR";
  }
  return "NO ACTION REQUIRED";
}
