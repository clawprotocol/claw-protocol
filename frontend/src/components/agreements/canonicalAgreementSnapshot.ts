import { applyProCorpusIntegrity, type ProCorpusIntegrityReport } from "./proCorpusIntegrity";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import { validateProFullAgreementCandidate } from "./proFullAgreementCandidate";
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
  archetype: string;
  parties: CanonicalAgreementSnapshotParty[];
  semanticFacts: GuidedSemanticFacts;
  canonicalText: string;
  signerState: CanonicalAgreementSignerState;
  integrityReport: ProCorpusIntegrityReport | null;
  source: CanonicalAgreementSnapshotSource;
  hash: string;
  len: number;
  integrityOk: boolean;
  placeholderIssues: string[];
  blockerIssues: string[];
  commercialSpecificity: CommercialSpecificityScore;
  frozen: boolean;
};

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
};

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
  };
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
  const parties = (args.parties ?? []).map(normalizeParty).filter(Boolean) as CanonicalAgreementSnapshotParty[];
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
    } else {
      const fullCandidate = validateProFullAgreementCandidate(canonicalText, {
        intakeText: args.intakeText,
        semanticFacts,
        canonicalPartyNames: partyNames,
      });
      if (fullCandidate.ok) {
        const stabilized = stabilizeFinalAgreementCompilerOutput(canonicalText, {
          intakeText: args.intakeText,
          surface: `${args.surface}:full_candidate_snapshot`,
        });
        canonicalText = stabilized.text.trim();
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
    (args.tier === "starter" || commercialSpecificity.score >= MINIMUM_COMMERCIAL_SPECIFICITY_SCORE) &&
    (args.tier === "starter" || fullCandidateOk || Boolean(integrityReport?.ok));

  const snapshot: CanonicalAgreementSnapshot = {
    archetype: integrityReport?.archetype ?? "starter",
    parties,
    semanticFacts,
    canonicalText,
    signerState,
    integrityReport,
    source: selected.source,
    hash: fingerprintAgreementBody(canonicalText),
    len: canonicalText.length,
    integrityOk,
    placeholderIssues: signatureMissing ? [...placeholderIssues, "missing_signer_blocks"] : placeholderIssues,
    blockerIssues,
    commercialSpecificity,
    frozen: false,
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
    frozen: true,
    hash: fingerprintAgreementBody(snapshot.canonicalText),
    len: snapshot.canonicalText.length,
  };
  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[canonical-corpus-frozen]", {
      hash: frozen.hash,
      len: frozen.len,
      source: frozen.source,
    });
  }
  return frozen;
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
