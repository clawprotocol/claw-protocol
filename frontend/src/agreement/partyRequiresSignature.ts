import type { AgreementParty } from "./agreementTypes";

const NON_SIGNING_ROLES = new Set([
  "viewer",
  "reviewer",
  "coordinator",
  "fyi",
  "copy",
  "read_only",
  "readonly",
]);

function normalizeWorkflowRole(role: string): string {
  return (role || "").trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
}

/** True when a legal party row should receive a signature role by default. */
export function partyRequiresSignature(party: AgreementParty | null | undefined): boolean {
  if (!party) return false;
  if (party.requiresSignature === false) return false;
  const name = (party.name || "").trim();
  if (!name) return false;
  const wr = normalizeWorkflowRole(party.role || "");
  return !NON_SIGNING_ROLES.has(wr);
}

/** Legal parties that sign by default (excludes reviewers/viewers/coordinators). */
export function signingPartiesFromDraft(parties: readonly AgreementParty[] | null | undefined): AgreementParty[] {
  return (parties ?? []).filter((p) => partyRequiresSignature(p));
}
