/**
 * Business Review Mode: semantic change cards + focused OLD/NEW extraction.
 * (Separate from {@link recipientHumanReviewSummaryModel} to keep card copy in one place.)
 */

import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";

export type BusinessReviewSemanticId =
  | "payment_terms"
  | "scope"
  | "ownership"
  | "third_party"
  | "acceptance"
  | "timeline_protections"
  | "term_timing"
  | "generic";

export type BusinessReviewCardModel = {
  id: BusinessReviewSemanticId;
  /** Display title — usually matches the friendly chip. */
  title: string;
  whyMatters: string;
  riskImpact: string;
  businessEffect: string;
};

const KEYWORD_SCORES: Partial<Record<BusinessReviewSemanticId, RegExp>> = {
  payment_terms: /\b(net|payment|invoice|invoices|payable|fee|fees|compensation|late|overdue|pause|suspend|undisputed)\b/i,
  scope: /\b(scope|deliverable|milestone|boundary|feature|work\s+order|change\s+order)\b/i,
  ownership: /\b(own|ownership|intellectual\s+property|ip\b|work\s+product|background|license)\b/i,
  third_party: /\b(third[\s-]?party|subcontract|vendor|saas|dependency|liability)\b/i,
  acceptance: /\b(acceptance|signoff|uat|defect|warranty|remedy)\b/i,
  timeline_protections: /\b(pause|suspend|nonpayment|timeline|schedule|delay|dependency)\b/i,
  term_timing: /\b(term|duration|deadline|calendar)\b/i,
};

/** Map a friendly chip label (from {@link buildRecipientFriendlyRedlineChips}) to a semantic id. */
export function friendlyChipToSemanticId(chip: string): BusinessReviewSemanticId {
  const c = chip.toLowerCase();
  if (/payment|net|invoice|payable/.test(c)) return "payment_terms";
  if (/scope|boundary|deliverable/.test(c)) return "scope";
  if (/ownership|intellectual|ip\b|background/.test(c)) return "ownership";
  if (/third[\s-]?party|risk/.test(c)) return "third_party";
  if (/acceptance|signoff|uat|defect/.test(c)) return "acceptance";
  if (/timeline|protection|pause|suspend|nonpayment|overdue/.test(c)) return "timeline_protections";
  if (/term|adjusted|deadline/.test(c)) return "term_timing";
  return "generic";
}

export function businessReviewCardForSemanticId(id: BusinessReviewSemanticId, title: string): BusinessReviewCardModel {
  const t = title.trim() || "Proposed change";
  switch (id) {
    case "payment_terms":
      return {
        id,
        title: t,
        whyMatters: "Clarifies when invoices are due and what happens if payment is late.",
        riskImpact: "Low–Medium.",
        businessEffect: "Can strengthen leverage on collections and cash timing if invoices age.",
      };
    case "scope":
      return {
        id,
        title: t,
        whyMatters: "Clarifies what is in or out of the engagement.",
        riskImpact: "Medium.",
        businessEffect: "Reduces scope creep disputes and sets clearer delivery expectations.",
      };
    case "ownership":
      return {
        id,
        title: t,
        whyMatters: "Clarifies who owns deliverables, tools, and pre-existing materials.",
        riskImpact: "Medium–High.",
        businessEffect: "Affects reuse, resale, and downstream licensing of work product.",
      };
    case "third_party":
      return {
        id,
        title: t,
        whyMatters: "Addresses vendors, subcontractors, or services outside direct control.",
        riskImpact: "Medium.",
        businessEffect: "Allocates operational and liability risk when third parties are involved.",
      };
    case "acceptance":
      return {
        id,
        title: t,
        whyMatters: "Clarifies how work is reviewed, accepted, or remediated.",
        riskImpact: "Low–Medium.",
        businessEffect: "Sets clearer finish lines and dispute windows for delivery quality.",
      };
    case "timeline_protections":
      return {
        id,
        title: t,
        whyMatters: "Adds protections when schedules slip or payments are overdue.",
        riskImpact: "Medium.",
        businessEffect: "May pause or reprioritize work if commercial terms are not met.",
      };
    case "term_timing":
      return {
        id,
        title: t,
        whyMatters: "Adjusts how long the relationship runs or key dates apply.",
        riskImpact: "Low–Medium.",
        businessEffect: "Affects renewal, exit timing, and notice obligations.",
      };
    default:
      return {
        id: "generic",
        title: t,
        whyMatters: "Refines agreement language in this area.",
        riskImpact: "Low.",
        businessEffect: "Usually clarifying or operational unless your counsel flags otherwise.",
      };
  }
}

function scoreBlockForSemantic(block: LegalRedlineBlock, id: BusinessReviewSemanticId): number {
  if (!block.hasChange) return 0;
  const re = KEYWORD_SCORES[id];
  const hay = block.segments.map((s) => s.text).join(" ");
  if (!re) return 0;
  return re.test(hay) ? 10 + hay.length / 1000 : 0;
}

function changeMass(block: LegalRedlineBlock): number {
  return block.segments
    .filter((s) => s.type !== "same")
    .reduce((a, s) => a + String(s.text).length, 0);
}

export type FocusedWordingResult = {
  sectionLabel: string;
  oldText: string;
  newText: string;
};

/** Deleted vs inserted text for a single changed block (focused OLD/NEW dialog). */
export function extractFocusedWordingForBlock(block: LegalRedlineBlock): FocusedWordingResult | null {
  if (!block.hasChange) return null;
  const oldText = block.segments
    .filter((s) => s.type === "delete")
    .map((s) => s.text)
    .join("");
  const newText = block.segments
    .filter((s) => s.type === "insert")
    .map((s) => s.text)
    .join("");
  if (!oldText.trim() && !newText.trim()) return null;
  const sectionLabel = (block.label || block.clauseNumber || block.heading || "Section").trim();
  return {
    sectionLabel,
    oldText: oldText.trim() || "(no prior wording in this excerpt)",
    newText: newText.trim() || "(no new wording in this excerpt)",
  };
}

/**
 * Picks the best-matching changed block and returns deleted vs inserted text for focused view.
 */
export function extractFocusedWordingForSemanticId(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
): FocusedWordingResult | null {
  let best: { block: LegalRedlineBlock; score: number } | null = null;
  for (const b of vm.blocks) {
    if (!b.hasChange) continue;
    const kw = scoreBlockForSemantic(b, id);
    const mass = changeMass(b);
    const score = kw > 0 ? kw + mass / 100 : mass;
    if (!best || score > best.score) best = { block: b, score };
  }
  if (!best) return null;
  return extractFocusedWordingForBlock(best.block);
}

/** Short numbered lines for “Recommended review focus”. */
/** Short bullets for dense “section substantially revised” cards. */
export function inferDenseSectionChangeBullets(block: LegalRedlineBlock): string[] {
  const t = block.segments
    .map((s) => s.text)
    .join(" ")
    .toLowerCase();
  const out: string[] = [];
  if (/\bnet\s*\d|invoice|payable|payment|compensation|fee\b/.test(t)) out.push("revised payment timing");
  if (/pause|suspend|overdue|undisputed|late payment|days late/.test(t)) out.push("pause or protection tied to late payment");
  if (/scope|deliverable|milestone|boundary/.test(t)) out.push("scope or delivery boundaries");
  if (/accept|signoff|uat|defect|warranty/.test(t)) out.push("acceptance or quality mechanics");
  if (/third|vendor|subcontract|saas|dependency/.test(t)) out.push("third-party or dependency risk");
  if (/own|intellectual property|ip\b|work product|background/.test(t)) out.push("ownership or IP");
  if (out.length === 0) out.push("revised legal language in this section");
  return [...new Set(out)].slice(0, 5);
}

/** One scannable line under the card title (first sentence of why it matters). */
export function businessReviewCardTitleSubline(card: BusinessReviewCardModel): string {
  const s = card.whyMatters.trim();
  const cut = s.indexOf(". ");
  if (cut > 8 && cut < 88) return s.slice(0, cut + 1).trim();
  if (s.length <= 90) return s;
  return `${s.slice(0, 87).trim()}…`;
}

const EXCERPT_REVIEWER_ARTIFACT = /\b(reviewer\s+notes|notes\s+to\s+sender|message\s+to\s+)\b/i;

/** Short same-line excerpt for hover/sheet (agreement diff only; skips placeholder-only rows). */
export function extractBusinessReviewCardPreviewExcerpt(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
  maxLen = 140,
): string | null {
  const w = extractFocusedWordingForSemanticId(vm, id);
  if (!w) return null;
  let snippet = [w.oldText, w.newText]
    .filter((t) => t && !/^\(no (prior|new) wording\b/i.test(t))
    .join(" · ");
  snippet = snippet.replace(/\s+/g, " ").trim();
  if (!snippet || EXCERPT_REVIEWER_ARTIFACT.test(snippet)) return null;
  if (snippet.length <= maxLen) return snippet;
  return `${snippet.slice(0, maxLen - 1).trim()}…`;
}

export function buildRecommendedSenderFocusLines(chips: readonly string[]): string[] {
  const priority: BusinessReviewSemanticId[] = [
    "ownership",
    "payment_terms",
    "third_party",
    "scope",
    "acceptance",
    "timeline_protections",
    "term_timing",
  ];
  const seen = new Set<BusinessReviewSemanticId>();
  const lines: string[] = [];
  for (const p of priority) {
    for (const c of chips) {
      if (friendlyChipToSemanticId(c) === p && !seen.has(p)) {
        seen.add(p);
        lines.push(businessReviewCardForSemanticId(p, c).title);
        break;
      }
    }
    if (lines.length >= 3) break;
  }
  if (lines.length === 0 && chips[0]) {
    lines.push(chips[0]!);
    if (chips[1]) lines.push(chips[1]!);
  }
  return lines.slice(0, 3);
}
