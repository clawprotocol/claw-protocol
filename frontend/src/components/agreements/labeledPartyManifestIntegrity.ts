/**
 * Labeled-party manifest integrity — blocks Pro acceptance when party identity is corrupted.
 */

import {
  intakeHasAuthoritativeLabeledPartyBlocks,
  labeledPartyLegalEntities,
  parseLabeledPartyBlocks,
} from "./labeledPartyBlockParse";
import {
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
} from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";

const FATAL_PLACEHOLDER_RE = /\[(?:ORG|EMAIL)_\d+\]/i;
const COORDINATOR_NAME_MARKERS = /\b(?:alex\s+morgan|coordinator)\b/i;

export type LabeledPartyManifestIntegrityResult = {
  ok: boolean;
  reasons: string[];
  authoritativeLabeledPartyCount: number;
  expectedPartyNames: readonly string[];
  userMessage: string | null;
};

function normName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function assessLabeledPartyManifestIntegrity(args: {
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  documentText?: string | null;
}): LabeledPartyManifestIntegrityResult {
  const intake = String(args.intakeText ?? "").trim();
  const expectedPartyNames = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const authoritativeLabeledPartyCount = expectedPartyNames.length;

  if (!intakeHasAuthoritativeLabeledPartyBlocks(intake)) {
    return {
      ok: true,
      reasons: [],
      authoritativeLabeledPartyCount,
      expectedPartyNames,
      userMessage: null,
    };
  }

  const reasons: string[] = [];
  const draftNames = (args.draftPartyNames ?? [])
    .map((n) => normName(String(n ?? "")))
    .filter((n) => n.length >= 2);

  for (const name of draftNames) {
    if (isDisallowedPartyPhrase(name)) {
      reasons.push(`draft_party_disallowed_phrase:${name.slice(0, 48)}`);
    }
    if (COORDINATOR_NAME_MARKERS.test(name) && !/LLC|Inc|Corp|Ltd/i.test(name)) {
      reasons.push(`coordinator_leaked_as_party:${name.slice(0, 48)}`);
    }
  }

  if (authoritativeLabeledPartyCount >= 3 && draftNames.length > 0) {
    const corruptDraft = draftNames.filter(
      (name) =>
        isDisallowedPartyPhrase(name) ||
        (!isAuthoritativeLegalEntityName(name) &&
          !expectedPartyNames.some((e) => partyLegalNamesMatch(e, name))),
    );
    if (corruptDraft.length > 0) {
      reasons.push(`draft_party_identity_corrupt:${corruptDraft.length}`);
    }
  }

  const doc = String(args.documentText ?? "");
  if (doc && FATAL_PLACEHOLDER_RE.test(doc)) {
    reasons.push("document_fatal_org_email_placeholder");
  }

  for (const bad of [
    "SOFTWARE PLATFORM AGREEMENT",
    "licensing revenue will be shared",
    "Signer Unknown",
  ]) {
    if (doc.includes(bad) && bad !== "Signer Unknown") {
      const inNoticePartyLine = new RegExp(
        `(?:If to|PARTY\\s*\\d+|CLIENT|SERVICE PROVIDER)[:\\s][^\\n]*${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      ).test(doc);
      if (inNoticePartyLine) {
        reasons.push(`document_contaminated_party_line:${bad.slice(0, 40)}`);
      }
    }
  }

  const blocks = parseLabeledPartyBlocks(intake);
  if (blocks.some((b) => COORDINATOR_NAME_MARKERS.test(b.legalEntity) && !/LLC|Inc/i.test(b.legalEntity))) {
    reasons.push("coordinator_in_labeled_party_blocks");
  }

  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    authoritativeLabeledPartyCount,
    expectedPartyNames,
    userMessage: ok
      ? null
      : "Party identity could not be verified for this multi-party agreement. Edit intake party blocks or retry Pro draft.",
  };
}

/** When labeled manifest integrity fails, block soft Pro acceptance overrides. */
export function shouldBlockPaidProAdvisoryAcceptForPartyIdentity(
  integrity: LabeledPartyManifestIntegrityResult,
): boolean {
  return !integrity.ok && integrity.authoritativeLabeledPartyCount >= 3;
}
