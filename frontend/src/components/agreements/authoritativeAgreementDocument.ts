import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";

export type AuthoritativeAgreementDocument = {
  fullCorpusText: string;
  authoritativeHash: string;
  canonicalPartyManifest: CanonicalAgreementSnapshotParty[];
  agreementMetadata: {
    title?: string | null;
    agreementFamily?: string | null;
    jurisdiction?: string | null;
    reviewSessionId?: string | null;
  };
  generationMetadata: {
    source: "server_full_draft";
    acceptedAt: number;
    pipelineSource?: string | null;
    rawAcceptedLen: number;
  };
  explicitUserEditState: {
    edited: boolean;
    oldHash?: string | null;
    newHash?: string | null;
    editedAt?: number | null;
  };
};

export type AuthoritativeProSurface =
  | "pro_review"
  | "review_route"
  | "send_route"
  | "vs01_signing"
  | "recipient_setup"
  | "signature_prepare";

export type AuthoritativeProLockState = {
  locked: boolean;
  authoritativeText: string;
  authoritativeHash: string;
  reason: "authoritative_document" | "paid_pro_accepted" | "accepted_review_hash" | "unlocked";
};

let authoritativeAgreementDocument: AuthoritativeAgreementDocument | null = null;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function hash(text: string): string {
  return fingerprintAgreementBody(text || "");
}

function cleanManifestPartyName(name: string): string {
  return (name || "")
    .replace(/\s*\((?:"|“)?(?:Client|Service Provider|Provider|Company|Contractor|Party)(?:"|”)?\)\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function isDevOrTest(): boolean {
  return isTestMode() || Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV);
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function establishAuthoritativeAgreementDocument(args: {
  fullCorpusText: string;
  canonicalPartyManifest?: readonly CanonicalAgreementSnapshotParty[] | null;
  agreementMetadata?: AuthoritativeAgreementDocument["agreementMetadata"];
  generationMetadata?: Partial<AuthoritativeAgreementDocument["generationMetadata"]>;
}): AuthoritativeAgreementDocument {
  const text = trim(args.fullCorpusText);
  const doc: AuthoritativeAgreementDocument = {
    fullCorpusText: text,
    authoritativeHash: hash(text),
    canonicalPartyManifest: [...(args.canonicalPartyManifest ?? [])].map((party) => ({
      ...party,
      name: cleanManifestPartyName(party.name),
    })),
    agreementMetadata: args.agreementMetadata ?? {},
    generationMetadata: {
      source: "server_full_draft",
      acceptedAt: args.generationMetadata?.acceptedAt ?? Date.now(),
      pipelineSource: args.generationMetadata?.pipelineSource ?? "server_full_draft",
      rawAcceptedLen: args.generationMetadata?.rawAcceptedLen ?? text.length,
    },
    explicitUserEditState: { edited: false },
  };
  authoritativeAgreementDocument = doc;
  if (isDevOrTest() && !isTestMode()) {
    // eslint-disable-next-line no-console
    console.info("[authoritative-agreement-document-established]", {
      hash: doc.authoritativeHash,
      len: doc.fullCorpusText.length,
      parties: doc.canonicalPartyManifest.length,
      source: doc.generationMetadata.source,
    });
  }
  return doc;
}

export function hydrateAuthoritativeAgreementDocument(args: {
  fullCorpusText: string;
  authoritativeHash?: string | null;
  canonicalPartyManifest?: readonly CanonicalAgreementSnapshotParty[] | null;
  agreementMetadata?: AuthoritativeAgreementDocument["agreementMetadata"];
  acceptedAt?: number | null;
}): AuthoritativeAgreementDocument | null {
  const text = trim(args.fullCorpusText);
  if (text.length < 500) return null;
  const doc = establishAuthoritativeAgreementDocument({
    fullCorpusText: text,
    canonicalPartyManifest: args.canonicalPartyManifest,
    agreementMetadata: args.agreementMetadata,
    generationMetadata: { acceptedAt: args.acceptedAt ?? Date.now(), rawAcceptedLen: text.length },
  });
  const suppliedHash = trim(args.authoritativeHash);
  if (suppliedHash && suppliedHash !== doc.authoritativeHash) {
    logIllegalPostAcceptanceMutationAttempt({
      surface: "hydrate_authoritative_agreement_document",
      mutation: "hash_mismatch",
      attemptedHash: suppliedHash,
      authoritativeHash: doc.authoritativeHash,
    });
  }
  return doc;
}

export function clearAuthoritativeAgreementDocument(): void {
  authoritativeAgreementDocument = null;
}

export function getAuthoritativeAgreementDocument(): AuthoritativeAgreementDocument | null {
  return authoritativeAgreementDocument;
}

export function hasAuthoritativeAgreementDocument(): boolean {
  return Boolean(authoritativeAgreementDocument?.fullCorpusText);
}

export function getAuthoritativeAgreementText(): string {
  return authoritativeAgreementDocument?.fullCorpusText ?? "";
}

export function isAuthoritativeProLocked(args?: {
  paidProAccepted?: boolean | null;
  acceptedReviewHash?: string | null;
}): boolean {
  return Boolean(
    authoritativeAgreementDocument?.fullCorpusText ||
      args?.paidProAccepted ||
      (args?.acceptedReviewHash || "").trim(),
  );
}

export function getAuthoritativeProLockState(args?: {
  paidProAccepted?: boolean | null;
  acceptedReviewHash?: string | null;
}): AuthoritativeProLockState {
  if (authoritativeAgreementDocument?.fullCorpusText) {
    return {
      locked: true,
      authoritativeText: authoritativeAgreementDocument.fullCorpusText,
      authoritativeHash: authoritativeAgreementDocument.authoritativeHash,
      reason: "authoritative_document",
    };
  }
  if (args?.paidProAccepted) {
    return { locked: true, authoritativeText: "", authoritativeHash: "", reason: "paid_pro_accepted" };
  }
  if ((args?.acceptedReviewHash || "").trim()) {
    return {
      locked: true,
      authoritativeText: "",
      authoritativeHash: trim(args?.acceptedReviewHash),
      reason: "accepted_review_hash",
    };
  }
  return { locked: false, authoritativeText: "", authoritativeHash: "", reason: "unlocked" };
}

export function logAuthoritativeCorpusDivergenceBlocked(args: {
  surface: AuthoritativeProSurface;
  source: string;
  renderedText?: string | null;
  renderedHash?: string | null;
  authoritativeHash?: string | null;
  reason?: string | null;
}): void {
  const rendered = trim(args.renderedText);
  // eslint-disable-next-line no-console
  console.error("[authoritative-corpus-divergence-blocked]", {
    surface: args.surface,
    source: args.source,
    renderedLen: rendered.length,
    renderedHash: args.renderedHash ?? (rendered ? hash(rendered) : null),
    authoritativeHash: args.authoritativeHash ?? authoritativeAgreementDocument?.authoritativeHash ?? null,
    authoritativeLen: authoritativeAgreementDocument?.fullCorpusText.length ?? 0,
    reason: args.reason ?? null,
  });
}

export function requireAuthoritativeCorpusForSurface(args: {
  surface: AuthoritativeProSurface;
  source: string;
  renderedText?: string | null;
  paidProAccepted?: boolean | null;
  acceptedReviewHash?: string | null;
  minLen?: number;
}): { ok: true; text: string; hash: string } | { ok: false; reason: string } {
  const lock = getAuthoritativeProLockState({
    paidProAccepted: args.paidProAccepted,
    acceptedReviewHash: args.acceptedReviewHash,
  });
  if (!lock.locked) {
    const rendered = trim(args.renderedText);
    return { ok: true, text: rendered, hash: hash(rendered) };
  }
  if (!lock.authoritativeText || lock.authoritativeText.length < (args.minLen ?? 500)) {
    logAuthoritativeCorpusDivergenceBlocked({
      surface: args.surface,
      source: args.source,
      renderedText: args.renderedText,
      authoritativeHash: lock.authoritativeHash,
      reason: "authoritative_corpus_unavailable",
    });
    return { ok: false, reason: "authoritative_corpus_unavailable" };
  }
  const rendered = trim(args.renderedText);
  if (rendered && hash(rendered) !== lock.authoritativeHash) {
    logAuthoritativeCorpusDivergenceBlocked({
      surface: args.surface,
      source: args.source,
      renderedText: rendered,
      authoritativeHash: lock.authoritativeHash,
      reason: "hash_mismatch",
    });
  }
  return { ok: true, text: lock.authoritativeText, hash: lock.authoritativeHash };
}

export function markAuthoritativeAgreementUserEdited(newText: string): AuthoritativeAgreementDocument | null {
  const current = authoritativeAgreementDocument;
  if (!current) return null;
  const oldHash = current.authoritativeHash;
  const nextText = trim(newText);
  const newHash = hash(nextText);
  authoritativeAgreementDocument = {
    ...current,
    fullCorpusText: nextText,
    authoritativeHash: newHash,
    explicitUserEditState: {
      edited: true,
      oldHash,
      newHash,
      editedAt: Date.now(),
    },
  };
  // eslint-disable-next-line no-console
  console.info("[user-edited-authoritative-corpus]", { oldHash, newHash });
  return authoritativeAgreementDocument;
}

export function logIllegalPostAcceptanceMutationAttempt(payload: {
  surface: string;
  mutation: string;
  attemptedHash?: string | null;
  authoritativeHash?: string | null;
  attemptedLen?: number | null;
  authoritativeLen?: number | null;
}): void {
  const body = {
    ...payload,
    authoritativeHash: payload.authoritativeHash ?? authoritativeAgreementDocument?.authoritativeHash ?? null,
    authoritativeLen: payload.authoritativeLen ?? authoritativeAgreementDocument?.fullCorpusText.length ?? null,
  };
  // eslint-disable-next-line no-console
  console.error("[illegal-post-acceptance-mutation-attempt]", body);
}

export function assertNoPostAcceptanceStructuralMutation(args: {
  surface: string;
  mutation: string;
  inputText: string;
  outputText: string;
  allowUserEdit?: boolean;
}): void {
  const doc = authoritativeAgreementDocument;
  if (!doc || args.allowUserEdit || doc.explicitUserEditState.edited) return;
  const inputHash = hash(trim(args.inputText));
  const outputHash = hash(trim(args.outputText));
  const authoritativeHash = doc.authoritativeHash;
  if (inputHash !== authoritativeHash && outputHash !== authoritativeHash) return;
  if (outputHash === authoritativeHash) return;
  logIllegalPostAcceptanceMutationAttempt({
    surface: args.surface,
    mutation: args.mutation,
    attemptedHash: outputHash,
    authoritativeHash,
    attemptedLen: trim(args.outputText).length,
    authoritativeLen: doc.fullCorpusText.length,
  });
  if (isBrowserRuntime()) {
    // Browser routes must recover to the immutable authoritative corpus instead of blanking the page.
    // Unit/node paths still throw so mutation bugs remain visible in tests.
    // eslint-disable-next-line no-console
    console.warn("[illegal-post-acceptance-mutation-route-fallback]", {
      surface: args.surface,
      mutation: args.mutation,
      authoritativeHash,
    });
    return;
  }
  if (isDevOrTest()) {
    throw new Error(`[illegal-post-acceptance-mutation-attempt] ${args.surface}:${args.mutation}`);
  }
}

export function returnAuthoritativeTextForIllegalPostAcceptanceGeneration(args: {
  surface: string;
  builder: string;
  generatedText: string;
  allowBeforeAcceptance?: boolean;
}): string {
  const doc = authoritativeAgreementDocument;
  if (!doc || args.allowBeforeAcceptance) return args.generatedText;
  const generated = trim(args.generatedText);
  if (hash(generated) === doc.authoritativeHash) return generated;
  logIllegalPostAcceptanceMutationAttempt({
    surface: args.surface,
    mutation: `independent_builder:${args.builder}`,
    attemptedHash: hash(generated),
    attemptedLen: generated.length,
  });
  if (isBrowserRuntime()) {
    // eslint-disable-next-line no-console
    console.warn("[illegal-post-acceptance-generation-route-fallback]", {
      surface: args.surface,
      builder: args.builder,
      authoritativeHash: doc.authoritativeHash,
    });
    return doc.fullCorpusText;
  }
  if (isDevOrTest()) {
    throw new Error(`[illegal-post-acceptance-mutation-attempt] independent_builder:${args.builder}`);
  }
  return doc.fullCorpusText;
}

export function authoritativeDocumentForSurface(surface: string): AuthoritativeAgreementDocument | null {
  const doc = authoritativeAgreementDocument;
  if (!doc) return null;
  if (
    shouldLogPaidProAuthoritySurfaceEvent({
      event: "authoritative-agreement-document-surface",
      surface,
      hash: doc.authoritativeHash,
      source: doc.generationMetadata.source,
    })
  ) {
    // eslint-disable-next-line no-console
    console.info("[authoritative-agreement-document-surface]", {
      surface,
      hash: doc.authoritativeHash,
      len: doc.fullCorpusText.length,
    });
  }
  return doc;
}
