import { fingerprintAgreementBody } from "../../guidedDealCompletion/guidedSigningPacketVersion";
import { hashPaidProCorpus } from "../../paidProSourceOfTruth";
import {
  countSignatureBlockHeadingsInTail,
  countSignatureExecutionLinesInTail,
  signaturePatchStartIndex,
} from "../../guidedDealCompletion/signatureRegion";

export type PaidProSurfaceLabel =
  | "sourceOfTruth"
  | "reviewRenderPlain"
  | "copyToClipboard"
  | "signerSetupCorpus"
  | "hydratedCorpus"
  | "finalAcceptedCorpus";

export type PaidProCorpusLineCounts = {
  clientHeading: number;
  serviceProviderHeading: number;
  byLine: number;
  nameLine: number;
  dateLine: number;
};

export type PaidProCompleteSignatureSections = {
  clientWithBy: number;
  serviceProviderWithBy: number;
  witnessBlocks: number;
  legacyEntitySignatureLines: number;
  signatureBlockHeadings: number;
  signatureExecutionLines: number;
};

export type PaidProSurfaceCorpusMetrics = {
  surface: PaidProSurfaceLabel;
  len: number;
  hash: string;
  fingerprint: string;
  lineCounts: PaidProCorpusLineCounts;
  signatureSections: PaidProCompleteSignatureSections;
};

const LEGACY_ENTITY_INLINE_SIGNATURE_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited)\s+Signature:\s*_{1,}\s*Date:\s*_{1,}/gi;

export function corpusFingerprint(text: string): string {
  return fingerprintAgreementBody((text || "").replace(/\r\n/g, "\n").trim());
}

export function corpusDisplayHash(text: string): string {
  const normalized = (text || "").replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return "empty";
  return hashPaidProCorpus(normalized);
}

export function countCorpusLineMarkers(text: string): PaidProCorpusLineCounts {
  const body = (text || "").replace(/\r\n/g, "\n");
  const tailStart = signaturePatchStartIndex(body);
  const scan = tailStart >= 0 ? body.slice(tailStart) : body;
  return {
    clientHeading: (scan.match(/^\s*CLIENT\s*:/gim) || []).length,
    serviceProviderHeading: (scan.match(/^\s*SERVICE\s+PROVIDER\s*:/gim) || []).length,
    byLine: (scan.match(/^\s*By\s*:/gim) || []).length,
    nameLine: (scan.match(/^\s*Name\s*:/gim) || []).length,
    dateLine: (scan.match(/^\s*Date\s*:/gim) || []).length,
  };
}

export function analyzeCompleteSignatureSections(text: string): PaidProCompleteSignatureSections {
  const body = (text || "").replace(/\r\n/g, "\n");
  const tailStart = signaturePatchStartIndex(body);
  const tail = tailStart >= 0 ? body.slice(tailStart) : body.slice(Math.floor(body.length * 0.72));
  const chunks = tail.split(/\n(?=\s*(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:)/i).filter((c) => c.trim());
  let clientWithBy = 0;
  let serviceProviderWithBy = 0;
  for (const chunk of chunks) {
    const hasBy = /\bBy\s*:/i.test(chunk);
    if (!hasBy) continue;
    if (/^\s*CLIENT\s*:/im.test(chunk)) clientWithBy += 1;
    if (/^\s*SERVICE\s+PROVIDER\s*:/im.test(chunk)) serviceProviderWithBy += 1;
  }
  LEGACY_ENTITY_INLINE_SIGNATURE_RE.lastIndex = 0;
  return {
    clientWithBy,
    serviceProviderWithBy,
    witnessBlocks: (body.match(/\bIN WITNESS WHEREOF\b/gi) || []).length,
    legacyEntitySignatureLines: (tail.match(LEGACY_ENTITY_INLINE_SIGNATURE_RE) || []).length,
    signatureBlockHeadings: countSignatureBlockHeadingsInTail(body),
    signatureExecutionLines: countSignatureExecutionLinesInTail(body),
  };
}

export function buildSurfaceMetrics(
  surface: PaidProSurfaceLabel,
  text: string,
): PaidProSurfaceCorpusMetrics {
  const normalized = (text || "").replace(/\r\n/g, "\n").trimEnd();
  return {
    surface,
    len: normalized.length,
    hash: corpusDisplayHash(normalized),
    fingerprint: corpusFingerprint(normalized),
    lineCounts: countCorpusLineMarkers(normalized),
    signatureSections: analyzeCompleteSignatureSections(normalized),
  };
}

export function normalizeCorpusForCopyCompare(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function diffNormalizedCorpora(a: string, b: string): string | null {
  const left = normalizeCorpusForCopyCompare(a);
  const right = normalizeCorpusForCopyCompare(b);
  if (left === right) return null;
  let idx = 0;
  while (idx < left.length && idx < right.length && left[idx] === right[idx]) idx += 1;
  const context = 80;
  return [
    `first_diff_at=${idx}`,
    `left_len=${left.length}`,
    `right_len=${right.length}`,
    `left_snip=${JSON.stringify(left.slice(Math.max(0, idx - context), idx + context))}`,
    `right_snip=${JSON.stringify(right.slice(Math.max(0, idx - context), idx + context))}`,
  ].join("\n");
}

export function assertNoDuplicateCompleteSignatureSections(
  metrics: PaidProSurfaceCorpusMetrics,
  expectedParties = 2,
): string[] {
  const issues: string[] = [];
  const { signatureSections: s } = metrics;
  if (s.clientWithBy > 1) {
    issues.push(`${metrics.surface}: ${s.clientWithBy} complete CLIENT signature sections (max 1)`);
  }
  if (s.serviceProviderWithBy > 1) {
    issues.push(
      `${metrics.surface}: ${s.serviceProviderWithBy} complete SERVICE PROVIDER signature sections (max 1)`,
    );
  }
  if (expectedParties === 2 && s.signatureBlockHeadings > 2) {
    issues.push(
      `${metrics.surface}: ${s.signatureBlockHeadings} labeled signature headings (expected ≤2)`,
    );
  }
  if (s.witnessBlocks > 1) {
    issues.push(`${metrics.surface}: ${s.witnessBlocks} IN WITNESS WHEREOF blocks`);
  }
  if (s.legacyEntitySignatureLines > 0) {
    issues.push(
      `${metrics.surface}: ${s.legacyEntitySignatureLines} legacy entity Signature/Date tail line(s)`,
    );
  }
  return issues;
}

/** Surfaces that must be byte-identical for user-visible parity (review screen = copy = signer setup). */
export const PAID_PRO_USER_VISIBLE_PARITY_SURFACES: readonly PaidProSurfaceLabel[] = [
  "reviewRenderPlain",
  "copyToClipboard",
  "signerSetupCorpus",
];

/** Captured for audit; hydratedCorpus aligns with review when signer metadata is complete. */
export const PAID_PRO_INFORMATIONAL_SURFACE_SURFACES: readonly PaidProSurfaceLabel[] = [
  "sourceOfTruth",
  "hydratedCorpus",
  "finalAcceptedCorpus",
];

export function compareSurfaceMetrics(
  surfaces: readonly PaidProSurfaceCorpusMetrics[],
): {
  report: Record<string, unknown>;
  duplicateSectionIssues: string[];
  unexpectedHashDrift: string[];
  informationalHashDrift: string[];
} {
  const bySurface = Object.fromEntries(surfaces.map((m) => [m.surface, m]));
  const duplicateSectionIssues = surfaces.flatMap((m) => assertNoDuplicateCompleteSignatureSections(m));
  const reviewHash = surfaces.find((m) => m.surface === "reviewRenderPlain")?.hash;
  const unexpectedHashDrift: string[] = [];
  const informationalHashDrift: string[] = [];
  if (reviewHash) {
    for (const m of surfaces) {
      if (m.hash === reviewHash) continue;
      const line = `${m.surface} hash ${m.hash} !== review ${reviewHash}`;
      if (PAID_PRO_USER_VISIBLE_PARITY_SURFACES.includes(m.surface)) {
        unexpectedHashDrift.push(line);
      } else if (PAID_PRO_INFORMATIONAL_SURFACE_SURFACES.includes(m.surface)) {
        informationalHashDrift.push(line);
      }
    }
  }
  return {
    report: {
      surfaces: bySurface,
      signatureBlockHeadings: Object.fromEntries(
        surfaces.map((m) => [m.surface, m.signatureSections.signatureBlockHeadings]),
      ),
      completeSections: Object.fromEntries(
        surfaces.map((m) => [
          m.surface,
          {
            client: m.signatureSections.clientWithBy,
            serviceProvider: m.signatureSections.serviceProviderWithBy,
          },
        ]),
      ),
      lineCounts: Object.fromEntries(surfaces.map((m) => [m.surface, m.lineCounts])),
      hashes: Object.fromEntries(surfaces.map((m) => [m.surface, m.hash])),
      informationalHashDrift,
    },
    duplicateSectionIssues,
    unexpectedHashDrift,
    informationalHashDrift,
  };
}
