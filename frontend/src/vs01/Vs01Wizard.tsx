import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { JOY_COPY } from "../joy/clawJoyCopy";
import { useAccess } from "../access/AccessContext";
import { UpgradeLimitNotice } from "../components/access/UpgradeLimitNotice";
import "./vs01.css";
import { StepAgreementDetails } from "./StepAgreementDetails";
import { RecipientSigningView } from "./RecipientSigningView";
import { StepCompleteAndSend } from "./StepCompleteAndSend";
import { StepDocument } from "./StepDocument";
import { StepDone } from "./StepDone";
import { Vs01DocumentsList } from "./Vs01DocumentsList";
import { StepPrepareSignature } from "./StepPrepareSignature";
import { detailsStepIsValid } from "./detailsStepValidation";
import type { PlacedSigningField } from "./signingFields";
import { getVs01UrlBootstrap } from "./vs01UrlBootstrap";
import { fetchDocumentContent, getReceipt } from "./vs01Api";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { stashHeroIntakePrefill } from "../launch/heroIntakePrefill";
import { prepareFreshMarketingEntry } from "../launch/marketingSession";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  clearAgreementVs01BridgeSession,
  lawdogSenderFirstBridgeMetadataReady,
  readAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { sha256Bytes } from "../utils/agreements/hash";
import type {
  Vs01Counterparty,
  Vs01DocumentIntakeSource,
  Vs01FinalizeDocumentPayload,
  Vs01LoadingState,
  Vs01RecipientPlacedField,
  Vs01SenderSignatureRef,
  Vs01Step,
} from "./types";

function stripExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return fileName;
  return fileName.slice(0, i);
}

function defaultAgreementTitle(meta: { fileName: string; source: Vs01DocumentIntakeSource }): string {
  if (meta.source === "camera") {
    const d = new Date();
    return `Scanned Agreement ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  }
  const base = stripExtension(meta.fileName).trim();
  return base || meta.fileName;
}

const STEPS: { id: Vs01Step; label: string }[] = [
  { id: 0, label: "Document" },
  { id: 1, label: "Details" },
  { id: 2, label: "Signing" },
  { id: 3, label: "Recipient fields" },
  { id: 4, label: "Receipt" },
];

function initialCounterparties(): Vs01Counterparty[] {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return [{ id, name: "", email: "", phone: "" }];
}

/** Parsed once at module load; URL search cleared inside getVs01UrlBootstrap (StrictMode-safe memo). */
const VS01_URL_BOOT = typeof window !== "undefined" ? getVs01UrlBootstrap() : null;

const RECIPIENT_SIGNER_DEEP_LINK = VS01_URL_BOOT?.recipientSignerMode === true;
const RECIPIENT_LOCKED_CP_ID = VS01_URL_BOOT?.recipientLockedCounterpartyId ?? null;

const INITIAL_RECIPIENT_FIELDS: Vs01RecipientPlacedField[] =
  RECIPIENT_SIGNER_DEEP_LINK && VS01_URL_BOOT?.recipientHydratedFields
    ? VS01_URL_BOOT.recipientHydratedFields
    : [];

export type Vs01WizardProps = {
  /** Reserved for future controlled mode; shell ignores if unset. */
  initialStep?: Vs01Step;
  /** Open an existing finalized document by id (e.g. /app/esign/:id); loads bytes and content hash. */
  seedDocumentId?: string | null;
  /** Quick-send style: hide numbered stepper; user advances with each screen’s primary button. */
  hideStepper?: boolean;
  /** From `/app/quick?start=` — highlights entry path; PDF may auto-open file picker once. */
  quickEntryIntent?: "pdf" | "type" | "speak" | null;
};

/**
 * Envelope flow: document → details → sign → handoff → receipt.
 * Owns step index, finalize identifiers, counterparties, loading, and errors.
 */
export function Vs01Wizard({
  initialStep = 0,
  seedDocumentId = null,
  hideStepper = false,
  quickEntryIntent = null,
}: Vs01WizardProps) {
  const access = useAccess();
  const { navigate } = useLaunchNav();
  const handleQuickHandoffTypedIntake = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      prepareFreshMarketingEntry();
      logProductEvent("quick_entry_choose", { surface: "vs01", path: "type_handoff" });
      stashHeroIntakePrefill(t, { fromHomeSubmit: true });
      navigate("/app/create", {
        heroIntake: t,
        heroFromHome: true,
        heroVoiceFinalize: false,
        heroQuickSendTypedHandoff: true,
      });
    },
    [navigate],
  );
  const handleQuickHandoffSpeaking = useCallback(() => {
    prepareFreshMarketingEntry();
    logProductEvent("quick_entry_choose", { surface: "vs01", path: "speak" });
    navigate("/app/create");
  }, [navigate]);
  const countedSignatureReceiptRef = useRef<string | null>(null);
  const didLogVs01RouteMount = useRef(false);
  const [step, setStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.step ?? initialStep);
  /** Furthest step visited — gates Receipt until assign step satisfied. */
  const [furthestStep, setFurthestStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.furthestStep ?? initialStep);
  const [recipientPlacedFields, setRecipientPlacedFields] = useState<Vs01RecipientPlacedField[]>(
    () => INITIAL_RECIPIENT_FIELDS
  );
  const [recipientSigningFinished, setRecipientSigningFinished] = useState(false);
  const [senderPlacedFields, setSenderPlacedFields] = useState<PlacedSigningField[]>([]);
  const [senderSignatureRef, setSenderSignatureRef] = useState<Vs01SenderSignatureRef | null>(null);
  const [loading, setLoading] = useState<Vs01LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [agreementTitle, setAgreementTitle] = useState("");
  /** Once true, auto title from document must never run again this session. */
  const [agreementTitleUserEdited, setAgreementTitleUserEdited] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [senderMessage, setSenderMessage] = useState("");
  const [counterparties, setCounterparties] = useState<Vs01Counterparty[]>(
    () => VS01_URL_BOOT?.counterparties ?? initialCounterparties()
  );

  const [documentId, setDocumentId] = useState<string | null>(() => {
    const fromUrl = VS01_URL_BOOT?.documentId?.trim();
    if (fromUrl) return fromUrl;
    const seed = (seedDocumentId || "").trim();
    return seed || null;
  });
  const [contentSha256, setContentSha256] = useState<string | null>(null);
  /** Set when document finalize succeeds — drives default agreement title. */
  const [documentMeta, setDocumentMeta] = useState<{
    fileName: string;
    source: Vs01DocumentIntakeSource;
  } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(() => VS01_URL_BOOT?.receiptId ?? null);
  const [receiptHashSha256, setReceiptHashSha256] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);

  useEffect(() => {
    const seed = (seedDocumentId || "").trim();
    if (!seed || didLogVs01RouteMount.current) return;
    didLogVs01RouteMount.current = true;
    // eslint-disable-next-line no-console
    console.info("[vs01-route-mounted]", { seedDocumentId: seed, hideStepper });
  }, [seedDocumentId, hideStepper]);

  useEffect(() => {
    if (!VS01_URL_BOOT) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReceipt(VS01_URL_BOOT.receiptId);
        if (cancelled) return;
        const raw = data.receipt !== undefined ? data.receipt : data;
        let hash: string | null = null;
        if (typeof data.receipt_hash_sha256 === "string" && data.receipt_hash_sha256.trim()) {
          hash = data.receipt_hash_sha256.trim();
        } else if (raw && typeof raw === "object" && raw !== null && "receipt_hash_sha256" in raw) {
          const h = (raw as { receipt_hash_sha256?: unknown }).receipt_hash_sha256;
          if (typeof h === "string" && h.trim()) hash = h.trim();
        }
        setReceipt(raw);
        if (hash) setReceiptHashSha256(hash);
      } catch {
        /* receipt optional for placement; hash/id already from URL where applicable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultSignerRef =
    [creatorName.trim(), creatorEmail.trim()].filter(Boolean).join(" · ") || "signer";

  const detailsOk = useMemo(
    () => detailsStepIsValid(agreementTitle, creatorName, creatorEmail, counterparties),
    [agreementTitle, creatorName, creatorEmail, counterparties]
  );

  const docFinalized = Boolean(documentId && contentSha256);

  const canReachStep = useCallback(
    (id: Vs01Step): boolean => {
      if (id === 0) return true;
      if (id === 1) return docFinalized;
      if (id === 2) return docFinalized && detailsOk;
      if (id === 3) return !!receiptId;
      if (id === 4) {
        return (
          !!receiptId &&
          furthestStep >= 3 &&
          recipientPlacedFields.length > 0
        );
      }
      return false;
    },
    [docFinalized, detailsOk, receiptId, furthestStep, recipientPlacedFields.length]
  );

  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
    setFurthestStep((prev) => (target > prev ? target : prev));
    setError(null);
  }, []);

  /** Deep link: /app/esign/:documentId — fetch content and bind hash so steps 1+ unlock. */
  useEffect(() => {
    if (RECIPIENT_SIGNER_DEEP_LINK) return;
    const sid = (seedDocumentId || "").trim();
    if (!sid) return;
    if (VS01_URL_BOOT?.documentId?.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fetchDocumentContent(sid);
        const buf = await blob.arrayBuffer();
        const hex = (await sha256Bytes(buf)).toLowerCase();
        if (cancelled) return;
        setDocumentId(sid);
        setContentSha256(hex);

        const bridgeParams = new URLSearchParams(window.location.search);
        const bridge = readAgreementVs01BridgeSession();
        if (bridgeParams.get("agreement_bridge") === "1" && bridge?.vs01DocumentId === sid) {
          const cps =
            bridge.counterparties?.length > 0 ? bridge.counterparties : initialCounterparties();
          const detailsReady = detailsStepIsValid(
            bridge.agreementTitle || "",
            bridge.creatorName || "",
            bridge.creatorEmail || "",
            cps,
          );
          const senderFirstSkipDetails = lawdogSenderFirstBridgeMetadataReady(bridge, cps);
          const titleForUi = (bridge.agreementTitle || "").trim() || "Agreement";
          flushSync(() => {
            setAgreementTitle(titleForUi);
            setCreatorName(bridge.creatorName || "");
            setCreatorEmail(bridge.creatorEmail || "");
            setCounterparties(cps);
            setAgreementTitleUserEdited(Boolean((bridge.agreementTitle || "").trim()));
            setDocumentMeta({
              fileName: `${titleForUi.replace(/[/\\]/g, "-")}.pdf`,
              source: "upload",
            });
          });
          clearAgreementVs01BridgeSession();
          bridgeParams.delete("agreement_bridge");
          const qs = bridgeParams.toString();
          window.history.replaceState(
            window.history.state,
            "",
            qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
          );
          const nextStep: Vs01Step = senderFirstSkipDetails
            ? 2
            : detailsReady && bridge.targetStep >= 2
              ? 2
              : 1;
          // eslint-disable-next-line no-console
          console.info("[vs01-bridge-hydrate]", {
            agreementId: bridge.agreementId,
            vs01DocumentId: bridge.vs01DocumentId,
            agreementTitle: bridge.agreementTitle,
            targetStep: bridge.targetStep,
            nextStep,
            senderFirstLawdogHandoff: Boolean(bridge.senderFirstLawdogHandoff),
            senderFirstSkipDetails,
            detailsReady,
            counterpartiesCount: cps.length,
          });
          setFurthestStep((prev) => (nextStep > prev ? nextStep : prev));
          goToStep(nextStep);
          return;
        }

        setFurthestStep((prev) => (1 > prev ? 1 : prev));
        goToStep(1);
      } catch (e) {
        console.error("[Vs01Wizard] seed document load failed", e);
        if (!cancelled) setError("Could not load this document. Check the link or start a new packet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedDocumentId, goToStep]);

  const handleFinalized = useCallback(
    (payload: Vs01FinalizeDocumentPayload) => {
      setDocumentId(payload.documentId ? payload.documentId : null);
      setContentSha256(payload.contentSha256 ? payload.contentSha256 : null);
      setSenderPlacedFields([]);
      setSenderSignatureRef(null);
      setRecipientPlacedFields([]);
      if (!payload.documentId?.trim()) {
        setDocumentMeta(null);
        return;
      }
      const fn = payload.fileName?.trim();
      if (fn && payload.source) {
        setDocumentMeta({ fileName: fn, source: payload.source });
      }
      const did = (payload.documentId || "").trim();
      const hash = (payload.contentSha256 || "").trim();
      if (hideStepper && did && hash) {
        goToStep(1);
      }
    },
    [hideStepper, goToStep]
  );

  useEffect(() => {
    if (step !== 1) return;
    if (agreementTitleUserEdited) return;
    if (!documentMeta) return;
    setAgreementTitle(defaultAgreementTitle(documentMeta));
  }, [step, documentMeta, agreementTitleUserEdited]);

  const handleSigned = useCallback(
    (payload: {
      receiptId: string;
      receiptHashSha256: string;
      receipt: unknown;
      senderPlacedFields: PlacedSigningField[];
      senderSignatureRef: Vs01SenderSignatureRef | null;
    }) => {
      const rid = payload.receiptId?.trim() || "";
      if (rid && countedSignatureReceiptRef.current !== rid) {
        countedSignatureReceiptRef.current = rid;
        if (access.check("signature_request").allowed) {
          access.recordUsage("signature_requests");
        }
      }
      setReceiptId(payload.receiptId || null);
      setReceiptHashSha256(payload.receiptHashSha256 || null);
      setReceipt(payload.receipt ?? null);
      setSenderPlacedFields(payload.senderPlacedFields ?? []);
      setSenderSignatureRef(payload.senderSignatureRef ?? null);
    },
    [access]
  );

  const handleReceiptUpdated = useCallback(
    (payload: { receipt: unknown; receiptHashSha256?: string | null }) => {
      setReceipt(payload.receipt);
      if (payload.receiptHashSha256 != null && String(payload.receiptHashSha256).trim() !== "") {
        setReceiptHashSha256(String(payload.receiptHashSha256).trim());
      }
    },
    []
  );

  const resetAll = useCallback(() => {
    setAgreementTitle("");
    setAgreementTitleUserEdited(false);
    setDocumentMeta(null);
    setCreatorName("");
    setCreatorEmail("");
    setSenderMessage("");
    setCounterparties(initialCounterparties());
    setDocumentId(null);
    setContentSha256(null);
    setReceiptId(null);
    setReceiptHashSha256(null);
    setReceipt(null);
    setRecipientPlacedFields([]);
    setSenderPlacedFields([]);
    setSenderSignatureRef(null);
    setStep(0);
    setFurthestStep(0);
    setError(null);
  }, []);

  const stepCount = STEPS.length;

  const vs01DocumentsUpdatedMs = useMemo(
    () => Date.now(),
    [step, documentId, receiptId, agreementTitle, documentMeta?.fileName]
  );

  const namedCounterpartyCount = useMemo(
    () => counterparties.filter((c) => c.name.trim().length > 0).length,
    [counterparties]
  );

  /** Paid Pro `/app/esign/:id` — avoid Step 0 upload UI + documents rail flash while bytes load. */
  const seedDirectLayout = useMemo(
    () => Boolean((seedDocumentId || "").trim() && hideStepper),
    [seedDocumentId, hideStepper],
  );
  const seedAwaitingContentSha = useMemo(
    () => seedDirectLayout && !((contentSha256 || "").trim()),
    [seedDirectLayout, contentSha256],
  );
  const showVs01DocumentsRail = useMemo(
    () => !(hideStepper && (seedDocumentId || "").trim()),
    [hideStepper, seedDocumentId],
  );
  const counterpartyGate = access.check("add_vs01_counterparty", {
    vs01NamedCounterpartyCount: namedCounterpartyCount,
  });
  const esignGate = access.check("esign_flow");
  const signatureGate = access.check("signature_request");

  if (RECIPIENT_SIGNER_DEEP_LINK && RECIPIENT_LOCKED_CP_ID) {
    return (
      <>
        {error ? (
          <div className="vs01-error-banner" role="alert">
            {error}
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              style={{ marginTop: "0.5rem", width: "auto" }}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div
          className="vs01-card vs01-card--envelope vs01-recipient-signing-shell"
          data-vs01-receipt-id={receiptId ?? ""}
          data-vs01-receipt-hash={receiptHashSha256 ?? ""}
          data-vs01-receipt-present={receipt != null ? "1" : "0"}
        >
          {recipientSigningFinished ? (
            <section className="vs01-recipient-signing-done" aria-labelledby="vs01-recipient-done-title">
              <h2 id="vs01-recipient-done-title" className="vs01-card-title">
                {JOY_COPY.signLockedIn}
              </h2>
              <p className="vs01-card-help">
                Saved in this session. The sender continues from their receipt flow when everyone has signed.
              </p>
            </section>
          ) : (
            <RecipientSigningView
              documentId={documentId}
              counterparties={counterparties}
              lockedCounterpartyId={RECIPIENT_LOCKED_CP_ID}
              recipientFields={recipientPlacedFields}
              senderPlacedFields={senderPlacedFields}
              senderSignatureRef={senderSignatureRef}
              onRecipientFieldsChange={setRecipientPlacedFields}
              onError={setError}
              onFinishSigning={() => setRecipientSigningFinished(true)}
              manifestDecodeError={VS01_URL_BOOT?.recipientManifestDecodeError ?? null}
              manifestParamPresent={VS01_URL_BOOT?.recipientManifestParamPresent ?? false}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {error ? (
        <div className="vs01-error-banner" role="alert">
          {error}
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            style={{ marginTop: "0.5rem", width: "auto" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {counterpartyGate.approaching && counterpartyGate.allowed ? (
        <UpgradeLimitNotice gate={counterpartyGate} className="mb-3" />
      ) : null}
      {!esignGate.allowed && step >= 2 ? (
        <UpgradeLimitNotice gate={esignGate} className="mb-3" />
      ) : null}
      {!signatureGate.allowed && step >= 2 ? (
        <UpgradeLimitNotice gate={signatureGate} className="mb-3" />
      ) : null}

      {!hideStepper ? (
        <nav className="vs01-stepper" aria-label={`VS01 flow: ${stepCount} steps from document to receipt`}>
          {STEPS.map(({ id, label }) => {
            const active = id === step;
            const future = id > step;
            const blocked = future && !canReachStep(id);
            const stepNum = id + 1;
            return (
              <button
                key={id}
                type="button"
                className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
                disabled={blocked}
                aria-current={active ? "step" : undefined}
                aria-label={
                  blocked
                    ? `Step ${stepNum} of ${stepCount}: ${label} (complete earlier steps first)`
                    : `Step ${stepNum} of ${stepCount}: ${label}`
                }
                onClick={() => {
                  if (!blocked) goToStep(id);
                }}
              >
                <span className="vs01-stepper-num">{stepNum}</span>
                <span className="vs01-stepper-label">{label}</span>
              </button>
            );
          })}
        </nav>
      ) : hideStepper && step === 0 ? null : (
        <p className="mb-4 text-center text-sm leading-relaxed text-slate-400" aria-live="polite">
          Step {step + 1} of {stepCount}
        </p>
      )}

      <div
        className="vs01-card vs01-card--envelope"
        data-vs01-active-step={step}
        data-vs01-receipt-id={receiptId ?? ""}
        data-vs01-receipt-hash={receiptHashSha256 ?? ""}
        data-vs01-receipt-present={receipt != null ? "1" : "0"}
      >
        {seedAwaitingContentSha ? (
          <div className="vs01-details-step" aria-busy="true" aria-live="polite">
            <p className="vs01-card-help text-center text-slate-300">Loading your document…</p>
          </div>
        ) : step === 0 ? (
          <StepDocument
            loading={loading}
            setLoading={setLoading}
            documentId={documentId}
            contentSha256={contentSha256}
            onFinalized={handleFinalized}
            onError={setError}
            entryIntent={quickEntryIntent}
            onQuickHandoffTypedIntake={hideStepper ? handleQuickHandoffTypedIntake : undefined}
            onQuickHandoffSpeaking={hideStepper ? handleQuickHandoffSpeaking : undefined}
            onContinue={() => {
              /* Details step is index 1. Advance when finalize produced ids (mirrors docFinalized / canReachStep(1)). */
              const did = documentId?.trim();
              const hash = contentSha256?.trim();
              if (did && hash && loading === "idle") goToStep(1);
            }}
          />
        ) : null}
        {step === 1 ? (
          <StepAgreementDetails
            agreementTitle={agreementTitle}
            onAgreementTitleChange={(v) => {
              setAgreementTitleUserEdited(true);
              setAgreementTitle(v);
            }}
            creatorName={creatorName}
            onCreatorNameChange={setCreatorName}
            creatorEmail={creatorEmail}
            onCreatorEmailChange={setCreatorEmail}
            counterparties={counterparties}
            onCounterpartiesChange={setCounterparties}
            senderMessage={senderMessage}
            onSenderMessageChange={setSenderMessage}
            loading={loading}
            onError={setError}
            onBack={() => goToStep(0)}
            onContinue={() => {
              if (!esignGate.allowed) {
                setError(esignGate.message || "This step isn’t available on your plan.");
                return;
              }
              if (detailsOk) goToStep(2);
            }}
            counterpartyCapacityReached={
              access.entitlements.max_vs01_counterparties != null &&
              namedCounterpartyCount >= access.entitlements.max_vs01_counterparties
            }
            counterpartyCapacityHint={counterpartyGate.message}
            hidePhoneFields={hideStepper}
          />
        ) : null}
        {step === 2 ? (
          <StepPrepareSignature
            defaultSignerRef={defaultSignerRef}
            documentId={documentId}
            contentSha256={contentSha256}
            receiptId={receiptId}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onSigned={handleSigned}
            counterparties={counterparties}
            senderMessage={senderMessage}
            onBack={() => goToStep(1)}
            onContinue={() => {
              if (receiptId) goToStep(3);
            }}
          />
        ) : null}
        {step === 3 ? (
          <StepCompleteAndSend
            documentId={documentId}
            counterparties={counterparties}
            recipientFields={recipientPlacedFields}
            onRecipientFieldsChange={setRecipientPlacedFields}
            senderPlacedFields={senderPlacedFields}
            senderSignatureRef={senderSignatureRef}
            onError={setError}
            onBack={() => goToStep(2)}
            onContinueToReceipt={() => {
              if (recipientPlacedFields.length > 0) goToStep(4);
            }}
          />
        ) : null}
        {step === 4 ? (
          <StepDone
            counterparties={counterparties}
            recipientPlacedFields={recipientPlacedFields}
            documentId={documentId}
            receiptId={receiptId}
            receiptHashSha256={receiptHashSha256}
            receipt={receipt}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onReceiptUpdated={handleReceiptUpdated}
            onStartOver={resetAll}
            compactCompletion={hideStepper}
          />
        ) : null}
      </div>

      {showVs01DocumentsRail ? (
        <Vs01DocumentsList
          documentMeta={documentMeta}
          documentId={documentId}
          agreementTitle={agreementTitle}
          counterparties={counterparties}
          step={step}
          goToStep={goToStep}
          updatedAtMs={vs01DocumentsUpdatedMs}
        />
      ) : null}
    </>
  );
}
