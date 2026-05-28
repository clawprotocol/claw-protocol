import { applyProCorpusIntegrity, type ProCorpusIntegrityReport } from "./proCorpusIntegrity";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";
import {
  repairProFullAgreementCandidateSurgically,
  validateProFullAgreementCandidate,
} from "./proFullAgreementCandidate";
import {
  extractGuidedSemanticFacts,
  type GuidedSemanticFacts,
} from "./guidedDealCompletion/guidedAnswerSemanticMerger";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import type { GuidedCompletionSession } from "./guidedDealCompletion/types";
import {
  MINIMUM_COMMERCIAL_SPECIFICITY_SCORE,
  logCommercialSpecificityScore,
  scoreCommercialSpecificity,
  type CommercialSpecificityScore,
} from "./commercialSpecificity";
import {
  logCanonicalPartyIdentityPreserved,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";

export type CanonicalAgreementSnapshotSource =
  | "free_starter"
  | "canonical_working_draft"
  | "finalized_signer_applied_guided_corpus"
  | "finalized_guided_corpus"
  | "finalized_signing"
  | "accepted_review"
  | "authoritative_snapshot"
  | "hydrated_premium_with_signers"
  | "hydrated_premium"
  | "server_full_document_text"
  | "last_known_good_authoritative"
  | "agreement_document"
  | "picker_authoritative"
  | "last_accepted_premium_candidate"
  | "rendered_preview"
  | "draft_fallback"
  | "none";

export type CanonicalAgreementSnapshotParty = {
  name: string;
  role?: string | null;
  email?: string | null;
  partyAddress?: string | null;
};

export type CanonicalAgreementSignerState = {
  complete: boolean;
  signerCount: number;
  requireSignerBlocks?: boolean;
};

export type CanonicalAgreementSnapshotCandidate = {
  source: CanonicalAgreementSnapshotSource;
  text: string | null | undefined;
};

export type CanonicalAgreementSnapshot = {
  tier: "starter" | "pro";
  archetype: string;
  parties: CanonicalAgreementSnapshotParty[];
  semanticFacts: GuidedSemanticFacts;
  canonicalText: string;
  bodyText: string;
  bodyHtml: string;
  signerState: CanonicalAgreementSignerState;
  signerManifest: CanonicalAgreementSnapshotParty[];
  signerManifestHash: string;
  sectionGraph: CanonicalAgreementSectionMetadata[];
  integrityReport: ProCorpusIntegrityReport | null;
  source: CanonicalAgreementSnapshotSource;
  sourceLabel: CanonicalAgreementSnapshotSource | string;
  hash: string;
  len: number;
  integrityOk: boolean;
  placeholderIssues: string[];
  blockerIssues: string[];
  commercialSpecificity: CommercialSpecificityScore;
  frozen: boolean;
  generatedAt: number;
  reviewSessionId: string;
};

export type AuthoritativeCorpusInvariantResult = {
  reviewHash: string | null;
  signerHash: string | null;
  reviewerHash: string | null;
  canonicalHash: string | null;
  invariantOk: boolean;
};

export type CanonicalAgreementSectionMetadata = {
  index: number;
  title: string;
  startOffset: number;
};

export type CanonicalAgreementSurface =
  | "review"
  | "reviewer"
  | "readonly"
  | "handoff"
  | "vs01"
  | "signing_prep"
  | "export"
  | "copy"
  | "display"
  | "finalized";

export type BuildCanonicalAgreementSnapshotArgs = {
  surface: string;
  tier: "starter" | "pro";
  candidates: readonly CanonicalAgreementSnapshotCandidate[];
  intakeText?: string | null;
  guidedSession?: GuidedCompletionSession | null;
  semanticFacts?: GuidedSemanticFacts | null;
  parties?: readonly CanonicalAgreementSnapshotParty[];
  signerState?: Partial<CanonicalAgreementSignerState> | null;
  frozenSnapshot?: CanonicalAgreementSnapshot | null;
  minLen?: number;
  generatedAt?: number;
  reviewSessionId?: string | null;
};

let frozenCanonicalAgreementCorpus: CanonicalAgreementSnapshot | null = null;

const PRESERVE_CORPUS_SOURCES = new Set<CanonicalAgreementSnapshotSource>([
  "finalized_signer_applied_guided_corpus",
  "finalized_signing",
  "accepted_review",
  "authoritative_snapshot",
]);

const SOURCE_PRIORITY: readonly CanonicalAgreementSnapshotSource[] = [
  "finalized_signer_applied_guided_corpus",
  "finalized_signing",
  "accepted_review",
  "authoritative_snapshot",
  "canonical_working_draft",
  "hydrated_premium_with_signers",
  "finalized_guided_corpus",
  "hydrated_premium",
  "last_known_good_authoritative",
  "agreement_document",
  "picker_authoritative",
  "server_full_document_text",
  "last_accepted_premium_candidate",
  "free_starter",
  "rendered_preview",
  "draft_fallback",
  "none",
];

const BLOCKER_TEXT_RE =
  /\b(?:Final review needs another pass|guided_corpus_finalize_failed|missingState|Try again|needs your attention|final agreement snapshot is not ready)\b/i;

const HARD_PLACEHOLDER_RE =
  /\[(?:ORG|PERSON|ADDRESS|PARTY|ENTITY|CLIENT|PROVIDER|COMPANY|ORGANIZATION)[_\s-]*\d*\]|\bparty[_\s-]?[ab]\b|\bparty\s+[ab]\b|\b(?:party|org|person|address)[_\s-]+\d+\b/i;

function priority(source: CanonicalAgreementSnapshotSource): number {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx >= 0 ? idx : SOURCE_PRIORITY.length;
}

function normalizeParty(party: CanonicalAgreementSnapshotParty): CanonicalAgreementSnapshotParty | null {
  const name = String(party.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return {
    name,
    role: party.role ? String(party.role).trim() : null,
    email: party.email ? String(party.email).trim() : null,
    partyAddress: party.partyAddress ? String(party.partyAddress).trim() : null,
  };
}

function preserveCanonicalLegalParties(args: {
  parties: CanonicalAgreementSnapshotParty[];
  intakeText?: string | null;
  generatedBody?: string | null;
  surface: string;
}): CanonicalAgreementSnapshotParty[] {
  const roles = args.parties.map((party) => party.role || "");
  const records = resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: args.intakeText,
    generatedBody: args.generatedBody,
    starterNames: args.parties.map((party) => party.name),
    roleLabels: roles,
    source: "canonical_snapshot_sources",
    surface: args.surface,
  });
  if (records.length < 2) return args.parties;
  return args.parties.map((party, index) => {
    const record = records[index];
    if (!record?.fullLegalName) return party;
    logCanonicalPartyIdentityPreserved({
      canonicalLegalName: record.fullLegalName,
      shortDisplayName: record.displayAlias && record.displayAlias !== record.fullLegalName ? record.displayAlias : null,
      source: "canonical_snapshot",
      surface: args.surface,
    });
    return {
      ...party,
      name: record.fullLegalName,
      role: party.role || record.roleLabel,
      partyAddress: party.partyAddress || record.partyAddress || null,
    };
  });
}

function collectPlaceholderIssues(text: string): string[] {
  const issues = new Set<string>();
  if (HARD_PLACEHOLDER_RE.test(text)) issues.add("unresolved_identity_or_address_placeholder");
  if (/\[[A-Z][A-Z0-9_\s-]{2,}\]/.test(text)) issues.add("unresolved_bracket_token");
  return [...issues];
}

function collectBlockerIssues(text: string): string[] {
  return BLOCKER_TEXT_RE.test(text) ? ["blocker_text_in_corpus"] : [];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyHtmlFromPlainText(text: string): string {
  return `<article data-canonical-agreement-corpus="true"><pre>${escapeHtml(text)}</pre></article>`;
}

function collectSectionGraph(text: string): CanonicalAgreementSectionMetadata[] {
  const sections: CanonicalAgreementSectionMetadata[] = [];
  const re = /^(?:\s*(?:\d+[\.)]|[A-Z][A-Z\s]{3,}:)\s*)(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && sections.length < 80) {
    const title = (match[1] || match[0] || "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    sections.push({ index: sections.length, title, startOffset: match.index });
  }
  return sections;
}

function reviewSessionIdFor(hash: string, explicit?: string | null): string {
  const raw = (explicit || "").trim();
  return raw || `review-${hash}`;
}

function selectCandidate(
  candidates: readonly CanonicalAgreementSnapshotCandidate[],
): CanonicalAgreementSnapshotCandidate {
  return [...candidates]
    .map((candidate) => ({
      source: candidate.source,
      text: (candidate.text || "").trim(),
    }))
    .filter((candidate) => candidate.text.length > 0)
    .sort((a, b) => priority(a.source) - priority(b.source) || b.text.length - a.text.length)[0] ?? {
    source: "none",
    text: "",
  };
}

export function buildCanonicalAgreementSnapshot(
  args: BuildCanonicalAgreementSnapshotArgs,
): CanonicalAgreementSnapshot {
  if (args.frozenSnapshot?.canonicalText && args.frozenSnapshot.integrityOk) {
    logCanonicalSnapshotSelected(args.frozenSnapshot, args.surface);
    return args.frozenSnapshot;
  }

  const selected = selectCandidate(args.candidates);
  const normalizedParties = (args.parties ?? []).map(normalizeParty).filter(Boolean) as CanonicalAgreementSnapshotParty[];
  const parties = preserveCanonicalLegalParties({
    parties: normalizedParties,
    intakeText: args.intakeText,
    generatedBody: selected.text,
    surface: args.surface,
  });
  const partyNames = parties.map((p) => p.name);
  const semanticFacts =
    args.semanticFacts ?? extractGuidedSemanticFacts(args.guidedSession ?? null, args.intakeText ?? "");
  const signerState: CanonicalAgreementSignerState = {
    complete: Boolean(args.signerState?.complete),
    signerCount: args.signerState?.signerCount ?? partyNames.length,
    requireSignerBlocks: Boolean(args.signerState?.requireSignerBlocks),
  };

  let canonicalText = selected.text || "";
  let integrityReport: ProCorpusIntegrityReport | null = null;
  let fullCandidateOk = false;
  if (canonicalText) {
    if (args.tier === "starter") {
      const repaired = repairAgreementTemplatePlaceholders(canonicalText, {
        intakeRaw: args.intakeText ?? "",
        partyNames,
      });
      canonicalText = repaired.text.trim();
    } else if (PRESERVE_CORPUS_SOURCES.has(selected.source)) {
      fullCandidateOk = true;
    } else {
      let fullCandidate = validateProFullAgreementCandidate(canonicalText, {
        intakeText: args.intakeText,
        semanticFacts,
        canonicalPartyNames: partyNames,
      });
      if (!fullCandidate.ok) {
        const repairedFullCandidate = repairProFullAgreementCandidateSurgically(canonicalText, {
          intakeText: args.intakeText,
          semanticFacts,
          canonicalPartyNames: partyNames,
        });
        if (repairedFullCandidate.repairs.length > 0) {
          const repairedValidation = validateProFullAgreementCandidate(repairedFullCandidate.text, {
            intakeText: args.intakeText,
            semanticFacts,
            canonicalPartyNames: partyNames,
          });
          if (repairedValidation.ok) {
            canonicalText = repairedFullCandidate.text;
            fullCandidate = repairedValidation;
          }
        }
      }
      if (fullCandidate.ok) {
        fullCandidateOk = true;
      } else {
        const integrity = applyProCorpusIntegrity(canonicalText, {
          intakeText: args.intakeText,
          semanticFacts,
          canonicalPartyNames: partyNames,
          surface: args.surface,
        });
        canonicalText = integrity.text.trim();
        integrityReport = integrity.report;
      }
    }
  }

  const placeholderIssues = collectPlaceholderIssues(canonicalText);
  const blockerIssues = collectBlockerIssues(canonicalText);
  const commercialSpecificity =
    integrityReport?.commercialSpecificity ??
    scoreCommercialSpecificity(`${args.intakeText ?? ""}\n${Object.values(semanticFacts.facts ?? {}).join("\n")}`, canonicalText);
  logCommercialSpecificityScore({
    score: commercialSpecificity,
    normalizationMode: "soft",
    surface: args.surface,
  });
  const minLen = args.minLen ?? (args.tier === "pro" ? 1500 : 300);
  const signatureMissing =
    signerState.requireSignerBlocks &&
    signerState.signerCount >= 2 &&
    !/\bIN WITNESS WHEREOF\b/i.test(canonicalText);
  const integrityOk =
    canonicalText.length >= minLen &&
    placeholderIssues.length === 0 &&
    blockerIssues.length === 0 &&
    !signatureMissing &&
    (args.tier === "starter" || fullCandidateOk || commercialSpecificity.score >= MINIMUM_COMMERCIAL_SPECIFICITY_SCORE) &&
    (args.tier === "starter" || fullCandidateOk || Boolean(integrityReport?.ok));

  const snapshot: CanonicalAgreementSnapshot = {
    archetype: integrityReport?.archetype ?? "starter",
    tier: args.tier,
    parties,
    semanticFacts,
    canonicalText,
    bodyText: canonicalText,
    bodyHtml: bodyHtmlFromPlainText(canonicalText),
    signerState,
    signerManifest: parties,
    signerManifestHash: fingerprintAgreementBody(JSON.stringify(parties)),
    sectionGraph: collectSectionGraph(canonicalText),
    integrityReport,
    source: selected.source,
    sourceLabel: selected.source,
    hash: fingerprintAgreementBody(canonicalText),
    len: canonicalText.length,
    integrityOk,
    placeholderIssues: signatureMissing ? [...placeholderIssues, "missing_signer_blocks"] : placeholderIssues,
    blockerIssues,
    commercialSpecificity,
    frozen: false,
    generatedAt: args.generatedAt ?? Date.now(),
    reviewSessionId: reviewSessionIdFor(fingerprintAgreementBody(canonicalText), args.reviewSessionId),
  };
  logCanonicalSnapshotSelected(snapshot, args.surface);
  return snapshot;
}

export function freezeCanonicalAgreementSnapshot(
  snapshot: CanonicalAgreementSnapshot,
  source = snapshot.source,
): CanonicalAgreementSnapshot | null {
  if (!snapshot.integrityOk || !snapshot.canonicalText.trim()) return null;
  const frozen = {
    ...snapshot,
    source,
    sourceLabel: source,
    frozen: true,
    hash: fingerprintAgreementBody(snapshot.canonicalText),
    len: snapshot.canonicalText.length,
    bodyText: snapshot.canonicalText,
    bodyHtml: bodyHtmlFromPlainText(snapshot.canonicalText),
    signerManifest: snapshot.signerManifest.length ? snapshot.signerManifest : snapshot.parties,
    signerManifestHash: fingerprintAgreementBody(
      JSON.stringify(snapshot.signerManifest.length ? snapshot.signerManifest : snapshot.parties),
    ),
    sectionGraph: snapshot.sectionGraph.length ? snapshot.sectionGraph : collectSectionGraph(snapshot.canonicalText),
  };
  frozenCanonicalAgreementCorpus = frozen;
  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[canonical-corpus-freeze]", {
      hash: frozen.hash,
      len: frozen.len,
      source: frozen.source,
      reviewSessionId: frozen.reviewSessionId,
      signerManifestHash: frozen.signerManifestHash,
    });
  }
  return frozen;
}

export function clearFrozenCanonicalAgreementCorpus(): void {
  frozenCanonicalAgreementCorpus = null;
}

export function getFrozenCanonicalAgreementCorpus(): CanonicalAgreementSnapshot | null {
  return frozenCanonicalAgreementCorpus;
}

export function hasFrozenCanonicalAgreementCorpus(): boolean {
  return Boolean(frozenCanonicalAgreementCorpus?.frozen && frozenCanonicalAgreementCorpus.canonicalText.trim());
}

export function readCanonicalAgreementCorpusForSurface(
  surface: CanonicalAgreementSurface,
  opts?: { required?: boolean; tier?: "starter" | "pro" },
): CanonicalAgreementSnapshot | null {
  const corpus = getFrozenCanonicalAgreementCorpus();
  if (corpus?.frozen && corpus.canonicalText.trim() && (!opts?.tier || corpus.tier === opts.tier)) {
    logCanonicalSurfaceRead(surface, corpus);
    return corpus;
  }
  if (opts?.required) {
    const payload = {
      surface,
      error: "canonical_corpus_missing_after_review_ready",
    };
    // eslint-disable-next-line no-console
    console.error("[canonical-corpus-missing]", payload);
    throw new Error(`Canonical agreement corpus is missing for ${surface}`);
  }
  return null;
}

export function assertPostCanonicalSurfaceUsesFrozenCorpus(args: {
  surface: CanonicalAgreementSurface;
  text: string | null | undefined;
  source: string;
}): void {
  const corpus = getFrozenCanonicalAgreementCorpus();
  if (!corpus?.frozen) return;
  const actual = (args.text || "").trim();
  const actualHash = fingerprintAgreementBody(actual);
  if (actualHash === corpus.hash) {
    logCanonicalSurfaceRead(args.surface, corpus);
    return;
  }
  const payload = {
    surface: args.surface,
    expectedHash: corpus.hash,
    actualHash,
    source: args.source,
  };
  // eslint-disable-next-line no-console
  console.error("[canonical-corpus-surface-drift]", payload);
  throw new Error(`Post-canonical surface ${args.surface} attempted ${args.source}`);
}

export function logCanonicalSurfaceRead(surface: CanonicalAgreementSurface | string, snapshot: CanonicalAgreementSnapshot): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[canonical-surface-read]", {
    surface,
    hash: snapshot.hash,
    source: snapshot.sourceLabel || snapshot.source,
  });
}

export function logAuthoritativeCorpusInvariant(args?: {
  reviewHash?: string | null;
  signerHash?: string | null;
  reviewerHash?: string | null;
  canonicalHash?: string | null;
}): AuthoritativeCorpusInvariantResult {
  const canonical = getFrozenCanonicalAgreementCorpus();
  const canonicalHash = args?.canonicalHash ?? canonical?.hash ?? null;
  const reviewHash = args?.reviewHash ?? canonicalHash;
  const signerHash = args?.signerHash ?? canonicalHash;
  const reviewerHash = args?.reviewerHash ?? canonicalHash;
  const hashes = [reviewHash, signerHash, reviewerHash, canonicalHash].filter(Boolean);
  const invariantOk = Boolean(canonicalHash && hashes.every((hash) => hash === canonicalHash));
  const payload = {
    reviewHash,
    signerHash,
    reviewerHash,
    canonicalHash,
    invariantOk,
  };
  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[authoritative-corpus-invariant]", payload);
  }
  return payload;
}

export function logCanonicalSnapshotSelected(snapshot: CanonicalAgreementSnapshot, surface: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[canonical-snapshot-selected]", {
    source: snapshot.source,
    len: snapshot.len,
    hash: snapshot.hash,
    integrityOk: snapshot.integrityOk,
    surface,
  });
}
