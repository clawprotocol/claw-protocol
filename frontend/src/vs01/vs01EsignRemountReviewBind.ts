/**
 * ANY entry to a persist's esign packet must not paint a leftover version
 * when a certified Review exists (verified commercial display / accepted
 * snapshot / persist Review GET). Never seed premium/server_full_document_text
 * or a reconstructed-from-stale-blob body. If certified Review cannot be
 * resolved, fail closed — do not seed leftover. Same persist / same vs01 id.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import {
  fetchAgreementVs01SigningSeed,
  readAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { resolveExistingPreparedDocumentId } from "./vs01PreparePlacementBeforeLinks";
import {
  loadVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import {
  readActivePaidProVs01PostSignHandoff,
  readLatestLocalPaidProVs01PostSignHandoff,
} from "./vs01PaidProPostSignHandoff";
import { fetchVs01DocumentMeta } from "./vs01Api";
import {
  fetchCanonicalReviewSnapshot,
  hydrateCommercialReviewFromServerSnapshot,
  readVerifiedCommercialDisplayCorpus,
} from "../agreement/canonicalReviewSnapshotApi";
import {
  FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE,
  readAcceptedReviewCorpusFromDraftLike,
  resolveCertifiedReviewCorpusForSigningSeed,
} from "./vs01CurrentReviewSotForSeed";

export {
  FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE,
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE,
  FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE,
} from "./vs01CurrentReviewSotForSeed";
import { isNonBindingDraftTemplateCorpus } from "./vs01ReviewCorpusSeedRefresh";
import {
  bindReviewCorpusOntoSeededVs01Document,
  type BindReviewCorpusResult,
  type FetchedDocumentContent,
  type Vs01SigningSeedFn,
} from "./vs01ReviewCorpusServerContent";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const FIRST_FAILING_ESIGN_REMOUNT_PREDICATE =
  "esign_remount_paints_template_content_without_bind" as const;

export type EsignEntryReviewBindContext = {
  agreementId: string;
  existingBridgeCorpus: string | null;
};

export function resolveEsignEntryReviewBindContext(
  documentId: string,
): EsignEntryReviewBindContext | null {
  const sid = documentId.trim();
  if (!sid) return null;

  const bridge = readAgreementVs01BridgeSession();
  if (bridge && bridge.vs01DocumentId.trim() === sid && bridge.agreementId.trim()) {
    return {
      agreementId: bridge.agreementId.trim(),
      existingBridgeCorpus: (bridge.agreementCorpusText ?? "").trim() || null,
    };
  }
  if (bridge?.agreementId.trim()) {
    const existing = resolveExistingPreparedDocumentId(bridge.agreementId);
    if (existing === sid) {
      return {
        agreementId: bridge.agreementId.trim(),
        existingBridgeCorpus: (bridge.agreementCorpusText ?? "").trim() || null,
      };
    }
  }

  const seed = loadVs01CanonicalPacketSeed(sid);
  if (seed?.agreementId.trim()) {
    return {
      agreementId: seed.agreementId.trim(),
      existingBridgeCorpus: seed.corpusPlain.trim() || null,
    };
  }

  const portable = loadVs01CanonicalPacketPortable(sid);
  if (portable?.seed.agreementId.trim()) {
    return {
      agreementId: portable.seed.agreementId.trim(),
      existingBridgeCorpus: portable.seed.corpusPlain.trim() || null,
    };
  }

  const active = readActivePaidProVs01PostSignHandoff();
  if (active && active.vs01DocumentId.trim() === sid && active.agreementId.trim()) {
    return { agreementId: active.agreementId.trim(), existingBridgeCorpus: null };
  }
  const latest = readLatestLocalPaidProVs01PostSignHandoff();
  if (latest && latest.vs01DocumentId.trim() === sid && latest.agreementId.trim()) {
    return { agreementId: latest.agreementId.trim(), existingBridgeCorpus: null };
  }

  return null;
}

function certifiedPlainOrEmpty(text: string | null | undefined): string {
  const plain = (text ?? "").trim();
  if (plain.length < VS01_SIGNING_CORPUS_MIN_LEN || isNonBindingDraftTemplateCorpus(plain)) {
    return "";
  }
  return resolveCertifiedReviewCorpusForSigningSeed(plain);
}

async function defaultFetchAcceptedReviewCorpus(agreementId: string): Promise<string> {
  // Keep resolving certified Review. First empty accepted snapshot is not leftover.
  const verified = certifiedPlainOrEmpty(
    readVerifiedCommercialDisplayCorpus(agreementId)?.corpusPlain,
  );
  if (verified) return verified;
  try {
    const hydrated = await hydrateCommercialReviewFromServerSnapshot({ agreementId });
    if (hydrated.ok) {
      const fromHydrate = certifiedPlainOrEmpty(hydrated.snapshot.corpus_plain);
      if (fromHydrate) return fromHydrate;
    }
  } catch {
    /* leftover remount must not reconstruct a stale blob as certified Review */
  }
  return certifiedPlainOrEmpty(readVerifiedCommercialDisplayCorpus(agreementId)?.corpusPlain);
}

/** Persist Review GET — same canonical snapshot bytes Review already painted. */
async function defaultFetchPersistReviewGet(agreementId: string): Promise<string> {
  try {
    const fetched = await fetchCanonicalReviewSnapshot({ agreementId });
    if (fetched.ok) {
      return certifiedPlainOrEmpty(fetched.snapshot.corpus_plain);
    }
  } catch {
    /* fail closed below — never seed leftover */
  }
  return "";
}

/**
 * Inspect GET /content and POST vs01-signing-seed with the persist Review
 * corpus when the painted blob is not that SoT. Same persist; prefer same vs01 id.
 * Leftover remount with an empty Incognito session still resolves agreement_id
 * from GET /v1/documents/{id} and loads the persist draft — do not skip.
 * When a certified Review exists, write only that corpus. Empty first
 * accepted-snapshot read is not leftover — keep resolving. Unresolved
 * certified Review fails closed (no leftover seed).
 */
export async function ensureReviewCorpusOnEsignEntry(args: {
  documentId: string;
  agreementId?: string | null;
  reviewCorpus?: string | null;
  existingBridgeCorpus?: string | null;
  draft?: AgreementDraft | null;
  seed?: Vs01SigningSeedFn;
  fetchContent?: (id: string) => Promise<FetchedDocumentContent>;
  fetchDocumentMeta?: (id: string) => Promise<{ agreementId: string | null }>;
  fetchDraft?: (agreementId: string) => Promise<AgreementDraft | null>;
  fetchAcceptedReviewCorpus?: (agreementId: string) => Promise<string | null>;
  fetchPersistReviewGet?: (agreementId: string) => Promise<string | null>;
  signingCorpusSource?: string | null;
}): Promise<
  | BindReviewCorpusResult
  | { ok: true; skipped: true; reason: string; documentId: string }
> {
  const documentId = args.documentId.trim();
  if (!documentId || documentId.startsWith("local_doc_")) {
    return { ok: true, skipped: true, reason: "local_or_missing", documentId };
  }

  const resolved = args.agreementId?.trim()
    ? {
        agreementId: args.agreementId.trim(),
        existingBridgeCorpus: (args.existingBridgeCorpus ?? "").trim() || null,
      }
    : resolveEsignEntryReviewBindContext(documentId);
  let agreementId = resolved?.agreementId ?? "";
  if (!agreementId) {
    try {
      const meta = await (args.fetchDocumentMeta ?? fetchVs01DocumentMeta)(documentId);
      agreementId = (meta.agreementId ?? "").trim();
    } catch {
      agreementId = "";
    }
  }
  if (!agreementId) {
    return { ok: true, skipped: true, reason: "missing_agreement_id", documentId };
  }

  const existingBridgeCorpus =
    (args.existingBridgeCorpus ?? "").trim() || resolved?.existingBridgeCorpus || null;
  let draft = args.draft ?? null;
  if (!draft) {
    try {
      draft = args.fetchDraft
        ? await args.fetchDraft(agreementId)
        : (await fetchAgreementDraftWithSigningLock(agreementId)).draft;
    } catch {
      draft = null;
    }
  }

  // First accepted-snapshot read may be empty on leftover Incognito remount.
  // Keep resolving certified Review (hydrate / verified display / persist GET).
  // Never fall back to premium/server/handoff leftover.
  let certifiedReviewCorpus = resolveCertifiedReviewCorpusForSigningSeed(
    readAcceptedReviewCorpusFromDraftLike(draft),
  );
  if (!certifiedReviewCorpus) {
    try {
      certifiedReviewCorpus = certifiedPlainOrEmpty(
        await (args.fetchAcceptedReviewCorpus ?? defaultFetchAcceptedReviewCorpus)(agreementId),
      );
    } catch {
      certifiedReviewCorpus = "";
    }
  }
  if (!certifiedReviewCorpus) {
    try {
      certifiedReviewCorpus = certifiedPlainOrEmpty(
        await (args.fetchPersistReviewGet ?? defaultFetchPersistReviewGet)(agreementId),
      );
    } catch {
      certifiedReviewCorpus = "";
    }
  }
  if (!certifiedReviewCorpus) {
    return { ok: false, reason: FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE };
  }

  return bindReviewCorpusOntoSeededVs01Document({
    agreementId,
    existingDocumentId: documentId,
    reviewCorpus: certifiedReviewCorpus,
    existingBridgeCorpus,
    seed: args.seed ?? fetchAgreementVs01SigningSeed,
    draft,
    signingCorpusSource: args.signingCorpusSource ?? FIRST_FAILING_ESIGN_REMOUNT_PREDICATE,
    fetchContent: args.fetchContent,
  });
}
