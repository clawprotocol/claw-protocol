import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCommercialEntitlement, type CommercialEntitlementDecision } from "../../access/commercialEntitlement";
import { useAuth } from "../../auth/AuthProvider";
import { resolveCurrentUser } from "../../account/currentUser";
import { useLaunchNav } from "../LaunchNavContext";
import { QUICK_PDF_SIGN_IN_PATH } from "../quickPdfReturnAuthority";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { decideQuickPdfAccess, microphoneCaptureAvailable, type QuickPdfAccess } from "./quickIntakeAccess";
import {
  clearQuickPdfDocumentHint,
  loadOwnerQuickPdfBinding,
  readQuickPdfDocumentHint,
  sanitizedQuickPdfMessage,
  sha256Hex,
  uploadOwnerQuickPdf,
  validateQuickPdfBytes,
  validateQuickPdfFile,
  writeQuickPdfDocumentHint,
  type QuickPdfBinding,
  type QuickPdfErrorCode,
} from "./quickPdfUpload";
import { QuickPdfCompletion } from "./QuickPdfCompletion";

type QuickStart = "choice" | "type" | "speak" | "pdf";

const SPARSE_HINT = "Need a SaaS subscription agreement";
const AUTH_ENTITLEMENT_STALE_MS = 8000;

function parseQuickStart(search: string): QuickStart {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const v = (new URLSearchParams(raw).get("start") || "").trim().toLowerCase();
  if (v === "pdf" || v === "type" || v === "speak") return v;
  return "choice";
}

/**
 * Public Quick entry: draft via the canonical create interview, or upload a final PDF.
 * Does not draft paper, create sign sessions, or upload until Save & continue.
 */
export function QuickSendPage() {
  const { search, navigate } = useLaunchNav();
  const { enabled, loading: authLoading, user } = useAuth();
  const start = useMemo(() => parseQuickStart(search || ""), [search]);
  const current = resolveCurrentUser({
    supabaseUserId: user?.id,
    supabaseEmail: user?.email ?? null,
    supabaseDisplayName: (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? null,
  });
  const isAuthenticated = current.isAuthenticated;

  const [typedText, setTypedText] = useState("");
  const [typedBusy, setTypedBusy] = useState(false);
  const typedOnceRef = useRef(false);
  const [speakFallback, setSpeakFallback] = useState(false);

  const [entitlement, setEntitlement] = useState<CommercialEntitlementDecision | null>(null);
  const [entitlementSettled, setEntitlementSettled] = useState(false);
  const [staleLoading, setStaleLoading] = useState(false);
  const [accessNonce, setAccessNonce] = useState(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [binding, setBinding] = useState<QuickPdfBinding | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const uploadInFlightRef = useRef(false);
  const uploadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (start !== "speak") {
      setSpeakFallback(false);
      return;
    }
    if (!microphoneCaptureAvailable()) setSpeakFallback(true);
  }, [start]);

  useEffect(() => {
    const timer = window.setTimeout(() => setStaleLoading(true), AUTH_ENTITLEMENT_STALE_MS);
    return () => window.clearTimeout(timer);
  }, [accessNonce, start]);

  useEffect(() => {
    if (start !== "pdf") return;
    let cancel = false;
    setEntitlementSettled(false);
    setStaleLoading(false);
    if (!isAuthenticated) {
      setEntitlement(null);
      setEntitlementSettled(true);
      return;
    }
    void fetchCommercialEntitlement().then((decision) => {
      if (cancel) return;
      setEntitlement(decision);
      setEntitlementSettled(true);
    });
    return () => {
      cancel = true;
    };
  }, [isAuthenticated, start, accessNonce]);

  const access: QuickPdfAccess = useMemo(
    () =>
      decideQuickPdfAccess({
        authLoading: Boolean(enabled && authLoading),
        authResolved: !authLoading || !enabled,
        isAuthenticated,
        entitlement,
        entitlementSettled,
        staleLoadingTooLong: staleLoading,
      }),
    [authLoading, enabled, entitlement, entitlementSettled, isAuthenticated, staleLoading],
  );

  useEffect(() => {
    if (start !== "pdf" || !access.canUpload) return;
    const hint = readQuickPdfDocumentHint();
    if (!hint || uploadedIdRef.current === hint) return;
    let cancel = false;
    void loadOwnerQuickPdfBinding(hint).then((result) => {
      if (cancel) return;
      if (result.ok) {
        uploadedIdRef.current = result.binding.documentId;
        setBinding(result.binding);
        setShowCompletion(true);
      } else {
        clearQuickPdfDocumentHint();
        if (result.code === "wrong_organization" || result.code === "forbidden") {
          setLocalError(result.message);
        }
      }
    });
    return () => {
      cancel = true;
    };
  }, [access.canUpload, start]);

  const goStart = useCallback(
    (next: QuickStart) => {
      if (next === "choice") navigate("/app/quick");
      else navigate(`/app/quick?start=${next}`);
    },
    [navigate],
  );

  const handoffTyped = useCallback(
    (text: string, voiceFinalize: boolean) => {
      if (typedOnceRef.current || typedBusy) return;
      const trimmed = text.trim();
      if (!trimmed && !voiceFinalize) return;
      typedOnceRef.current = true;
      setTypedBusy(true);
      navigate("/app/create", {
        heroFromHome: true,
        heroIntake: trimmed,
        heroQuickSendTypedHandoff: !voiceFinalize,
        heroVoiceFinalize: voiceFinalize,
      });
    },
    [navigate, typedBusy],
  );

  const onSpeak = useCallback(() => {
    if (!microphoneCaptureAvailable()) {
      setSpeakFallback(true);
      goStart("type");
      return;
    }
    if (typedOnceRef.current || typedBusy) return;
    typedOnceRef.current = true;
    setTypedBusy(true);
    navigate("/app/create", {
      heroFromHome: true,
      heroIntake: typedText.trim(),
      heroVoiceFinalize: true,
    });
  }, [goStart, navigate, typedBusy, typedText]);

  const onFileChosen = useCallback((file: File | null) => {
    setLocalError(null);
    setSelectedFile(file);
    if (!file) return;
    const check = validateQuickPdfFile(file);
    if (!check.ok) {
      setLocalError(check.message);
      setSelectedFile(null);
    }
  }, []);

  const onSavePdf = useCallback(async () => {
    if (!access.canUpload || uploadInFlightRef.current || uploading) return;
    if (uploadedIdRef.current && binding) return;
    if (!selectedFile) {
      setLocalError("Choose a PDF, then select Save & continue.");
      return;
    }
    const fileCheck = validateQuickPdfFile(selectedFile);
    if (!fileCheck.ok) {
      setLocalError(fileCheck.message);
      return;
    }
    uploadInFlightRef.current = true;
    setUploading(true);
    setLocalError(null);
    try {
      const buf = new Uint8Array(await selectedFile.arrayBuffer());
      const bytesCheck = validateQuickPdfBytes(buf, selectedFile.type);
      if (bytesCheck) {
        setLocalError(bytesCheck.message);
        return;
      }
      const result = await uploadOwnerQuickPdf(buf, "application/pdf");
      if (!result.ok) {
        setLocalError(result.message);
        return;
      }
      const localHash = await sha256Hex(buf);
      if (localHash !== result.binding.contentSha256) {
        setLocalError(sanitizedQuickPdfMessage("unavailable" as QuickPdfErrorCode));
        return;
      }
      uploadedIdRef.current = result.binding.documentId;
      writeQuickPdfDocumentHint(result.binding.documentId);
      setBinding(result.binding);
    } catch {
      setLocalError(sanitizedQuickPdfMessage("network"));
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  }, [access.canUpload, binding, selectedFile, uploading]);

  const title =
    start === "type"
      ? "Draft a new agreement"
      : start === "speak"
        ? "Speak your request"
        : start === "pdf"
          ? "Sign an existing PDF"
          : "Start an agreement";

  const subtitle =
    start === "type"
      ? "LawDog’s structured clarifying interview will ask for missing parties, economics, governing law, and scope."
      : start === "speak"
        ? "Speaking opens the same Create interview. If your microphone is unavailable, type instead."
        : start === "pdf"
          ? "Upload final paper you already have. LawDog does not review whether this PDF is legally or commercially sufficient."
          : "Draft through LawDog’s clarifying interview, or prepare a PDF you already consider final.";

  return (
    <SimpleFlowShell title={title} subtitle={subtitle}>
      <div className="mx-auto w-full min-w-0 max-w-xl overflow-x-clip px-1">
        {start === "choice" ? (
          <div className="flex flex-col gap-4" data-testid="quick-intake-choice">
            <button
              type="button"
              data-testid="quick-intake-draft"
              className="vs01-btn vs01-btn--primary min-h-12 w-full text-left"
              onClick={() => goStart("type")}
            >
              <span className="block font-semibold">Draft a new agreement</span>
              <span className="mt-1 block text-sm font-normal opacity-90">
                Use LawDog’s structured clarifying interview. Missing parties, economics, governing law, or
                scope still get asked.
              </span>
            </button>
            <button
              type="button"
              data-testid="quick-intake-pdf"
              className="vs01-btn vs01-btn--secondary min-h-12 w-full text-left"
              onClick={() => goStart("pdf")}
            >
              <span className="block font-semibold">Sign an existing PDF</span>
              <span className="mt-1 block text-sm font-normal opacity-90">
                You are providing final paper. LawDog does not review its legal or commercial sufficiency.
              </span>
            </button>
            <button
              type="button"
              data-testid="quick-intake-speak"
              className="text-left text-sm text-slate-400 underline hover:text-slate-200"
              onClick={() => goStart("speak")}
            >
              I want to speak my request
            </button>
          </div>
        ) : null}

        {start === "type" || (start === "speak" && speakFallback) ? (
          <form
            className="flex min-w-0 flex-col gap-3"
            data-testid="quick-intake-typed"
            onSubmit={(e) => {
              e.preventDefault();
              handoffTyped(typedText, false);
            }}
          >
            {start === "speak" && speakFallback ? (
              <p
                className="rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
                data-testid="quick-intake-speak-fallback"
                role="status"
              >
                This browser cannot capture your microphone. Type your request instead — you will still enter
                the same clarifying interview.
              </p>
            ) : null}
            <label className="text-sm font-medium text-slate-300" htmlFor="quick-intake-text">
              Describe the agreement
            </label>
            <textarea
              id="quick-intake-text"
              data-testid="quick-intake-typed-text"
              className="min-h-36 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={SPARSE_HINT}
              disabled={typedBusy}
            />
            <button
              type="submit"
              data-testid="quick-intake-typed-submit"
              className="vs01-btn vs01-btn--primary min-h-11"
              disabled={typedBusy || !typedText.trim()}
            >
              {typedBusy ? "Opening interview…" : "Continue to clarifying interview"}
            </button>
            <button type="button" className="text-sm text-slate-500 underline" onClick={() => goStart("choice")}>
              Back to choices
            </button>
          </form>
        ) : null}

        {start === "speak" && !speakFallback ? (
          <div className="flex flex-col gap-3" data-testid="quick-intake-speak-ready">
            <p className="text-sm text-slate-300">
              Continue on Create to use LawDog’s supported voice intake. If capture fails there, you can type.
            </p>
            <button
              type="button"
              data-testid="quick-intake-speak-continue"
              className="vs01-btn vs01-btn--primary min-h-11"
              disabled={typedBusy}
              onClick={onSpeak}
            >
              {typedBusy ? "Opening Create…" : "Continue with speaking on Create"}
            </button>
            <button
              type="button"
              className="text-sm text-slate-400 underline"
              onClick={() => {
                setSpeakFallback(true);
                goStart("type");
              }}
            >
              Type instead
            </button>
          </div>
        ) : null}

        {start === "pdf" ? (
          <div className="flex min-w-0 flex-col gap-4" data-testid="quick-intake-pdf-pane">
            {access.kind === "loading" ? (
              <p className="text-sm text-slate-400" data-testid="quick-intake-pdf-loading" role="status">
                Checking whether you can prepare a PDF…
              </p>
            ) : null}
            {access.kind === "signed_out" || access.kind === "auth_failure" ? (
              <div data-testid="quick-intake-pdf-signin">
                <p className="text-sm text-slate-300">
                  Sign in to continue. We will not upload or store this PDF until you are signed in and
                  entitled.
                </p>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary mt-3 min-h-11"
                  data-testid="quick-intake-pdf-signin-cta"
                  onClick={() => navigate(QUICK_PDF_SIGN_IN_PATH)}
                >
                  Sign in to continue
                </button>
              </div>
            ) : null}
            {access.kind === "upgrade_required" || access.kind === "expired" ? (
              <div data-testid="quick-intake-pdf-upgrade">
                <p className="text-sm text-slate-300">
                  {access.kind === "expired"
                    ? "Your paid access is not active, so this PDF cannot be uploaded for e-sign."
                    : "Preparing an existing PDF for e-sign is a paid workspace action."}
                </p>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary mt-3 min-h-11"
                  data-testid="quick-intake-pdf-upgrade-cta"
                  onClick={() => navigate("/app/billing")}
                >
                  Review plans
                </button>
              </div>
            ) : null}
            {access.kind === "probe_failure" ? (
              <div data-testid="quick-intake-pdf-retry">
                <p className="text-sm text-slate-300">We couldn’t confirm your access. The PDF was not saved.</p>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary mt-3 min-h-11"
                  onClick={() => {
                    setStaleLoading(false);
                    setAccessNonce((n) => n + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {access.canUpload && !binding ? (
              <div className="flex min-w-0 flex-col gap-3">
                <label className="text-sm font-medium text-slate-300" htmlFor="quick-intake-pdf-file">
                  PDF file
                </label>
                <input
                  id="quick-intake-pdf-file"
                  data-testid="quick-intake-pdf-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="w-full min-w-0 text-sm text-slate-200"
                  disabled={uploading}
                  onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-slate-500">Selecting a file does not upload it.</p>
                <button
                  type="button"
                  data-testid="quick-intake-pdf-save"
                  className="vs01-btn vs01-btn--primary min-h-11"
                  disabled={uploading || !selectedFile}
                  onClick={() => void onSavePdf()}
                >
                  {uploading ? "Saving…" : "Save & continue"}
                </button>
              </div>
            ) : null}

            {binding ? (
              <div
                className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-3 text-sm text-emerald-50"
                data-testid="quick-intake-pdf-details"
              >
                <p className="font-semibold">PDF saved to your workspace</p>
                <dl className="mt-2 grid grid-cols-1 gap-1 break-all">
                  <div>
                    <dt className="text-emerald-200/80">Document ID</dt>
                    <dd data-testid="quick-intake-pdf-id">{binding.documentId}</dd>
                  </div>
                  <div>
                    <dt className="text-emerald-200/80">SHA-256</dt>
                    <dd data-testid="quick-intake-pdf-hash">{binding.contentSha256}</dd>
                  </div>
                  <div>
                    <dt className="text-emerald-200/80">Bytes</dt>
                    <dd data-testid="quick-intake-pdf-size">{binding.sizeBytes}</dd>
                  </div>
                  <div>
                    <dt className="text-emerald-200/80">Type</dt>
                    <dd data-testid="quick-intake-pdf-type">{binding.contentType}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-emerald-100/80">
                  Placement and sending come next. This step only confirms the exact PDF you uploaded.
                </p>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary mt-3 min-h-11"
                  data-testid="quick-intake-pdf-continue"
                  onClick={() => setShowCompletion(true)}
                >
                  Continue to placement
                </button>
              </div>
            ) : null}

            {binding && showCompletion ? <QuickPdfCompletion binding={binding} /> : null}

            {localError ? (
              <p className="text-sm text-rose-300" data-testid="quick-intake-pdf-error" role="alert">
                {localError}
              </p>
            ) : null}

            <button type="button" className="text-sm text-slate-500 underline" onClick={() => goStart("choice")}>
              Back to choices
            </button>
          </div>
        ) : null}
      </div>
    </SimpleFlowShell>
  );
}
