/**
 * LawDog Pro readonly / deliverable preview: cluster dense commercial text into
 * numbered workstream sections instead of collapsing into five starter slots.
 * Free `starterPreview` path never imports this output shape.
 */
import type { AgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { splitTextAtStructuredPromptSectionLabels } from "./intakeSectionLabels";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";

const PREMIUM_SCHEDULE_FALLBACK =
  "Additional commercial terms may be defined in schedules, statements of work, or written approvals between the parties.";

const WEAK_COMMERCIAL_PHRASE_RES: Array<[RegExp, string]> = [
  [/\(\s*other\s+payment\s+terms?\s+not\s+specified\.?\s*\)/gi, PREMIUM_SCHEDULE_FALLBACK],
  [/\bother\s+payment\s+terms?\s+not\s+specified\.?\b/gi, PREMIUM_SCHEDULE_FALLBACK],
  [/\bpayment\s+terms?\s+not\s+specified\.?\b/gi, PREMIUM_SCHEDULE_FALLBACK],
  [/\(\s*compensation\s+not\s+specified\.?\s*\)/gi, PREMIUM_SCHEDULE_FALLBACK],
];

export function applyPremiumDeliverableWeakPhraseReplacements(text: string): string {
  let t = text;
  for (const [re, rep] of WEAK_COMMERCIAL_PHRASE_RES) {
    t = t.replace(re, rep);
  }
  return t;
}

export function stripPreviewEsignNoticeLines(text: string): string {
  const line = AGREEMENT_PREVIEW_ESIGN_NOTICE;
  return text
    .split("\n")
    .filter((ln) => ln.trim() !== line)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type ChunkSource = "purpose" | "payment" | "additional" | "termination";

type TaggedChunk = { text: string; source: ChunkSource; order: number };

type Theme = { id: string; title: string; score: (t: string) => number };

/** Count distinct signal regex hits (each pattern fires at most once per chunk). */
function signalCount(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    if (re.test(text)) n++;
  }
  return n;
}

/** Legacy: sum of match lengths (fees / dense economic lines). */
function countHits(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

/** Notice / exit mechanics strong enough to let transition compete with economics-heavy lines. */
function chunkHasExplicitExitOrNoticeLanguage(t: string): boolean {
  return /\b(?:\d+\s*(?:calendar\s+)?(?:day|days|week|weeks|month|months)\s+notice|notice\s+of\s+termin|written\s+notice|without\s+cause|for\s+cause|wind[\s-]?down|offboarding|convenience\s+termin|exit\s+package)\b/i.test(
    t,
  );
}

const THEMES: Theme[] = [
  {
    id: "fees",
    title: "Fees & Spend Controls",
    score: (t) => {
      let s =
        signalCount(t, [
          /\b(invoice|invoicing|invoiced)\b/i,
          /\b(retainer|milestone|deposit|chargeback|clawback|reimburs)\b/i,
          /\b(cadence|payout|payouts|true[\s-]?up)\b/i,
          /\b(pre[\s-]?approv|spend\s+approv|approval\s+limits?)\b/i,
          /\b(professional\s+fees|compensation)\b/i,
          /\b(collected\s+revenue|revenue\s+share|rev\s*share)\b/i,
          /\bpayable\b/i,
          /\b(?:reporting\s+)?ledger\b/i,
          /\bmonthly\s+payout\b/i,
          /\bsourced\s+client\s+revenue\b/i,
          /\breferral\s+fees?\b/i,
        ]) + countHits(t, [/\b(commissions?|fee|fees|payment)\b/gi]);
      if (/\$\s*\d/.test(t)) s += 2;
      if (/\b\d{1,2}(?:\.\d+)?\s*%/.test(t)) s += 2;
      if (/\b(commission|commissions|fee|fees)\b/i.test(t) && (/\d/.test(t) || /\b(payable|invoice|percent|%|monthly|quarter|revenue|collected|ledger|payout)\b/i.test(t))) {
        s += 3;
      }
      return s;
    },
  },
  {
    id: "referral",
    title: "Referral, Attribution & Sourced Deals",
    score: (t) => {
      let s = signalCount(t, [
        /\breferral\b/i,
        /\battribution\b/i,
        /\b(sourced|introduced)\s+(deals?|accounts?|counterparties?|clients?|buyers?)\b/i,
        /\b(channel|growth)\s+partner\b/i,
        /\bqualified\s+leads?\b/i,
        /\b(true[\s-]?up|ledger\s+extracts?)\b/i,
        /\b(non[\s-]?circumvent|anti[\s-]?bypass)\b/i,
        /\b(exclusiv|exclusivity|territory)\b/i,
        /\bcollected\s+revenue\b/i,
        /\breferred\s+clients?\b/i,
        /\bsourced\s+clients?\b/i,
        /\breferral\s+(fee|commission)s?\b/i,
      ]);
      if (/\b\d{1,2}(?:\.\d+)?\s*%/.test(t) && /\b(referral|referred|introduc|broker|brokerage)\b/i.test(t)) {
        s += 3;
      }
      if (/\bcollected\s+revenue\b/i.test(t) && /\b(referral|referred|introduc)\b/i.test(t)) {
        s += 2;
      }
      return s;
    },
  },
  {
    id: "ownership",
    title: "Ownership of Accounts / Data",
    score: (t) =>
      Math.max(
        signalCount(t, [
          /\b(own(?:ership)?|owns?)\b/i,
          /\b(pixel|pixels)\b/i,
          /\b(ad\s+account|business\s+manager)\b/i,
          /\b(audiences?|remarketing)\b/i,
          /\b(crm|lead\s+lists?|customer\s+lists?)\b/i,
          /\b(work\s+product|intellectual\s+property)\b/i,
          /\b(exports?|credentials)\b/i,
          /\b(data\s+stewardship|customer\s+data)\b/i,
        ]),
        countHits(t, [/\b(data|lead)\b/gi]),
      ),
  },
  {
    id: "usage_rights",
    title: "Usage Rights, License & Content",
    score: (t) =>
      signalCount(t, [
        /\b(usage\s+rights|content\s+rights)\b/i,
        /\b(license|licence|sublicense)\b/i,
        /\b(work[\s-]?for[\s-]?hire)\b/i,
        /\b(ugc|user[\s-]generated)\b/i,
        /\b(deliverables?)\b/i,
        /\b(limited\s+license|perpetual\s+license|license[\s-]back)\b/i,
        /\b(sponsored\s+content|brand\s+assets?)\b/i,
      ]),
  },
  {
    id: "reporting",
    title: "Reporting & Performance",
    score: (t) =>
      signalCount(t, [
        /\breporting\b/i,
        /\breports?\b/i,
        /\breadouts?\b/i,
        /\bdashboards?\b/i,
        /\banalytics\b/i,
        /\bkpis?\b/i,
        /\bmetrics?\b/i,
        /\bperformance\s+(report|readout|snapshot)\b/i,
        /\bweekly\s+(readout|snapshot|report|package)\b/i,
        /\b(monthly|quarterly)\s+(status|report|readout|workbook|package)\b/i,
        /\battribution\s+workbook\b/i,
        /\bbudget\s+vs\.?\s+actuals?\b/i,
      ]),
  },
  {
    id: "subcontractors",
    title: "Subcontractors & Fulfillment",
    score: (t) =>
      signalCount(t, [
        /\bsubcontract(or|ors|ing)?\b/i,
        /\bsub-?contract(or|ing)?\b/i,
        /\bvendors?\b/i,
        /\bwhite[\s-]?label\b/i,
        /\boffshore\b/i,
        /\bfulfillment\b/i,
        /\bundisclosed\b/i,
        /\b(motion\s+designer|editor)\s+(must\s+be\s+)?disclosed\b/i,
      ]),
  },
  {
    id: "compliance",
    title: "Compliance & Approvals",
    score: (t) =>
      signalCount(t, [
        /\bftc\b/i,
        /\bcompliance\b/i,
        /\b(claims?|misleading)\b/i,
        /\bendorsement\b/i,
        /\bconsumer[\s-]?protection\b/i,
        /\b(advertising|marketing)\s+standards\b/i,
        /\b(substantiation|pre[\s-]?publication)\b/i,
        /\bfalse\s+or\s+misleading\b/i,
      ]),
  },
  {
    id: "confidentiality",
    title: "Confidentiality",
    score: (t) =>
      signalCount(t, [
        /\bconfidential(ity|)\b/i,
        /\bnon[\s-]?disclosure\b/i,
        /\bn\.?\s*d\.?\s*a\.?\b/i,
        /\bnda\b/i,
        /\btrade\s+secret\b/i,
        /\bproprietary\b/i,
        /\bmutual\s+confidentiality\b/i,
        /\b(permitted\s+use|confidential\s+information)\b/i,
      ]),
  },
  {
    id: "restrictions",
    title: "Non-solicit, Non-circumvent & Non-reuse",
    score: (t) =>
      signalCount(t, [
        /\bnon[\s-]?solicit/i,
        /\bno[\s-]?hire\b/i,
        /\bnon[\s-]?circumvent/i,
        /\banti[\s-]?bypass\b/i,
        /\bcompet(?:ing|itor)\b/i,
        /\bnon[\s-]?reuse\b/i,
        /\breuse\b/i,
        /\bno\s+solicitation\b/i,
        /\bexclusiv/i,
        /\bterritor(y|ies)\b/i,
      ]),
  },
  {
    id: "transition",
    title: "Transition, Notice & Exit",
    score: (t) => {
      let s = signalCount(t, [
        /\bterminat(?:e|ion|ing|ed)\b/i,
        /\bterminate\b/i,
        /\bnotice\b/i,
        /\bexit\b/i,
        /\btransition\b/i,
        /\bwind[\s-]?down\b/i,
        /\bhandoff\b/i,
        /\brevok/i,
        /\bsurviv(?:e|es|ing|al)\b/i,
        /\bconvenience\b/i,
        /\bcure\b/i,
      ]);
      const econHeavy =
        /\b\d{1,2}(?:\.\d+)?\s*%/.test(t) &&
        /\b(commission|commissions|collected\s+revenue|referral\s+fees?|payable|payout|ledger)\b/i.test(t);
      if (econHeavy && !chunkHasExplicitExitOrNoticeLanguage(t)) {
        s = Math.min(s, 1);
      }
      return s;
    },
  },
  {
    id: "governance",
    title: "Deadlock & Governance",
    score: (t) =>
      signalCount(t, [
        /\bdeadlock\b/i,
        /\bboard\b/i,
        /\bmanagers?\b/i,
        /\bmember[\s-]?managed\b/i,
        /\bcapital\s+calls?\b/i,
        /\bwaterfall\b/i,
        /\bjv\b/i,
        /\bjoint\s+venture\b/i,
      ]),
  },
];

function themeScore(id: string, t: string): number {
  const th = THEMES.find((x) => x.id === id);
  return th ? th.score(t) : 0;
}

/** On ties, lower index wins (more specific commercial workstreams first). */
const THEME_TIE_PRIORITY = [
  "confidentiality",
  "usage_rights",
  "restrictions",
  "fees",
  "referral",
  "reporting",
  "subcontractors",
  "compliance",
  "ownership",
  "transition",
  "governance",
];

function themePriority(id: string): number {
  const i = THEME_TIE_PRIORITY.indexOf(id);
  return i < 0 ? 99 : i;
}

function pickThemeBest(text: string, minScore: number): Theme | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const scored = THEMES.map((th) => ({ th, s: th.score(trimmed) }));
  const maxS = Math.max(0, ...scored.map((x) => x.s));
  if (maxS < minScore) return null;
  const winners = scored.filter((x) => x.s === maxS);
  winners.sort((a, b) => themePriority(a.th.id) - themePriority(b.th.id));
  return winners[0].th;
}

/** Primary routing: keep prior bar (≥2 aggregate score) so free flow and coarse drafts stay stable. */
function pickTheme(text: string): Theme | null {
  const len = text.trim().length;
  return pickThemeBest(text, len < 56 ? 2 : 2);
}

/** Second pass for chunks stuck in `other`: allow single strong signal (score ≥ 1). */
function pickThemeRelaxed(text: string): Theme | null {
  return pickThemeBest(text, 1);
}

function buildDraftCorpus(draft: ParsedDraftShape): string {
  const sched = [draft.duration, draft.effective_date, draft.due_date]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  return [
    (draft.purpose || "").trim(),
    (draft.payment_terms || "").trim(),
    (draft.additional_terms || "").trim(),
    (draft.termination_summary || "").trim(),
    sched,
  ]
    .filter(Boolean)
    .join("\n");
}

const CORPUS_CONFIDENTIALITY_RE =
  /\b(confidential|confidentiality|non[\s-]?disclosure|trade\s+secret|\bnda\b|n\.?\s*d\.?\s*a\.?|proprietary\s+information|mutual\s+confidentiality)\b/i;

const CORPUS_REPORTING_RE =
  /\b(reporting|readouts?|dashboards?|analytics|kpis?|metrics?|performance\s+report|weekly\s+snapshot|attribution\s+workbook|budget\s+vs\.?\s+actuals)\b/i;

/** Corpus / chunk pull: avoid generic “fulfillment” (e.g. contracting and fulfillment) — require vendor/sub signals. */
const CORPUS_SUBCONTRACT_RE =
  /\b(subcontract(or|ing)?|sub-?contract|subcontractors?\b|vendors?|white[\s-]?label|offshore|undisclosed\s+sub)\b/i;

export function detectCorpusConfidentialitySignals(corpus: string): boolean {
  return CORPUS_CONFIDENTIALITY_RE.test(corpus);
}

function mergeShortSequential(chunks: string[], minLen: number): string[] {
  const out: string[] = [];
  for (const ch of chunks) {
    const t = ch.trim();
    if (!t) continue;
    if (!out.length) {
      out.push(t);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev.length < minLen || t.length < minLen) {
      out[out.length - 1] = `${prev} ${t}`.replace(/\s+/g, " ").trim();
    } else {
      out.push(t);
    }
  }
  return out;
}

/** Split single-paragraph purposes so per-chunk theme routing can surface workstream headings. */
function splitMonolithicPurposeForTheming(cleaned: string): string[] {
  const byStructuredSections = splitTextAtStructuredPromptSectionLabels(cleaned);
  if (byStructuredSections.length >= 2) return byStructuredSections;

  const base = splitSmartParagraphs(cleaned);
  if (base.length !== 1) return base;
  const block = base[0];
  if (block.length < 200) return base;

  const bySent = block
    .split(/(?<=[.!?;:])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const merged = mergeShortSequential(bySent, 48);
  const longEnough = merged.filter((x) => x.length >= 24);
  if (longEnough.length >= 2) return longEnough;

  const bySemi = block
    .split(/\s*;\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 36);
  if (bySemi.length >= 2) return bySemi;

  return base;
}

function collectTaggedChunks(draft: ParsedDraftShape): TaggedChunk[] {
  const out: TaggedChunk[] = [];
  let order = 0;
  const push = (src: ChunkSource, raw: string | null | undefined) => {
    const cleaned = stripPreviewEsignNoticeLines(applyPremiumDeliverableWeakPhraseReplacements((raw || "").trim()));
    if (!cleaned) return;
    const pieces =
      src === "additional"
        ? splitBulletAware(cleaned)
        : src === "purpose"
          ? splitMonolithicPurposeForTheming(cleaned)
          : splitSmartParagraphs(cleaned);
    for (const text of pieces) {
      const t = applyPremiumDeliverableWeakPhraseReplacements(text).trim();
      if (t.length < 24) continue;
      out.push({ text: t, source: src, order: order++ });
    }
  };
  push("purpose", draft.purpose);
  push("payment", draft.payment_terms);
  push("additional", draft.additional_terms);
  push("termination", draft.termination_summary);
  return out;
}

/** Split purpose prose into peelable sentence / clause units (order preserved). */
function splitScopeSentencesForPeel(text: string): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  const byPunct = t
    .split(/(?<=[.!?;:])\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (byPunct.length >= 2) return byPunct;
  if (t.length > 160) {
    const semi = t
      .split(/\s*;\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 16);
    if (semi.length >= 2) return semi;
  }
  if (t.length > 120) {
    const isDenseAgencyServiceScope =
      /\b(agency|agencies|contractor|marketer|vendor|provider|growth\s+marketing|paid\s+media|ad\s+operations?)\b/i.test(
        t,
      ) &&
      (/\b(including|provide|deliver|perform|operations|ad\s+account|business\s+manager|pixel|audience|funnel|crm|landing)\b/i.test(t) ||
        /\b(align|aligns|aligning|coordinat|reporting|tracking|retargeting|measurement|compliance|ad\s+buy|campaigns?|programmatic)\b/i.test(t));
    if (!isDenseAgencyServiceScope) {
      const comma = t
        .split(/,\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 28);
      if (comma.length >= 2) return comma;
    }
  }
  return byPunct.length ? byPunct : [t];
}

/**
 * Long “The Agency will provide / perform … (including ad accounts, pixels, …)” inventory lines
 * are commercial scope, not a standalone **ownership** disclosure — do not peel them wholesale.
 * Allow peel when the same line states client **retention / owner / remain / not re-use** outcomes.
 */
function isAgencyObligationInventorySentence(s: string): boolean {
  const t = s.trim();
  if (/\b(client|the\s+client|our\s+client|we|brand|company|party|vendor|your(\s+company)?)\b.{0,320}\b(remain|remains?|remains?\s+the\s+owner|remains?\s+owner|remained|retain(s|ed|ing)?\b|ownership|owns?|own\s+)(?:'s|’s)?/i.test(t) && /accounts?|data|pixel|audience|funnel|landing|list|creatives?/i.test(t)) {
    return false; // not a “pure” roster: contains client-ownership / retention phrasing
  }
  if (/\b(agency|contractor|marketer|vendor|provider)(?![a-z0-9])[\s\S]{0,200}\b(do\s+not|will\s+not|shall\s+not|must\s+not)\b.{0,80}\b(re-?use|reuse|retain|exploit|copy)\b/i.test(s) && /client|first[\s-]?party|funnel|data|list|audience|creative/i.test(s)) {
    return false; // re-use / retention restriction — may belong in ownership
  }
  const looksLikeAgencyLeadObligation =
    /^(the\s+)?(agency|contractor|marketer|vendor|provider)(?![a-z0-9])[\s\S]{0,200}\b(shall|will|is\s+engaged|is\s+retained|agrees?\s+to|has\s+been|was\s+retained|was\s+engaged)\b/i.test(t) ||
    /^agency(?![a-z0-9])[\s\S]{0,80}\bwill\s+(?:provide|perform|align|and\s+ad|execute|oversee|launch|support|build|create|deliver|supply|run|manage|offer|assist)\b/i.test(t) ||
    /^a\s+marketing\s+agency\b/i.test(t) ||
    /^(the\s+)?(agency|contractor)(?![a-z0-9])[\s\S]{0,120}\b(including|to\s+include|as\s+well\s+as|such\s+as|covering|provides?|performing|delivering)\b/i.test(t);
  if (!looksLikeAgencyLeadObligation) {
    if (/\b(remain|remains?|remains?\s+owner|retain(s|ed|ing)?\b|ownership|owns?|'s|’s)\b/i.test(t) && /client|we|our|company|brand|party|vendor|your(\s+company)?/i.test(t) && /accounts?|data|pixel|funnel|landing|audience|lists?|creatives?/i.test(t)) {
      return false; // do not mark as "inventory" — allow peel
    }
    return false; // e.g. client-led sentence
  }
  if (/\b(remain|remains?|remains?\s+owner|retain(s|ed|ing)?\b.*\b(ownership|accounts?|data|assets?|lists?)|'s|’s)\b/i.test(t) && /client|we|our|company|brand|party|vendor|your(\s+company)?/i.test(t) && /accounts?|data|pixel|funnel|landing|audience|lists?|creatives?/i.test(t)) {
    return false; // same-line mixed obligation + client outcome: prefer peel, not “inventory”
  }
  return true;
}

function sentenceMatchesOwnershipPeel(s: string): boolean {
  const t = s.trim();
  if (t.length < 12) return false;
  if (isAgencyObligationInventorySentence(t)) return false;
  if (/\bremains?\s+owner|remain(s|ed|ing)\s+the\s+owner/i.test(t) && /accounts?|data|pixel|audience|funnel|landing|lists?|email|creatives?/i.test(t)) return true;
  /** “for the Client” in a service roster is not an ownership *outcome*; avoid peeling inclusion clauses. */
  const hasOwnOutcomeLanguage =
    /\b(remain|remains?|remains?\s+the\s+owner|remains?\s+owner|retain(s|ed|ing)?|ownership|owns?|ours|yours?|our\s+property|’s|['']s)\b/i.test(t) ||
    /\bthe\s+client[''’]s\s+(ad|data|list|funnel|pixel|accounts?|audiences?|email|assets?|creatives?|lists?)\b/i.test(t) ||
    /\b(client|company|party)\s+(remains?|retains?|owns?|holds?|waives?)\b/i.test(t) ||
    /\bno(t)?\b.{0,30}re-?use/i.test(t);
  if (/\bad\s+accounts?\b/i.test(t) && (t.length >= 120 || hasOwnOutcomeLanguage)) return true;
  if (/\bad\s+operations?\b/i.test(t) && (t.length >= 120 || hasOwnOutcomeLanguage)) return true;
  if (/\bpixels?\b/i.test(t) && (t.length >= 120 || hasOwnOutcomeLanguage)) return true;
  if (/\b(audience|audiences?)\b/i.test(t) && /pixel|ad|customer|data|own|our|retain|remain/i.test(t)) return true;
  if (/\b(audience|audiences?)\/pixel\b/i.test(t) || /pixel\/?(audience|targeting|management)\b/i.test(t)) return true;
  if (/\bcustomer\s+data\b/i.test(t)) return true;
  if (/\bownership\s+of\s+assets\b/i.test(t)) return true;
  if (/\bwork\s*[-–]?\s*product|intellectual\s+property\b/i.test(t) && /\b(our|the\s+client|remains?|retained)\b/i.test(t)) return true;
  if (/\bremain(s)?\s+ours\b/i.test(t) || /\b(ours|the\s+client)['’]s\b/i.test(t) && /account|data|list|funnel|creative|landing/i.test(t)) {
    return true;
  }
  if (/\b(creatives?|funnels?|landing\s+pages?)\b/i.test(t) && (/\bremain|retain|ours|the\s+client|brand|company\b/i.test(t) || /do\s+not\s+re/i.test(t))) {
    return true;
  }
  if (/\b(our|the\s+client|brand|company|your(\s+company)?)\b.{0,60}\b(landing|funnel|creative|ad\s+accounts?|pixel|audiences?|business\s+manager|crm|lists?|exports?)\b/i.test(t)) {
    return true;
  }
  if (/\b(client|we|brand|company|party)\b.*\bretain(s|ed)?\b.*\b(ownership|accounts?|assets?|data|lists?)\b/i.test(t)) return true;
  if (/\bno(t)?\b.{0,40}re-?use.{0,40}funnel/i.test(t)) return true;
  if (countAgencyOwnershipSignalsInClause(t) >= 2 && isAgencyInclusionRosterOrTailClause(t) === false) {
    if (
      /\b(agency|ad[\s-]?ops|ad[\s-]?account|ads?\b|media\s+buy|business\s+manager|crm|pixel|landing|funnel|customer\s+data|meta|klaviyo|google\s+ads?)\b/i.test(
        t,
      ) &&
      !isAgencyObligationInventorySentence(t)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Comma- or “including …”-split clauses that only enumerate *scope* inclusions
 * (not client retention / re-use) must not be peeled via density.
 */
function isAgencyInclusionRosterOrTailClause(s: string): boolean {
  const t = s.trim();
  if (/^(including|plus|in\s+addition|as\s+well\s+as|such\s+as|e\.?g\.|e\.?g\.\s*|covering|i\.?e\.)\b/i.test(t)) {
    return true;
  }
  if (/^,\s*(and|or|plus|including|such\s+as)\b/i.test(t)) return true;
  if (t.length < 200 && /^(and|or)\b/i.test(t) && /\b(only|directed|scheduled|in\s+arrears|in\s+writing|unless)\b/i.test(t)) {
    return true; // e.g. “, and platform policy compliance unless separately …”
  }
  if (t.length < 200 && /^(and|or)\b/i.test(t) && /^(and|or)\b.{0,180}\b(compliance|policies?|standards?|applicable|scheduled)\b/i.test(t) && !/\b(owns?|remain|remains?|re-?use|yours?|our\s+property|’s|')\b/i.test(t)) {
    return true;
  }
  return false;
}

/** For agency-style dense prompts: count distinct control/account/data signals (used for peel + prestige). */
function countAgencyOwnershipSignalsInClause(t: string): number {
  const low = t.toLowerCase();
  let n = 0;
  const add = (re: RegExp) => {
    if (re.test(low)) n += 1;
  };
  add(/\bad[\s-]?accounts?/);
  add(/\b(business|ads?)\s+manager\b/);
  add(/\bcrm\b/);
  add(/pixel/);
  add(/audience/);
  add(/customer\s+data/);
  add(/landing/);
  add(/funnel/);
  add(/creatives?/);
  if (/\b(remain|remains?|remained|retain|retained|retains?|retaining|ours)\b/.test(low)) n += 1;
  return n;
}

function isDenseAgencyOwnershipCorpus(cs: string): boolean {
  return countAgencyOwnershipSignalsInClause(cs) >= 3;
}

function isAgencyMarketingContext(cs: string): boolean {
  return /\b(agency|growth\s+marketing|media\s+agency|marketing\s+services|ad\s+operations?|ad\s+account|business\s+manager|crm|\bmeta\b|tiktok|klaviyo|google\s+ads?|\bpixels?\b|audiences?|campaigns?|landing|funnels?)\b/i.test(
    cs,
  );
}

/**
 * "Reporting" as a list tail in growth-marketing **scope** (e.g. "… tracking, and reporting, and compliance")
 * is not a dedicated **Reporting & Performance** workstream. Do not promote that chunk off unscoped.
 */
function isAgencyScopeReportingFillerMention(s: string): boolean {
  if (
    /\b(weekly|readout|dashboards?|snapshot|KPIs?|attributions?|ledgers?|workbooks?|true[\s-]?up|attribution)\b/i.test(
      s,
    ) &&
    !/\bwithout|unless|except(ing|ed)?\b.{0,60}\b(weekly|readout|dashboards?|snapshot|ledger|ledgers?|readouts?|package|book|workbook|status|metrics?)\b/i.test(
      s,
    ) &&
    !/\bno\b.{0,8}\b(weekly|readout|dashboards?|snapshot|packages?|portals?)\b/i.test(s) &&
    !/\bun(?:less|til|available)\b.{0,20}\b(weekly|readout|dashboards?|snapshot|packages?)\b/i.test(s)
  ) {
    return false;
  }
  if (/\b(monthly|quarterly|daily|yearly|weekly)\b.{0,40}\b(ledger|report|readout|package|book|workbook|status|dashboard|snapshot|metrics?)\b/i.test(s) && !/\bwithout|unless|except(ing|ed)?\b.{0,30}\b(ledger|readout|dashboards?|snapshot|packages?|metrics?)\b/i.test(s)) {
    return false;
  }
  if (/\bperformance\s+(report|readout|snapshot|dashboard|metrics?|analytics)\b/i.test(s)) return false;
  if (/\b(reporting|report|reports?)\b.{0,20}\b(dashboard|ledger|readout|KPIs?|cadence|cadences?|metrics?|packages?|portal)\b/i.test(s)) {
    return false;
  }
  if (!/\breport(ing|s)?\b/i.test(s)) return false;
  if (/(,|\s+or\s+|\s+and\s+)(compliance|ftc|chargeback|spend|budget|refund|approval)/i.test(s) && /report(ing|s)?/i.test(s)) {
    return true;
  }
  if (/(and\s+related\s+)?(advertising|ads?|media|tracking|campaigns?|creative)[^.]{0,100}\breport(ing|s)?\b/i.test(s)) return true;
  if (/,[^.;]{0,100}\breport(ing|s)?\s*[;,.]?\s*$/i.test(s.trim())) return true;
  return false;
}

function sentenceMatchesUsagePeel(s: string): boolean {
  const t = s.trim();
  if (t.length < 12) return false;
  if (/\busage\s+rights?\b/i.test(t)) return true;
  if (/\bpaid\s+ads?\s+rights?\b/i.test(t)) return true;
  if (/\bfor\s+paid\s+ads?\b/i.test(t)) return true;
  if (/\blicen[cs]e\b/i.test(t) && /\b(usage|content|sublicen|ads?|promot)/i.test(t)) return true;
  if (/\brepost\b/i.test(t)) return true;
  if (/\bcontent\s+rights?\b/i.test(t)) return true;
  if (/\bsublicen[cs]e\b/i.test(t)) return true;
  if (/\b\d+\s*months?\b/i.test(t) && /\b(use|usage|ads?|license)\b/i.test(t)) return true;
  return false;
}

function dedupePeelSentences(sents: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sents) {
    const k = s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 220);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Before theme routing: peel ownership / usage-rights sentences out of purpose chunks into
 * at most two synthetic chunks (one ownership, one usage). Remaining purpose text stays in
 * scope as trimmed purpose chunks; sentence order preserved; no duplicated lines.
 */
function peelScopeSentencesFromPurposeChunks(chunks: TaggedChunk[]): {
  routed: TaggedChunk[];
  ownershipPeel: TaggedChunk | null;
  usagePeel: TaggedChunk | null;
} {
  const routed: TaggedChunk[] = [];
  const ownSents: string[] = [];
  const useSents: string[] = [];
  const purposeOrders = chunks.filter((c) => c.source === "purpose").map((c) => c.order);
  const anchorOrder = purposeOrders.length ? Math.min(...purposeOrders) : 0;

  for (const ch of chunks) {
    if (ch.source !== "purpose") {
      routed.push(ch);
      continue;
    }
    const sents = splitScopeSentencesForPeel(ch.text);
    const rem: string[] = [];
    for (const s of sents) {
      if (sentenceMatchesOwnershipPeel(s) && ownSents.length < 2) ownSents.push(s);
      else if (sentenceMatchesUsagePeel(s) && useSents.length < 2) useSents.push(s);
      else rem.push(s);
    }
    const remText = rem.join(" ").replace(/\s+/g, " ").trim();
    if (remText.length > 0) {
      routed.push({ text: remText, source: "purpose", order: ch.order });
    }
  }

  const ownDeduped = dedupePeelSentences(ownSents);
  const useDeduped = dedupePeelSentences(useSents);
  const ownText = ownDeduped.join(" ").replace(/\s+/g, " ").trim();
  const useText = useDeduped.join(" ").replace(/\s+/g, " ").trim();

  const ownershipPeel: TaggedChunk | null =
    ownText.length >= 12 ? { text: ownText, source: "purpose", order: anchorOrder - 2 } : null;
  const usagePeel: TaggedChunk | null =
    useText.length >= 12 ? { text: useText, source: "purpose", order: anchorOrder - 1 } : null;

  return { routed, ownershipPeel, usagePeel };
}

/** True when paid preview should use commercial workstreams instead of five starter slots. */
export function shouldUsePremiumDynamicCommercialSections(draft: ParsedDraftShape): boolean {
  const purpose = (draft.purpose || "").trim();
  const pay = (draft.payment_terms || "").trim();
  const add = (draft.additional_terms || "").trim();
  const term = (draft.termination_summary || "").trim();
  const sched = [draft.duration, draft.effective_date, draft.due_date]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const tit = (draft.title || "").trim();
  const corpus = [purpose, pay, add, term, sched].filter(Boolean).join("\n");
  const corpusSignals = [tit, corpus].filter(Boolean).join("\n");
  const wc = corpus.replace(/\s+/g, " ").trim().length;
  if (!corpusSignals.trim()) return false;

  const doubleBreakParas = corpus.split(/\n{2,}/).filter((x) => x.trim().length >= 40).length;
  const bulletLines = add.split("\n").filter((ln) => /^[•\-*]\s/.test(ln.trim())).length;
  const numberedLines = add.split("\n").filter((ln) => /^\d+\.\s+\S/.test(ln.trim())).length;
  const paras = doubleBreakParas + bulletLines + numberedLines;
  const themeHits = THEMES.reduce((n, th) => n + (th.score(corpusSignals) >= 2 ? 1 : 0), 0);

  const feeDenseCommercial =
    pay.length >= 40 &&
    /\$|(?:\d{1,2}\s*%)|(?:%\s*(?:of|on))|invoice|retainer|milestone|\/month|per month|commission|collected revenue/i.test(
      pay,
    ) &&
    purpose.length >= 28;

  const densePaidMedia =
    wc >= 220 &&
    /\b(meta|tiktok|google|klaviyo|pixel|subcontract|dashboard|\bftc\b|chargeback|competitor|funnel)\b/i.test(
      corpusSignals,
    );

  return (
    paras >= 5 ||
    themeHits >= 3 ||
    wc >= 2200 ||
    (wc >= 360 && themeHits >= 2) ||
    feeDenseCommercial ||
    densePaidMedia
  );
}

function pullChunksMatching(
  chunks: TaggedChunk[],
  test: (text: string) => boolean,
): { kept: TaggedChunk[]; pulled: TaggedChunk[] } {
  const kept: TaggedChunk[] = [];
  const pulled: TaggedChunk[] = [];
  for (const c of chunks) {
    if (test(c.text)) pulled.push(c);
    else kept.push(c);
  }
  return { kept, pulled };
}

function appendChunks(map: Map<string, TaggedChunk[]>, id: string, incoming: TaggedChunk[]): void {
  if (!incoming.length) return;
  const arr = map.get(id) ?? [];
  arr.push(...incoming);
  arr.sort((a, b) => a.order - b.order);
  map.set(id, arr);
}

/** Reassign `other` using relaxed theme pick to shrink catch-all bucket. */
function reclassifyOtherBucket(byTheme: Map<string, TaggedChunk[]>): void {
  const other = byTheme.get("other");
  if (!other?.length) return;
  const stay: TaggedChunk[] = [];
  for (const ch of other) {
    const th = pickThemeRelaxed(ch.text);
    if (th) {
      const arr = byTheme.get(th.id) ?? [];
      arr.push(ch);
      arr.sort((a, b) => a.order - b.order);
      byTheme.set(th.id, arr);
    } else {
      stay.push(ch);
    }
  }
  if (stay.length) byTheme.set("other", stay);
  else byTheme.delete("other");
}

/**
 * Pull confidentiality / reporting / subcontractor signal chunks out of `other` and unscoped
 * so they earn dedicated headings (goal 3–5).
 */
function promoteThemedChunksFromCatchalls(
  byTheme: Map<string, TaggedChunk[]>,
  unscoped: TaggedChunk[],
  corpusConf: boolean,
  corpusReporting: boolean,
  corpusSub: boolean,
): void {
  const confTest = (s: string) => CORPUS_CONFIDENTIALITY_RE.test(s);
  const repTest = (s: string) =>
    !isAgencyScopeReportingFillerMention(s) && CORPUS_REPORTING_RE.test(s);
  const subTest = (s: string) => CORPUS_SUBCONTRACT_RE.test(s);

  if (corpusConf) {
    const { kept, pulled } = pullChunksMatching(unscoped, confTest);
    unscoped.length = 0;
    unscoped.push(...kept);
    appendChunks(byTheme, "confidentiality", pulled);
    const other = byTheme.get("other");
    if (other?.length) {
      const { kept: ok, pulled: pc } = pullChunksMatching(other, confTest);
      byTheme.set("other", ok);
      appendChunks(byTheme, "confidentiality", pc);
    }
  }
  if (corpusReporting) {
    const { kept, pulled } = pullChunksMatching(unscoped, repTest);
    unscoped.length = 0;
    unscoped.push(...kept);
    appendChunks(byTheme, "reporting", pulled);
    const other = byTheme.get("other");
    if (other?.length) {
      const { kept: ok, pulled: pc } = pullChunksMatching(other, repTest);
      byTheme.set("other", ok);
      appendChunks(byTheme, "reporting", pc);
    }
  }
  if (corpusSub) {
    const { kept, pulled } = pullChunksMatching(unscoped, subTest);
    unscoped.length = 0;
    unscoped.push(...kept);
    appendChunks(byTheme, "subcontractors", pulled);
    const other = byTheme.get("other");
    if (other?.length) {
      const { kept: ok, pulled: pc } = pullChunksMatching(other, subTest);
      byTheme.set("other", ok);
      appendChunks(byTheme, "subcontractors", pc);
    }
  }
}

type PrestigePick = {
  title: string;
  consumeThemeIds: string[];
  bodyChunks: TaggedChunk[];
  strength: number;
  tiePri: number;
};

const PERFORMANCE_PRESTIGE_RES = [
  /\bSLA\b/i,
  /\bmilestones?\b/i,
  /\bdeliverables?\b/i,
  /\bacceptance\s*(criteria|testing)?\b/i,
  /\bKPIs?\b/i,
  /\bperformance\s+standards?\b/i,
  /\bstandard\s+of\s+work\b/i,
  /\bquality\s+standards?\b/i,
  /\bservice\s+levels?\b/i,
];

function scorePrestigePerformanceCorpus(t: string): number {
  return signalCount(t, PERFORMANCE_PRESTIGE_RES);
}

function prestigeBodyFromThemes(byTheme: Map<string, TaggedChunk[]>, ids: string[]): TaggedChunk[] {
  const out: TaggedChunk[] = [];
  for (const id of ids) {
    const arr = byTheme.get(id);
    if (arr?.length) out.push(...arr);
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

/**
 * At most one high-confidence “prestige” heading (family-specific), consumed from theme buckets
 * (or peeled ownership lines) so the main theme loop does not duplicate it.
 */
function pickSinglePrestigeSection(
  draft: ParsedDraftShape,
  corpusSignals: string,
  byTheme: Map<string, TaggedChunk[]>,
  peeledOwnershipFromUnscoped: TaggedChunk[] | null,
  peeledUsageFromUnscoped: TaggedChunk[] | null,
): PrestigePick | null {
  const family = draft.agreement_family as AgreementFamily | undefined;
  const cs = corpusSignals;
  const candidates: PrestigePick[] = [];

  const ownScore = themeScore("ownership", cs);
  const marketingAgencyContext = isAgencyMarketingContext(cs);
  const ownFromTheme = prestigeBodyFromThemes(byTheme, ["ownership"]);
  const ownBody =
    ownFromTheme.length > 0 ? ownFromTheme : peeledOwnershipFromUnscoped && peeledOwnershipFromUnscoped.length > 0
      ? peeledOwnershipFromUnscoped
      : [];
  const ownConsume = ownFromTheme.length > 0 ? ["ownership"] : [];
  const ownDense = isDenseAgencyOwnershipCorpus(cs);
  const ownQualifies =
    marketingAgencyContext &&
    (ownScore >= 5 || (ownScore >= 3 && ownDense) || (ownScore >= 4 && ownFromTheme.length > 0));
  if (ownBody.length && ownQualifies) {
    const denseBonus = ownDense && marketingAgencyContext ? 3.5 : 0;
    candidates.push({
      title: "Ownership of Accounts & Data",
      consumeThemeIds: ownConsume,
      bodyChunks: ownBody,
      strength: ownScore + (marketingAgencyContext ? 2.5 : 0) + denseBonus + (ownFromTheme.length > 0 ? 0.25 : 0),
      tiePri: 0,
    });
  }

  const usageScore = themeScore("usage_rights", cs);
  const influencerContext =
    /\b(influencer|creator|sponsored\s+content|ugc)\b/i.test(cs) &&
    /\b(usage\s+rights?|license|licence|deliverables?|paid\s+ads?|content\s+rights?|story\s+posts?|\bvideos?\b)\b/i.test(
      cs,
    );
  const usageFromTheme = prestigeBodyFromThemes(byTheme, ["usage_rights"]);
  let usageBody =
    usageFromTheme.length > 0
      ? usageFromTheme
      : peeledUsageFromUnscoped && peeledUsageFromUnscoped.length > 0
        ? peeledUsageFromUnscoped
        : [];
  let usageConsume = usageFromTheme.length > 0 ? ["usage_rights"] : peeledUsageFromUnscoped?.length ? [] : [];
  if (!usageBody.length && influencerContext) {
    const compAll = byTheme.get("compliance") ?? [];
    const compInfluencer = compAll.filter((c) =>
      /\b(ftc|disclosure|approval|deliverables?|usage\s+rights?|license|paid\s+ads?|posts?|videos?)\b/i.test(
        c.text,
      ),
    );
    if (compInfluencer.length) {
      usageBody = [...compInfluencer].sort((a, b) => a.order - b.order);
      usageConsume = ["compliance"];
    }
  }
  const usageSignalStrength = influencerContext
    ? Math.max(usageScore, themeScore("compliance", cs))
    : usageScore;
  if (usageBody.length && influencerContext && usageSignalStrength >= 5) {
    candidates.push({
      title: "Usage Rights & Content License",
      consumeThemeIds: usageConsume,
      bodyChunks: usageBody,
      strength: usageSignalStrength + (influencerContext ? 2 : 0),
      tiePri: 1,
    });
  }

  const confScore = themeScore("confidentiality", cs);
  const ndaHybridFamily = family === "nda" || family === "confidentiality_commercial_protections_agreement";
  const confHybridCorpus =
    detectCorpusConfidentialitySignals(cs) &&
    /\b(crm|customer\s+lists?|non[\s-]?solicit|no[\s-]?hire|poach|engineers?|proprietary|trade\s+secret|vendors?)\b/i.test(
      cs,
    );
  const confChunks = prestigeBodyFromThemes(byTheme, ["confidentiality"]);
  if (confChunks.length && (ndaHybridFamily || confHybridCorpus) && confScore >= 5) {
    candidates.push({
      title: "Confidentiality",
      consumeThemeIds: ["confidentiality"],
      bodyChunks: confChunks,
      strength: ndaHybridFamily ? confScore + 2 : confScore + 0.5,
      tiePri: 2,
    });
  }

  const refScore = themeScore("referral", cs);
  const refChunks = prestigeBodyFromThemes(byTheme, ["referral"]);
  if (refChunks.length && /\b(referral|referred|introductions?|channel\s+partner)\b/i.test(cs) && refScore >= 6) {
    candidates.push({
      title: "Referral Mechanics",
      consumeThemeIds: ["referral"],
      bodyChunks: refChunks,
      strength: refScore,
      tiePri: 3,
    });
  }

  const contractorFam =
    family === "independent_contractor_agreement" ||
    family === "consulting_agreement" ||
    family === "services_agreement";
  const perfCorpus = scorePrestigePerformanceCorpus(cs);
  const rep = byTheme.get("reporting") ?? [];
  const comp = byTheme.get("compliance") ?? [];
  const repJoin = rep.map((c) => c.text).join("\n");
  if (contractorFam && rep.length && perfCorpus >= 4 && /\b(report|milestone|deliverable|KPI|acceptance|SLA|status|review)\b/i.test(repJoin)) {
    candidates.push({
      title: "Performance Standards",
      consumeThemeIds: ["reporting"],
      bodyChunks: [...rep].sort((a, b) => a.order - b.order),
      strength: perfCorpus + 2,
      tiePri: 4,
    });
  } else if (contractorFam && comp.length && perfCorpus >= 5) {
    candidates.push({
      title: "Performance Standards",
      consumeThemeIds: ["compliance"],
      bodyChunks: [...comp].sort((a, b) => a.order - b.order),
      strength: perfCorpus + 1.5,
      tiePri: 4,
    });
  }

  const qualified = candidates.filter((c) => {
    if (c.bodyChunks.length === 0) return false;
    if (c.title === "Confidentiality")
      return c.strength >= (ndaHybridFamily || confHybridCorpus ? 5.5 : 6);
    if (c.title === "Performance Standards") return c.strength >= 5.5;
    if (c.title === "Ownership of Accounts & Data") return c.strength >= 5.5;
    if (c.title === "Usage Rights & Content License") return c.strength >= 5.5;
    return c.strength >= 6;
  });
  if (!qualified.length) return null;
  qualified.sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return a.tiePri - b.tiePri;
  });
  return qualified[0] ?? null;
}

export type PremiumDynamicSectionLinesOpts = {
  buildTermSection: () => string;
  buildLawBlock: () => string;
  premiumSectionHeading: (n: number, title: string) => string;
};

/** Default emission order after optional early confidentiality block. */
const DEFAULT_THEME_EMIT_ORDER = [
  "fees",
  "referral",
  "ownership",
  "usage_rights",
  "reporting",
  "subcontractors",
  "compliance",
  "confidentiality",
  "restrictions",
  "transition",
  "governance",
];

/**
 * Flat lines (with embedded newlines inside sections) after parties block.
 */
export function buildPremiumDynamicCommercialSectionLines(
  draft: ParsedDraftShape,
  opts: PremiumDynamicSectionLinesOpts,
): string[] {
  const chunks = collectTaggedChunks(draft);
  if (!chunks.length) return [];

  const scopePeel = peelScopeSentencesFromPurposeChunks(chunks);
  const scopePeelActive = Boolean(scopePeel.ownershipPeel || scopePeel.usagePeel);

  const corpus = buildDraftCorpus(draft);
  const corpusConf = detectCorpusConfidentialitySignals(corpus);
  const corpusReporting = CORPUS_REPORTING_RE.test(corpus);
  const corpusSub = CORPUS_SUBCONTRACT_RE.test(corpus);

  const byTheme = new Map<string, TaggedChunk[]>();
  const unscoped: TaggedChunk[] = [];

  for (const ch of scopePeel.routed) {
    if (scopePeelActive && ch.source === "purpose") {
      unscoped.push(ch);
      continue;
    }
    const th = pickTheme(ch.text);
    if (!th) {
      if (ch.source === "purpose") unscoped.push(ch);
      else {
        const id = ch.source === "payment" ? "fees" : "other";
        const arr = byTheme.get(id) ?? [];
        arr.push(ch);
        byTheme.set(id, arr);
      }
      continue;
    }
    const arr = byTheme.get(th.id) ?? [];
    arr.push(ch);
    byTheme.set(th.id, arr);
  }

  if (scopePeel.ownershipPeel) {
    appendChunks(byTheme, "ownership", [scopePeel.ownershipPeel]);
  }
  if (scopePeel.usagePeel) {
    appendChunks(byTheme, "usage_rights", [scopePeel.usagePeel]);
  }

  unscoped.sort((a, b) => a.order - b.order);
  for (const arr of byTheme.values()) arr.sort((a, b) => a.order - b.order);

  reclassifyOtherBucket(byTheme);
  promoteThemedChunksFromCatchalls(byTheme, unscoped, corpusConf, corpusReporting, corpusSub);

  const tit = (draft.title || "").trim();
  const corpusSignals = [tit, corpus].filter(Boolean).join("\n");

  let peeledOwnership: TaggedChunk[] | null = null;
  if (themeScore("ownership", corpusSignals) >= 5 && isAgencyMarketingContext(corpusSignals)) {
    const fromMap = byTheme.get("ownership");
    if (!fromMap?.length && unscoped.length) {
      const ownSignals =
        /\b(own(?:ership)?|owns?|pixel|pixels|\bad\s+accounts?|ad\s+operations?|customer\s+data|audiences?|crm|credentials|business\s+manager|remain\s+ours|landing|funnel|funnels?|creatives?|work\s*[-–]?\s*product|email\s+lists?)\b/i;
      const pulled: TaggedChunk[] = [];
      const stay: TaggedChunk[] = [];
      for (const ch of unscoped) {
        if (ownSignals.test(ch.text)) pulled.push(ch);
        else stay.push(ch);
      }
      if (pulled.length) {
        peeledOwnership = pulled;
        unscoped.length = 0;
        unscoped.push(...stay);
      }
    }
  }

  let peeledUsage: TaggedChunk[] | null = null;
  if (
    themeScore("usage_rights", corpusSignals) >= 5 &&
    /\b(influencer|creator|sponsored\s+content|ugc)\b/i.test(corpusSignals) &&
    !byTheme.get("usage_rights")?.length &&
    unscoped.length
  ) {
    const usageSignals =
      /\b(usage\s+rights?|license|licence|deliverables?|videos?|story|posts?|paid\s+ads?|content\s+rights?|approval|ftc)\b/i;
    const pulled: TaggedChunk[] = [];
    const stay: TaggedChunk[] = [];
    for (const ch of unscoped) {
      if (usageSignals.test(ch.text)) pulled.push(ch);
      else stay.push(ch);
    }
    if (pulled.length) {
      peeledUsage = pulled;
      unscoped.length = 0;
      unscoped.push(...stay);
    }
  }

  if (
    !peeledUsage?.length &&
    /\b(influencer|creator)\b/i.test(corpusSignals) &&
    themeScore("usage_rights", corpusSignals) + themeScore("compliance", corpusSignals) >= 4 &&
    unscoped.length
  ) {
    const uSig =
      /\b(ftc|disclosure|approval|deliverables?|usage\s+rights?|license|licence|paid\s+ads?|posts?|videos?|stories?|sponsored)\b/i;
    const pulled: TaggedChunk[] = [];
    const stay: TaggedChunk[] = [];
    for (const ch of unscoped) {
      if (uSig.test(ch.text)) pulled.push(ch);
      else stay.push(ch);
    }
    if (pulled.length) {
      peeledUsage = pulled;
      unscoped.length = 0;
      unscoped.push(...stay);
    }
  }

  const prestige = pickSinglePrestigeSection(draft, corpusSignals, byTheme, peeledOwnership, peeledUsage);

  const lines: string[] = [];

  const emitTheme = (nRef: { n: number }, title: string, bodyChunks: TaggedChunk[]) => {
    if (!bodyChunks.length) return;
    const body = bodyChunks.map((c) => c.text).join("\n\n");
    if (!body.trim()) return;
    lines.push(opts.premiumSectionHeading(nRef.n, title), body, "", "");
    nRef.n += 1;
  };

  const nRef = { n: 1 };

  if (unscoped.length) {
    lines.push(
      opts.premiumSectionHeading(nRef.n, "Commercial relationship & scope"),
      unscoped.map((c) => c.text).join("\n\n"),
      "",
      "",
    );
    nRef.n += 1;
  }

  let prestigeAteConfidentiality = false;
  if (prestige?.bodyChunks.length) {
    const prestigeBody = prestige.bodyChunks.map((c) => c.text).join("\n\n").trim();
    if (prestigeBody) {
      lines.push(opts.premiumSectionHeading(nRef.n, prestige.title), prestigeBody, "", "");
      nRef.n += 1;
      for (const id of prestige.consumeThemeIds) {
        byTheme.delete(id);
        if (id === "confidentiality") prestigeAteConfidentiality = true;
      }
    }
  }

  const earlyConf = corpusConf && !prestigeAteConfidentiality && (byTheme.get("confidentiality")?.length ?? 0) > 0;
  if (earlyConf) {
    emitTheme(nRef, "Confidentiality", byTheme.get("confidentiality")!);
    byTheme.delete("confidentiality");
  }

  const emitOrder = DEFAULT_THEME_EMIT_ORDER.filter((id) => !(earlyConf && id === "confidentiality"));
  for (const id of emitOrder) {
    const th = THEMES.find((x) => x.id === id);
    const arr = byTheme.get(id);
    if (th && arr?.length) emitTheme(nRef, th.title, arr);
  }

  const other = byTheme.get("other");
  if (other?.length) emitTheme(nRef, "Additional commercial commitments", other);

  const termLine = opts.buildTermSection();
  if (termLine && termLine !== "[Not yet specified]") {
    lines.push(opts.premiumSectionHeading(nRef.n, "Term & key dates"), termLine, "", "");
    nRef.n += 1;
  }

  lines.push(opts.premiumSectionHeading(nRef.n, "Governing law"), opts.buildLawBlock(), "", "");

  return lines;
}

function splitSmartParagraphs(raw: string): string[] {
  const s = raw.replace(/\r\n/g, "\n").trim();
  if (!s) return [];
  let parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= 1100) {
      out.push(p);
      continue;
    }
    const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z(“"])/);
    let buf = "";
    for (const sent of sentences) {
      const t = sent.trim();
      if (!t) continue;
      if ((buf + " " + t).length > 900 && buf) {
        out.push(buf.trim());
        buf = t;
      } else {
        buf = buf ? `${buf} ${t}` : t;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return dedupeSequential(out);
}

function splitBulletAware(additional: string): string[] {
  const s = additional.replace(/\r\n/g, "\n").trim();
  if (!s) return [];
  const pieces = s.split(/\n(?=\s*(?:[•\-*]|\d+\.)\s)/).map((x) => x.trim()).filter(Boolean);
  const blocks = pieces.length > 1 ? pieces : splitSmartParagraphs(s);
  return dedupeSequential(
    blocks.flatMap((b) => (b.length > 1600 ? splitSmartParagraphs(b) : [b])).filter((x) => x.length >= 24),
  );
}

function dedupeSequential(chunks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const k = c.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
