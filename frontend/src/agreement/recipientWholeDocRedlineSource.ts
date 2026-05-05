/**
 * Whole-document recipient redline plain-text pair: owner baseline HTML vs proposed state.
 * Full /revise rendered HTML can diverge structurally; we prefer field-targeted patches on the
 * immutable baseline plain text when snapshot edits are patchable and the HTML diff is noisy.
 */

import type { AgreementDraft } from "./agreementTypes";
import type { AgreementFieldChange } from "../vs01/agreementCompare";
import { htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import {
  buildLegalRedlineDocumentViewModel,
  normalizeNewlinesForLegalRedline,
  parsePlainTextIntoLegalBlocks,
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

export type BuildRecipientLegalRedlinePlainTextsResult = {
  currentPlain: string;
  proposedPlain: string;
  sourceMode: RecipientWholeDocRedlineSourceMode;
  /** True when full HTML vs baseline had a large block diff but patch mode was used instead. */
  usedNoisyReviseGuard?: boolean;
};

function replaceFirst(haystack: string, needle: string, repl: string): string {
  const i = haystack.indexOf(needle);
  if (i < 0) return haystack;
  return haystack.slice(0, i) + repl + haystack.slice(i + needle.length);
}

function appendIfMissing(plain: string, fragment: string): string {
  const f = fragment.trim();
  if (!f || plain.includes(f)) return plain;
  return `${plain}\n\n${f}`;
}

function scorePaymentLikeBlock(raw: string, beforeWords: string[]): number {
  const t = raw.toLowerCase();
  let s = 0;
  if (/\b(payment|invoice|invoices|net|receipt|due|payable|fee|compensation)\b/.test(t)) s += 6;
  for (const w of beforeWords) {
    if (w.length < 4) continue;
    if (t.includes(w.toLowerCase())) s += 2;
  }
  return s;
}

/**
 * When `before` is not a literal substring of baseline plain (template omits draft wording),
 * replace the best-matching payment-like block body with `after`.
 */
function patchPaymentTermsBlockInPlain(
  plain: string,
  before: string,
  after: string,
): string {
  const norm = normalizeNewlinesForLegalRedline(plain);
  const beforeWords = before.split(/\s+/).filter((w) => w.length > 3);
  const blocks = parsePlainTextIntoLegalBlocks(norm);
  if (blocks.length === 0) return appendIfMissing(norm, after);

  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < blocks.length; i++) {
    const sc = scorePaymentLikeBlock(blocks[i]!.rawText, beforeWords);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  if (best < 0 || bestScore < 4) {
    return appendIfMissing(norm, after);
  }
  const b = blocks[best]!;
  const lines = b.rawText.split("\n");
  const head = lines[0]?.trim() ?? "";
  const hasClauseHead =
    /^\d+(?:\.\d+)*\.?\s+\S/.test(head) || /^(article|section)\s+/i.test(head);
  const newRaw =
    hasClauseHead && lines.length > 1
      ? `${lines[0]}\n${after}${lines.length > 2 ? "\n" + lines.slice(2).join("\n") : ""}`
      : after;
  blocks[best] = { ...b, rawText: newRaw };
  return blocks.map((x) => x.rawText).join("\n\n");
}

function isNarrowPaymentTimingInstruction(instructionPlain: string): boolean {
  const t = String(instructionPlain ?? "").trim();
  if (!t) return false;
  return NARROW_PAYMENT_TIMING_RE.test(t);
}

function buildFieldPatchPair(
  baselinePlain: string,
  changedPatchableRows: AgreementFieldChange[],
): { currentPlain: string; proposedPlain: string } {
  const sortedAugment = [...changedPatchableRows].sort(
    (a, b) => (b.before ?? "").trim().length - (a.before ?? "").trim().length,
  );
  let currentPlain = baselinePlain;
  for (const row of sortedAugment) {
    const before = (row.before ?? "").trim();
    if (before && !currentPlain.includes(before)) {
      currentPlain = appendIfMissing(currentPlain, before);
    }
  }

  let proposedPlain = currentPlain;
  const sortedReplace = [...changedPatchableRows].sort(
    (a, b) => (b.before ?? "").trim().length - (a.before ?? "").trim().length,
  );
  for (const row of sortedReplace) {
    const before = (row.before ?? "").trim();
    const after = (row.after ?? "").trim();
    if (before && proposedPlain.includes(before)) {
      proposedPlain = replaceFirst(proposedPlain, before, after);
      continue;
    }
    if (row.field === "payment_terms" && after) {
      proposedPlain = patchPaymentTermsBlockInPlain(proposedPlain, before, after);
      continue;
    }
    if (!before && after) {
      proposedPlain = appendIfMissing(proposedPlain, after);
    }
  }
  return { currentPlain, proposedPlain };
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
    return { currentPlain: cur, proposedPlain: prop, sourceMode: "baseline_vs_revise_html" };
  }

  const changedKeys = changedFields.filter((r) => r.changed).map((r) => r.field);
  const patchableChangedRows = changedFields.filter((r) => r.changed && PATCHABLE_FIELDS.has(r.field));
  const partiesChanged = changedKeys.includes("parties");
  const hasPatchableDiff = patchableChangedRows.length > 0;

  const vmFull = buildLegalRedlineDocumentViewModel(cur, prop);
  const narrow = isNarrowPaymentTimingInstruction(instructionPlain);

  let patchPair: { currentPlain: string; proposedPlain: string } | null = null;
  if (hasPatchableDiff) {
    patchPair = buildFieldPatchPair(cur, patchableChangedRows);
  }

  const vmPatch =
    patchPair != null
      ? buildLegalRedlineDocumentViewModel(patchPair.currentPlain, patchPair.proposedPlain)
      : null;

  let usePatch = false;

  if (patchPair && vmPatch) {
    if (!vmFull.hasChanges) {
      usePatch = true;
    } else if (!partiesChanged && patchableChangedRows.length === changedKeys.length) {
      // Only structured text fields changed — always keep baseline structure.
      usePatch = true;
    } else if (narrow && vmFull.stats.changedBlockCount > 3 && hasPatchableDiff) {
      usePatch = true;
    } else if (narrow && hasPatchableDiff && vmPatch.stats.changedBlockCount + 2 < vmFull.stats.changedBlockCount) {
      usePatch = true;
    }
  }

  if (usePatch && patchPair) {
    const usedNoisyReviseGuard =
      vmFull.hasChanges && vmFull.stats.changedBlockCount > 3;
    const diag =
      typeof import.meta !== "undefined" &&
      import.meta.env?.DEV &&
      usedNoisyReviseGuard;
    if (diag && vmPatch) {
      // eslint-disable-next-line no-console
      console.warn("[recipient-redline-patch-fallback]", {
        reason: "narrow_instruction_or_structural_noise",
        changedBlockCountFull: vmFull.stats.changedBlockCount,
        changedBlockCountPatch: vmPatch.stats.changedBlockCount,
        instructionSnippet: instructionPlain.slice(0, 120),
      });
    }
    return {
      currentPlain: patchPair.currentPlain,
      proposedPlain: patchPair.proposedPlain,
      sourceMode: "baseline_vs_field_patch",
      usedNoisyReviseGuard,
    };
  }

  return { currentPlain: cur, proposedPlain: prop, sourceMode: "baseline_vs_revise_html" };
}
