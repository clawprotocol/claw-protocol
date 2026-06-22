/**
 * Document Composition Authority — platform boundary helpers.
 *
 * Hierarchy (highest → lowest):
 * 1. Corpus Source-of-Truth
 * 2. Clause Family Registry
 * 3. Composition / Enrichment Passes
 * 4. Formatting / Repair Passes
 * 5. Rendering Passes
 */

import {
  canAppendOperativeClauseFamily,
  type OperativeClauseFamily,
} from "./clauseFamilyRegistry";

export type ClauseFamilyAppendGateResult = {
  allowed: boolean;
  family: OperativeClauseFamily;
  reason: "family_absent" | "family_present";
};

export function gateOperativeClauseFamilyAppend(
  corpus: string,
  family: OperativeClauseFamily,
): ClauseFamilyAppendGateResult {
  const allowed = canAppendOperativeClauseFamily(corpus, family);
  return {
    allowed,
    family,
    reason: allowed ? "family_absent" : "family_present",
  };
}

export {
  canAppendOperativeClauseFamily,
  countStandaloneClauseFamilyHeadings,
  type OperativeClauseFamily,
} from "./clauseFamilyRegistry";
export { dedupeStandaloneOperativeClauseFamilies } from "./operativeClauseFamilyDedup";
export {
  assertClauseFamilyStructuralIntegrityForFreeze,
  validateClauseFamilyStructuralIntegrity,
  validateNoticesClauseFamilyStructuralIntegrity,
  type ClauseFamilyStructuralIntegrityReport,
  type ClauseFamilyStructuralViolation,
} from "./clauseFamilyStructuralIntegrity";
