/**
 * Whole-document recipient redline plain-text pair: owner baseline HTML vs proposed state.
 * Field-patch mode never appends draft text to the tail of the document — payment edits must
 * land inside a scored payment block or the patch is skipped (UI shows placement callout).
 */

import type { AgreementDraft } from "./agreementTypes";
import type { AgreementFieldChange } from "../vs01/agreementCompare";
import { htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import {
  buildLegalRedlineDocumentViewModel,
  filterNarrowRecipientPaymentRedlineNoise,
  normalizeNewlinesForLegalRedline,
  parsePlainTextIntoLegalBlocks,
  type ParsedPlainBlock,
} from "./legalRedlineBlocks";

const PATCHABLE_FIELDS = new Set([
  "title",
  "jurisdiction",
  "effective_date",
  "purpose",
  "payment_terms",
  "duration",
  "due_date",
]);

const NARROW_PAYMENT_TIMING_RE =
  /\b(payment|invoice|invoices|net|payable|receipt|due|late|arrears|pause|days?|day\b|30|15|60)\b/i;

/** Minimum score to treat a block as a safe payment patch target (no tail append). */
const MIN_PAYMENT_TARGET_SCORE = 10;

/** Compact fingerprint for diagnostics (length + FNV-1a 32-bit). */
export function fingerprintPlainText(s: string): string {
  const t = String(s ?? "").slice(0, 12000);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

/** Short snippet around payment-related wording for logs. */
export function snippetAroundPaymentTerms(plain: string): string {
  const lower = plain.toLowerCase();
  const needles = ["net 30", "net 15", "net 60", "receipt", "invoice", "payment terms", "payable", "payment"];
  let idx = -1;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i >= 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return plain.slice(0, 200).replace(/\s+/g, " ").trim();
  return plain.slice(Math.max(0, idx - 50), idx + 180).replace(/\s+/g, " ").trim();
}

export type RecipientWholeDocRedlineSourceMode = "baseline_vs_revise_html" | "baseline_vs_field_patch";

export type RecipientRedlineInlinePlacementDiag = {
  field: string;
  mode: "literal_replace" | "payment_block_inline" | "skipped_no_safe_target" | "skipped_empty_after" | "n_a";
  targetBlockIndex: number | null;
  targetBlockLabel: string | null;
  targetScore: number | null;
  appendedFallbackUsed: false;
};

export type RecipientRedlineTargetedPatchDiag = {
  selectedBlockKey: string | null;
  selectedBlockLabel: string | null;
  selectedBlockSnippet: string | null;
  rejectedNoiseBlockCount: number;
  patchApplied: boolean;
  fallbackCalloutUsed: boolean;
  finalInsertCount: number | null;
  finalDeleteCount: number | null;
  finalChangedBlockCount: number | null;
};

export type BuildRecipientLegalRedlinePlainTextsResult = {
  currentPlain: string;
  proposedPlain: string;
  sourceMode: RecipientWholeDocRedlineSourceMode;
  /** True when full HTML vs baseline had a large block diff but patch mode was used instead. */
  usedNoisyReviseGuard?: boolean;
  /** True when payment_terms snapshot change could not be placed inside a scored payment block. */
  paymentTermsInlinePlacementFailed?: boolean;
  inlinePlacementDiags?: RecipientRedlineInlinePlacementDiag[];
  /** When true, UI should run {@link filterNarrowRecipientPaymentRedlineNoise} on the legal redline VM. */
  narrowRecipientTargetedRedline?: boolean;
  /** Populated for narrow payment + field-patch path (diagnostics / QA). */
  recipientRedlineTargetedPatchDiag?: RecipientRedlineTargetedPatchDiag;
};

function replaceFirst(haystack: string, needle: string, repl: string): string {
  const i = haystack.indexOf(needle);
  if (i < 0) return haystack;
  return haystack.slice(0, i) + repl + haystack.slice(i + needle.length);
}

function logInlinePlacement(diag: RecipientRedlineInlinePlacementDiag): void {
  const diagOn =
    typeof import.meta !== "undefined" &&
    (import.meta.env?.DEV ||
      (typeof globalThis !== "undefined" &&
        (globalThis as unknown as { window?: Window }).window?.localStorage?.getItem("lawdogRecipientReviseDiag") ===
          "1"));
  if (!diagOn) return;
  // eslint-disable-next-line no-console
  console.info("[recipient-redline-inline-placement]", {
    field: diag.field,
    mode: diag.mode,
    targetBlockIndex: diag.targetBlockIndex,
    targetBlockLabel: diag.targetBlockLabel,
    targetScore: diag.targetScore,
    appendedFallbackUsed: diag.appendedFallbackUsed,
  });
}

const FOOTER_OR_BRANDING_RE =
  /\b(created with lawdog|draft for review|lawdog\s*[—\-]|in\s+witness\s+whereof|witness\s+whereof|signature|signatures|page\s+\d+\s+of\s+\d+)\b/i;

const PAYMENT_LEX_GLOBAL =
  /\b(payment|payments|fee|fees|compensation|invoice|invoices|invoicing|payment schedule|total fee|expenses|taxes|tax|net|due|late|disputed|payable|receipt|receipts|wire|ach|usd)\b/gi;

const PAYMENT_LEX_TEST =
  /\b(payment|payments|fee|fees|compensation|invoice|invoices|invoicing|payment schedule|total fee|expenses|taxes|tax|net|due|late|disputed|payable|receipt|receipts|wire|ach|usd)\b/i;

const PAYMENT_TIMING_LINE_RE =
  /\b(invoice|invoices|payable|payment|due|net|receipt|fee|fees|compensation|within\s+\d+|days?\s+after)\b/i;

/** Block head (prefix before notices/signature boilerplate) must mention at least one of these to qualify as payment target. */
const REQUIRED_PAYMENT_TARGET_LEX = /\b(payment|compensation|fee|fees|invoice|invoices|due|receipt|net)\b/i;

function recipientRedlineDiagEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    (import.meta.env?.DEV ||
      (typeof globalThis !== "undefined" &&
        (globalThis as unknown as { window?: Window }).window?.localStorage?.getItem("lawdogRecipientReviseDiag") ===
          "1"))
  );
}

function logRecipientRedlineTargetedPatch(payload: RecipientRedlineTargetedPatchDiag): void {
  if (!recipientRedlineDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[recipient-redline-targeted-patch]", payload);
}

/**
 * Split block text so payment edits never cross into signature/footer/party boilerplate in the same chunk.
 */
export function splitPlainTextAtRecipientPaymentNoiseBoundary(raw: string): { head: string; tail: string } {
  const t = String(raw ?? "");
  const low = t.toLowerCase();
  let cut = t.length;
  const phraseStarts = [
    "in witness whereof",
    "created with lawdog",
    "draft for review",
    "execution and signature",
    "email for notices",
  ];
  for (const p of phraseStarts) {
    const i = low.indexOf(p);
    if (i >= 0) cut = Math.min(cut, i);
  }
  const clientLab = low.search(/(^|\n)\s*client\s*:\s*/i);
  if (clientLab >= 0) cut = Math.min(cut, clientLab);
  const devLab = low.search(/(^|\n)\s*developer\s*:\s*/i);
  if (devLab >= 0) cut = Math.min(cut, devLab);
  const noticesH = low.search(/(^|\n)\s*notices?\s*($|:|\n)/i);
  if (noticesH >= 0) cut = Math.min(cut, noticesH);
  return { head: t.slice(0, cut), tail: t.slice(cut) };
}

/** Party / execution boilerplate that must not appear in the patchable payment prefix. */
function paymentTargetHeadPoisoned(head: string): boolean {
  const h = head.toLowerCase();
  if (/\b(in witness whereof|created with lawdog|draft for review|execution and signature)\b/.test(h)) return true;
  if (/\bemail\s+for\s+notices\b/.test(h)) return true;
  if (/(^|\n)\s*(client|developer)\s*:\s*/im.test(head)) return true;
  if (/(^|\n)\s*by\s*:\s*/im.test(head)) return true;
  if (/(^|\n)\s*(name|title|date)\s*:\s*/im.test(head)) return true;
  if (/\bemail\s+.*@/.test(h)) return true;
  if (/(^|\n)\s*signature\b/im.test(head)) return true;
  return false;
}

/** Snippet for “Requested but not safely placed inline: …” callout. */
export function extractPaymentPlacementCalloutSnippet(paymentTermsAfter: string): string {
  const p = String(paymentTermsAfter ?? "").trim();
  const m = p.match(/\bnet\s*\d+\b/i);
  if (m) return m[0]!;
  const m2 = p.match(/\b(due\s+on\s+receipt|net\s+\d+|payable\s+[^.]{0,40})/i);
  if (m2) return m2[0]!.trim().slice(0, 48);
  return "the requested payment edit";
}

function isFooterLikeBlock(raw: string, blockIndex: number, totalBlocks: number): boolean {
  const t = raw.toLowerCase();
  if (FOOTER_OR_BRANDING_RE.test(t)) return true;
  if (blockIndex >= totalBlocks - 1 && t.length < 500 && /\blawdog\b/.test(t)) return true;
  return false;
}

function scorePaymentTargetBlock(
  block: ParsedPlainBlock,
  index: number,
  totalBlocks: number,
  beforeWords: string[],
  safeHead: string,
): number {
  const raw = block.rawText;
  const head = safeHead;
  const headTrim = head.replace(/\s+/g, " ").trim();
  const t = head.toLowerCase();
  if (block.kind === "signature" || block.kind === "footer") return -1000;
  if (isFooterLikeBlock(raw, index, totalBlocks)) return -1000;
  if (!headTrim) return -1000;
  if (paymentTargetHeadPoisoned(head)) return -1000;
  if (!REQUIRED_PAYMENT_TARGET_LEX.test(head)) return -1000;

  let s = 0;
  const lexMatches = head.match(PAYMENT_LEX_GLOBAL);
  if (lexMatches) s += Math.min(lexMatches.length * 3, 18);

  if (/\b(listing only|sample only|marketing copy)\b/i.test(t) && !/\b(invoice|invoicing|payable|net\s*\d|due upon|fee schedule)\b/i.test(t)) {
    s -= 30;
  }
  if (/\bpayment\s+detail\b/i.test(t) && !/\b(invoice|payable|net\s*\d|fee)\b/i.test(t)) s -= 20;

  const cn = block.clauseNumber;
  if (cn) {
    const major = parseInt(String(cn).split(/[.-]/)[0] ?? "0", 10);
    if ((major === 2 || major === 3) && PAYMENT_LEX_TEST.test(t)) s += 10;
    else if (major === 2 || major === 3) s += 2;
  }

  if (/\b(payment schedule|invoice|invoicing|compensation|fees?\b.*payment|payment.*fees?)\b/i.test(t)) s += 6;

  for (const w of beforeWords) {
    if (w.length < 4) continue;
    if (t.includes(w.toLowerCase())) s += 4;
  }

  if (index >= totalBlocks - 1 && s < MIN_PAYMENT_TARGET_SCORE) s -= 8;
  return s;
}

function rebuildPlainFromBlocks(blocks: ParsedPlainBlock[]): string {
  return blocks.map((b) => b.rawText).join("\n\n");
}

export type ApplyPaymentTermsInlinePatchMeta = {
  rejectedNoiseBlockCount: number;
  selectedBlockKey: string | null;
  selectedBlockLabel: string | null;
  selectedBlockSnippet: string | null;
  patchApplied: boolean;
};

function applyMicroNet30InLine(line: string, before: string, after: string): string {
  if (
    /\bupon\s+receipt\b/i.test(before) &&
    /\bnet\s*30\b/i.test(after) &&
    /\bupon\s+receipt\b/i.test(line)
  ) {
    const re = /\bupon\s+receipt\b/i;
    const m = re.exec(line);
    if (m) {
      return line.slice(0, m.index) + "Net 30" + line.slice(m.index + m[0].length);
    }
  }
  return line;
}

/**
 * Mutates only `head` (prefix before signature/footer noise); `tail` is preserved verbatim.
 */
function patchPaymentTermsHeadChunk(head: string, before: string, after: string, narrowMicroNet30: boolean): string {
  const afterT = after.trim();
  const lines = head.split("\n");
  const line0 = (lines[0] ?? "").trim();
  const hasHeading =
    /^\d+(?:\.\d+)*\.?\s+\S/.test(line0) ||
    /^(article|section)\s+/i.test(line0) ||
    (lines.length > 1 && line0.length < 120);

  if (hasHeading && lines.length > 1) {
    const bodyLines = lines.slice(1);
    let hit = -1;
    for (let j = 0; j < bodyLines.length; j++) {
      if (PAYMENT_TIMING_LINE_RE.test(bodyLines[j]!)) {
        hit = j;
        break;
      }
    }
    const j = hit >= 0 ? hit : 0;
    let line = bodyLines[j] ?? "";
    if (before.trim() && line.includes(before.trim())) {
      const oldLine = line;
      line = narrowMicroNet30 ? applyMicroNet30InLine(line, before, after) : line.replace(before.trim(), afterT);
      if (narrowMicroNet30 && line === oldLine) {
        line = oldLine.replace(before.trim(), afterT);
      }
    } else if (PAYMENT_TIMING_LINE_RE.test(line)) {
      line = afterT;
    } else {
      line = afterT;
    }
    bodyLines[j] = line;
    return `${lines[0]}\n${bodyLines.join("\n")}`;
  }

  const single = head.trim();
  if (before.trim() && single.includes(before.trim())) {
    if (narrowMicroNet30) {
      const next = applyMicroNet30InLine(single, before, after);
      return next === single ? single.replace(before.trim(), afterT) : next;
    }
    return single.replace(before.trim(), afterT);
  }
  if (PAYMENT_TIMING_LINE_RE.test(single)) {
    return afterT;
  }
  return afterT;
}

/**
 * Apply payment_terms change inside the best-scored block only (safe prefix before boilerplate).
 * Never appends to document tail.
 */
function applyPaymentTermsInlinePatch(
  plain: string,
  before: string,
  after: string,
  options?: { narrowPaymentInstruction?: boolean },
): { ok: boolean; plain: string; diag: RecipientRedlineInlinePlacementDiag; meta: ApplyPaymentTermsInlinePatchMeta } {
  const narrowMicro = Boolean(options?.narrowPaymentInstruction);
  const afterT = after.trim();
  const emptyMeta: ApplyPaymentTermsInlinePatchMeta = {
    rejectedNoiseBlockCount: 0,
    selectedBlockKey: null,
    selectedBlockLabel: null,
    selectedBlockSnippet: null,
    patchApplied: false,
  };

  if (!afterT) {
    const diag: RecipientRedlineInlinePlacementDiag = {
      field: "payment_terms",
      mode: "skipped_empty_after",
      targetBlockIndex: null,
      targetBlockLabel: null,
      targetScore: null,
      appendedFallbackUsed: false,
    };
    logInlinePlacement(diag);
    return { ok: false, plain: normalizeNewlinesForLegalRedline(plain), diag, meta: emptyMeta };
  }

  const norm = normalizeNewlinesForLegalRedline(plain);
  const beforeWords = before.split(/\s+/).filter((w) => w.length > 3);
  const blocks = parsePlainTextIntoLegalBlocks(norm);

  if (blocks.length === 0) {
    const diag: RecipientRedlineInlinePlacementDiag = {
      field: "payment_terms",
      mode: "skipped_no_safe_target",
      targetBlockIndex: null,
      targetBlockLabel: null,
      targetScore: null,
      appendedFallbackUsed: false,
    };
    logInlinePlacement(diag);
    return { ok: false, plain: norm, diag, meta: emptyMeta };
  }

  let rejectedNoiseBlockCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i]!.rawText;
    const { head } = splitPlainTextAtRecipientPaymentNoiseBoundary(raw);
    const headTrim = head.replace(/\s+/g, " ").trim();
    const looksPaymentish = PAYMENT_LEX_TEST.test(raw) || PAYMENT_TIMING_LINE_RE.test(raw);
    if (looksPaymentish && (!headTrim || paymentTargetHeadPoisoned(head) || !REQUIRED_PAYMENT_TARGET_LEX.test(head))) {
      rejectedNoiseBlockCount++;
    }
  }

  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i]!.rawText;
    const { head } = splitPlainTextAtRecipientPaymentNoiseBoundary(raw);
    const sc = scorePaymentTargetBlock(blocks[i]!, i, blocks.length, beforeWords, head);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }

  if (best < 0 || bestScore < MIN_PAYMENT_TARGET_SCORE) {
    const diag: RecipientRedlineInlinePlacementDiag = {
      field: "payment_terms",
      mode: "skipped_no_safe_target",
      targetBlockIndex: best >= 0 ? best : null,
      targetBlockLabel: best >= 0 ? (blocks[best]!.headingLine || blocks[best]!.rawText).slice(0, 120) : null,
      targetScore: bestScore >= 0 ? bestScore : null,
      appendedFallbackUsed: false,
    };
    logInlinePlacement(diag);
    return {
      ok: false,
      plain: norm,
      diag,
      meta: {
        ...emptyMeta,
        rejectedNoiseBlockCount,
      },
    };
  }

  const b = blocks[best]!;
  const fullRaw = b.rawText;
  const { head, tail } = splitPlainTextAtRecipientPaymentNoiseBoundary(fullRaw);
  const patchedHead = patchPaymentTermsHeadChunk(head, before, after, narrowMicro);
  const newRaw = patchedHead + tail;

  blocks[best] = { ...b, rawText: newRaw };
  const out = rebuildPlainFromBlocks(blocks);
  const selectedBlockKey = b.clauseNumber ?? `idx:${best}`;
  const selectedBlockLabel = (b.headingLine || b.rawText).slice(0, 120);
  const selectedBlockSnippet = head.replace(/\s+/g, " ").trim().slice(0, 160);

  const diag: RecipientRedlineInlinePlacementDiag = {
    field: "payment_terms",
    mode: "payment_block_inline",
    targetBlockIndex: best,
    targetBlockLabel: selectedBlockLabel,
    targetScore: bestScore,
    appendedFallbackUsed: false,
  };
  logInlinePlacement(diag);
  return {
    ok: true,
    plain: out,
    diag,
    meta: {
      rejectedNoiseBlockCount,
      selectedBlockKey,
      selectedBlockLabel,
      selectedBlockSnippet,
      patchApplied: true,
    },
  };
}

export function isNarrowPaymentTimingInstruction(instructionPlain: string): boolean {
  const t = String(instructionPlain ?? "").trim();
  if (!t) return false;
  return NARROW_PAYMENT_TIMING_RE.test(t);
}

type FieldPatchPairResult = {
  currentPlain: string;
  proposedPlain: string;
  paymentTermsInlinePlacementFailed: boolean;
  inlinePlacementDiags: RecipientRedlineInlinePlacementDiag[];
  targetedPatchMeta: ApplyPaymentTermsInlinePatchMeta | null;
};

function buildFieldPatchPair(
  baselinePlain: string,
  changedPatchableRows: AgreementFieldChange[],
  options?: { narrowPaymentInstruction?: boolean },
): FieldPatchPairResult {
  const narrowPayment = Boolean(options?.narrowPaymentInstruction);
  const inlinePlacementDiags: RecipientRedlineInlinePlacementDiag[] = [];
  let paymentTermsInlinePlacementFailed = false;
  let targetedPatchMeta: ApplyPaymentTermsInlinePatchMeta | null = null;

  let currentPlain = baselinePlain;
  let proposedPlain = baselinePlain;

  const sortedReplace = [...changedPatchableRows].sort(
    (a, b) => (b.before ?? "").trim().length - (a.before ?? "").trim().length,
  );

  for (const row of sortedReplace) {
    const before = (row.before ?? "").trim();
    const after = (row.after ?? "").trim();

    if (row.field === "payment_terms" && after) {
      if (narrowPayment) {
        const res = applyPaymentTermsInlinePatch(proposedPlain, before, after, {
          narrowPaymentInstruction: true,
        });
        inlinePlacementDiags.push(res.diag);
        targetedPatchMeta = res.meta;
        if (res.ok) {
          proposedPlain = res.plain;
        } else {
          paymentTermsInlinePlacementFailed = true;
        }
        continue;
      }
      if (before && proposedPlain.includes(before)) {
        proposedPlain = replaceFirst(proposedPlain, before, after);
        inlinePlacementDiags.push({
          field: "payment_terms",
          mode: "literal_replace",
          targetBlockIndex: null,
          targetBlockLabel: null,
          targetScore: null,
          appendedFallbackUsed: false,
        });
        logInlinePlacement(inlinePlacementDiags[inlinePlacementDiags.length - 1]!);
        continue;
      }
      const res = applyPaymentTermsInlinePatch(proposedPlain, before, after, {
        narrowPaymentInstruction: false,
      });
      inlinePlacementDiags.push(res.diag);
      if (res.ok) {
        proposedPlain = res.plain;
      } else {
        paymentTermsInlinePlacementFailed = true;
      }
      continue;
    }

    if (before && proposedPlain.includes(before)) {
      proposedPlain = replaceFirst(proposedPlain, before, after);
      inlinePlacementDiags.push({
        field: row.field,
        mode: "literal_replace",
        targetBlockIndex: null,
        targetBlockLabel: null,
        targetScore: null,
        appendedFallbackUsed: false,
      });
      logInlinePlacement(inlinePlacementDiags[inlinePlacementDiags.length - 1]!);
      continue;
    }

    if (!before && after) {
      inlinePlacementDiags.push({
        field: row.field,
        mode: "skipped_no_safe_target",
        targetBlockIndex: null,
        targetBlockLabel: null,
        targetScore: null,
        appendedFallbackUsed: false,
      });
      logInlinePlacement(inlinePlacementDiags[inlinePlacementDiags.length - 1]!);
    }
  }

  return { currentPlain, proposedPlain, paymentTermsInlinePlacementFailed, inlinePlacementDiags, targetedPatchMeta };
}

/**
 * @param hasSnapshotDiff — from {@link assessRecipientPreviewDiff}
 * @param instructionPlain — recipient free-text (guards noisy full revise HTML)
 * @param changedFields — snapshot compare rows (drives targeted patch)
 */
export function buildRecipientLegalRedlinePlainTexts(
  _baselineDraft: AgreementDraft,
  _proposedDraft: AgreementDraft,
  baselineHtml: string,
  proposedHtml: string,
  hasSnapshotDiff: boolean,
  instructionPlain: string,
  changedFields: readonly AgreementFieldChange[],
): BuildRecipientLegalRedlinePlainTextsResult {
  const cur = htmlToPlainTextForLegalRedline(baselineHtml || "");
  const prop = htmlToPlainTextForLegalRedline(proposedHtml || "");

  if (!hasSnapshotDiff) {
    return {
      currentPlain: cur,
      proposedPlain: prop,
      sourceMode: "baseline_vs_revise_html",
      narrowRecipientTargetedRedline: false,
    };
  }

  const changedKeys = changedFields.filter((r) => r.changed).map((r) => r.field);
  const patchableChangedRows = changedFields.filter((r) => r.changed && PATCHABLE_FIELDS.has(r.field));
  const partiesChanged = changedKeys.includes("parties");
  const hasPatchableDiff = patchableChangedRows.length > 0;

  const narrow = isNarrowPaymentTimingInstruction(instructionPlain);
  const narrowPatchOnly = narrow && hasPatchableDiff;
  const vmFull = narrowPatchOnly ? null : buildLegalRedlineDocumentViewModel(cur, prop);

  let patchPair: FieldPatchPairResult | null = null;
  if (hasPatchableDiff) {
    patchPair = buildFieldPatchPair(cur, patchableChangedRows, { narrowPaymentInstruction: narrow });
  }

  const vmPatch =
    patchPair != null
      ? buildLegalRedlineDocumentViewModel(patchPair.currentPlain, patchPair.proposedPlain)
      : null;

  let usePatch = false;

  if (patchPair && vmPatch) {
    if (narrow && hasPatchableDiff) {
      usePatch = true;
    } else if (vmFull && !vmFull.hasChanges) {
      usePatch = true;
    } else if (vmFull && !partiesChanged && patchableChangedRows.length === changedKeys.length) {
      usePatch = true;
    }
  }

  if (usePatch && patchPair) {
    const usedNoisyReviseGuard = narrowPatchOnly
      ? normalizeNewlinesForLegalRedline(cur) !== normalizeNewlinesForLegalRedline(prop)
      : Boolean(vmFull?.hasChanges && vmFull.stats.changedBlockCount > 3);
    const shouldWarnPatchFallback =
      typeof import.meta !== "undefined" &&
      import.meta.env?.DEV &&
      vmPatch &&
      !narrowPatchOnly &&
      Boolean(vmFull?.hasChanges && vmFull.stats.changedBlockCount > 3);
    if (shouldWarnPatchFallback) {
      // eslint-disable-next-line no-console
      console.warn("[recipient-redline-patch-fallback]", {
        reason: "narrow_instruction_or_structural_noise",
        changedBlockCountFull: vmFull!.stats.changedBlockCount,
        changedBlockCountPatch: vmPatch.stats.changedBlockCount,
        instructionSnippet: instructionPlain.slice(0, 120),
      });
    }

    let recipientRedlineTargetedPatchDiag: RecipientRedlineTargetedPatchDiag | undefined;
    if (narrow && usePatch) {
      const vmSan = filterNarrowRecipientPaymentRedlineNoise(
        buildLegalRedlineDocumentViewModel(patchPair.currentPlain, patchPair.proposedPlain),
        { narrowPaymentInstruction: true },
      );
      const m = patchPair.targetedPatchMeta;
      recipientRedlineTargetedPatchDiag = {
        selectedBlockKey: m?.selectedBlockKey ?? null,
        selectedBlockLabel: m?.selectedBlockLabel ?? null,
        selectedBlockSnippet: m?.selectedBlockSnippet ?? null,
        rejectedNoiseBlockCount: m?.rejectedNoiseBlockCount ?? 0,
        patchApplied: Boolean(m?.patchApplied),
        fallbackCalloutUsed: patchPair.paymentTermsInlinePlacementFailed,
        finalInsertCount: vmSan.stats.insertCount,
        finalDeleteCount: vmSan.stats.deleteCount,
        finalChangedBlockCount: vmSan.stats.changedBlockCount,
      };
      logRecipientRedlineTargetedPatch(recipientRedlineTargetedPatchDiag);
    }

    return {
      currentPlain: patchPair.currentPlain,
      proposedPlain: patchPair.proposedPlain,
      sourceMode: "baseline_vs_field_patch",
      usedNoisyReviseGuard,
      paymentTermsInlinePlacementFailed: patchPair.paymentTermsInlinePlacementFailed,
      inlinePlacementDiags: patchPair.inlinePlacementDiags,
      narrowRecipientTargetedRedline: Boolean(narrow && usePatch),
      recipientRedlineTargetedPatchDiag,
    };
  }

  return {
    currentPlain: cur,
    proposedPlain: prop,
    sourceMode: "baseline_vs_revise_html",
    narrowRecipientTargetedRedline: false,
  };
}
