import type { AgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";

/** Keep in sync with `PREMIUM_JURISDICTION_PLACEHOLDER` in `premiumDraftTransform.ts` (avoid import cycle). */
const PREMIUM_JURISDICTION_PLACEHOLDER_TEXT = "To be selected in review.";

/** Detected in additional_terms to avoid double-applying expansion in one session. */
export const FULL_DRAFT_EXPANSION_MARKER = "[claw_full_draft_expansion_v1]";

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

function pickRicher(prev: string, next: string): string {
  const a = nz(prev);
  const b = nz(next);
  if (b.length > Math.max(a.length * 1.12, a.length + 10)) return b;
  return a || b;
}

function rawIntakeSubstantiveForPremiumMerge(originalRawIntake: string | null | undefined): boolean {
  return nz(originalRawIntake).length >= 120;
}

/** True when premium narrative is materially shorter than merge-base (likely generic model echo). */
function premiumFieldLooksThinVersusBase(base: string, premium: string): boolean {
  const b = nz(base);
  const p = nz(premium);
  if (!p) return true;
  if (!b) return false;
  if (p.length >= b.length) return false;
  const threshold = Math.max(140, Math.floor(b.length * 0.75));
  return p.length < threshold;
}

/** Prefer the more detailed field values when re-parsing after an upgrade. */
export function mergeParsedPreferRicher(prev: ParsedDraftShape, fresh: ParsedDraftShape): ParsedDraftShape {
  const parties =
    (prev.parties?.length ?? 0) >= 2 && (fresh.parties?.length ?? 0) < 2 ? prev.parties : fresh.parties;
  return {
    ...fresh,
    title: pickRicher(prev.title, fresh.title),
    jurisdiction: pickRicher(prev.jurisdiction, fresh.jurisdiction),
    parties: parties || fresh.parties,
    purpose: pickRicher(prev.purpose, fresh.purpose),
    payment_terms: pickRicher(prev.payment_terms, fresh.payment_terms),
    duration: nz(fresh.duration) ? fresh.duration : prev.duration,
    due_date: nz(fresh.due_date) ? fresh.due_date : prev.due_date,
    effective_date: nz(fresh.effective_date) ? fresh.effective_date : prev.effective_date,
    payment:
      fresh.payment?.amount != null || nz(fresh.payment?.cadence)
        ? fresh.payment
        : prev.payment,
    termination_summary: pickRicher(prev.termination_summary ?? "", fresh.termination_summary ?? "") || null,
    additional_terms: pickRicher(prev.additional_terms ?? "", fresh.additional_terms ?? "") || null,
    agreement_family: fresh.agreement_family ?? prev.agreement_family,
    llc_company_name: fresh.llc_company_name ?? prev.llc_company_name,
    management_structure: pickRicher(prev.management_structure ?? "", fresh.management_structure ?? "") || null,
    members_ownership_summary:
      pickRicher(prev.members_ownership_summary ?? "", fresh.members_ownership_summary ?? "") || null,
    capital_contributions_summary:
      pickRicher(prev.capital_contributions_summary ?? "", fresh.capital_contributions_summary ?? "") || null,
    distributions_summary: pickRicher(prev.distributions_summary ?? "", fresh.distributions_summary ?? "") || null,
    transfer_restrictions_summary:
      pickRicher(prev.transfer_restrictions_summary ?? "", fresh.transfer_restrictions_summary ?? "") || null,
    dissolution_summary: pickRicher(prev.dissolution_summary ?? "", fresh.dissolution_summary ?? "") || null,
  };
}

function expansionForFamily(family: AgreementFamily | undefined, rawIntake: string): string {
  const raw = (rawIntake || "").trim();
  const isNda = family === "nda" || /\bnda\b|confidentiality|non-disclosure/i.test(raw);
  if (isNda) {
    return [
      "Expanded provisions for review (not legal advice):",
      "",
      "• Confidential Information: a mutual definition covering written, oral, and tangible disclosures, plus reasonably inferred confidential information from the relationship.",
      "• Use and restrictions: use solely to evaluate or perform the permitted purpose; no reverse engineering except as allowed by law.",
      "• Standard exclusions: publicly available information, independently developed information, information from a third party without confidentiality duty, and disclosures required by law (with notice where practicable).",
      "• Term / survival: confidentiality obligations extend for a commercially reasonable period after the relationship ends for trade secrets; shorter period for other information unless you specify otherwise in the title block.",
      "• Return / destruction: upon request, materials containing Confidential Information will be returned or destroyed, with limited retention for legal/compliance archives.",
      "• Remedies: acknowledgment that breach may cause harm difficult to measure; parties intend equitable relief in addition to other remedies available at law.",
    ].join("\n");
  }
  if (family === "operating_agreement") {
    return [
      "Expanded LLC-style provisions for review (not legal advice):",
      "",
      "• Management: clearer delineation of manager vs member-managed defaults, officer-style roles where applicable, and decision thresholds for ordinary vs major actions.",
      "• Economics: distributions and capital-account concepts described in clearer commercial language for counsel to finalize.",
      "• Transfer / buy-sell: a practical starting point for restrictions, rights of first refusal, and permitted transfers to affiliates or for estate planning.",
      "• Dissolution / wind-up: orderly wind-down steps and reserved matters requiring supermajority or unanimous consent.",
    ].join("\n");
  }
  if (
    family === "consulting_agreement" ||
    family === "independent_contractor_agreement" ||
    family === "services_agreement" ||
    family === "generic_business_agreement" ||
    !family
  ) {
    return [
      "Expanded commercial provisions for review (not legal advice):",
      "",
      "• Deliverables and acceptance: clearer milestones, review windows, and change-control language for scope adjustments.",
      "• IP and work product: default assignment of deliverables to the client with carve-outs for pre-existing materials and open-source, subject to your stated exceptions.",
      "• Confidentiality: mutual protection of business information disclosed during the engagement, aligned with the scope you described.",
      "• Liability and indemnity: a balanced starting framework (caps, consequential damages, and mutual indemnities) for counsel to tune to your risk posture.",
      "• Termination: convenience vs cause concepts, transition assistance, and payment for work performed through the effective date of termination.",
    ].join("\n");
  }
  return [
    "Expanded provisions for review (not legal advice):",
    "",
    "• Additional defined terms, cross-defaults, and notice mechanics appropriate to the agreement type inferred from your intake.",
    "• Stronger structural headings and clause scaffolding so counsel can refine rather than draft from a blank page.",
  ].join("\n");
}

/**
 * Post-checkout premium re-parse: merge premium model output with the pre-pay starter snapshot.
 * When `originalRawIntake` is substantive, thin/generic premium narrative must not overwrite richer
 * merge-base fields (starter + premium pickRicher) — raw home prompt remains source of truth for substance.
 */
export function mergePremiumParsePreferFresh(
  structuredSnapshot: ParsedDraftShape,
  premiumParse: ParsedDraftShape,
  originalRawIntake?: string | null,
): ParsedDraftShape {
  const nz = (s: string | null | undefined) => (s || "").trim();
  const base = mergeParsedPreferRicher(structuredSnapshot, premiumParse);
  const rawOk = rawIntakeSubstantiveForPremiumMerge(originalRawIntake);

  const pPurpose = nz(premiumParse.purpose);
  const bPurpose = nz(base.purpose);
  const purpose =
    rawOk && premiumFieldLooksThinVersusBase(bPurpose, pPurpose) ? bPurpose : pPurpose || bPurpose;

  const pPay = nz(premiumParse.payment_terms);
  const bPay = nz(base.payment_terms);
  const payment_terms = rawOk && premiumFieldLooksThinVersusBase(bPay, pPay) ? bPay : pPay || bPay;

  const pTerm = nz(premiumParse.termination_summary ?? "");
  const bTerm = nz(base.termination_summary ?? "");
  const termination_summary =
    rawOk && premiumFieldLooksThinVersusBase(bTerm, pTerm)
      ? base.termination_summary
      : nz(premiumParse.termination_summary ?? "")
        ? premiumParse.termination_summary
        : base.termination_summary;

  const pAdd = nz(premiumParse.additional_terms ?? "");
  const bAdd = nz(base.additional_terms ?? "");
  const additional_terms =
    rawOk && premiumFieldLooksThinVersusBase(bAdd, pAdd)
      ? base.additional_terms
      : nz(premiumParse.additional_terms ?? "")
        ? premiumParse.additional_terms
        : base.additional_terms;

  const structDur = nz(structuredSnapshot.duration ?? "");
  const pDur = nz(premiumParse.duration ?? "");
  const bDur = nz(base.duration ?? "");
  /** `mergeParsedPreferRicher` lets a non-empty premium `duration` win even when starter `duration` is richer — recover against thin premium when raw intake is substantive. */
  let duration = nz(premiumParse.duration ?? "") || base.duration;
  if (rawOk && pDur && structDur && premiumFieldLooksThinVersusBase(structDur, pDur)) {
    duration = structuredSnapshot.duration ?? base.duration;
  } else if (rawOk && pDur && bDur && premiumFieldLooksThinVersusBase(bDur, pDur)) {
    duration = base.duration;
  }

  const pJ = nz(premiumParse.jurisdiction);
  const bJ = nz(base.jurisdiction);
  let jurisdiction = pJ || bJ;
  if (rawOk) {
    if (pJ === PREMIUM_JURISDICTION_PLACEHOLDER_TEXT && bJ && bJ !== PREMIUM_JURISDICTION_PLACEHOLDER_TEXT) {
      jurisdiction = bJ;
    } else if (premiumFieldLooksThinVersusBase(bJ, pJ) && bJ) {
      jurisdiction = bJ;
    }
  }

  let parties: ParsedDraftShape["parties"] =
    (premiumParse.parties?.length ?? 0) >= 2 ? premiumParse.parties! : base.parties;
  if (
    rawOk &&
    (premiumParse.parties?.length ?? 0) >= 2 &&
    draftHasPlaceholderParties({ ...premiumParse, parties: premiumParse.parties }) &&
    (base.parties?.length ?? 0) >= 2 &&
    !draftHasPlaceholderParties({ ...base, parties: base.parties })
  ) {
    parties = base.parties;
  }

  return {
    ...base,
    title: nz(premiumParse.title) || nz(base.title),
    jurisdiction,
    purpose,
    payment_terms,
    termination_summary,
    additional_terms,
    parties,
    duration,
    due_date: nz(premiumParse.due_date ?? "") || base.due_date,
    effective_date: nz(premiumParse.effective_date ?? "") || base.effective_date,
    payment:
      premiumParse.payment?.amount != null || nz(premiumParse.payment?.cadence ?? "")
        ? premiumParse.payment
        : base.payment,
    material_asks:
      premiumParse.material_asks && premiumParse.material_asks.length > 0
        ? premiumParse.material_asks
        : base.material_asks,
    agreement_family: premiumParse.agreement_family ?? base.agreement_family,
    llc_company_name: premiumParse.llc_company_name ?? base.llc_company_name,
    management_structure: nz(premiumParse.management_structure ?? "") || base.management_structure,
    members_ownership_summary: nz(premiumParse.members_ownership_summary ?? "") || base.members_ownership_summary,
    capital_contributions_summary: nz(premiumParse.capital_contributions_summary ?? "") || base.capital_contributions_summary,
    distributions_summary: nz(premiumParse.distributions_summary ?? "") || base.distributions_summary,
    transfer_restrictions_summary: nz(premiumParse.transfer_restrictions_summary ?? "") || base.transfer_restrictions_summary,
    dissolution_summary: nz(premiumParse.dissolution_summary ?? "") || base.dissolution_summary,
  };
}

/** Append a visible expanded-clauses section for optional full-draft upgrade (client-side only). */
export function enrichParsedDraftForFullDraftUpgrade(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const existing = nz(parsed.additional_terms);
  if (existing.includes(FULL_DRAFT_EXPANSION_MARKER)) return parsed;
  const block = expansionForFamily(parsed.agreement_family, rawIntake);
  const nextAdd = existing
    ? `${existing}\n\n${FULL_DRAFT_EXPANSION_MARKER}\n${block}`
    : `${FULL_DRAFT_EXPANSION_MARKER}\n${block}`;
  return { ...parsed, additional_terms: nextAdd };
}

export function draftHasFullDraftExpansion(parsed: ParsedDraftShape | null | undefined): boolean {
  if (!parsed) return false;
  const m = FULL_DRAFT_EXPANSION_MARKER;
  if (nz(parsed.additional_terms).includes(m)) return true;
  /** Persisted rows often store the full preview body in `purpose` (additional_terms omitted from POST /draft). */
  if (nz(parsed.purpose).includes(m)) return true;
  return false;
}
