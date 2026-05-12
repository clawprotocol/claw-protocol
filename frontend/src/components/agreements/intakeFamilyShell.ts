/**
 * Family-aware deterministic shells so non–service-contract intakes still produce a reviewable draft.
 * No extra API calls.
 */
import { applyNamedPartyFallbackFromIntake, tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import {
  detectAgreementFamily,
  needsServiceBilateralSmartDefaults,
  type AgreementFamily,
} from "./agreementFamilyRouter";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { extractBetweenPartyPair } from "./partyBetweenParse";
import { applyIntakePartyRoleOverlay, type IntakePartyRoleLabels } from "./partyRoleIntake";
import { applySimpleFlowSmartDefaults, type ParsedDraftShape } from "./intakeSmartDefaults";

const MAX_PARTY_NAME_LEN = 280;

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/** Extract "ABC LLC" style name from common phrasing. */
export function extractLlcDisplayName(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  const m1 = t.match(
    /\bname\s+of\s+(?:the\s+)?(?:LLC|limited\s+liability\s+company)\s+is\s+([^.\n]+?)(?:\.|,|\s+the\s+|\s+The\s+LLC\b|\s+LLC\s+is\b)/i,
  );
  if (m1) {
    const name = m1[1].trim().replace(/\s+/g, " ");
    if (name.length > 1 && name.length <= MAX_PARTY_NAME_LEN) return name;
  }
  const m2 = t.match(/\b([A-Z][A-Za-z0-9&,.'\-\s]{1,120}?\bLLC\b)/);
  if (m2) {
    const name = m2[1].trim().replace(/\s+/g, " ");
    if (name.length > 1) return name.slice(0, MAX_PARTY_NAME_LEN);
  }
  return null;
}

/** US state / formation phrase from intake (not legal advice — heuristic only). */
export function extractFormationJurisdictionHint(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  const m1 = t.match(/\bformed\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (m1) return m1[1].trim();
  const m2 = t.match(/\b(?:LLC|company|entity)\s+is\s+formed\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
  if (m2) return m2[1].trim();
  return null;
}

function defaultPartiesForOperating(company: string | null): { name: string; role: string }[] {
  const c = (company || "").trim() || "The limited liability company (name in review)";
  return [
    { name: c.slice(0, MAX_PARTY_NAME_LEN), role: "company" },
    { name: "Members (names and interests to be finalized in review)", role: "members" },
  ];
}

/**
 * Applies tolerant defaults for families that should not use bilateral service `applySimpleFlowSmartDefaults`.
 */
export function applyAgreementFamilyIntakeShell(
  parsed: ParsedDraftShape,
  intakeText: string,
  family: AgreementFamily,
): ParsedDraftShape {
  const structured = parseIntakeToStructuredAgreement(intakeText);
  const live = buildLiveDraftPreview(intakeText);

  if (family === "operating_agreement") {
    const company = extractLlcDisplayName(intakeText) || nz(parsed.llc_company_name ?? null) || null;
    const stateHint = extractFormationJurisdictionHint(intakeText) || nz(structured.governing_law) || "";

    let title = nz(parsed.title);
    if (!title || /^agreement$/i.test(title)) {
      title = company ? `Operating Agreement — ${company}` : "Operating Agreement";
    }

    let jurisdiction = nz(parsed.jurisdiction);
    if (!jurisdiction || jurisdiction.toLowerCase() === "tbd") {
      jurisdiction = stateHint || "Delaware";
    }

    const parties =
      (parsed.parties || []).length >= 2 ? [...parsed.parties] : defaultPartiesForOperating(company);

    const purpose =
      nz(parsed.purpose) ||
      "Governance, economics, management, and operations of the LLC, including member rights, allocations, and company procedures, as further described in the full agreement and exhibits.";

    const payment_terms =
      nz(parsed.payment_terms) ||
      "Not applicable — this is an internal LLC governance document, not a fee-for-services contract.";

    const duration =
      nz(parsed.duration) || "Until dissolved in accordance with this agreement and applicable law.";

    const effective_date =
      nz(parsed.effective_date) ||
      "Upon adoption by the members (unless a different effective date is specified in review).";

    return {
      ...parsed,
      agreement_family: "operating_agreement",
      llc_company_name: company,
      title,
      jurisdiction,
      parties,
      purpose,
      payment_terms,
      duration,
      effective_date,
    };
  }

  if (family === "nda") {
    let title = nz(parsed.title);
    if (!title || /^agreement$/i.test(title)) {
      title = /\bmutual\b/i.test(intakeText) ? "Mutual Confidentiality Agreement" : "Confidentiality Agreement";
    }
    let jurisdiction = nz(parsed.jurisdiction);
    if (!jurisdiction || jurisdiction.toLowerCase() === "tbd") {
      jurisdiction = nz(structured.governing_law) || "Delaware";
    }
    let parties = [...(parsed.parties || [])];
    if (parties.length < 2) {
      const explicitSigners = tryInferNamedPartiesFromIntake(intakeText);
      if (explicitSigners && explicitSigners.length >= 2) {
        parties = explicitSigners;
      } else {
        const between = extractBetweenPartyPair(intakeText);
        if (between && between.left.trim().length > 1 && between.right.trim().length > 1) {
          parties = [
            { name: between.left.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
            { name: between.right.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
          ];
        } else {
          parties = [
            { name: "Party A (disclosing / receiving — edit in review)", role: "party" },
            { name: "Party B (disclosing / receiving — edit in review)", role: "party" },
          ];
        }
      }
    }
    const purpose =
      nz(parsed.purpose) ||
      nz(structured.scope) ||
      "Protection of confidential and proprietary information disclosed between the parties for the relationship described in this agreement.";
    const payment_terms =
      nz(parsed.payment_terms) ||
      "No fees unless the parties document compensation in a separate writing or amendment.";
    const duration = nz(parsed.duration) || nz(structured.term) || live.termLine || "As stated in the agreement body.";
    const effective_date =
      nz(parsed.effective_date) || "Upon full execution by the parties unless otherwise specified in review.";
    return {
      ...parsed,
      agreement_family: "nda",
      title,
      jurisdiction,
      parties,
      purpose,
      payment_terms,
      duration: duration || null,
      effective_date,
    };
  }

  // generic_business_agreement
  let next: ParsedDraftShape = { ...parsed, agreement_family: "generic_business_agreement" };
  if ((next.parties || []).length < 2) {
    const explicitSigners = tryInferNamedPartiesFromIntake(intakeText);
    if (explicitSigners && explicitSigners.length >= 2) {
      next = { ...next, parties: explicitSigners };
    } else {
      const between = extractBetweenPartyPair(intakeText);
      if (between && between.left.trim().length > 1 && between.right.trim().length > 1) {
        next = {
          ...next,
          parties: [
            { name: between.left.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
            { name: between.right.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
          ],
        };
      } else {
        next = {
          ...next,
          parties: [
            { name: "Party A (edit in review)", role: "party" },
            { name: "Party B (edit in review)", role: "party" },
          ],
        };
      }
    }
  }
  if (!nz(next.title)) next = { ...next, title: nz(live.docTitle) || "Agreement" };
  if (!nz(next.jurisdiction) || nz(next.jurisdiction).toLowerCase() === "tbd") {
    next = { ...next, jurisdiction: nz(structured.governing_law) || "Delaware" };
  }
  if (!nz(next.purpose)) {
    next = {
      ...next,
      purpose: nz(structured.scope) || nz(live.scopeLine) || "Commercial arrangement to be described in review.",
    };
  }
  if (!nz(next.payment_terms)) {
    next = {
      ...next,
      payment_terms: "To be agreed between the parties (add specifics in review if compensation applies).",
    };
  }
  if (!nz(next.duration) && !nz(next.due_date)) {
    next = {
      ...next,
      duration: nz(live.termLine) || nz(structured.term) || "As stated in the agreement or to be refined in review.",
    };
  }
  if (!nz(next.effective_date)) {
    next = { ...next, effective_date: "Upon full execution by the parties unless otherwise specified." };
  }
  return next;
}

/**
 * Single entry: attach `agreement_family`, optional `[agreement-family-route]` log,
 * then either bilateral service smart defaults or family shell + party overlay.
 */
export function runIntakeDefaultsAndRoles(
  parsed: ParsedDraftShape,
  rawIntake: string,
  simpleProductFlow: boolean,
  roles: IntakePartyRoleLabels,
): ParsedDraftShape {
  const family = parsed.agreement_family ?? detectAgreementFamily(rawIntake);
  let next: ParsedDraftShape = { ...parsed, agreement_family: family };
  console.debug("[agreement-family-route]", {
    intakeSnippet: rawIntake.slice(0, 140),
    detectedFamily: family,
  });
  if (!simpleProductFlow) {
    return next;
  }
  if (needsServiceBilateralSmartDefaults(family)) {
    next = applySimpleFlowSmartDefaults(next, rawIntake);
  } else {
    next = applyAgreementFamilyIntakeShell(next, rawIntake, family);
  }
  next = applyNamedPartyFallbackFromIntake(next, rawIntake);
  return applyIntakePartyRoleOverlay(next, roles);
}
