/**
 * Post-freeze Paid Pro corpus contract: rendered plain must match frozen/SoT bytes
 * except explicit signer_identity_apply hydration.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";

export type PaidProPostFreezeMutationSource =
  | "signer_identity_apply"
  | "display_html_wrap"
  | "canonical_establish_reconcile"
  | "readonly_display_strip"
  | "unknown";

export type PostFreezeCorpusMutationClass =
  | "signer_hydration"
  | "display_html"
  | "canonical_refreeze"
  | "illegal_structural";

/** Surfaces where readonly input plain is audited at buildPremiumAgreementReadonlyHtml entry. */
export const PAID_PRO_READONLY_INPUT_PLAIN_AUDITED_SOURCES = new Set([
  "premium_agreement_readonly_html",
]);

export function shouldSkipPostFreezeDriftForReadonlyHtmlStrip(surface?: string | null): boolean {
  const s = (surface || "").trim();
  if (!s) return false;
  if (PAID_PRO_READONLY_INPUT_PLAIN_AUDITED_SOURCES.has(s)) return true;
  if (s.startsWith("buildPremiumAgreementReadonlyHtml:")) {
    const inner = s.slice("buildPremiumAgreementReadonlyHtml:".length);
    return PAID_PRO_READONLY_INPUT_PLAIN_AUDITED_SOURCES.has(inner);
  }
  return false;
}

export function isSignatureRegionOnlyCorpusShrink(before: string, after: string): boolean {
  const b = trimCorpus(before);
  const a = trimCorpus(after);
  if (!b || !a || a.length >= b.length) return false;
  const witness = /\bIN WITNESS WHEREOF\b/i;
  if (!witness.test(b)) return false;
  const bHeadEnd = b.search(witness);
  const aHeadEnd = a.search(witness);
  const bHead = bHeadEnd >= 0 ? b.slice(0, bHeadEnd) : b;
  const aHead = aHeadEnd >= 0 ? a.slice(0, aHeadEnd) : a;
  return bHead.trimEnd() === aHead.trimEnd();
}

export type ByteLevelCorpusDiffSegment = {
  kind: "equal" | "insert" | "remove" | "replace";
  beforeOffset: number;
  afterOffset: number;
  beforeText: string;
  afterText: string;
};

export type ByteLevelCorpusDiff = {
  identical: boolean;
  beforeLen: number;
  afterLen: number;
  beforeHash: string;
  afterHash: string;
  firstChangeOffset: number;
  segments: ByteLevelCorpusDiffSegment[];
};

export type PostFreezeCorpusBoundaryRecord = {
  at: number;
  surface: string;
  mutationSource: PaidProPostFreezeMutationSource;
  len: number;
  hash: string;
  head: string;
  tail: string;
  identicalToFrozen: boolean;
};

const BOUNDARY_RING_MAX = 48;
const boundaryRing: PostFreezeCorpusBoundaryRecord[] = [];

function trimCorpus(text: string): string {
  return (text || "").trim();
}

function corpusHeadTail(text: string, n = 250): { head: string; tail: string } {
  const t = text || "";
  return {
    head: t.slice(0, n),
    tail: t.length > n ? t.slice(-n) : t,
  };
}

/** Authoritative frozen plain for hash compare (SoT record, then frozen snapshot). */
export function resolvePaidProFrozenAuthoritativePlain(): string | null {
  const sot = getPaidProSourceOfTruth()?.text?.trim();
  if (sot && sot.length >= 200) return sot;
  const frozen = getFrozenCanonicalAgreementCorpus()?.canonicalText?.trim();
  if (frozen && frozen.length >= 200) return frozen;
  return null;
}

export function resolvePaidProFrozenAuthoritativeHash(): string | null {
  const frozen = getFrozenCanonicalAgreementCorpus()?.hash;
  if (frozen) return frozen;
  if (hasPaidProSourceOfTruth()) return getPaidProSourceOfTruth()?.hash ?? null;
  return null;
}

/** Display-prepared frozen baseline hash — review/display surfaces compare against this after acceptance. */
export function resolvePaidProFrozenDisplayAuthoritativeHash(
  opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] | null },
): string | null {
  const plain = resolvePaidProFrozenAuthoritativePlain();
  if (!plain) return null;
  const display = preparePaidProFrozenDisplayPlain(plain, opts).text.trim();
  return display.length >= 80 ? hashPaidProCorpus(display) : null;
}

/**
 * Display/review plain after acceptance — byte-aligned with SoT (no callout strip / whitespace normalize).
 */
export function resolvePaidProFrozenDisplayPlain(fallback?: string): string {
  const sot = getPaidProSourceOfTruthText().trim();
  if (sot.length >= 200) return sot;
  const fb = trimCorpus(fallback ?? "");
  return fb;
}

/**
 * True when only the signature/execution tail differs (authorized render-time signer overlay).
 */
function signatureExecutionTailDiffIsSignerFieldsOnly(bTail: string, aTail: string): boolean {
  const sigFieldRe = /^\s*(?:Name|Title|Email for Notice|Address for Notice|By)\s*:/i;
  const roleHeadingRe =
    /^\s*(?:CLIENT|SERVICE\s+PROVIDER|CONSULTANT|PROVIDER|COMPANY|CONTRACTOR|PARTY\s+\d+)\s*:/i;
  const bl = bTail.split("\n");
  const al = aTail.split("\n");
  const max = Math.max(bl.length, al.length);
  for (let i = 0; i < max; i++) {
    const bLine = (bl[i] ?? "").trimEnd();
    const aLine = (al[i] ?? "").trimEnd();
    if (bLine === aLine) continue;
    if (!bLine && !aLine) continue;
    if (sigFieldRe.test(bLine) || sigFieldRe.test(aLine)) continue;
    if (roleHeadingRe.test(bLine) || roleHeadingRe.test(aLine)) continue;
    if (/^\s*IN WITNESS WHEREOF\b/i.test(bLine) || /^\s*IN WITNESS WHEREOF\b/i.test(aLine)) continue;
    return false;
  }
  return true;
}

export function isPostFreezeAuthorizedSignerOverlayDrift(before: string, after: string): boolean {
  const b = trimCorpus(before);
  const a = trimCorpus(after);
  if (!b || !a || b === a) return false;
  const witness = /\bIN WITNESS WHEREOF\b/i;
  const bi = b.search(witness);
  const ai = a.search(witness);
  if (bi < 0 || ai < 0) return false;
  if (b.slice(0, bi).trimEnd() !== a.slice(0, ai).trimEnd()) return false;
  if (countWitnessExecutionSections(b) !== countWitnessExecutionSections(a)) return false;
  if (countPaidProExecutionBlocks(b) !== countPaidProExecutionBlocks(a)) return false;
  return signatureExecutionTailDiffIsSignerFieldsOnly(b.slice(bi), a.slice(ai));
}

export function buildPostFreezeCorpusByteDiffPayload(
  before: string,
  after: string,
  surface: string,
): Record<string, unknown> {
  const diff = computeByteLevelCorpusDiff(before, after);
  const lenDelta = diff.afterLen - diff.beforeLen;
  let removedChars = "";
  let insertedChars = "";
  for (const seg of diff.segments) {
    if (seg.kind === "remove" || seg.kind === "replace") removedChars += seg.beforeText;
    if (seg.kind === "insert" || seg.kind === "replace") insertedChars += seg.afterText;
  }
  return {
    surface,
    identical: diff.identical,
    firstChangeOffset: diff.firstChangeOffset,
    beforeLen: diff.beforeLen,
    afterLen: diff.afterLen,
    lenDelta,
    removedByteCount: removedChars.length,
    insertedByteCount: insertedChars.length,
    removedSnippet: removedChars.slice(0, 120),
    insertedSnippet: insertedChars.slice(0, 120),
    beforeHash: diff.beforeHash,
    afterHash: diff.afterHash,
  };
}

export function classifyPostFreezeCorpusMutation(args: {
  mutationSource: PaidProPostFreezeMutationSource;
  before: string;
  after: string;
}): PostFreezeCorpusMutationClass {
  if (args.mutationSource === "signer_identity_apply") return "signer_hydration";
  if (args.mutationSource === "display_html_wrap" || args.mutationSource === "readonly_display_strip") {
    return "display_html";
  }
  if (args.mutationSource === "canonical_establish_reconcile") return "canonical_refreeze";
  if (isSignatureRegionOnlyCorpusShrink(args.before, args.after)) return "display_html";
  const signatureFieldRe =
    /^\s*(?:Name|Title|Email for Notice|Address for Notice|By)\s*:/im;
  const beforeTail = args.before.slice(Math.max(0, args.before.search(/\bIN WITNESS WHEREOF\b/i)));
  const afterTail = args.after.slice(Math.max(0, args.after.search(/\bIN WITNESS WHEREOF\b/i)));
  if (beforeTail && afterTail) {
    const beforeSigLines = beforeTail.split("\n").filter((l) => signatureFieldRe.test(l));
    const afterSigLines = afterTail.split("\n").filter((l) => signatureFieldRe.test(l));
    if (
      beforeSigLines.length > 0 &&
      afterSigLines.length > 0 &&
      beforeSigLines.join("\n") !== afterSigLines.join("\n") &&
      args.before.slice(0, args.before.search(/\bIN WITNESS WHEREOF\b/i)) ===
        args.after.slice(0, args.after.search(/\bIN WITNESS WHEREOF\b/i))
    ) {
      return "signer_hydration";
    }
  }
  return "illegal_structural";
}

/** Literal byte-level diff (first change + up to three segments). */
export function computeByteLevelCorpusDiff(before: string, after: string): ByteLevelCorpusDiff {
  const b = before ?? "";
  const a = after ?? "";
  const beforeHash = fingerprintAgreementBody(b);
  const afterHash = fingerprintAgreementBody(a);
  if (b === a) {
    return {
      identical: true,
      beforeLen: b.length,
      afterLen: a.length,
      beforeHash,
      afterHash,
      firstChangeOffset: -1,
      segments: [],
    };
  }
  const maxLen = Math.max(b.length, a.length);
  let first = 0;
  while (first < maxLen && b.charCodeAt(first) === a.charCodeAt(first)) {
    first += 1;
  }
  let bEnd = b.length;
  let aEnd = a.length;
  while (bEnd > first && aEnd > first && b.charCodeAt(bEnd - 1) === a.charCodeAt(aEnd - 1)) {
    bEnd -= 1;
    aEnd -= 1;
  }
  const segments: ByteLevelCorpusDiffSegment[] = [];
  if (first > 0) {
    segments.push({
      kind: "equal",
      beforeOffset: 0,
      afterOffset: 0,
      beforeText: b.slice(0, first),
      afterText: a.slice(0, first),
    });
  }
  const removed = b.slice(first, bEnd);
  const inserted = a.slice(first, aEnd);
  if (removed && inserted) {
    segments.push({
      kind: "replace",
      beforeOffset: first,
      afterOffset: first,
      beforeText: removed,
      afterText: inserted,
    });
  } else if (removed) {
    segments.push({
      kind: "remove",
      beforeOffset: first,
      afterOffset: first,
      beforeText: removed,
      afterText: "",
    });
  } else if (inserted) {
    segments.push({
      kind: "insert",
      beforeOffset: first,
      afterOffset: first,
      beforeText: "",
      afterText: inserted,
    });
  }
  return {
    identical: false,
    beforeLen: b.length,
    afterLen: a.length,
    beforeHash,
    afterHash,
    firstChangeOffset: first,
    segments,
  };
}

export function formatByteLevelCorpusDiffReport(diff: ByteLevelCorpusDiff): string {
  if (diff.identical) return "identical:true";
  const lines: string[] = [
    `firstChangeOffset:${diff.firstChangeOffset}`,
    `beforeLen:${diff.beforeLen} afterLen:${diff.afterLen}`,
    `beforeHash:${diff.beforeHash}`,
    `afterHash:${diff.afterHash}`,
  ];
  for (const seg of diff.segments) {
    if (seg.kind === "equal") continue;
    if (seg.kind === "remove") {
      lines.push("Removed:", JSON.stringify(seg.beforeText));
      lines.push(`Removed byte count: ${seg.beforeText.length}`);
      lines.push(`Location: offset ${seg.beforeOffset}`);
    } else if (seg.kind === "insert") {
      lines.push("Inserted:", JSON.stringify(seg.afterText));
      lines.push(`Inserted byte count: ${seg.afterText.length}`);
      lines.push(`Location: offset ${seg.afterOffset}`);
    } else {
      lines.push("Removed:", JSON.stringify(seg.beforeText));
      lines.push("Inserted:", JSON.stringify(seg.afterText));
      lines.push(`Location: offset ${seg.beforeOffset}`);
    }
  }
  return lines.join("\n");
}

export function recordPostFreezeCorpusBoundary(args: {
  surface: string;
  renderedText: string;
  mutationSource?: PaidProPostFreezeMutationSource;
  frozenHash?: string | null;
}): PostFreezeCorpusBoundaryRecord {
  const rendered = trimCorpus(args.renderedText);
  const frozenHash = args.frozenHash ?? resolvePaidProFrozenAuthoritativeHash();
  const renderedHash = hashPaidProCorpus(rendered);
  const { head, tail } = corpusHeadTail(rendered);
  const record: PostFreezeCorpusBoundaryRecord = {
    at: Date.now(),
    surface: args.surface,
    mutationSource: args.mutationSource ?? "unknown",
    len: rendered.length,
    hash: renderedHash,
    head,
    tail,
    identicalToFrozen: Boolean(frozenHash && frozenHash === renderedHash),
  };
  boundaryRing.push(record);
  if (boundaryRing.length > BOUNDARY_RING_MAX) {
    boundaryRing.splice(0, boundaryRing.length - BOUNDARY_RING_MAX);
  }
  return record;
}

export function readPostFreezeCorpusBoundaryTimeline(): readonly PostFreezeCorpusBoundaryRecord[] {
  return [...boundaryRing];
}

export function clearPostFreezeCorpusBoundaryTimelineForTests(): void {
  boundaryRing.length = 0;
}

/**
 * Hard invariant: rendered plain must match frozen hash unless signer hydration is declared.
 */
export function assertPostFreezeRenderedCorpusMatchesFrozen(args: {
  surface: string;
  renderedText: string;
  mutationSource?: PaidProPostFreezeMutationSource;
  frozenHash?: string | null;
  frozenPlain?: string | null;
}): void {
  if (!hasPaidProSourceOfTruth() && !getFrozenCanonicalAgreementCorpus()) return;
  const rendered = trimCorpus(args.renderedText);
  if (rendered.length < 200) return;

  const frozenPlain = args.frozenPlain ?? resolvePaidProFrozenAuthoritativePlain();
  const frozenHash = args.frozenHash ?? resolvePaidProFrozenAuthoritativeHash();
  if (!frozenHash || !frozenPlain) return;

  const renderedHash = hashPaidProCorpus(rendered);
  if (renderedHash === frozenHash) return;

  const mutationSource = args.mutationSource ?? "unknown";
  const classification = classifyPostFreezeCorpusMutation({
    mutationSource,
    before: frozenPlain,
    after: rendered,
  });
  if (
    classification === "signer_hydration" ||
    classification === "display_html" ||
    classification === "canonical_refreeze" ||
    mutationSource === "signer_identity_apply" ||
    isPostFreezeAuthorizedSignerOverlayDrift(frozenPlain, rendered)
  ) {
    return;
  }

  const diff = computeByteLevelCorpusDiff(frozenPlain, rendered);
  const report = formatByteLevelCorpusDiffReport(diff);
  const msg = `[paid-pro-post-freeze-corpus-violation] surface=${args.surface} classification=${classification} mutationSource=${mutationSource}\n${report}`;

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    throw new Error(msg);
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.error(msg);
  }
}
