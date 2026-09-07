/**
 * ANY entry to a persist's esign packet must not paint a leftover version
 * when a certified Review exists (Review-paint SoT / paid Pro accepted
 * display / verified commercial display / accepted snapshot / persist Review
 * GET). Never seed premium/server_full_document_text or leftover fused
 * Notices. Fail-closed-without-replace is not allowed while leftover fused
 * GET /content is on screen and persist Review exists. Same persist /
 * same vs01 id.
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
import { fetchDocumentContent, fetchVs01DocumentMeta } from "./vs01Api";
import {
  fetchCanonicalReviewSnapshot,
  hydrateCommercialReviewFromServerSnapshot,
  readVerifiedCommercialDisplayCorpus,
} from "../agreement/canonicalReviewSnapshotApi";
import { getAcceptedPremiumDisplayText } from "../components/agreements/acceptedPremiumCanonicalCorpus";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "../components/agreements/paidProFirstReviewDisplayAuthority";
import { resolvePaidProReviewSessionAuthorityPaintPlain } from "../components/agreements/paidProReviewSessionAuthority";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import { resolveCanonicalPlainForVisibleShell } from "../components/agreements/paidProVisibleDocumentShell";
import {
  FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE,
  persistReviewGetPlainForSigningSeed,
  readAcceptedReviewCorpusFromDraftLike,
  resolveCertifiedReviewCorpusForSigningSeed,
  reviewCorpusLooksLikeLeftoverFusedNotices,
} from "./vs01CurrentReviewSotForSeed";

export { persistReviewGetPlainForSigningSeed } from "./vs01CurrentReviewSotForSeed";

/** Fail-closed toast only when persist Review truly does not exist. */
export function leftoverRemountShouldFailClosedToast(
  persistReviewCorpus: string | null | undefined,
): boolean {
  return !persistReviewGetPlainForSigningSeed(persistReviewCorpus);
}

export {
  FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTED_PREDICATE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE,
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE,
  FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE,
} from "./vs01CurrentReviewSotForSeed";
import { isNonBindingDraftTemplateCorpus } from "./vs01ReviewCorpusSeedRefresh";
import {
  bindReviewCorpusOntoSeededVs01Document,
  inspectSeededDocumentServerContent,
  type BindReviewCorpusResult,
  type FetchedDocumentContent,
  type Vs01SigningSeedFn,
} from "./vs01ReviewCorpusServerContent";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const FIRST_FAILING_ESIGN_REMOUNT_PREDICATE =
  "esign_remount_paints_template_content_without_bind" as const;

/**
 * Live stress-battery case 5: double-Continue minted `/app/esign/doc_*`
 * remount stayed on “Loading your document…” because the seed effect awaited
 * leftover GET /content inspect + vs01-signing-seed POST before setting
 * contentSha256. Persist Review + frozen restore must unblock Prepare paint
 * without that inspect.
 */
export const FIRST_FAILING_DOUBLE_CONTINUE_REMOUNT_LOADING_PREDICATE =
  "esign_double_continue_minted_prepare_stuck_loading" as const;

/**
 * After #186, second-mint remount fail-closed “Could not load” when persist
 * Review GET was missing/thin even though accepted CRS + frozen SA (+
 * optional GET /content) were already 200. Paint from those bodies.
 */
export const FIRST_FAILING_THIN_PERSIST_ACCEPTED_CRS_REMOUNT_PREDICATE =
  "esign_remount_fail_closes_thin_persist_despite_accepted_crs" as const;

export type CertifiedReviewForEsignRemount = {
  agreementId: string;
  persistReviewCorpus: string;
  existingBridgeCorpus: string | null;
  draft: AgreementDraft | null;
};

export type ResolveCertifiedReviewForEsignRemountArgs = {
  documentId: string;
  agreementId?: string | null;
  existingBridgeCorpus?: string | null;
  draft?: AgreementDraft | null;
  fetchDocumentMeta?: (id: string) => Promise<{ agreementId: string | null }>;
  fetchDraft?: (agreementId: string) => Promise<AgreementDraft | null>;
  fetchAcceptedReviewCorpus?: (agreementId: string) => Promise<string | null>;
  fetchPersistReviewGet?: (agreementId: string) => Promise<string | null>;
  fetchReviewPaintSot?: (agreementId: string) => Promise<string | null>;
};

/** Persist Review is enough to leave Loading — do not wait on GET /content. */
export function remountPrepareShouldPaintBeforeContentInspect(
  persistReviewCorpus: string | null | undefined,
): boolean {
  return Boolean(persistReviewGetPlainForSigningSeed(persistReviewCorpus));
}

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

/**
 * Remount Prepare paint body. Accepted CRS / persist Review GET must not be
 * leftover-filtered — that detector is for GET /content packet bytes and
 * false-positives commercial Notices ("Address:" + "30 days").
 * Prefer the longer accepted body over a thin pending persist GET.
 */
export function remountReviewPlainFromAcceptedOrPersist(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string {
  const have = persistReviewGetPlainForSigningSeed(current);
  const next = persistReviewGetPlainForSigningSeed(candidate);
  if (!next) return have;
  if (!have) return next;
  return next.length > have.length ? next : have;
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
      const fromHydrate = persistReviewPlainFromSnapshot(hydrated.snapshot);
      if (fromHydrate) return fromHydrate;
    }
  } catch {
    /* leftover remount must not reconstruct a stale blob as certified Review */
  }
  return certifiedPlainOrEmpty(readVerifiedCommercialDisplayCorpus(agreementId)?.corpusPlain);
}

function persistReviewPlainFromSnapshot(snapshot: {
  corpus_plain?: string | null;
  corpusPlain?: string | null;
} | null | undefined): string {
  if (!snapshot) return "";
  return persistReviewGetPlainForSigningSeed(snapshot.corpus_plain || snapshot.corpusPlain);
}

/** Persist Review GET — same canonical snapshot bytes Review already painted. */
export async function fetchPersistReviewGetForRemount(agreementId: string): Promise<string> {
  try {
    const fetched = await fetchCanonicalReviewSnapshot({ agreementId });
    if (fetched.ok) {
      return persistReviewPlainFromSnapshot(fetched.snapshot);
    }
  } catch {
    /* fail closed below — never seed leftover */
  }
  return "";
}

const defaultFetchPersistReviewGet = fetchPersistReviewGetForRemount;

export const REMOUNT_CRS_GET_SOURCE = "canonical_review_snapshot" as const;
export const REMOUNT_SEED_CERTIFIED_REVIEW_FALLBACK = "seed_certified_review" as const;

/**
 * Remount durable Review: GET canonical-review-snapshot (token-refreshed).
 * If GET is absent/fails, hard-fallback to the same certified Review the
 * vs01-signing-seed already used. Do not invent a second corpus SoT.
 */
export async function fetchRemountCertifiedReviewCorpus(args: {
  agreementId: string;
  fallbackCertifiedReview?: string | null;
  fetchPersistReviewGet?: (agreementId: string) => Promise<string | null>;
}): Promise<{
  corpus: string;
  source: typeof REMOUNT_CRS_GET_SOURCE | typeof REMOUNT_SEED_CERTIFIED_REVIEW_FALLBACK | "empty";
}> {
  const fallback = persistReviewGetPlainForSigningSeed(args.fallbackCertifiedReview);
  let fromGet = "";
  try {
    fromGet = persistReviewGetPlainForSigningSeed(
      await (args.fetchPersistReviewGet ?? fetchPersistReviewGetForRemount)(args.agreementId),
    );
  } catch {
    fromGet = "";
  }
  if (fromGet) return { corpus: fromGet, source: REMOUNT_CRS_GET_SOURCE };
  if (fallback) return { corpus: fallback, source: REMOUNT_SEED_CERTIFIED_REVIEW_FALLBACK };
  return { corpus: "", source: "empty" };
}

/** Persist leftover is Review-paint input only — never the seed body. */
function persistPlainForReviewPaintInput(draft: AgreementDraft | null | undefined): string {
  if (!draft) return "";
  const rec = draft as unknown as Record<string, unknown>;
  for (const key of [
    "premium_full_document_text",
    "server_full_document_text",
    "premium_server_full_document_text",
    "document_text",
  ] as const) {
    const v = String(rec[key] ?? "").trim();
    if (v.length >= VS01_SIGNING_CORPUS_MIN_LEN && !isNonBindingDraftTemplateCorpus(v)) {
      return v;
    }
  }
  return "";
}

/**
 * Paid Pro accepted display / the text Review already showed.
 * Leftover fused persist is paint input only; leftover is never returned as SoT.
 */
function defaultFetchReviewPaintSot(
  agreementId: string,
  draft?: AgreementDraft | null,
): string {
  const sot = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim() : "";
  const display = getAcceptedPremiumDisplayText().trim();
  const authority = resolvePaidProReviewSessionAuthorityPaintPlain()?.plain ?? "";
  const verified = (readVerifiedCommercialDisplayCorpus(agreementId)?.corpusPlain ?? "").trim();
  for (const candidate of [sot, display, authority, verified]) {
    const certified = certifiedPlainOrEmpty(candidate);
    if (certified) return certified;
  }

  const paintInput =
    certifiedPlainOrEmpty(sot) ||
    certifiedPlainOrEmpty(display) ||
    certifiedPlainOrEmpty(authority) ||
    certifiedPlainOrEmpty(verified) ||
    persistPlainForReviewPaintInput(draft);

  const paintArgs = {
    agreementId,
    draft: draft as never,
    paidProActive: true,
    premiumCheckoutCompleted: true,
    acceptedCanonicalPlain: paintInput || undefined,
  };
  const painted = certifiedPlainOrEmpty(
    resolvePaidProFirstReviewVisibleDisplayPlain(paintArgs).plain,
  );
  if (painted) return painted;
  return certifiedPlainOrEmpty(resolveCanonicalPlainForVisibleShell(paintArgs).plain);
}

/**
 * Persist Review for remount Prepare — no GET /content inspect or seed POST.
 * Double-Continue minted doc_* remount must leave “Loading your document…”
 * from this SoT even when leftover inspect / vs01-signing-seed hangs.
 */
export async function resolveCertifiedReviewForEsignRemount(
  args: ResolveCertifiedReviewForEsignRemountArgs,
): Promise<CertifiedReviewForEsignRemount> {
  const documentId = args.documentId.trim();
  if (!documentId || documentId.startsWith("local_doc_")) {
    return { agreementId: "", persistReviewCorpus: "", existingBridgeCorpus: null, draft: null };
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
    return { agreementId: "", persistReviewCorpus: "", existingBridgeCorpus: null, draft: null };
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

  // Resolve persist Review before leftover GET /content. Do not inspect
  // leftover GET as a success path while persist Review is still pending.
  // Persist Review GET 200 is the replace body — do not leftover-filter it.
  // Leftover-looking session/hydrate stores stay leftover-filtered so seed
  // does not POST leftover fused Notices. Remount paint uses
  // resolveAcceptedCrsPlainForRemountPaint when this body is empty/thin.
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
      certifiedReviewCorpus = persistReviewGetPlainForSigningSeed(
        await (args.fetchPersistReviewGet ?? defaultFetchPersistReviewGet)(agreementId),
      );
    } catch {
      certifiedReviewCorpus = "";
    }
  }
  if (!certifiedReviewCorpus) {
    try {
      certifiedReviewCorpus = certifiedPlainOrEmpty(
        args.fetchReviewPaintSot
          ? await args.fetchReviewPaintSot(agreementId)
          : defaultFetchReviewPaintSot(agreementId, draft),
      );
    } catch {
      certifiedReviewCorpus = "";
    }
  }

  return {
    agreementId,
    persistReviewCorpus: certifiedReviewCorpus,
    existingBridgeCorpus,
    draft,
  };
}

/**
 * Remount Prepare paint SoT when leftover-filtered persist Review is empty
 * or thin. Uses accepted CRS / persist Review GET bytes without leftover
 * filter (commercial Notices false-positive). Prefer the longer accepted
 * body over a thin pending persist GET. Does not invent a corpus.
 */
export async function resolveAcceptedCrsPlainForRemountPaint(
  args: Pick<
    ResolveCertifiedReviewForEsignRemountArgs,
    "agreementId" | "draft" | "fetchPersistReviewGet" | "fetchAcceptedReviewCorpus"
  > & {
    persistReviewCorpus?: string | null;
  },
): Promise<string> {
  const agreementId = (args.agreementId ?? "").trim();
  let corpus = persistReviewGetPlainForSigningSeed(args.persistReviewCorpus);
  corpus = remountReviewPlainFromAcceptedOrPersist(
    corpus,
    readAcceptedReviewCorpusFromDraftLike(args.draft),
  );
  if (agreementId) {
    try {
      corpus = remountReviewPlainFromAcceptedOrPersist(
        corpus,
        certifiedPlainOrEmpty(
          await (args.fetchAcceptedReviewCorpus ?? defaultFetchAcceptedReviewCorpus)(agreementId),
        ),
      );
    } catch {
      /* keep draft accepted / persist already in hand */
    }
    try {
      corpus = remountReviewPlainFromAcceptedOrPersist(
        corpus,
        await (args.fetchPersistReviewGet ?? defaultFetchPersistReviewGet)(agreementId),
      );
    } catch {
      /* keep accepted CRS when persist GET is thin / missing */
    }
  }
  return persistReviewGetPlainForSigningSeed(corpus);
}

/**
 * Inspect GET /content and POST vs01-signing-seed with the persist Review
 * corpus when the painted blob is not that SoT. Same persist; prefer same vs01 id.
 * Leftover remount with an empty Incognito Review-paint session still
 * resolves persist Review GET (canonical-review-snapshot) — do not skip.
 * If GET /content is leftover fused, it does not match certified Review —
 * replace it. Fail-closed only when persist Review truly does not exist.
 * Leftover on screen is not a pass. Leftover fused blob is never the seed body.
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
  fetchReviewPaintSot?: (agreementId: string) => Promise<string | null>;
  signingCorpusSource?: string | null;
}): Promise<
  | BindReviewCorpusResult
  | { ok: true; skipped: true; reason: string; documentId: string }
> {
  const documentId = args.documentId.trim();
  if (!documentId || documentId.startsWith("local_doc_")) {
    return { ok: true, skipped: true, reason: "local_or_missing", documentId };
  }

  const certified = await resolveCertifiedReviewForEsignRemount({
    documentId,
    agreementId: args.agreementId,
    existingBridgeCorpus: args.existingBridgeCorpus,
    draft: args.draft,
    fetchDocumentMeta: args.fetchDocumentMeta,
    fetchDraft: args.fetchDraft,
    fetchAcceptedReviewCorpus: args.fetchAcceptedReviewCorpus,
    fetchPersistReviewGet: args.fetchPersistReviewGet,
    fetchReviewPaintSot: args.fetchReviewPaintSot,
  });
  const agreementId = certified.agreementId;
  if (!agreementId) {
    return { ok: true, skipped: true, reason: "missing_agreement_id", documentId };
  }
  const existingBridgeCorpus = certified.existingBridgeCorpus;
  const certifiedReviewCorpus = certified.persistReviewCorpus;
  const draft = args.draft ?? certified.draft;

  const painted = await inspectSeededDocumentServerContent(
    documentId,
    args.fetchContent ?? fetchDocumentContent,
  );
  const leftoverFusedOnPacket =
    painted.leftoverRefused || reviewCorpusLooksLikeLeftoverFusedNotices(painted.plain);

  if (!certifiedReviewCorpus) {
    // Leftover on screen is not a pass. Fail-closed only when persist Review
    // truly does not exist. Leftover refuse / leftover packet that leftover-
    // text misses is not a reason to paint leftover GET /content.
    return {
      ok: false,
      reason: leftoverFusedOnPacket
        ? FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
        : FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE,
      persistReviewCorpus: "",
    };
  }
  // Persist Review GET 200 is the replace body. Do not leftover-filter that
  // snapshot into empty / fail-closed — leftover fused GET /content is never
  // this seed. Bind even when leftover detector false-positives persist Review.

  const bound = await bindReviewCorpusOntoSeededVs01Document({
    agreementId,
    existingDocumentId: documentId,
    reviewCorpus: certifiedReviewCorpus,
    existingBridgeCorpus,
    seed: args.seed ?? fetchAgreementVs01SigningSeed,
    draft,
    signingCorpusSource: args.signingCorpusSource ?? FIRST_FAILING_ESIGN_REMOUNT_PREDICATE,
    fetchContent: args.fetchContent,
  });
  if (!bound.ok) {
    return leftoverFusedOnPacket
      ? {
          ok: false,
          reason: FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
          persistReviewCorpus: certifiedReviewCorpus,
        }
      : { ...bound, persistReviewCorpus: certifiedReviewCorpus };
  }
  return { ...bound, reviewCorpus: certifiedReviewCorpus };
}
