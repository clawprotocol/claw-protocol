/**
 * Contractor / developer agreement intake signals.
 */

export function isContractorDeveloperIntake(intakeRaw?: string | null): boolean {
  const low = (intakeRaw || "").toLowerCase();
  if (!low.trim()) return false;
  return (
    /\bcontractor\s+agreement\b/.test(low) ||
    /\bindependent\s+contractor\b/.test(low) ||
    (/\bcontractor\b/.test(low) && /\bdeveloper\b/.test(low)) ||
    (/\bdeveloper\b/.test(low) && /\bwork\s+product\b/.test(low))
  );
}

export function contractorAgreementFamilyHint(): "generic_business_agreement" {
  return "generic_business_agreement";
}
