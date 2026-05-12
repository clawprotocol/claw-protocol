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
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import { emitPremiumRenderResolveLog, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import {
  partyNameLooksLikeRawPrompt,
  tryExtractPartyPairFromPromptBlob,
} from "./agreementPreviewPartyLine";
import { formatLegalPartyPreamble } from "./formatLegalPartyList";
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

const MISSING = "[Not yet specified]";
const STANDARD_DEFAULTS_NOTE =
  "Compensation and payment terms shall be defined as agreed between the Parties and set forth in this Agreement.";

function nz(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t : MISSING;
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

function buildTermAndScheduleSection(draft: ParsedDraftShape): string {
  const parts: string[] = [];
  const dur = (draft.duration || "").trim();
  const eff = (draft.effective_date || "").trim();
  const due = (draft.due_date || "").trim();
  if (dur) parts.push(`Term: ${dur}`);
  if (eff) parts.push(`Effective Date: ${formatScheduleFragment(eff)}`);
  if (due) parts.push(`Key date: ${formatScheduleFragment(due)}`);
  if (!parts.length) return MISSING;
  return parts.join("\n");
}

function partiesPreambleBlock(draft: ParsedDraftShape): string {
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
      { name: extracted.a, role: "party" },
      { name: extracted.b, role: "party" },
    ]);
  }

  const validParties = ps.filter((p) => (p.name || "").trim() && !partyNameLooksLikeRawPrompt(p.name));
  if (validParties.length >= 2) {
    return formatLegalPartyPreamble(validParties);
  }

  return `This Agreement (“Agreement”) is entered into by the parties identified above (the “Parties”).`;
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
  const title = nz(draft.title);

  const lawLine =
    starterPreview && isJurisdictionDisplayLowConfidence((draft.jurisdiction || "").trim())
      ? `State of formation and governing law: ${STARTER_GOVERNING_LAW_DISPLAY_FALLBACK}.`
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
  return collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
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

  const title = nz(draft.title);
  const partiesBlock = partiesPreambleBlock(draft);
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
      ? compressTerminationSummaryForStarter(termNoticePrepared) || MISSING
      : nz(termNoticePrepared)
    : STANDARD_DEFAULTS_NOTE;
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
    premiumSectionHeading(3, "Term and Effective Date", premiumDeliverable),
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
  return collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
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
