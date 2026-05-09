/**
 * Short, signer-facing labels for the compare header (not a substitute for legal review).
 */
export function buildRecipientFriendlyRedlineChips(
  instructionPlain: string,
  changedFieldKeys: readonly string[],
): string[] {
  const chips: string[] = [];
  const t = String(instructionPlain ?? "").toLowerCase();
  const fields = new Set(changedFieldKeys.map((k) => k.toLowerCase()));

  if (fields.has("payment_terms") || /\bnet\s*\d+|payment timing|invoice|payable|late payment\b/.test(t)) {
    chips.push("Payment terms updated");
  }
  if (/\bscope\b|deliverable|milestone|feature creep|boundary\b/.test(t)) {
    chips.push("Scope clarified");
  }
  if (/\bown|intellectual property|ip\b|background material|work product/.test(t)) {
    chips.push("Ownership clarified");
  }
  if (/\bthird[\s-]?party|subcontract|vendor|saas|dependency\b/.test(t)) {
    chips.push("Third-party risk addressed");
  }
  if (/\bacceptance|signoff|uat|defect|warranty period\b/.test(t)) {
    chips.push("Acceptance mechanics updated");
  }
  if (/\bpause|suspend|nonpayment|overdue|arrears\b/.test(t)) {
    chips.push("Timeline protections added");
  }
  if (fields.has("duration") || /\bterm|deadline|schedule\b/.test(t)) {
    chips.push("Timeline or term adjusted");
  }

  const out = [...new Set(chips)];
  return out.slice(0, 6);
}
