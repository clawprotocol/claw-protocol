/**
 * Session memo for review plain + readonly HTML — one build per stable visible plain hash.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { getAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { readPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";

const plainByKey = new Map<string, string>();
const htmlByKey = new Map<string, string>();

function signerOverlayEpoch(): string {
  const snap = getAuthoritativeSigningSnapshot()?.hash;
  if (snap) return `snap:${snap}`;
  const pin = readPaidProPinnedSignerAppliedCorpus().trim();
  if (pin.length >= 500) return `pin:${hashPaidProCorpus(pin)}`;
  const auth = readConsumedPaidProSignerMetadataAuthority()?.hash;
  if (auth) return `auth:${auth}`;
  return "none";
}

export function buildPaidProReviewPlainMemoKey(seedPlain: string, surface: string): string {
  const t = (seedPlain || "").trim();
  const corpusHash = t.length >= 80 ? hashPaidProCorpus(t) : t.length > 0 ? `len:${t.length}` : "empty";
  return `plain|${corpusHash}|${signerOverlayEpoch()}|${surface}`;
}

export function buildPaidProReadonlyHtmlMemoKey(
  plain: string,
  optsKey: string,
): string {
  const t = (plain || "").trim();
  const corpusHash = t.length >= 80 ? hashPaidProCorpus(t) : t.length > 0 ? `len:${t.length}` : "empty";
  return `html|${corpusHash}|${signerOverlayEpoch()}|${optsKey}`;
}

export function readMemoizedPaidProReviewPlain(key: string): string | null {
  const hit = plainByKey.get(key);
  return hit ?? null;
}

export function writeMemoizedPaidProReviewPlain(key: string, plain: string): void {
  plainByKey.set(key, plain);
}

export function readMemoizedPaidProReadonlyHtml(key: string): string | null {
  const hit = htmlByKey.get(key);
  return hit ?? null;
}

export function writeMemoizedPaidProReadonlyHtml(key: string, html: string): void {
  htmlByKey.set(key, html);
}

export function buildPremiumReadonlyHtmlOptsFingerprint(opts: {
  signatureSectionMode?: string;
  suppressCorpusEmbeddedSignatureForDisplay?: boolean;
  forceEmbeddedCorpusSignature?: boolean;
}): string {
  return [
    opts.signatureSectionMode ?? "default",
    opts.suppressCorpusEmbeddedSignatureForDisplay ? "suppressSig" : "showSig",
    opts.forceEmbeddedCorpusSignature ? "forceEmb" : "noForce",
  ].join("|");
}

export function clearPaidProVisibleRenderMemo(): void {
  plainByKey.clear();
  htmlByKey.clear();
}

export function clearPaidProVisibleRenderMemoForTests(): void {
  clearPaidProVisibleRenderMemo();
}
