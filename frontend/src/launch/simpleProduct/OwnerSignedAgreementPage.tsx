import { useCallback, useEffect, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  agreementPublicVerifyPath,
  fetchPublicAgreementVerify,
  type PublicVerifyPayload,
} from "../../agreement/agreementPublicVerify";
import { downloadCompletedSignedAgreementPdf } from "../../agreement/completedSignedAgreementPdfDownload";
import { PremiumAgreementReadonlyView } from "../../components/agreements/PremiumAgreementReadonlyView";
import { displayCreatorAgreementTitle } from "../creatorDashboardPresentation";
import { CREATOR_COMPLETED_PILL, CREATOR_DOWNLOAD_PDF_LABEL } from "../creatorDashboardCopy";
import { useLaunchNav } from "../LaunchNavContext";
import { loadOwnerSignedAgreementPreview } from "../ownerSignedAgreementView";
import { AppShell } from "../AppShell";

type Props = {
  agreementId: string;
};

function formatSignatureSummary(verify: PublicVerifyPayload | null): string | null {
  const sig = verify?.signature_status;
  if (!sig) return null;
  const required = Math.max(sig.signer_party_count ?? 0, 2);
  const recorded = sig.signatures_recorded ?? 0;
  if (sig.fully_executed) return `Fully signed (${required} of ${required})`;
  if (recorded > 0) return `${recorded} of ${required} signed`;
  return null;
}

export function OwnerSignedAgreementPage(props: Props) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("Agreement");
  const [previewHtml, setPreviewHtml] = useState("");
  const [usesPremiumDocument, setUsesPremiumDocument] = useState(false);
  const [verify, setVerify] = useState<PublicVerifyPayload | null>(null);
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [corpusSource, setCorpusSource] = useState<
    "fully_executed_snapshot" | "reconstructed" | "portable_packet" | "local_portable" | null
  >(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [loaded, publicVerify] = await Promise.all([
      loadOwnerSignedAgreementPreview(agreementId),
      fetchPublicAgreementVerify(agreementId),
    ]);
    if (!loaded) {
      setLoadError("Could not load this signed agreement.");
      setPreviewHtml("");
      setDraft(null);
      setCorpusSource(null);
      setVerify(publicVerify);
      setLoading(false);
      return;
    }
    setDraft(loaded.draft);
    setTitle(displayCreatorAgreementTitle(loaded.draft.title ?? ""));
    setPreviewHtml(loaded.html);
    setUsesPremiumDocument(loaded.usesPremiumDocument);
    setCorpusSource(loaded.corpusSource);
    setVerify(publicVerify);
    setLoading(false);
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const signatureSummary = formatSignatureSummary(verify);
  const proofHash = verify?.verification?.agreement_hash?.trim() || null;

  return (
    <AppShell
      title={title}
      subtitle="Fully signed agreement — read-only proof copy with verification metadata."
    >
      <div
        className="space-y-4"
        data-testid="owner-signed-agreement-page"
        data-agreement-id={agreementId}
        data-corpus-source={corpusSource ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
            data-testid="owner-signed-agreement-status"
          >
            {CREATOR_COMPLETED_PILL}
          </span>
          {signatureSummary ? (
            <p className="text-sm text-slate-400" data-testid="owner-signed-agreement-signatures">
              Signatures: <span className="text-slate-200">{signatureSummary}</span>
            </p>
          ) : null}
        </div>

        {proofHash ? (
          <div
            className="rounded-xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-sm text-slate-300"
            data-testid="owner-signed-agreement-proof"
          >
            <p className="font-medium text-slate-200">Proof record</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{proofHash}</p>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
              data-testid="owner-signed-agreement-verify-link"
              onClick={() => navigate(agreementPublicVerifyPath(agreementId))}
            >
              Open public verification
            </button>
          </div>
        ) : null}

        {loadError ? (
          <div
            className="rounded-xl border border-amber-800/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            <p>{loadError}</p>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400" data-testid="owner-signed-agreement-loading">
            Loading signed agreement…
          </p>
        ) : (
          <section
            className="rounded-2xl border border-slate-800/70 bg-white px-4 py-6 text-slate-900 shadow-inner sm:px-8 sm:py-8"
            data-testid="owner-signed-agreement-document"
            aria-label="Signed agreement document"
          >
            {previewHtml.trim() ? (
              usesPremiumDocument ? (
                <PremiumAgreementReadonlyView
                  html={previewHtml}
                  fullDocumentFlow
                  compactDocumentTopPadding
                />
              ) : (
                <div
                  className="mx-auto max-w-[48rem]"
                  data-testid="owner-signed-agreement-fallback-html"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )
            ) : (
              <p className="text-sm text-slate-600">No signed agreement text is available yet.</p>
            )}
          </section>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary vs01-btn--compact"
            data-testid="owner-signed-agreement-download-pdf"
            disabled={pdfBusy || loading || !previewHtml.trim()}
            onClick={() => {
              void (async () => {
                setPdfBusy(true);
                setPdfError(null);
                try {
                  await downloadCompletedSignedAgreementPdf({
                    agreementId,
                    html: previewHtml,
                    title,
                  });
                } catch (e: unknown) {
                  setPdfError(e instanceof Error ? e.message : "Could not download PDF.");
                } finally {
                  setPdfBusy(false);
                }
              })();
            }}
          >
            {pdfBusy ? "Preparing PDF…" : CREATOR_DOWNLOAD_PDF_LABEL}
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact"
            data-testid="owner-signed-agreement-back"
            onClick={() => navigate("/app")}
          >
            Back to dashboard
          </button>
        </div>
        {pdfError ? (
          <p className="text-sm text-amber-200/95" role="alert" data-testid="owner-signed-agreement-pdf-error">
            {pdfError}
          </p>
        ) : null}
        {draft ? (
          <span className="sr-only" data-testid="owner-signed-agreement-draft-loaded">
            loaded
          </span>
        ) : null}
      </div>
    </AppShell>
  );
}
