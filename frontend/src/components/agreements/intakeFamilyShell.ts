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
import { preserveExtractedFacts } from "./draftFactPreservation";
import { resolveCanonicalAgreementTitle } from "./canonicalAgreementTitle";
import { isPaymentSemanticallySafe } from "./paymentSemanticGuard";

const MAX_PARTY_NAME_LEN = 280;

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/**
 * Imperative phrasings that must NEVER become an LLC display name.
 * "Create an LLC", "Draft an LLC", "Form an LLC" etc. are intent verbs, not entity names.
 */
const IMPERATIVE_LLC_PHRASE =
  /^(?:create|draft|build|form|set\s+up|setup|generate|make|prepare|start)\s+(?:an?\s+|the\s+)?LLC$/i;

/** Extract "ABC LLC" style name from common phrasing. */
export function extractLlcDisplayName(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();

  // Highest-priority signal: "... for <Entity> LLC[.,]" — explicit entity callout (regression spec P2).
  // Anchored to "for" + capitalized phrase + "LLC" (or other entity suffix), then a sentence break.
  const forEntity = t.match(
    /\bfor\s+([A-Z][A-Za-z0-9&'\-\s]{1,80}?\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|LLP|PLLC))\b/,
  );
  if (forEntity?.[1]) {
    const name = forEntity[1].trim().replace(/\s+/g, " ");
    if (name.length > 1 && !IMPERATIVE_LLC_PHRASE.test(name)) return name.slice(0, MAX_PARTY_NAME_LEN);
  }

  const m1 = t.match(
    /\bname\s+of\s+(?:the\s+)?(?:LLC|limited\s+liability\s+company)\s+is\s+([^.\n]+?)(?:\.|,|\s+the\s+|\s+The\s+LLC\b|\s+LLC\s+is\b)/i,
  );
  if (m1) {
    const name = m1[1].trim().replace(/\s+/g, " ");
    if (name.length > 1 && name.length <= MAX_PARTY_NAME_LEN) return name;
  }

  // Generic capitalized "X LLC" anywhere in the intake — but skip imperative prefixes.
  const m2 = t.match(/\b([A-Z][A-Za-z0-9&,.'\-\s]{1,120}?\bLLC\b)/);
  if (m2) {
    const name = m2[1].trim().replace(/\s+/g, " ");
    if (name.length > 1 && !IMPERATIVE_LLC_PHRASE.test(name)) return name.slice(0, MAX_PARTY_NAME_LEN);
  }
  return null;
}

/**
 * Detects "Manager-managed" / "Member-managed" / "managed by managers" wording.
 * Returns null when no explicit signal is present (callers fall back to a neutral default).
 */
export function extractLlcManagementStructure(raw: string): string | null {
  const low = (raw || "").toLowerCase();
  if (!low) return null;
  if (/\bmanager[-\s]?managed\b/.test(low)) return "Manager-managed";
  if (/\bmember[-\s]?managed\b/.test(low)) return "Member-managed";
  if (/\bmanaged\s+by\s+(?:the\s+)?managers?\b/.test(low)) return "Manager-managed";
  if (/\bmanaged\s+by\s+(?:the\s+)?members?\b/.test(low)) return "Member-managed";
  return null;
}

/**
 * Returns the parsed [{ name, pct }] member rows from a labeled "Ownership/Members/Cap table"
 * segment. Useful for both the rendered ownership summary AND the party list (members).
 *
 * Universal rule: when the intake explicitly names the LLC's members and percentages, we should
 * surface those people as the party rows for the operating agreement, not "Members of the LLC".
 */
export function extractLlcMemberRows(raw: string): { name: string; pct: string }[] {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const labeled = t.match(
    /\b(?:ownership|members?|cap\s*table|equity\s+split|allocations?)\s*[:\-]\s*([^.\n]{6,300})/i,
  );
  const body = labeled?.[1] ?? null;
  if (!body) return [];
  const rows = body
    .split(/\s*[,;]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([A-Z][A-Za-z0-9&'\-.\s]{1,60}?)\s*\(?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)?$/);
      if (!m) return null;
      const name = m[1].trim().replace(/\s+/g, " ");
      const pct = m[2];
      if (!name || !pct) return null;
      return { name, pct };
    })
    .filter((x): x is { name: string; pct: string } => Boolean(x));
  return rows;
}

/**
 * Extracts ownership rows from "Ownership: A 40%, B 40%, C 20%" / "Members: A (40%) ..." style intake.
 * Returns a normalized "A 40%; B 40%; C 20%" string, or null when no clean signal is present.
 */
export function extractLlcOwnershipSummary(raw: string): string | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Look for "Ownership:" or "Members:" labeled segment
  const labeled = t.match(
    /\b(?:ownership|members?|cap\s*table|equity\s+split|allocations?)\s*[:\-]\s*([^.\n]{6,300})/i,
  );
  const body = labeled?.[1] ?? null;
  if (!body) return null;
  // Split on commas/semicolons, keep entries that look like "<Name> <number>%".
  const rows = body
    .split(/\s*[,;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // "Alpha Trust 40%" or "Alpha Trust (40%)"
      const m = s.match(/^([A-Z][A-Za-z0-9&'\-.\s]{1,60}?)\s*\(?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)?$/);
      if (!m) return null;
      const name = m[1].trim().replace(/\s+/g, " ");
      const pct = m[2];
      if (!name || !pct) return null;
      return `${name} ${pct}%`;
    })
    .filter((x): x is string => Boolean(x));
  if (rows.length < 2) return null;
  return rows.join("; ");
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
  const c = (company || "").trim() || "The limited liability company";
  return [
    { name: c.slice(0, MAX_PARTY_NAME_LEN), role: "company" },
    { name: "Members of the LLC", role: "members" },
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
    const management = extractLlcManagementStructure(intakeText) || nz(parsed.management_structure ?? null) || null;
    const ownership = extractLlcOwnershipSummary(intakeText) || nz(parsed.members_ownership_summary ?? null) || null;

    /**
     * Canonical title resolution (regression spec P3):
     *   - Empty / "Agreement" → canonical "Operating Agreement"
     *   - Imperative phrases like "Create an LLC" must never make it into the title
     *   - Truly custom titles (e.g. "Apollo Data LLC Operating Agreement") are preserved
     */
    let title = nz(parsed.title);
    const titleLooksImperative = /^(?:create|draft|build|form|generate|make|prepare|start)\b/i.test(title);
    if (!title || /^agreement$/i.test(title) || /^operating\s+agreement\b\s*[—-]\s*create\b/i.test(title) || titleLooksImperative) {
      title = "Operating Agreement";
    }

    let jurisdiction = nz(parsed.jurisdiction);
    if (!jurisdiction || jurisdiction.toLowerCase() === "tbd") {
      jurisdiction = stateHint || "Delaware";
    }

    /**
     * Strip "for <Entity> LLC" trailing phrases on individual party names — that wording
     * names the COMPANY, not the third party (regression spec P2). Also drop a duplicate
     * member entry that exactly equals the company name (the LLC itself isn't a member).
     */
    const cleanForCompanyTail = (name: string): string =>
      (name || "")
        .replace(/\s+for\s+[A-Z][A-Za-z0-9&'\-\s]{1,80}?\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|LLP|PLLC)\b\.?$/i, "")
        .trim();
    const dedupeAgainstCompany = (
      list: { name: string; role: string }[],
    ): { name: string; role: string }[] => {
      if (!company) return list;
      const co = company.toLowerCase();
      const dedup = list.filter((p) => p.name.toLowerCase() !== co);
      return dedup.length >= 2 ? dedup : list;
    };

    let inputParties = (parsed.parties || [])
      .map((p) => ({ ...p, name: cleanForCompanyTail(p.name) }))
      .filter((p) => p.name.length > 1);
    inputParties = dedupeAgainstCompany(inputParties);

    /**
     * If the parsed draft has no usable parties yet, adopt the structured-extracted owners
     * (regression spec P2 — Apollo Data LLC intake should surface Alpha Trust / Beta Capital /
     * Jamie Chen as members, not generic placeholders).
     */
    if (inputParties.length < 2 && structured.parties.length >= 2) {
      const fromStructured = structured.parties
        .map((n) => ({ name: cleanForCompanyTail(n).slice(0, MAX_PARTY_NAME_LEN), role: "member" as const }))
        .filter((p) => p.name.length > 1);
      const dedup = dedupeAgainstCompany(fromStructured);
      if (dedup.length >= 2) inputParties = dedup;
    }

    /**
     * Universal P2 fallback: if intake has a labeled "Members:" / "Ownership:" list with names
     * and percentages, surface those member names as parties even when the structured pair
     * extractor didn't find a "between …" clause. Pure-OA intakes routinely look like:
     *   "Operating agreement for Sunrise Ventures LLC. Members: Alice 40%, Bob 35%, Carol 25%."
     */
    if (inputParties.length < 2) {
      const memberRows = extractLlcMemberRows(intakeText);
      if (memberRows.length >= 2) {
        const fromMembers = memberRows
          .map((r) => ({ name: r.name.slice(0, MAX_PARTY_NAME_LEN), role: "member" as const }))
          .filter((p) => p.name.length > 1);
        const dedup = dedupeAgainstCompany(fromMembers);
        if (dedup.length >= 2) inputParties = dedup;
      }
    }

    const parties =
      inputParties.length >= 2 ? [...inputParties] : defaultPartiesForOperating(company);

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
      "Upon adoption by the members.";

    return {
      ...parsed,
      agreement_family: "operating_agreement",
      llc_company_name: company,
      management_structure: management,
      members_ownership_summary: ownership,
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
    /**
     * NDA archetype detection:
     *   - Treat as MUTUAL by default (matches modern best practice and test scenarios).
     *   - Only fall back to UNILATERAL when intake explicitly mentions one-way phrasing
     *     ("Disclosing Party", "Receiving Party", "one-way NDA", "unilateral").
     *   - Multi-party (3+ signers) is always mutual.
     */
    const explicitSigners = tryInferNamedPartiesFromIntake(intakeText);
    const isMultiParty = (parsed.parties || []).length >= 3 || (explicitSigners?.length ?? 0) >= 3;
    const lowIntake = intakeText.toLowerCase();
    const explicitlyUnilateral =
      /\b(?:one[-\s]?way|unilateral)\s+(?:nda|non[-\s]?disclosure|confidential)/i.test(intakeText) ||
      (/\bdisclosing\s+party\b/i.test(intakeText) && /\breceiving\s+party\b/i.test(intakeText) && !/\bmutual\b/i.test(intakeText));
    const isMutual = isMultiParty || !explicitlyUnilateral || /\bmutual\b/i.test(lowIntake);

    /**
     * Canonical NDA title resolution (regression spec §3):
     *   - Empty / "Agreement" / "Confidentiality Agreement" / "Mutual Confidentiality Agreement"
     *     are LEGACY upstream titles that must be replaced with the canonical NDA heading.
     *   - Truly custom user-typed titles (e.g. "ProjectApollo Confidentiality Pact 2026")
     *     are preserved verbatim.
     */
    let title = nz(parsed.title);
    const isLegacyOrGeneric =
      !title ||
      /^agreement$/i.test(title) ||
      /^confidentiality\s+agreement$/i.test(title) ||
      /^mutual\s+confidentiality\s+agreement$/i.test(title);
    if (isLegacyOrGeneric) {
      title = isMutual ? "Mutual Non-Disclosure Agreement" : "Non-Disclosure Agreement";
    }
    let jurisdiction = nz(parsed.jurisdiction);
    if (!jurisdiction || jurisdiction.toLowerCase() === "tbd") {
      jurisdiction = nz(structured.governing_law) || "Delaware";
    }
    let parties = [...(parsed.parties || [])];
    if (parties.length < 2) {
      if (explicitSigners && explicitSigners.length >= 2) {
        parties = explicitSigners;
      } else if (!structured.partiesUncertain && structured.parties.length >= 2) {
        parties = structured.parties.map((n) => ({ name: n.slice(0, MAX_PARTY_NAME_LEN), role: "party" }));
      } else {
        const between = extractBetweenPartyPair(intakeText);
        if (between && between.left.trim().length > 1 && between.right.trim().length > 1) {
          parties = [
            { name: between.left.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
            { name: between.right.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" },
          ];
        } else {
          // Neutral placeholders — never inject "disclosing/receiving" unless the user did.
          parties = [
            { name: "Party A", role: "party" },
            { name: "Party B", role: "party" },
          ];
        }
      }
    }
    const purpose =
      nz(parsed.purpose) ||
      nz(structured.scope) ||
      (isMutual
        ? "Mutual protection of confidential and proprietary information exchanged between the parties for the relationship described in this agreement."
        : "Protection of confidential and proprietary information disclosed between the parties for the relationship described in this agreement.");
    const payment_terms =
      nz(parsed.payment_terms) ||
      "No fees unless the parties document compensation in a separate writing or amendment.";
    const duration = nz(parsed.duration) || nz(structured.term) || live.termLine || "As stated in the agreement body.";
    const effective_date =
      nz(parsed.effective_date) || "Upon full execution by the parties.";
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
    const structuredOk = !structured.partiesUncertain && structured.parties.length >= 2;
    /**
     * Prefer structured multi-party extraction over the loose `tryInferNamedPartiesFromIntake`
     * "between … and …" heuristic whenever structured has **more** parties (3+ seller/buyer/escrow
     * lists, property-management triples, etc.) or the same-or-better count — the between-regex
     * cannot see Oxford-comma triples and would otherwise clobber a clean structured.parties[].
     */
    const preferStructured =
      structuredOk &&
      (structured.parties.length >= 3 ||
        !explicitSigners ||
        structured.parties.length >= (explicitSigners?.length ?? 0));

    if (preferStructured) {
      next = {
        ...next,
        parties: structured.parties.map((n) => ({ name: n.slice(0, MAX_PARTY_NAME_LEN), role: "party" })),
      };
    } else if (explicitSigners && explicitSigners.length >= 2) {
      next = { ...next, parties: explicitSigners };
    } else if (structuredOk) {
      next = {
        ...next,
        parties: structured.parties.map((n) => ({ name: n.slice(0, MAX_PARTY_NAME_LEN), role: "party" })),
      };
    } else {
      // Universal fallback: only adopt extractBetweenPartyPair output when each side looks
      // like a clean party fragment (≤6 words, no internal commas/semicolons). Otherwise
      // the structured extractor already flagged uncertainty and we should keep going,
      // landing on neutral placeholders rather than swallowing prose into party names.
      const between = extractBetweenPartyPair(intakeText);
      const looksClean = (raw: string) => {
        const t = raw.trim();
        if (t.length < 2 || t.length > 80) return false;
        if (t.split(/\s+/).filter(Boolean).length > 6) return false;
        if (/[,;]/.test(t)) return false;
        return true;
      };
      if (between && looksClean(between.left) && looksClean(between.right)) {
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
            { name: "Party A", role: "party" },
            { name: "Party B", role: "party" },
          ],
        };
      }
    }
  }
  // Canonical title: preserve substantive existing title; fall back to live docTitle, then family canonical.
  {
    const resolved = resolveCanonicalAgreementTitle({
      currentTitle: next.title,
      liveDocTitle: live.docTitle,
      family: "generic_business_agreement",
      intakeText,
    });
    next = { ...next, title: resolved.title };
  }
  if (!nz(next.jurisdiction) || nz(next.jurisdiction).toLowerCase() === "tbd") {
    next = { ...next, jurisdiction: nz(structured.governing_law) || "Delaware" };
  }
  if (!nz(next.purpose)) {
    next = {
      ...next,
      purpose: nz(structured.scope) || nz(live.scopeLine) || "Commercial arrangement to be agreed between the parties.",
    };
  }
  if (!nz(next.payment_terms)) {
    const structuredPayment = isPaymentSemanticallySafe(structured.payment) ? nz(structured.payment) : "";
    const liveComp = isPaymentSemanticallySafe(live.compensationLine) ? nz(live.compensationLine) : "";
    next = {
      ...next,
      payment_terms: structuredPayment || liveComp || "No fees unless the parties document compensation in a separate writing or amendment.",
    };
  }
  if (!nz(next.duration) && !nz(next.due_date)) {
    next = {
      ...next,
      duration: nz(structured.term) || nz(live.termLine) || "As stated in the agreement.",
    };
  }
  if (!nz(next.termination_summary)) {
    const structuredTermination = nz(structured.termination);
    if (structuredTermination) {
      next = { ...next, termination_summary: structuredTermination };
    }
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
  const { draft: preserved, restoredFields } = preserveExtractedFacts(next, rawIntake);
  next = preserved;
  if (restoredFields.length > 0) {
    console.debug("[draft-fact-preservation]", { restoredFields });
  }
  return applyIntakePartyRoleOverlay(next, roles);
}
