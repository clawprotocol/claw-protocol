/**
 * Deterministic “full agreement” style preview from structured draft fields.
 * For user review only — not legal advice.
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { FULL_DRAFT_EXPANSION_MARKER } from "./fullDraftUpgradeEnrich";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
export { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
import {
  applyPremiumDeliverableWeakPhraseReplacements,
  buildPremiumDynamicCommercialSectionLines,
  stripPreviewEsignNoticeLines,
} from "./premiumDeliverableDynamicSections";
import { selectAgreementPreviewRoute } from "./agreementPreviewRoute";
import type { AgreementFamily } from "./agreementFamilyRouter";
import {
  isGenericOrEmptyTitle,
  resolveCanonicalAgreementTitle,
} from "./canonicalAgreementTitle";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import { emitPremiumRenderResolveLog, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import {
  partyNameLooksLikeRawPrompt,
  tryExtractPartyPairFromPromptBlob,
} from "./agreementPreviewPartyLine";
import { formatLegalPartyPreamble, type PartyEntry } from "./formatLegalPartyList";
import { formatPaymentTermsLine } from "./intakeCurrencyParse";
import { normalizePaymentTermsForDisplay, normalizeStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";
import {
  STARTER_GOVERNING_LAW_DISPLAY_FALLBACK,
  compressProseForStarterScope,
  compressStarterAdditionalTerms,
  compressTerminationSummaryForStarter,
  isJurisdictionDisplayLowConfidence,
  sanitizeJurisdictionForStarterGoverningLaw,
} from "./starterAgreementPreviewNormalize";
import {
  sanitizeStarterPartyNameForDisplay,
  sanitizeStarterPreviewProse,
} from "./starterPreviewProseSanitize";

const MISSING = "[Not yet specified]";
/**
 * Neutral placeholder for termination when intake had no explicit termination/notice signal.
 * Keep this strictly about TERMINATION (not compensation) to avoid cross-section contamination.
 */
const NEUTRAL_TERMINATION_NOTE = "Termination terms to be agreed by the Parties.";

function nz(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t : MISSING;
}

/**
 * Display-layer title resolution for starter / generic previews.
 *
 *   1. Substantive parsed title (non-generic per canonical-title rules) → keep as-is.
 *   2. Generic / missing title + known family → `resolveCanonicalAgreementTitle`
 *      (handles explicit-intent overrides like "lease agreement" / "event production
 *      agreement" / "saas implementation agreement" and falls back to the family
 *      canonical heading when no intent phrase is present in the intake text).
 *   3. Otherwise → safe `MISSING` placeholder (preserves deterministic fallback).
 *
 * Pure presentation lookup — no parsing is performed here. The canonical resolver and
 * family routing are already populated upstream by `runIntakeDefaultsAndRoles`; this
 * function only exists to ensure the *display* layer never falls back to a bare
 * "AGREEMENT" / "DOCUMENT" / "[NOT YET SPECIFIED]" heading when a canonical heading
 * is computable from already-available metadata.
 */
function resolveStarterDisplayTitle(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  const current = (draft.title || "").trim();
  const family = draft.agreement_family as AgreementFamily | undefined;
  if (current && !isGenericOrEmptyTitle(current, family)) return current;
  if (family) {
    const resolution = resolveCanonicalAgreementTitle({
      currentTitle: current || null,
      liveDocTitle: null,
      family,
      intakeText: options?.intakeText ?? null,
    });
    if (resolution.title) return resolution.title;
  }
  return MISSING;
}

/**
 * Display-layer casing restoration for a single party name.
 *
 * When the canonicalizer normalized intentional intake casing (e.g. "FoundryCo Inc."
 * → "Foundryco Inc.") and the original intake text is available, prefer the source-
 * text variant ONLY when it has strictly more uppercase letters than the cleaned
 * variant. This guards against demoting an upgraded canonical form (e.g. "Smith And
 * Wesson Holdings LLC") back to a lowercase user variant — only deliberately-cased
 * names like FoundryCo / MidCap / iCloud are restored.
 *
 * Returns the input unchanged whenever:
 *   • the intake text is missing,
 *   • the cleaned name does not appear (case-insensitive, word-boundary) in the intake,
 *   • the intake variant has equal or fewer uppercase letters than the cleaned variant,
 *   • or the regex compilation fails for any reason.
 */
function restorePartyCasingFromIntake(
  name: string,
  intakeText: string | null | undefined,
): string {
  const trimmed = (name || "").trim();
  const intake = (intakeText || "").trim();
  if (!trimmed || !intake) return name;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use character-class boundaries (not \b) because canonical names frequently end in
  // a non-word character ("Inc.", "L.L.C.") where \b would not match against a trailing
  // space. We accept any non-alphanumeric / non-period boundary on either side.
  let m: RegExpExecArray | null = null;
  try {
    m = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").exec(intake);
  } catch {
    return name;
  }
  if (!m) return name;
  const original = m[0];
  if (original === trimmed) return name;
  const upperOrig = (original.match(/[A-Z]/g) || []).length;
  const upperClean = (trimmed.match(/[A-Z]/g) || []).length;
  if (upperOrig <= upperClean) return name;
  return original;
}

/** Collapses repeated LawDog e-sign footers to a single trailing notice (all preview modes). */
export function collapseDuplicateEsignNoticesInFullPreview(text: string): string {
  const line = AGREEMENT_PREVIEW_ESIGN_NOTICE;
  if (!text.includes(line)) return text;
  const esc = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const without = text
    .replace(new RegExp(`(?:^|\\n)${esc}(?:\\n|$)`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return `${without}\n\n${line}\n`;
}

/** Remove internal expansion marker and duplicate e-sign line from free-text blocks. */
function sanitizeUserAdditionalTerms(raw: string | null | undefined, premiumDeliverable = false): string {
  let s = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!s) return "";
  const markerIdx = s.indexOf(FULL_DRAFT_EXPANSION_MARKER);
  if (markerIdx >= 0) {
    s = `${s.slice(0, markerIdx).trim()}\n${s.slice(markerIdx + FULL_DRAFT_EXPANSION_MARKER.length).trim()}`.trim();
  }
  const lines = s.split("\n").filter((ln) => {
    const t = ln.trim();
    if (!t) return false;
    if (t.includes(FULL_DRAFT_EXPANSION_MARKER)) return false;
    if (t === AGREEMENT_PREVIEW_ESIGN_NOTICE) return false;
    return true;
  });
  let out = lines.join("\n").trim();
  out = stripPreviewEsignNoticeLines(out);
  if (premiumDeliverable) {
    out = applyPremiumDeliverableWeakPhraseReplacements(out);
  }
  return out;
}

/** Format ISO-like dates for display; otherwise return trimmed string. */
function formatScheduleFragment(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
    }
  }
  return t;
}

/**
 * Family-aware labels for the Term/Effective-Date section (P3 hardening). Purchase
 * agreements never read "Term: until 2026-08-15" — they read "Closing Date: …". Leases
 * use "Lease Term" + "Commencement Date". NDAs use "Confidentiality Term". Consulting/
 * services agreements use "Services Term". Generic fallback is the legacy "Term".
 */
function timingLabelsForFamily(
  family: string | undefined | null,
  title: string | undefined | null,
): { sectionHeading: string; durationLabel: string; effectiveLabel: string; keyDateLabel: string } {
  const fam = (family || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const isPurchase =
    fam === "generic_business_agreement" &&
    (/\bpurchase\s+agreement\b/.test(t) || /\breal\s+estate\s+purchase\s+agreement\b/.test(t));
  const isLease =
    fam === "generic_business_agreement" &&
    (/\blease\s+agreement\b/.test(t) || /\bsublease\s+agreement\b/.test(t));
  const isPropertyMgmt = fam === "generic_business_agreement" && /\bproperty\s+management\s+agreement\b/.test(t);
  // Event family is detected from title alone — covers "Event Production Agreement",
  // "Commercial Event Production Agreement", "Event Services Agreement", "Event Staffing
  // Agreement", "Conference Services Agreement", "Venue Agreement", "Sponsorship
  // Agreement", "Vendor Coordination Agreement". We never coerce ordinary services /
  // employment-staffing into this branch — the title check is the authoritative signal.
  const isEvent =
    /\bevent\s+production\s+agreement\b/.test(t) ||
    /\bevent\s+services\s+agreement\b/.test(t) ||
    /\bevent\s+staffing\s+agreement\b/.test(t) ||
    /\bconference\s+services\s+agreement\b/.test(t) ||
    /\bvenue\s+agreement\b/.test(t) ||
    /\bsponsorship\s+agreement\b/.test(t) ||
    /\bvendor\s+coordination\s+agreement\b/.test(t);
  if (isPurchase) {
    return {
      sectionHeading: "Closing and Effective Date",
      durationLabel: "Closing window",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Closing Date",
    };
  }
  if (isLease) {
    return {
      sectionHeading: "Lease Term and Commencement",
      durationLabel: "Lease Term",
      effectiveLabel: "Commencement Date",
      keyDateLabel: "Key Date",
    };
  }
  if (isPropertyMgmt) {
    return {
      sectionHeading: "Term and Commencement",
      durationLabel: "Management Term",
      effectiveLabel: "Commencement Date",
      keyDateLabel: "Key Date",
    };
  }
  if (isEvent) {
    return {
      sectionHeading: "Event Term and Effective Date",
      durationLabel: "Event Dates",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  if (fam === "nda" || fam === "confidentiality_commercial_protections_agreement") {
    return {
      sectionHeading: "Confidentiality Term and Effective Date",
      durationLabel: "Confidentiality Term",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  if (fam === "consulting_agreement" || fam === "services_agreement" || fam === "independent_contractor_agreement") {
    return {
      sectionHeading: "Services Term and Effective Date",
      durationLabel: "Services Term",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  return {
    sectionHeading: "Term and Effective Date",
    durationLabel: "Term",
    effectiveLabel: "Effective Date",
    keyDateLabel: "Key date",
  };
}

function buildTermAndScheduleSection(draft: ParsedDraftShape): string {
  const labels = timingLabelsForFamily(draft.agreement_family, draft.title);
  const parts: string[] = [];
  const dur = (draft.duration || "").trim();
  const eff = (draft.effective_date || "").trim();
  const due = (draft.due_date || "").trim();
  if (dur) parts.push(`${labels.durationLabel}: ${dur}`);
  if (eff) parts.push(`${labels.effectiveLabel}: ${formatScheduleFragment(eff)}`);
  if (due) parts.push(`${labels.keyDateLabel}: ${formatScheduleFragment(due)}`);
  if (!parts.length) return MISSING;
  return parts.join("\n");
}

/**
 * Family-aware section heading for the Term/Effective-Date block. Used by the
 * starter / generic / premium routes to pick "Closing and Effective Date" vs
 * "Lease Term and Commencement" vs the legacy "Term and Effective Date" heading.
 */
function termAndScheduleSectionHeading(draft: ParsedDraftShape): string {
  return timingLabelsForFamily(draft.agreement_family, draft.title).sectionHeading;
}

/**
 * Roles are only included in the rendered preamble when role confidence is high.
 * Confidence model: a role is "high" if it's a substantive non-generic value AND
 * was either explicitly applied via party-role overlay, carried through from
 * canonical entity types ("company"/"members"), or captured directly from the
 * intake as a structural party-role (guarantor, escrow agent, trustee, etc.).
 *
 * Starter preview (P2 hardening): when a party has a high-confidence intake-captured
 * role token like "guarantor", we render it parenthetically — `Jamie Chen (Guarantor)` —
 * but never invent speculative roles. Generic / "party" roles continue to render via
 * the neutral collective Parties phrasing.
 */
const HIGH_CONFIDENCE_ROLES = new Set(["company", "members"]);
const GENERIC_ROLE = new Set(["", "party", "parties", "signer", "signatory"]);

/**
 * Roles captured directly from intake phrasing that are safe to display in starter preview
 * preambles. These are concrete, structurally meaningful roles (not generic placeholder
 * words). When set, the preamble renders e.g. `First County Escrow (Escrow Agent)`.
 */
const STARTER_DISPLAY_ROLE_TOKENS = new Set([
  "guarantor",
  "escrow agent",
  "escrow",
  "title agent",
  "trustee",
  "landlord",
  "lessor",
  "tenant",
  "lessee",
  "seller",
  "buyer",
  "purchaser",
  "co-tenant",
  "co-signer",
  "advisor",
  "investor",
  "owner",
  "manager",
  "licensor",
  "licensee",
  "witness",
  "notary",
  "notary public",
  "broker",
]);

function partyEntryWithRoleConfidence(p: { name: string; role?: string }, starterPreview: boolean): PartyEntry {
  const role = (p.role || "").trim().toLowerCase();
  if (starterPreview) {
    // Substantive intake-captured roles render parenthetically; everything else collapses
    // to neutral "party" so the prose stays the collective "Parties".
    if (role && STARTER_DISPLAY_ROLE_TOKENS.has(role)) {
      return { name: p.name, role: p.role };
    }
    return { name: p.name, role: "party" };
  }
  if (!role || GENERIC_ROLE.has(role)) {
    return { name: p.name, role: "party" };
  }
  if (HIGH_CONFIDENCE_ROLES.has(role)) {
    return { name: p.name, role: p.role };
  }
  // Non-generic, non-canonical role: keep (user-supplied via overlay or intake-captured).
  return { name: p.name, role: p.role };
}

function partiesPreambleBlock(
  draft: ParsedDraftShape,
  starterPreview: boolean = false,
  intakeText: string | null | undefined = null,
): string {
  const ps = draft.parties || [];
  const n0 = (ps[0]?.name || "").trim();
  const n1 = (ps[1]?.name || "").trim();

  const blobForExtract = [n0, n1].filter(Boolean).join(" ");
  const extracted =
    partyNameLooksLikeRawPrompt(n0) || (n1 && partyNameLooksLikeRawPrompt(n1))
      ? tryExtractPartyPairFromPromptBlob(blobForExtract || n0)
      : null;

  if (extracted) {
    return formatLegalPartyPreamble([
      { name: restorePartyCasingFromIntake(extracted.a, intakeText), role: "party" },
      { name: restorePartyCasingFromIntake(extracted.b, intakeText), role: "party" },
    ]);
  }

  const validParties = ps
    .filter((p) => (p.name || "").trim() && !partyNameLooksLikeRawPrompt(p.name))
    .map((p) => ({
      ...p,
      name: starterPreview ? sanitizeStarterPartyNameForDisplay(p.name) : p.name,
    }))
    .map((p) => ({
      ...p,
      name: restorePartyCasingFromIntake(p.name, intakeText),
    }))
    .map((p) => partyEntryWithRoleConfidence(p, starterPreview));
  if (validParties.length >= 2) {
    return formatLegalPartyPreamble(validParties);
  }

  return `This Agreement (\u201cAgreement\u201d) is entered into by the parties identified above (the \u201cParties\u201d).`;
}

function operatingCompanyLabel(draft: ParsedDraftShape): string {
  const c = (draft.llc_company_name || "").trim();
  if (c) return c;
  const p0 = draft.parties?.[0]?.name?.trim();
  if (p0 && /\bLLC\b/i.test(p0)) return p0;
  return nz(draft.title).replace(/^Operating Agreement\s*[—-]\s*/i, "").trim() || MISSING;
}

function premiumSectionHeading(n: number, title: string, premiumDeliverable: boolean): string {
  if (!premiumDeliverable) return `${n}. ${title}`;
  const label = title.replace(/\s*\/\s*/, " · ").toUpperCase();
  return `${n}. ${label}`;
}

/** Premium deliverable: section labels read as strong headings without markdown asterisks in the editor. */
function premiumOaBlockLabel(label: string, premiumDeliverable: boolean): string {
  return premiumDeliverable ? label.toUpperCase() : label;
}

/** Break long payment blocks into shorter paragraphs for paid review (plain-text friendly). */
function airLongPaymentTerms(pay: string, premiumDeliverable: boolean): string {
  if (!premiumDeliverable || pay.length < 160) return pay;
  return pay.replace(/(?<=\.)\s+(?=[A-Z[(])/g, "\n\n");
}

export type AgreementPreviewBuildOptions = {
  /** When true, compress scope text and soften weak inferred fields for the free/basic review shell. */
  starterPreview?: boolean;
  /**
   * Paid / full-draft path: stronger intro, extra air between major blocks, upgraded tone
   * (not used when `starterPreview` is true).
   */
  premiumDeliverablePreview?: boolean;
  /** User intake for premium structural validation (scenario keywords). */
  intakeText?: string;
  /** Tier D: persisted snapshot / emergency plain body when passed into resolver. */
  legacyPremiumSnapshotText?: string;
  /** Tier A fallback when draft lacks split server fields (e.g. completion winner). */
  premiumWinningCorpusFallback?: string;
  /** When the paid pipeline already accepted the Pro body; trust over live preview. */
  paidAuthoritativeProBody?: string | null;
};

function buildOperatingAgreementPreviewText(draft: ParsedDraftShape, options?: AgreementPreviewBuildOptions): string {
  const starterPreview = Boolean(options?.starterPreview);
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  const company = operatingCompanyLabel(draft);
  const law = starterPreview ? sanitizeJurisdictionForStarterGoverningLaw(draft.jurisdiction) : nz(draft.jurisdiction);
  const purposeRaw = (draft.purpose || "").trim();
  const purpose = starterPreview
    ? compressProseForStarterScope(purposeRaw) || MISSING
    : nz(draft.purpose);
  const management = nz(draft.management_structure);
  const members = nz(draft.members_ownership_summary);
  const contributions = nz(draft.capital_contributions_summary);
  const distributions = nz(draft.distributions_summary);
  const transfers = nz(draft.transfer_restrictions_summary);
  const dissolution = nz(draft.dissolution_summary);
  const more = sanitizeUserAdditionalTerms(draft.additional_terms, premiumDeliverable);
  const title = resolveStarterDisplayTitle(draft, options);

  const lawLine =
    starterPreview && isJurisdictionDisplayLowConfidence((draft.jurisdiction || "").trim())
      ? `State of formation and governing law: ${STARTER_GOVERNING_LAW_DISPLAY_FALLBACK}.`
      : starterPreview
        ? `State of formation and governing law: ${law} (confirm formation and choice-of-law details with counsel).`
        : `The LLC is treated as formed or governed under ${law} for this review shell (confirm with counsel).`;

  const introOa = starterPreview
    ? "This simplified LLC starter preview highlights key fields only. It is not legal advice — confirm details with counsel before adoption."
    : premiumDeliverable
      ? "This LawDog Pro LLC operating agreement reflects your paid upgrade — structured for serious review (not the starter shell). It is not legal advice; confirm material terms with counsel before adoption."
      : "This draft LLC operating agreement preview is generated from your structured fields for review only. It is not legal advice and must be tailored before adoption.";

  const lines: string[] = [title.toUpperCase(), "", introOa, ""];
  if (premiumDeliverable) lines.push("");
  lines.push(
    premiumOaBlockLabel("ENTITY", premiumDeliverable),
    `Company: ${company}`,
    "",
    premiumOaBlockLabel("STATE OF FORMATION / GOVERNING LAW", premiumDeliverable),
    lawLine,
    "",
    premiumOaBlockLabel("PURPOSE", premiumDeliverable),
    purpose,
    "",
    premiumOaBlockLabel("MANAGEMENT", premiumDeliverable),
    management,
    "",
    premiumOaBlockLabel("MEMBERS / OWNERSHIP", premiumDeliverable),
    members,
    "",
    premiumOaBlockLabel("CAPITAL CONTRIBUTIONS", premiumDeliverable),
    contributions,
    "",
    premiumOaBlockLabel("DISTRIBUTIONS", premiumDeliverable),
    distributions,
    "",
    premiumOaBlockLabel("TRANSFER RESTRICTIONS", premiumDeliverable),
    transfers,
    "",
    premiumOaBlockLabel("DISSOLUTION", premiumDeliverable),
    dissolution,
    "",
  );
  if (more) {
    if (premiumDeliverable) lines.push("");
    lines.push(
      premiumOaBlockLabel("ADDITIONAL TERMS", premiumDeliverable),
      starterPreview ? compressStarterAdditionalTerms(more) : more,
      "",
    );
  }
  lines.push(AGREEMENT_PREVIEW_ESIGN_NOTICE, "");
  const collapsed = collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
  // Starter preview path also runs through the operating-agreement builder.
  return starterPreview ? sanitizeStarterPreviewProse(collapsed) : collapsed;
}

/**
 * Core preview builder (no premium server/repair resolution). Used by the universal resolver for tier C.
 */
export function buildAgreementPreviewTextCore(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  const starterPreview = Boolean(options?.starterPreview);
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  const route = selectAgreementPreviewRoute(draft, options);
  if (route === "operating") {
    return collapseDuplicateEsignNoticesInFullPreview(buildOperatingAgreementPreviewText(draft, options));
  }

  const title = resolveStarterDisplayTitle(draft, options);
  const partiesBlock = partiesPreambleBlock(draft, starterPreview, options?.intakeText);
  const purposeRaw = (draft.purpose || "").trim();
  const purposePrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(purposeRaw))
    : purposeRaw;
  const purpose = starterPreview
    ? compressProseForStarterScope(purposeRaw) || MISSING
    : premiumDeliverable
      ? purposePrepared || MISSING
      : nz(draft.purpose);
  const payRaw = (draft.payment_terms || "").trim();
  const payPrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(payRaw))
    : payRaw;
  const payStructuredLine = premiumDeliverable
    ? formatPaymentTermsLine(draft.payment ?? { amount: null, cadence: null, valid: true }).trim()
    : "";
  const pay = starterPreview
    ? normalizeStarterPaymentTermsForDisplay(draft.payment_terms) || MISSING
    : premiumDeliverable
      ? payPrepared.trim() ||
        payStructuredLine ||
        normalizePaymentTermsForDisplay(draft.payment_terms).trim() ||
        MISSING
      : nz(draft.payment_terms);
  const termSection = buildTermAndScheduleSection(draft);
  const lawRaw = (draft.jurisdiction || "").trim();
  const termNoticeRaw = (draft.termination_summary || "").trim();
  const termNoticePrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(termNoticeRaw))
    : termNoticeRaw;
  const termNotice = termNoticePrepared
    ? starterPreview
      ? compressTerminationSummaryForStarter(termNoticePrepared) || NEUTRAL_TERMINATION_NOTE
      : nz(termNoticePrepared)
    : NEUTRAL_TERMINATION_NOTE;
  const more = sanitizeUserAdditionalTerms(draft.additional_terms, premiumDeliverable);

  const introGeneral = starterPreview
    ? "This simplified starter preview reflects your key fields only. It is not legal advice — LawDog Pro can expand this into fuller agreement language when you upgrade."
    : premiumDeliverable
      ? "This LawDog Pro agreement is organized for your review. It is not legal advice; confirm material terms before you share or sign."
      : "This draft agreement preview is generated from your structured fields for review only. It is not legal advice and may require edits before signing.";

  const introPremiumDynamic =
    "The following sections organize your terms for review. It is not legal advice; confirm material terms before you share or sign.";

  const lawBlockPremium =
    lawRaw === PREMIUM_JURISDICTION_PLACEHOLDER
      ? `${PREMIUM_JURISDICTION_PLACEHOLDER} (Governing law was not taken from category labels or vague text — pick the correct state or country before send.)`
      : `This Agreement shall be governed by the laws of ${nz(draft.jurisdiction)}, without regard to conflict-of-law principles.`;

  if (route === "premium_dynamic") {
    const sectionLines = buildPremiumDynamicCommercialSectionLines(draft, {
      buildTermSection: () => buildTermAndScheduleSection(draft),
      buildLawBlock: () => lawBlockPremium,
      premiumSectionHeading: (n, h) => premiumSectionHeading(n, h, true),
    });
    const lines: string[] = [
      title.toUpperCase(),
      "",
      introPremiumDynamic,
      "",
      "",
      partiesBlock,
      "",
      "",
      ...sectionLines,
      AGREEMENT_PREVIEW_ESIGN_NOTICE,
      "",
    ];
    return collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
  }

  const lines: string[] = [title.toUpperCase(), "", introGeneral, ""];
  if (premiumDeliverable) lines.push("");
  lines.push(
    partiesBlock,
    "",
    premiumSectionHeading(1, "Scope of Services / Purpose", premiumDeliverable),
    premiumDeliverable ? purpose.split(/\n\n+/).join("\n\n") : purpose,
    "",
    premiumSectionHeading(2, "Payment Terms", premiumDeliverable),
    airLongPaymentTerms(pay, premiumDeliverable),
    "",
    premiumSectionHeading(3, termAndScheduleSectionHeading(draft), premiumDeliverable),
    termSection,
    "",
    premiumSectionHeading(4, "Governing Law", premiumDeliverable),
    starterPreview && isJurisdictionDisplayLowConfidence(lawRaw)
      ? `Governing law: ${STARTER_GOVERNING_LAW_DISPLAY_FALLBACK}.`
      : premiumDeliverable
        ? lawBlockPremium
        : `This Agreement shall be governed by the laws of ${
            starterPreview ? sanitizeJurisdictionForStarterGoverningLaw(draft.jurisdiction) : nz(draft.jurisdiction)
          }, without regard to conflict-of-law principles.`,
    "",
    premiumSectionHeading(5, "Termination", premiumDeliverable),
    termNotice,
    "",
  );
  if (more) {
    if (premiumDeliverable) lines.push("");
    lines.push(
      premiumSectionHeading(6, "Additional Terms", premiumDeliverable),
      starterPreview ? compressStarterAdditionalTerms(more) : more,
      "",
    );
  }
  lines.push(AGREEMENT_PREVIEW_ESIGN_NOTICE, "");
  const collapsed = collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
  // Starter preview: humanize internal-process phrasing for customer-facing prose.
  return starterPreview ? sanitizeStarterPreviewProse(collapsed) : collapsed;
}

/**
 * Human-readable draft agreement text (fixed section order, stable formatting).
 * Premium path uses {@link resolvePremiumRenderSource} (single source of truth).
 */
export function buildAgreementPreviewText(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  const starterPreview = Boolean(options?.starterPreview);
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  if (premiumDeliverable) {
    const res = resolvePremiumRenderSource({
      draft,
      intakeText: options?.intakeText,
      legacySnapshotText: options?.legacyPremiumSnapshotText,
      premiumWinningCorpusFallback: options?.premiumWinningCorpusFallback,
      paidAuthoritativeProBody: options?.paidAuthoritativeProBody,
      buildLivePreview: () =>
        buildAgreementPreviewTextCore(draft, { ...options, starterPreview: false, premiumDeliverablePreview: true }),
    });
    if (import.meta.env.DEV) emitPremiumRenderResolveLog(res);
    return collapseDuplicateEsignNoticesInFullPreview(res.text);
  }
  return buildAgreementPreviewTextCore(draft, options);
}
