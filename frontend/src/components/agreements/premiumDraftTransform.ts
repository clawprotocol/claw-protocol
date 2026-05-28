/**
 * Premium-only deterministic transforms: business-grade scope, no raw-intake dumps,
 * cautious governing law, lean boilerplate, and a lightweight quality gate.
 */
import type { AgreementFamily } from "./agreementFamilyRouter";
import { partyNameLooksLikeRawPrompt } from "./agreementPreviewPartyLine";
import { FULL_DRAFT_EXPANSION_MARKER } from "./fullDraftUpgradeEnrich";
import { type IntakeStructuredAgreement, parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractPremiumAskTargets } from "./premiumIntakeAskCoverage";
import { parseDeterministicCompensation } from "./premiumPaymentTermsElevate";
import { buildPremiumDeliverablePlainTextFromDraft } from "./premiumReadonlyRenderCorpus";
import { detectPremiumScenarioCategory, premiumScenarioPrefersLeanPacks } from "./premiumScenarioCategory";
import {
  buildCommercialFactGraph,
  commercialFactGraphToGuidanceLines,
} from "./proOperationalSynthesis";

/** Explicit review placeholder — never substitute marketing/category labels as law. */
export const PREMIUM_JURISDICTION_PLACEHOLDER = "To be selected in review.";

const VAGUE_PHRASE_RE =
  /\b(tbd|to\s+be\s+agreed|to\s+be\s+determined|to\s+be\s+specified|not\s+yet\s+specified|\[not\s+yet\s+specified\])\b/gi;

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/** Remove client-side “expanded provisions” bullet pack (generic boilerplate). */
export function stripFullDraftExpansionBlock(additionalTerms: string | null | undefined): string {
  const s = (additionalTerms || "").trim();
  const idx = s.indexOf(FULL_DRAFT_EXPANSION_MARKER);
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}

const OPERATIVE_DERIVED_HEAD = "Operative points derived from the parties";

function stripOperativeDerivedBlock(additionalTerms: string | null | undefined): string {
  const s = (additionalTerms || "").trim();
  const idx = s.indexOf(OPERATIVE_DERIVED_HEAD);
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}

function purposeReadsAsRawIntakeDump(purpose: string, rawIntake: string): boolean {
  const p = purpose.replace(/\s+/g, " ").trim();
  const r = rawIntake.replace(/\s+/g, " ").trim();
  if (!p || !r) return false;
  /** Long text alone is not a dump — premium (3b) legitimately returns clause-length scope. */
  const head = p.slice(0, Math.min(200, p.length));
  if (head.length >= 60 && r.includes(head)) return true;
  const words = p.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 14) return false;
  const rLower = r.toLowerCase();
  let hit = 0;
  for (const w of words) {
    if (rLower.includes(w.toLowerCase())) hit++;
  }
  return hit / words.length > 0.68;
}

/** True when merged purpose reads like agreement-grade drafting (not a menu label or thin starter line). */
export function looksClauseGradePremiumPurpose(purpose: string): boolean {
  const p = (purpose || "").trim();
  if (p.length < 160) return false;
  const t = p.toLowerCase();
  const patterns = [
    /\b(shall|must|may\s+not|will\s+not|agrees?\s+to)\b/,
    /\b(party|parties|provider|client|contractor|agency|referr(?:er|al)?)\b/,
    /\b(compensation|payment|fee|retainer|commission|invoice|milestone)\b/,
    /\b(confidential|termination|indemnif|warrant|liabilit)\b/,
    /\b(non[-\s]?solicit|non[-\s]?circumvent|exclusiv|intellectual\s+property|work\s+product)\b/,
  ];
  const hits = patterns.filter((re) => re.test(t)).length;
  const paragraphs = p.split(/\n\s*\n/).filter((blk) => blk.trim().length >= 40);
  return hits >= 2 || (hits >= 1 && paragraphs.length >= 3);
}

/** Short framing only — specifics must come from user intake / LLM fields (no generic “good faith” padding). */
function familyScopeLeadIn(family: AgreementFamily | undefined): string {
  switch (family) {
    case "nda":
      return "Confidentiality relationship: details below follow your notes.";
    case "consulting_agreement":
    case "independent_contractor_agreement":
    case "services_agreement":
      return "Services relationship: operative commitments below follow your notes.";
    default:
      return "Commercial relationship: operative commitments below follow your notes.";
  }
}

const US_STATE_TOKEN =
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new\s+hampshire|new\s+jersey|new\s+mexico|new\s+york|north\s+carolina|north\s+dakota|ohio|oklahoma|oregon|pennsylvania|rhode\s+island|south\s+carolina|south\s+dakota|tennessee|texas|utah|vermont|virginia|washington|west\s+virginia|wisconsin|wyoming|district\s+of\s+columbia)\b/i;

/** Marketing / menu labels must never become jurisdiction or scope (e.g. “Fitness Niche”, “Cleaning services”). */
export function isLikelyCategoryOrTradeLabel(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  const low = t.toLowerCase();
  if (/\bniche\b|\bvertical\b|\bcategory\b|\bsegment\b/.test(low)) return true;
  if (/^(cleaning|marketing|fitness|consulting|design|logistics|analytics)\s+services?$/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 4 && !/\b(between|party|shall|will|must|llc|inc|ltd)\b/i.test(t) && !US_STATE_TOKEN.test(t)) {
    if (t.length <= 48 && !/\d/.test(t)) return true;
  }
  return false;
}

function stripInstructionNoise(line: string): string {
  return line
    .replace(/^\s*(?:please|i\s+need|we\s+need|create|draft|help\s+me)\b[^.!?]*[.!?]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function operativeLinesFromIntake(structured: IntakeStructuredAgreement, rawIntake: string, maxLines: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushLine = (raw: string) => {
    let t = stripInstructionNoise(raw);
    if (t.length < 28 || t.length > 300) return;
    if (/^(i need|please|create|draft|describe)\b/i.test(t)) return;
    if (/\bparties?\s*:/i.test(t)) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t.length > 280 ? `${t.slice(0, 277)}…` : t);
  };

  if (structured.confidentiality) pushLine(`Each Party will treat the other’s confidential information with reasonable care, consistent with the purpose of this relationship: ${structured.confidentiality}`);

  const raw = rawIntake.replace(/\r\n/g, "\n");
  for (const para of raw.split(/\n+/)) {
    if (out.length >= maxLines) break;
    const t = para.replace(/\s+/g, " ").trim();
    if (!/\b(shall|must|will\s+pay|agrees\s+to|may\s+not|will\s+not|commission|reimburs|retainer|milestone)\b/i.test(t)) continue;
    pushLine(t);
  }

  return out.slice(0, maxLines);
}

/**
 * Replace wall-of-text scope with concise business language; move usable intake lines
 * into numbered operative notes (not pasted into Scope).
 */
export function synthesizePremiumScopeAndOperativeFields(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (parsed.agreement_family === "operating_agreement") return parsed;

  const structured = parseIntakeToStructuredAgreement(rawIntake.trim());
  const factGraph = buildCommercialFactGraph(rawIntake, parsed);
  const fam = parsed.agreement_family;
  const purposeWas = nz(parsed.purpose);
  const dump = purposeReadsAsRawIntakeDump(purposeWas, rawIntake);

  const paragraphs: string[] = [];
  const lead = familyScopeLeadIn(fam);
  if (lead) paragraphs.push(lead);
  const scopeLine = structured.scope.trim();
  const incomingAddendum = nz(parsed.additional_terms);
  const intakeAskLoad = extractPremiumAskTargets(rawIntake.trim()).length;
  const richOperativeDraft = incomingAddendum.length >= 420 || intakeAskLoad >= 6;
  const clauseGradePremiumPurpose =
    !dump && purposeWas.length >= 160 && looksClauseGradePremiumPurpose(purposeWas);

  if (scopeLine.length >= 12 && !isLikelyCategoryOrTradeLabel(scopeLine)) {
    paragraphs.push(`Commercial scope (summary): ${scopeLine.replace(/^commercial\s+scope\s*\(?summary\)?\s*:\s*/i, "")}`);
  }

  const filler =
    "Use the numbered operative points and payment section to capture specifics — edit freely before send.";

  if (clauseGradePremiumPurpose) {
    const cap = 5200;
    paragraphs.push(purposeWas.length > cap ? `${purposeWas.slice(0, cap - 1)}…` : purposeWas);
  } else if (!dump && purposeWas.length >= 12 && purposeWas.length <= 520) {
    paragraphs.push(purposeWas);
  } else if (!dump && richOperativeDraft && purposeWas.length >= 48) {
    paragraphs.push(purposeWas.length > 1100 ? `${purposeWas.slice(0, 1100)}…` : purposeWas);
  } else {
    const hasScopeSummary = paragraphs.some((x) => /commercial scope \(summary\)/i.test(x));
    const substantiveBeyondFraming = paragraphs.some(
      (x) => x !== lead && !/commercial scope \(summary\)/i.test(x),
    );
    if (!substantiveBeyondFraming) paragraphs.push(filler);
    else if (!hasScopeSummary && paragraphs.length <= 1) paragraphs.push(filler);
  }

  const purpose = paragraphs.filter(Boolean).join("\n\n");

  const operative = operativeLinesFromIntake(structured, rawIntake, 5);
  let add = stripOperativeDerivedBlock(stripFullDraftExpansionBlock(parsed.additional_terms));
  if (operative.length) {
    const block = [
      "Operative points derived from the parties’ notes (edit to match your deal):",
      "",
      ...operative.map((b, i) => `${i + 1}. ${b}`),
    ].join("\n");
    add = add ? `${add}\n\n${block}` : block;
  }
  const factGuidance = commercialFactGraphToGuidanceLines(factGraph, rawIntake);
  if (factGuidance.length) {
    const graphHead =
      factGraph.agreementKind === "joint_venture_economics"
        ? "Commercial fact graph for premium joint venture economics synthesis:"
        : "Commercial fact graph for premium services synthesis:";
    const graphBlock = [graphHead, "", ...factGuidance.map((line, i) => `${i + 1}. ${line}`)].join("\n");
    if (!add.toLowerCase().includes("commercial fact graph for premium")) {
      add = add ? `${add}\n\n${graphBlock}` : graphBlock;
    }
  }

  return { ...parsed, purpose, additional_terms: add || null };
}

const US_STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia";

function jurisdictionAppearsInIntake(jurisdiction: string, rawLower: string): boolean {
  const j = jurisdiction.toLowerCase().replace(/^state\s+of\s+/i, "").trim();
  if (j.length < 3) return false;
  if (rawLower.includes(j)) return true;
  return (
    new RegExp(`\\b(?:${US_STATE_NAMES})\\b`, "i").test(j) &&
    new RegExp(`\\b(?:${US_STATE_NAMES})\\b`, "i").test(rawLower)
  );
}

/**
 * Raw-intake first: explicit phrasing the user chose (e.g. Oklahoma) must beat parse defaults
 * (often Delaware) on premium fallback/stitch paths.
 */
function preferGoverningLawFromRawIntake(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (/\boklahoma\s+law\s+governs\b/i.test(t)) return "State of Oklahoma";
  if (/\blaws?\s+of\s+oklahoma\b/i.test(t)) return "State of Oklahoma";
  if (/\boklahoma\s+law\b/.test(t)) return "State of Oklahoma";
  if (/\bgoverning\s+law:?\s*oklahoma\b/i.test(t)) return "State of Oklahoma";
  if (/\bgoverned\s+by\s+the\s+laws?\s+of\s+oklahoma\b/i.test(t)) return "State of Oklahoma";
  return null;
}

/**
 * Single resolver for Pro output governing law. Priority: explicit raw intake > parsed draft
 * (structured + jurisdiction field corroboration) > fallback default.
 */
export function resolveFinalGoverningLaw(
  rawIntake: string,
  parsed: ParsedDraftShape,
  fallbackDefault: string,
): string {
  const p0 = preferGoverningLawFromRawIntake(rawIntake);
  if (p0) return p0;
  const r = resolvePremiumJurisdiction(parsed, rawIntake);
  if (r !== PREMIUM_JURISDICTION_PLACEHOLDER) return r;
  const pj = nz(parsed.jurisdiction);
  if (pj && !/^tbd$/i.test(pj) && !isLikelyCategoryOrTradeLabel(pj)) return pj.slice(0, 160);
  const fd = nz(fallbackDefault);
  if (fd && !isLikelyCategoryOrTradeLabel(fd)) return fd.slice(0, 160);
  return PREMIUM_JURISDICTION_PLACEHOLDER;
}

/** Never invent governing law: structured intake only, else placeholder if not corroborated in raw text. */
export function resolvePremiumJurisdiction(parsed: ParsedDraftShape, rawIntake: string): string {
  const pRaw = preferGoverningLawFromRawIntake(rawIntake);
  if (pRaw) return pRaw;

  const rawLower = rawIntake.toLowerCase();
  if (/\boklahoma\b/.test(rawLower) && /\bdelaware\b/.test(nz(parsed.jurisdiction).toLowerCase())) {
    return "State of Oklahoma";
  }

  const structured = parseIntakeToStructuredAgreement(rawIntake.trim());
  const fromStructured = structured.governing_law.trim();
  if (fromStructured && !isLikelyCategoryOrTradeLabel(fromStructured)) {
    return fromStructured.slice(0, 160);
  }

  const cur = nz(parsed.jurisdiction);
  if (!cur || /^tbd$/i.test(cur) || isLikelyCategoryOrTradeLabel(cur)) return PREMIUM_JURISDICTION_PLACEHOLDER;
  if (jurisdictionAppearsInIntake(cur, rawLower)) return cur;

  return PREMIUM_JURISDICTION_PLACEHOLDER;
}

function intakeSignalsLow(intakeLower: string): boolean {
  return intakeLower.length < 80;
}

export type PremiumCommercialSignals = {
  commission: boolean;
  clawback: boolean;
  reimbursement: boolean;
  ownershipData: boolean;
  adCompliance: boolean;
  exclusivity: boolean;
  nonsolicit: boolean;
  noncircumvent: boolean;
  termRenewal: boolean;
  terminationCause: boolean;
  disputeArbitration: boolean;
  confidentiality: boolean;
  referralChannel: boolean;
  contractorServices: boolean;
  collaborationPilot: boolean;
};

export function detectPremiumCommercialSignals(text: string): PremiumCommercialSignals {
  const low = (text || "").toLowerCase();
  return {
    commission: /\bcommission|%\s*(?:of\s+)?(?:sales|revenue|net|gross)|referral\s+fee\b/.test(low),
    clawback: /\bclawback|chargeback|refund|reversal\b/.test(low),
    reimbursement: /\breimburs|pre-?approved\s+expenses?|out[-\s]?of[-\s]?pocket\b/.test(low),
    ownershipData:
      /\b(work\s+product|inventions?|intellectual\s+property\s+(?:assignment|ownership)|assign(?:ed)?\s+(?:all\s+)?rights|customer\s+list|crm|lead\s+data|background\s+ip)\b/.test(
        low,
      ) || /\bowns?\s+(?:the\s+)?(?:crm|list|data|deliverables|work\s+product)\b/.test(low),
    adCompliance: /\b(ad\s+claims?|misleading\s+claims?|fake\s+promises?|compliance|approval(?:\s+rights?)?|ftc|brand\s+safety|publishing\s+any\s+claims?)\b/.test(low),
    exclusivity: /\b(exclusive|exclusivity|territory|qualified\s+leads?)\b/.test(low),
    nonsolicit: /\b(?:non[-\s]?solicit|anti[-\s]?solicit|no\s+solicitation|no[-\s]?hire|solicitation\s+of\s+(?:staff|team|employees?|contractors?))\b/.test(low),
    noncircumvent: /\b(?:non[-\s]?circumvent|anti[-\s]?bypass|bypass|no\s+circumvention|anti[-\s]?circumvention)\b/.test(low),
    termRenewal: /\b(auto[-\s]?renew|renewal|12\s*month|term)\b/.test(low),
    terminationCause: /\b(termination|terminate|for\s+cause|fraud|brand\s+damage|criminal|material\s+breach)\b/.test(low),
    disputeArbitration:
      /\b(arbitration|arbitrator|arbitrate|arbitrated|binding\s+arbitration|aaa\b|jams|mediation|mediate|litigation\s+in\s+the\s+courts|dispute\s+resolution\s+(?:clause|process))\b/.test(
        low,
      ),
    confidentiality: /\b(nda|confidential|non[-\s]?disclosure)\b/.test(low),
    referralChannel: /\b(referral|channel\s+partner|introduced?\s+accounts?|sourced\s+deals?|growth\s+partner|business\s+development)\b/.test(low),
    contractorServices: /\b(independent\s+contractor|contractor|1099|statement\s+of\s+work|deliverables?)\b/.test(low),
    collaborationPilot: /\b(collaboration|pilot|trial|evaluation|proof[-\s]?of[-\s]?concept)\b/.test(low),
  };
}

const MARKETING_AGENCY_PACK_HEAD = "Marketing agency / paid media safeguards (edit as needed)";

/**
 * Deterministic pack for e‑commerce / brand + paid media + agency engagements (no invented $ amounts).
 */
export function detectMarketingAgencyPremiumIntake(rawIntake: string): { active: boolean; signalsFound: string[] } {
  const low = (rawIntake || "").toLowerCase();
  const signalsFound: string[] = [];

  const agencyFrame =
    /\b(marketing\s+agency|ad\s+agency|media\s+buying|growth\s+agency)\b/.test(low) ||
    /\bhire\s+(?:a|an)\s+.*\bagency\b/.test(low) ||
    (/\bagency\b/.test(low) && /\b(run|runs|running|manage|managing|execute|executing)\b/.test(low) && /\b(ads?|campaigns?|creatives?|email)\b/.test(low));

  const paidSurface =
    /\b(meta|facebook|instagram|tiktok|tik\s*tok|linkedin\s+ads?|google\s+ads?|youtube\s+ads?|paid\s+media)\b/.test(low) ||
    /\bemail\s+flows?\b/.test(low) ||
    (/\bads?\b/.test(low) && /\b(email|flows?|tiktok|meta|facebook|instagram)\b/.test(low));

  const opsSignals: Array<[string, RegExp]> = [
    ["spend_approval", /\b(spend\s+approv|approval\s+limits?|budget\s+caps?|pre-?approv\w*\s+spend)\b/i],
    ["ad_accounts_pixels", /\b(ad\s+accounts?|business\s+manager|pixels?|tag(?:ging)?|audiences?)\b/i],
    ["creatives_assets", /\b(creatives?|creative\s+assets?|copywriting|landing\s+pages?)\b/i],
    ["reporting", /\b(performance\s+report|reporting|metrics|dashboards?|analytics)\b/i],
    ["subcontractors", /\b(subcontractors?|subcontracts?|sub-?contract|hidden\s+sub|undisclosed\s+sub)\b/i],
    ["ftc_compliance", /\b(ftc|truth\s+in\s+advertising|endorsement|consumer\s+protection|compliance)\b/i],
    ["chargebacks", /\b(chargeback|refund\s+cooperation|processor)\b/i],
    ["termination_notice", /\b(cancellation|terminate|termination|notice\s+period)\b/i],
    ["competitor_creative", /\b(competitors?|competing|no\s+using\s+our\s+creatives|non-?reuse|reuse)\b/i],
  ];
  for (const [id, re] of opsSignals) {
    if (re.test(low)) signalsFound.push(id);
  }

  const groupBHits = opsSignals.filter(([, re]) => re.test(low)).length;
  const active = Boolean(agencyFrame && paidSurface && groupBHits >= 2);

  if (agencyFrame) signalsFound.unshift("agency_frame");
  if (paidSurface) signalsFound.unshift("paid_surface");

  return { active, signalsFound: [...new Set(signalsFound)] };
}

export function buildMarketingAgencyPremiumClauseBullets(rawIntake: string): string[] {
  if (!detectMarketingAgencyPremiumIntake(rawIntake).active) return [];
  return [
    "Spend approval and media controls: Client reserves written approval for campaign launches, creative/material changes that materially change claims, and media spend increases beyond agreed thresholds or test budgets; Agency pauses net-new spend on Client’s written direction pending approval.",
    "Ad accounts, pixels, audiences, and data: Client owns its ad accounts, pixels/tags, remarketing audiences, first-party lists, and historical performance data; Agency receives only the access reasonably required to perform the Services and will not merge Client assets into the Agency’s unrelated client properties without prior written consent.",
    "Subcontractors and undisclosed fulfillment: Agency will not engage undisclosed subcontractors or white-label fulfillment for material workstreams without Client’s prior written approval; Agency remains responsible for approved subcontractors’ performance and confidentiality.",
    "Performance reporting: Agency will provide recurring performance reporting (spend, delivery, creative tests, and attributable results where reasonably available) and reasonable export/read access consistent with platform permissions and Client’s role ownership.",
    "FTC / advertising compliance: Externally facing claims, testimonials, endorsements, and promotional copy will follow applicable advertising and consumer-protection standards (including FTC guidance where relevant), with substantiation on file and pre-publication review for materially sensitive statements.",
    "Chargebacks and payment disputes: The Parties will cooperate in good faith on chargebacks, refunds, and processor inquiries with prompt notice, evidence preservation, and commercially reasonable documentation.",
    "Cancellation, notice, and transition: Termination and wind-down follow the notice and cure concepts described in this Agreement; upon exit, Agency will cooperate on an orderly transition including pausing active spend, preserving exports Client is entitled to receive, and revoking Agency access credentials except as needed for final reconciliation.",
    "Non-reuse of Client creatives for competitors: Client-furnished brand assets, lists, and approved creatives may not be used to promote competing brands or unrelated clients without Client’s prior written consent.",
  ];
}

function appendMarketingAgencyPremiumClausePack(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const detection = detectMarketingAgencyPremiumIntake(rawIntake);
  const bullets = detection.active ? buildMarketingAgencyPremiumClauseBullets(rawIntake) : [];
  const existing = nz(parsed.additional_terms);
  if (existing.includes(MARKETING_AGENCY_PACK_HEAD)) {
    if (import.meta.env.DEV) {
      console.info("[premium-agency-pack]", {
        detected: detection.active,
        signals_found: detection.signalsFound,
        clauses_injected: 0,
        snapshot_len_before: buildPremiumDeliverablePlainTextFromDraft(parsed).length,
        snapshot_len_after: buildPremiumDeliverablePlainTextFromDraft(parsed).length,
        note: "pack_already_present",
      });
    }
    return parsed;
  }
  if (!detection.active || !bullets.length) {
    const low = (rawIntake || "").toLowerCase();
    if (
      import.meta.env.DEV &&
      rawIntake.length >= 120 &&
      /\b(agency|meta|tiktok|facebook|instagram|ads|email\s+flows?)\b/.test(low)
    ) {
      console.info("[premium-agency-pack]", {
        detected: false,
        signals_found: detection.signalsFound,
        clauses_injected: 0,
      });
    }
    return parsed;
  }

  const beforeLen = buildPremiumDeliverablePlainTextFromDraft(parsed).length;
  const block = `${MARKETING_AGENCY_PACK_HEAD}\n\n${bullets.map((b) => `• ${b}`).join("\n")}`;
  const out: ParsedDraftShape = { ...parsed, additional_terms: existing ? `${existing}\n\n${block}` : block };
  const afterLen = buildPremiumDeliverablePlainTextFromDraft(out).length;
  if (import.meta.env.DEV) {
    console.info("[premium-agency-pack]", {
      detected: true,
      signals_found: detection.signalsFound,
      clauses_injected: bullets.length,
      snapshot_len_before: beforeLen,
      snapshot_len_after: afterLen,
    });
  }
  return out;
}

function buildCommercialSignalClauses(signals: PremiumCommercialSignals): string[] {
  const out: string[] = [];
  if (signals.commission)
    out.push(
      "Commission mechanics: variable compensation applies only to qualified transactions and is calculated from defined net receipts after cleared funds, less documented refunds/chargebacks and taxes unless otherwise stated in the fee schedule.",
    );
  if (signals.clawback)
    out.push(
      "Clawback / reversal: commissions already paid may be offset or repaid for refunded, canceled, or reversed transactions during the agreed lookback period, with transparent ledger support and good-faith dispute review.",
    );
  if (signals.reimbursement)
    out.push(
      "Reimbursements: documented out-of-pocket costs require prior written approval and are reimbursable at cost within the invoicing cycle specified by the Parties.",
    );
  if (signals.ownershipData)
    out.push(
      "Ownership and data: client ownership of deliverables, lead/CRM records, and campaign data is preserved except for provider pre-existing tools and know-how, which remain provider property under a limited use license.",
    );
  if (signals.adCompliance)
    out.push(
      "Advertising compliance and approvals: externally-facing claims, creatives, and landing-page statements require client approval before publication and must follow applicable advertising and consumer-protection rules.",
    );
  if (signals.contractorServices)
    out.push(
      "No authority to bind: contractor or sales representative has no authority to bind the company, alter approved pricing/terms, or make guarantees/promises outside written authorization.",
    );
  if (signals.exclusivity)
    out.push(
      "Exclusivity and performance gates: any exclusive territory or channel rights apply only while agreed qualified-lead or performance thresholds are met for consecutive periods set in the schedule.",
    );
  if (signals.nonsolicit)
    out.push("Non-solicitation: neither Party will solicit or hire the other Party’s personnel or contractors involved in this engagement during the term and agreed tail period.");
  if (signals.noncircumvent)
    out.push("Non-circumvent: neither Party may bypass the other to transact directly with introduced counterparties in a way that avoids agreed compensation during the protection period.");
  if (signals.termRenewal)
    out.push("Term and renewal: the initial term and any auto-renewal cadence continue unless either Party gives timely non-renewal notice in the period set by the schedule.");
  if (signals.terminationCause)
    out.push("Termination for cause: immediate termination rights apply for fraud, criminal conduct, material reputational harm, repeated quality failures, or uncured material breach.");
  if (signals.disputeArbitration)
    out.push("Dispute resolution: unresolved disputes proceed under the selected arbitration/court framework and governing law stated in this Agreement, after good-faith escalation.");
  if (signals.confidentiality)
    out.push("Confidentiality: non-public business information is protected and used solely for this relationship, with required-law disclosure carve-outs and survival after termination.");
  if (signals.referralChannel) {
    out.push(
      "Referral / channel mechanics: introduced prospects are tracked in a shared attribution log; referral credit, protected accounts, and payout timing follow the schedule attached to this Agreement.",
    );
  }
  if (signals.contractorServices) {
    out.push(
      "Independent contractor status and deliverables: provider performs services as an independent contractor, controls work methods, and delivers the milestones, reports, and handoff artifacts described in the scope.",
    );
    out.push(
      "Authority, representations, and access controls: provider may not make false or misleading promises, and company systems/CRM access may be revoked immediately upon suspension or termination.",
    );
    out.push(
      "Execution and signatures: the Parties execute through authorized signers with printed name, title, and date lines in the signature block.",
    );
  }
  return out;
}

function buildReferralPack(signals: PremiumCommercialSignals, rawIntake: string): string[] {
  if (!signals.referralChannel) return [];
  const out: string[] = [
    "Channel / referral scope: this engagement covers introductions, opportunity qualification, and coordination support as described in the scope schedule.",
  ];
  const economics = parseDeterministicCompensation(rawIntake);
  if (economics.hasExplicitEconomics) {
    out.push(
      `Referral economics synthesis: ${economics.percentage || "agreed"} commission applies ${economics.trigger || "to attributable closed sourced opportunities"}, with payout ${economics.payoutTiming || "after cleared funds are collected"}.`,
    );
    if (economics.exclusions.length) out.push(`Commission exclusions: ${economics.exclusions.join(" ")}`);
    if (economics.clawback) out.push(`Commission clawback/offset: ${economics.clawback}`);
  }
  if (signals.commission)
    out.push(
      "Referral commissions: earned only on attributed opportunities that close and clear payment; statements and true-up cadence follow the payout schedule.",
    );
  if (signals.noncircumvent)
    out.push(
      "Anti-circumvention: counterparties introduced under this Agreement may not be bypassed to avoid agreed referral compensation during the protection period.",
    );
  if (signals.nonsolicit)
    out.push(
      "Non-solicitation: neither Party will solicit or hire the other Party’s personnel tied to introduced accounts during the term and agreed post-term tail.",
    );
  if (signals.exclusivity)
    out.push(
      "Territory / exclusivity: exclusive rights in a territory or channel apply only while measurable performance thresholds are met for consecutive measurement windows.",
    );
  return out;
}

function buildContractorPack(signals: PremiumCommercialSignals): string[] {
  if (!signals.contractorServices) return [];
  const out: string[] = [
    "Contractor scope and deliverables: deliverables, acceptance checkpoints, and revision windows are defined in the statement of work and incorporated by reference.",
  ];
  if (signals.ownershipData)
    out.push(
      "Work product and account ownership: client owns final deliverables, campaign assets, and CRM/lead data generated for the engagement, with contractor retaining pre-existing tools and know-how.",
    );
  if (signals.adCompliance)
    out.push(
      "Compliance and approvals: promotional claims and externally-facing copy require client approval before publication and must follow advertising and platform rules.",
    );
  if (signals.reimbursement)
    out.push("Expense controls: reimbursable expenses require prior written approval, supporting receipts, and invoicing consistent with agreed timelines.");
  return out;
}

function buildHybridConfidentialityPack(signals: PremiumCommercialSignals, rawIntake: string): string[] {
  const hybrid =
    signals.confidentiality &&
    (signals.ownershipData ||
      signals.adCompliance ||
      signals.referralChannel ||
      signals.nonsolicit ||
      signals.noncircumvent ||
      signals.contractorServices ||
      signals.collaborationPilot);
  if (!hybrid) return [];
  const low = (rawIntake || "").toLowerCase();
  const explicitReverseEngineer = /\breverse[-\s]?engineer|decompil|disassembl\b/i.test(low);
  const out = [
    "Confidentiality definition and permitted use: confidential information includes technical, commercial, customer, and pricing information and may be used only for the defined relationship purpose.",
    "Return and destruction: upon request or termination, each Party will promptly return or securely destroy confidential materials and certify destruction for sensitive repositories.",
  ];
  if (explicitReverseEngineer) {
    out.push(
      "No reverse or competing use: recipients may not reverse-engineer confidential materials or use them to build a competing offering or bypass the disclosing Party’s business opportunity.",
    );
  }
  out.push(
    "Injunctive relief and remedies: unauthorized disclosure or misuse may cause irreparable harm and supports equitable relief in addition to any monetary remedies available at law.",
    "Term and survival: confidentiality obligations apply during the relationship and survive for the stated post-termination period or as required by applicable trade-secret law.",
    "Dispute and venue: disputes regarding confidentiality misuse may be brought in the agreed venue and governing-law forum after good-faith escalation.",
  );
  if (signals.ownershipData)
    out.push("Data stewardship: each Party will safeguard lead and account data and return or securely destroy access credentials and exports at termination.");
  if (signals.nonsolicit)
    out.push("No-hire / non-solicit: neither Party will directly solicit, recruit, or hire the other Party’s employees, contractors, or key team members during the term and agreed tail period.");
  if (signals.noncircumvent)
    out.push("Commercial non-circumvent: neither Party may bypass the other for introduced customers, vendors, or counterparties in a way that avoids agreed economics during the protection period.");
  if (signals.adCompliance)
    out.push("Regulatory hygiene: the Parties will maintain records supporting claim substantiation and approval history for materially sensitive ad statements.");
  return out;
}

/**
 * Lean add-on clauses only when intake or family clearly calls for them (capped insert list).
 */
export function injectCoreClausesConservative(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const low = `${nz(parsed.purpose)}\n${nz(parsed.payment_terms)}\n${nz(parsed.additional_terms)}`.toLowerCase();
  const rawLow = rawIntake.toLowerCase();
  const fam = parsed.agreement_family;
  const chunks: string[] = [];

  const needsIp =
    fam === "consulting_agreement" ||
    fam === "independent_contractor_agreement" ||
    fam === "services_agreement";

  if (!/\bterminat(e|ion)\b/.test(low) && !intakeSignalsLow(rawLow)) {
    chunks.push(
      "Termination: Either Party may terminate on written notice as permitted herein; accrued fees and confidentiality survive as stated below.",
    );
  }
  const explicitDisputeIntent =
    /\b(arbitration|arbitrator|arbitrate|binding\s+arbitration|mediat|litigat|exclusive\s+jurisdiction|dispute\s+resolution|lawsuit|court\s+of)\b/i.test(
      rawLow,
    );
  if (
    !/\bdispute\b/.test(low) &&
    !/\barbitrat/.test(low) &&
    !/\bmediat/.test(low) &&
    explicitDisputeIntent
  ) {
    chunks.push(
      "Dispute resolution: The Parties will attempt good-faith negotiation before pursuing formal remedies in the courts of the jurisdiction selected above unless they agree otherwise in writing.",
    );
  }
  if (
    (/\bliabilit(y|ies)\b/.test(rawLow) || /\bindemnif/.test(rawLow) || /\bcap(s|ped)\b/.test(rawLow)) &&
    !/\bliabilit(y|ies)\b/.test(low) &&
    !/\bindemnif/.test(low) &&
    (fam === "consulting_agreement" || fam === "independent_contractor_agreement" || fam === "services_agreement")
  ) {
    chunks.push(
      "Liability: Except where prohibited by law, liability is subject to commercially reasonable limitations to be confirmed by the Parties (including any caps or carve-outs).",
    );
  }
  const isNda = fam === "nda" || /\bnda\b|confidentiality|non-disclosure/i.test(rawIntake);
  if (isNda && !/\bconfident/.test(low)) {
    chunks.push(
      "Confidentiality: Each Party will protect the other’s confidential information using reasonable care and use it solely for the purpose of this relationship.",
    );
  }
  const creativeOpsSignal =
    /\b(marketing|content\s+creation|influencer|campaign|crm|creative\s+assets?|brand\s+assets?|drone|footage|ugc|social\s+media|newsletter|subscriber|audience|deliverables?)\b/i.test(
      rawLow,
    );
  if (
    needsIp &&
    (/\bdeliver|software|code|design|work\s+product|intellectual\s+property\b/i.test(rawLow) ||
      /\b(?:ip|intellectual\s+property)\s+(?:assignment|transfer|ownership)\b/i.test(rawLow) ||
      creativeOpsSignal) &&
    !/\bintellectual\s+property\b/.test(low) &&
    !/\bwork\s+product\b/.test(low)
  ) {
    chunks.push(
      "Deliverables and IP: Deliverables and ownership/license rights will follow the statement of work or specifications agreed by the Parties.",
    );
  }
  if (
    /\b(scandal|reputation|defamation|morals|publicity|disparag|character|cancel\s+culture)\b/i.test(rawLow) &&
    !/\bmoral|conduct|publicity\b/.test(low)
  ) {
    chunks.push(
      "Conduct and publicity: The Parties will avoid disparaging statements and will handle reputation-sensitive topics as responsible business counterparts (edit to match your standards).",
    );
  }
  if (
    /\b(customer\s+list|email\s+list|subscriber|crm|proprietary\s+data|user\s+data|content\s+creation|ugc|audience\s+data)\b/i.test(
      rawLow,
    ) &&
    !/\bown(ership)?\b.*\b(data|list|content)\b/i.test(low)
  ) {
    chunks.push(
      "Lists, data, and content: allocation of customer lists, audience data, and created content should follow the operative notes and any schedule you attach (confirm ownership and use rights before send).",
    );
  }
  if (
    (/\bexclusive\b|\bexclusivity\b|\bnon[\s-]*compete\b|\bterritory\b|\bgeo[\s-]?fence\b/i.test(rawLow) ||
      /\bus\s+northeast\b/i.test(rawLow)) &&
    !/\bexclusive|exclusivity|territory\b/i.test(low)
  ) {
    chunks.push(
      "Exclusivity / territory: any exclusive rights, territory limits, or carve-outs follow the scope and duration described in the Parties’ schedule (confirm conflicts with other engagements before send).",
    );
  }

  const signals = detectPremiumCommercialSignals(rawIntake);
  const scenario = detectPremiumScenarioCategory(rawIntake, fam);
  const leanScenario = premiumScenarioPrefersLeanPacks(scenario.category);
  const signalClauses = [
    ...buildCommercialSignalClauses(signals),
    ...buildReferralPack(signals, rawIntake),
    ...buildContractorPack(signals),
    ...buildHybridConfidentialityPack(signals, rawIntake),
  ];
  const prioritizedSignalClauses = signalClauses.filter((c) =>
    /\b(non-solicitation|non-circumvent|ownership|data stewardship|compliance|approval|injunctive relief)\b/i.test(c),
  );
  const nonPrioritizedSignalClauses = signalClauses.filter((c) => !prioritizedSignalClauses.includes(c));
  const mergedClauses = [...prioritizedSignalClauses, ...chunks, ...nonPrioritizedSignalClauses];
  const deduped: string[] = [];
  for (const clause of mergedClauses) {
    const key = clause.slice(0, 36).toLowerCase();
    if (!low.includes(key) && !deduped.includes(clause)) deduped.push(clause);
  }

  const askLoad = extractPremiumAskTargets(rawIntake).length;
  const maxClauses = leanScenario ? (askLoad >= 8 ? 10 : 7) : askLoad >= 8 ? 22 : 14;
  const limited = deduped.slice(0, maxClauses);
  if (!limited.length) return appendMarketingAgencyPremiumClausePack(parsed, rawIntake);
  const add = nz(parsed.additional_terms);
  const block = `Commercial safeguards (edit as needed)\n\n${limited.map((c) => `• ${c}`).join("\n")}`;
  return appendMarketingAgencyPremiumClausePack({ ...parsed, additional_terms: add ? `${add}\n\n${block}` : block }, rawIntake);
}

export function reinforcePremiumSignalPersistence(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const signals = detectPremiumCommercialSignals(rawIntake);
  const rawLow = (rawIntake || "").toLowerCase();
  const corpus = `${nz(parsed.purpose)}\n${nz(parsed.payment_terms)}\n${nz(parsed.additional_terms)}\n${nz(parsed.termination_summary)}`.toLowerCase();
  const missing: string[] = [];
  if (signals.noncircumvent && !/\b(?:non[-\s]?circumvent|anti[-\s]?circumvention|anti[-\s]?bypass|bypass|no\s+circumvention)\b/.test(corpus)) missing.push("noncircumvent");
  const nonsolicitHintInRaw = /\b(non[-\s]?solicit|anti[-\s]?solicit|no[-\s]?hire|no\s+solicitation|staff|team|employee|contractor|poach|client\s+solicitation)\b/.test(rawLow);
  if ((signals.nonsolicit || nonsolicitHintInRaw) && !/\b(?:non[-\s]?solicit|anti[-\s]?solicit|no[-\s]?hire|no\s+solicitation)\b/.test(corpus)) {
    missing.push("nonsolicit");
  }
  if (signals.adCompliance && !/\bcompliance|approval|misleading|ftc|claims?\b/.test(corpus)) missing.push("ad_compliance");
  const ownershipHintInRaw = /\b(ownership|ip|intellectual\s+property|invention|work\s+product|customer\s+list|crm|lead\s+data)\b/.test(rawLow);
  if ((signals.ownershipData || ownershipHintInRaw) && !/\bownership|crm|lead|data|work\s+product|intellectual\s+property|invention\b/.test(corpus)) {
    missing.push("ownership_data");
  }
  if (!missing.length) return parsed;
  const add = nz(parsed.additional_terms);
  const repairs = buildCommercialSignalClauses(signals)
    .filter((c) => {
      const k = c.toLowerCase();
      if (missing.includes("noncircumvent") && /non-circumvent|anti-circumvention|bypass/.test(k)) return true;
      if (missing.includes("nonsolicit") && /non-solicitation/.test(k)) return true;
      if (missing.includes("ad_compliance") && /compliance|approval/.test(k)) return true;
      if (missing.includes("ownership_data") && /ownership|data|crm|work product/.test(k)) return true;
      return false;
    })
    .map((c) => `• ${c}`);
  if (missing.includes("nonsolicit") && !repairs.some((r) => /solicit|hire/i.test(r))) {
    repairs.push("• No-hire / non-solicit: neither Party will solicit, recruit, or hire the other Party’s employees, contractors, or key team members during the term and agreed tail period.");
  }
  if (missing.includes("ownership_data") && !repairs.some((r) => /ownership|work product|intellectual property|data|crm/i.test(r))) {
    repairs.push("• Ownership and data: discloser ownership of work product, inventions, CRM/lead records, and customer-list information is preserved unless expressly licensed in writing.");
  }
  if (!repairs.length) return parsed;
  const block = `Signal persistence safeguards:\n\n${repairs.join("\n")}`;
  return { ...parsed, additional_terms: add ? `${add}\n\n${block}` : block };
}

/**
 * Premium completion: strengthen termination copy with notice, survival, and fees when intake supports it.
 */
export function enrichPremiumTerminationFromContext(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const rawLow = rawIntake.toLowerCase();
  let t = nz(parsed.termination_summary);
  if (!t) return parsed;
  if (t.length > 680) return parsed;
  const bits: string[] = [];
  if (
    !/\b(written\s+)?notice\b|\bnotice\s+period|\b\d+\s*(calendar\s+)?(day|week|month)s?\b/i.test(t) &&
    /\bterminat|end\s+the\s+relationship|convenience|without\s+cause\b/i.test(rawLow)
  ) {
    bits.push(
      "Termination is on reasonable written notice unless a different notice period is attached; for-cause termination remains available where expressly stated or for material breach.",
    );
  }
  if (
    !/\bsurviv(e|es|ing|al)\b/i.test(t) &&
    (/\bconfidential|nda|\bip\b|trade\s+secret|proprietary|license\b/i.test(rawLow) || nz(parsed.payment_terms).length > 24)
  ) {
    bits.push(
      "Survival: obligations that reasonably should survive (including confidentiality, payment for work performed through the termination date, and indemnities the Parties make expressly continuing) remain effective until fully performed.",
    );
  }
  if (
    !/\baccrued|unpaid\s+fee|through\s+the\s+(effective\s+)?date|amounts\s+not\s+in\s+dispute/i.test(t) &&
    /\bpay|fee|invoice|compensation|retainer|milestone|subscription\b/i.test(rawLow)
  ) {
    bits.push(
      "Accrued, undisputed fees through the effective date of termination remain payable subject to any invoice dispute process the Parties adopt.",
    );
  }
  if (!bits.length) return parsed;
  const merged = `${t} ${bits.join(" ")}`.replace(/\s+/g, " ").trim();
  return { ...parsed, termination_summary: merged.slice(0, 720) };
}

export type PremiumDraftQuality = { ok: boolean; reasons: string[]; score: number };

export function evaluatePremiumDraftQuality(draft: ParsedDraftShape, rawIntake: string): PremiumDraftQuality {
  const reasons: string[] = [];
  const parties = draft.parties || [];
  for (const p of parties) {
    if (partyNameLooksLikeRawPrompt(nz(p.name))) {
      reasons.push("party_name_prompt_like");
      break;
    }
  }

  const purpose = nz(draft.purpose);
  if (purposeReadsAsRawIntakeDump(purpose, rawIntake)) reasons.push("scope_raw_intake_echo");

  const corpus = `${purpose}\n${nz(draft.payment_terms)}\n${nz(draft.additional_terms)}`;
  const vagueHits = corpus.match(VAGUE_PHRASE_RE);
  if (vagueHits && vagueHits.length > 1) reasons.push("too_many_vague_placeholders");

  if (/\n\d+\.\s*\n/.test(corpus) || /^\d+\.\s*$/m.test(corpus)) reasons.push("malformed_numbered_heading");

  const numLines = corpus.split("\n").filter((l) => /^\d+\.\s+\S/.test(l.trim()));
  const seenH = new Set<string>();
  for (const h of numLines) {
    const k = h.trim().toLowerCase();
    if (seenH.has(k)) reasons.push("duplicate_numbered_heading");
    seenH.add(k);
  }

  const score = Math.max(0, 100 - reasons.length * 18);
  return { ok: reasons.length === 0, reasons, score };
}

/** Second-pass tightening when the quality gate fails. */
export function repairPremiumDraftAfterQualityFailure(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const cleanedAdd = stripOperativeDerivedBlock(stripFullDraftExpansionBlock(parsed.additional_terms));
  let next = synthesizePremiumScopeAndOperativeFields(
    {
      ...parsed,
      purpose: "",
      additional_terms: cleanedAdd || null,
    },
    rawIntake,
  );
  next = { ...next, jurisdiction: resolvePremiumJurisdiction(next, rawIntake) };
  return next;
}
