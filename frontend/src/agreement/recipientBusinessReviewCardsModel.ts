/**
 * Business Review Mode: semantic change cards + focused OLD/NEW extraction.
 * (Separate from {@link recipientHumanReviewSummaryModel} to keep card copy in one place.)
 */

import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { recipientBlockShowsRedline } from "./recipientMeaningfulRedlinePass";

function recipientSemanticAnchorSlugForBlockId(blockId: string): string {
  return `semantic-${String(blockId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

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
  scope: /\b(scope|deliverables?|milestone|boundary|feature|work\s+order|change\s+order)\b/i,
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

function blockHaystack(block: LegalRedlineBlock): string {
  return block.segments.map((s) => s.text).join(" ");
}

function scoreBlockForSemantic(block: LegalRedlineBlock, id: BusinessReviewSemanticId): number {
  if (!block.hasChange || !recipientBlockShowsRedline(block)) return 0;
  const hay = blockHaystack(block);
  const low = hay.toLowerCase();
  /** Avoid mapping payment / ownership cards to confidentiality-only noise. */
  if (id === "payment_terms") {
    if (/\b(confidentiality|confidential|non-?disclosure|nda)\b/i.test(hay) && !/\b(invoice|invoices|net\s*\d|payment|payable|compensation|fee|fees|late|overdue|undisputed|pause|suspend)\b/i.test(low)) {
      return 0;
    }
  }
  if (id === "ownership") {
    const hasOwnershipSignal =
      /\b(ownership|intellectual\s+property|work\s+product|background|assign|license\s+to)\b/i.test(low) || /\bip\b/i.test(low);
    if (/\b(confidentiality|confidential|non-?disclosure)\b/i.test(hay) && !hasOwnershipSignal) {
      return 0;
    }
  }
  if (id === "scope") {
    if (/\b(confidential|nda|non-?disclosure)\b/i.test(hay) && !/\b(scope|deliverables?|milestone|boundary|work\s+order|services)\b/i.test(low)) {
      return 0;
    }
  }
  if (id === "third_party") {
    if (/\b(confidentiality|confidential|nda)\b/i.test(hay) && !/\b(third|vendor|subcontract|saas|dependency|liability|subprocessor)\b/i.test(low)) {
      return 0;
    }
  }
  if (id === "acceptance") {
    if (/\b(confidentiality|confidential|nda)\b/i.test(hay) && !/\b(acceptance|signoff|uat|defect|warranty|review)\b/i.test(low)) {
      return 0;
    }
  }
  if (id === "timeline_protections") {
    if (/\b(confidentiality|confidential|nda)\b/i.test(hay) && !/\b(schedule|delay|pause|suspend|timeline|force\s+majeure|nonpayment)\b/i.test(low)) {
      return 0;
    }
  }
  const re = KEYWORD_SCORES[id];
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

const PLACEHOLDER_OLD = /^\(no prior wording in this excerpt\)\s*$/i;
const PLACEHOLDER_NEW = /^\(no new wording in this excerpt\)\s*$/i;

/** True when a side is usable in the exact-wording modal (not empty / not placeholder). */
export function isMeaningfulWordingSide(text: string, minLen = 10): boolean {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < minLen) return false;
  if (PLACEHOLDER_OLD.test(t) || PLACEHOLDER_NEW.test(t)) return false;
  return true;
}

/** Deleted vs inserted text for a single changed block (focused OLD/NEW dialog). */
export function extractFocusedWordingForBlock(block: LegalRedlineBlock): FocusedWordingResult | null {
  if (!block.hasChange || !recipientBlockShowsRedline(block)) return null;
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

export type FocusedWordingPickQuality = "none" | "weak" | "strong";

export type FocusedWordingPick = {
  wording: FocusedWordingResult | null;
  quality: FocusedWordingPickQuality;
};

/**
 * Best block for a semantic card + whether mapping is strong enough for the exact-wording modal.
 * Non-generic ids never fall back to unrelated high-mass blocks (keyword match required).
 */
export function getFocusedWordingPickForSemanticId(vm: LegalRedlineDocumentViewModel, id: BusinessReviewSemanticId): FocusedWordingPick {
  const scored: { block: LegalRedlineBlock; score: number; kw: number }[] = [];
  for (const b of vm.blocks) {
    if (!b.hasChange || !recipientBlockShowsRedline(b)) continue;
    const kw = scoreBlockForSemantic(b, id);
    const mass = changeMass(b);
    if (id !== "generic" && kw <= 0) continue;
    const score = id !== "generic" ? kw + mass / 2000 : kw > 0 ? kw + mass / 2000 : mass / 1500;
    scored.push({ block: b, score, kw });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return { wording: null, quality: "none" };
  if (id !== "generic" && top.kw <= 0) return { wording: null, quality: "none" };

  const raw = extractFocusedWordingForBlock(top.block);
  if (!raw) return { wording: null, quality: "none" };
  const oldOk = isMeaningfulWordingSide(raw.oldText);
  const newOk = isMeaningfulWordingSide(raw.newText);
  if (!oldOk || !newOk) return { wording: null, quality: "none" };

  const second = scored[1]?.score ?? 0;
  const margin = top.score - second;
  let quality: FocusedWordingPickQuality = "weak";
  if (id !== "generic") {
    quality = margin >= 0.35 && top.kw >= 10 ? "strong" : "weak";
  } else {
    quality = changeMass(top.block) >= 48 && margin >= 0.2 ? "strong" : "weak";
  }

  return { wording: raw, quality };
}

/** Block id for scroll / highlight — allows weak mappings so signers still land in the right neighborhood. */
export function getPrimaryScrollTargetBlockIdForSemanticId(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
): string | null {
  const scored: { block: LegalRedlineBlock; score: number; kw: number }[] = [];
  for (const b of vm.blocks) {
    if (!b.hasChange || !recipientBlockShowsRedline(b)) continue;
    const kw = scoreBlockForSemantic(b, id);
    const mass = changeMass(b);
    if (id !== "generic" && kw <= 0) continue;
    const score = id !== "generic" ? kw + mass / 2000 : kw > 0 ? kw + mass / 2000 : mass / 1500;
    scored.push({ block: b, score, kw });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return null;
  if (id !== "generic" && top.kw <= 0) return null;
  const raw = extractFocusedWordingForBlock(top.block);
  if (!raw) return null;
  if (!isMeaningfulWordingSide(raw.oldText) || !isMeaningfulWordingSide(raw.newText)) return null;
  return top.block.id;
}

/** Scroll target: semantic match, else first changed block so navigation never dead-ends. */
export function getScrollTargetBlockIdForSemanticOrFallback(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
): string | null {
  return (
    getPrimaryScrollTargetBlockIdForSemanticId(vm, id) ??
    vm.blocks.find((b) => b.hasChange && recipientBlockShowsRedline(b))?.id ??
    null
  );
}

export type RecipientRedlineStickyNavRow = {
  key: string;
  label: string;
  semanticId: BusinessReviewSemanticId;
  anchorId: string | null;
};

export function buildRecipientRedlineStickyNavRows(
  chips: readonly string[],
  vm: LegalRedlineDocumentViewModel,
): RecipientRedlineStickyNavRow[] {
  const seen = new Set<string>();
  const out: RecipientRedlineStickyNavRow[] = [];
  for (const c of chips) {
    const t = c.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const id = friendlyChipToSemanticId(t);
    const bid = getScrollTargetBlockIdForSemanticOrFallback(vm, id);
    out.push({
      key: k,
      label: t,
      semanticId: id,
      anchorId: bid ? recipientSemanticAnchorSlugForBlockId(bid) : null,
    });
  }
  return out.slice(0, 8);
}

/**
 * Picks the best-matching changed block and returns deleted vs inserted text for focused view.
 * Returns null when no keyword-aligned block exists (callers should not open the modal).
 */
export function extractFocusedWordingForSemanticId(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
): FocusedWordingResult | null {
  const { wording, quality } = getFocusedWordingPickForSemanticId(vm, id);
  if (quality === "none" || !wording) return null;
  return wording;
}

/** Only use for modal / “Preview wording” when mapping is reliable. */
export function extractStrongFocusedWordingForSemanticId(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
): FocusedWordingResult | null {
  const { wording, quality } = getFocusedWordingPickForSemanticId(vm, id);
  if (quality !== "strong" || !wording) return null;
  return wording;
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
  if (/scope|deliverables?|milestone|boundary/.test(t)) out.push("scope or delivery boundaries");
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

/** Single-line risk band + commercial consequence (compact card body). */
export function businessReviewCardCompactImpactLine(card: BusinessReviewCardModel): string {
  const r = card.riskImpact.replace(/\s+/g, " ").trim();
  const e = card.businessEffect.replace(/\s+/g, " ").trim();
  return `${r} ${e}`.replace(/\s+/g, " ").trim();
}

const EXCERPT_REVIEWER_ARTIFACT = /\b(reviewer\s+notes|notes\s+to\s+sender|message\s+to\s+)\b/i;

/** Short same-line excerpt for hover/sheet (agreement diff only; skips placeholder-only rows). */
export function extractBusinessReviewCardPreviewExcerpt(
  vm: LegalRedlineDocumentViewModel,
  id: BusinessReviewSemanticId,
  maxLen = 140,
): string | null {
  const w = extractStrongFocusedWordingForSemanticId(vm, id);
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
