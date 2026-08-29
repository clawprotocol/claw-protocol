/**
 * ANY entry to a persist's esign packet must not paint a template.
 *
 * First failing predicate after #143: bindReviewCorpusOntoSeededVs01Document
 * ran only inside tryNavigate when existingDoc was set. Hard refresh of a
 * leftover `/app/esign/:id` (and leftover-route fallback) remounted the
 * wizard and painted GET /content without that bind, so vs01-signing-seed
 * never fired. Reuse the existing Review SoT + seed POST.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraftWithSigningLock } from "../agreement/agreementWorkspaceApi";
import {
  fetchAgreementVs01SigningSeed,
  readAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { resolveAgreementCorpusForPrepareHandoff } from "./vs01PrepareBridgeCorpus";
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
  isNonBindingDraftTemplateCorpus,
} from "./vs01ReviewCorpusSeedRefresh";
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

function pickNonTemplateReviewCorpus(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (t.length < VS01_SIGNING_CORPUS_MIN_LEN) return "";
  if (isNonBindingDraftTemplateCorpus(t)) return "";
  return t;
}

/**
 * Inspect GET /content and POST vs01-signing-seed with the persist Review
 * corpus when the painted blob is not that SoT. Same persist; prefer same vs01 id.
 * Leftover remount with an empty Incognito session still resolves agreement_id
 * from GET /v1/documents/{id} and loads the persist draft — do not skip.
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
  let reviewCorpus = pickNonTemplateReviewCorpus(args.reviewCorpus);
  if (!reviewCorpus) {
    reviewCorpus = pickNonTemplateReviewCorpus(
      resolveAgreementCorpusForPrepareHandoff({
        agreementId,
        draft,
        bridgeCorpusText: existingBridgeCorpus,
      }),
    );
  }
  if (!reviewCorpus) {
    try {
      const loaded = args.fetchDraft
        ? await args.fetchDraft(agreementId)
        : (await fetchAgreementDraftWithSigningLock(agreementId)).draft;
      if (loaded) {
        draft = loaded;
        reviewCorpus = pickNonTemplateReviewCorpus(
          resolveAgreementCorpusForPrepareHandoff({
            agreementId,
            draft: loaded,
            bridgeCorpusText: existingBridgeCorpus,
          }),
        );
      }
    } catch {
      /* persist seed POST still runs when GET /content is the template */
    }
  }

  return bindReviewCorpusOntoSeededVs01Document({
    agreementId,
    existingDocumentId: documentId,
    reviewCorpus,
    existingBridgeCorpus,
    seed: args.seed ?? fetchAgreementVs01SigningSeed,
    draft,
    signingCorpusSource: args.signingCorpusSource ?? FIRST_FAILING_ESIGN_REMOUNT_PREDICATE,
    fetchContent: args.fetchContent,
  });
}
