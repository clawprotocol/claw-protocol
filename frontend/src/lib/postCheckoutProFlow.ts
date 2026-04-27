import { shortIntakeFingerprint } from "./agreementGenerationId";

/**
 * First pass after payment: do not block on the missing-facts modal. The pipeline
 * may still receive gap answers on explicit retry.
 */
export const defaultPostCheckoutRunModelPassInput = (mergedIntake: string) =>
  ({
    intakeText: mergedIntake,
    userGapAnswers: null as string | null,
    gapResolverSkippedWithDefaults: true,
  }) as const;

export function getPremiumGenerationIntakeFingerprint(mergedIntake: string): string {
  return shortIntakeFingerprint(mergedIntake);
}
