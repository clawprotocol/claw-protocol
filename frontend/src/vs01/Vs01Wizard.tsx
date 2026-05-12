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
  clearPaidProAgreementBridgeSkipMarker,
  computePaidProAgreementBridgeSkip,
  readAgreementVs01BridgeSession,
  readPaidProAgreementBridgeSkipMarker,
  type AgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import {
  clearPaidProVs01PostSignHandoff,
  writePaidProVs01PostSignHandoff,
  type PaidProVs01PostSignHandoffV1,
} from "./vs01PaidProPostSignHandoff";
import { sha256Bytes } from "../utils/agreements/hash";
import {
  clearVs01DraftState,
  loadVs01DraftState,
  mergeBridgeEmailsIntoSavedCounterparties,
  saveVs01DraftState,
} from "./vs01DraftStatePersist";
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
  /** Fires whenever the active VS01 step changes (used by shell to update hero copy). */
  onStepChange?: (step: Vs01Step) => void;
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
  onStepChange,
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
  /** Paid Pro `/app/esign/:id?agreement_bridge=1` — LawDog already collected signers; never show VS01 details step. */
  const [paidProAgreementBridgeSkip] = useState(() =>
    computePaidProAgreementBridgeSkip(seedDocumentId, hideStepper),
  );
  const bridgeHydratedSeedSid = useRef<string | null>(null);
  const bridgeHandoffSnapshotRef = useRef<AgreementVs01BridgeSession | null>(null);
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
    if (RECIPIENT_SIGNER_DEEP_LINK) {
      // eslint-disable-next-line no-console
      console.info("[vs01-recipient-route-guard]", {
        recipientSign: true,
        blockedSenderSetup: true,
        recipientFieldCount: INITIAL_RECIPIENT_FIELDS.length,
        lockedCounterpartyId: RECIPIENT_LOCKED_CP_ID,
        manifestParamPresent: VS01_URL_BOOT?.recipientManifestParamPresent ?? false,
        manifestDecodeError: VS01_URL_BOOT?.recipientManifestDecodeError ?? null,
        documentId: VS01_URL_BOOT?.documentId ?? null,
      });
      if (INITIAL_RECIPIENT_FIELDS.length === 0 && VS01_URL_BOOT?.recipientManifestParamPresent) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-recipient-field-mismatch]", {
          reason: "zero_fields_despite_manifest_param",
          lockedCounterpartyId: RECIPIENT_LOCKED_CP_ID,
          documentId: VS01_URL_BOOT?.documentId,
          hint: "Fields were expected but hydration returned empty. Check manifest encoding/storage.",
        });
      }
    }
  }, [seedDocumentId, hideStepper]);

  useEffect(() => {
    bridgeHandoffSnapshotRef.current = null;
    bridgeHydratedSeedSid.current = null;
  }, [seedDocumentId]);

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
      if (id === 2) return docFinalized && (paidProAgreementBridgeSkip || detailsOk);
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
    [docFinalized, detailsOk, paidProAgreementBridgeSkip, receiptId, furthestStep, recipientPlacedFields.length]
  );

  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
    setFurthestStep((prev) => (target > prev ? target : prev));
    setError(null);
    onStepChangeRef.current?.(target);
  }, []);

  useEffect(() => {
    if (!paidProAgreementBridgeSkip) return;
    if (step !== 1) return;
    goToStep(2);
  }, [paidProAgreementBridgeSkip, step, goToStep]);

  /* Skip marker + bridge session persist across refresh; cleared in resetAll or post-sign navigate. */

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

        if (bridgeHydratedSeedSid.current === sid) {
          return;
        }

        const bridgeParams = new URLSearchParams(window.location.search);
        const agreementBridgeQuery = bridgeParams.get("agreement_bridge") === "1";
        const rawBridge = readAgreementVs01BridgeSession();
        const bridge: AgreementVs01BridgeSession | null =
          rawBridge && rawBridge.vs01DocumentId.trim() === sid
            ? rawBridge
            : bridgeHandoffSnapshotRef.current &&
                bridgeHandoffSnapshotRef.current.vs01DocumentId.trim() === sid
              ? bridgeHandoffSnapshotRef.current
              : null;

        const paidProAgreementHandoff =
          hideStepper &&
          Boolean(sid) &&
          (readPaidProAgreementBridgeSkipMarker(sid) ||
            (agreementBridgeQuery &&
              bridge !== null &&
              bridge.vs01DocumentId.trim() === sid));

        if (paidProAgreementHandoff && bridge && bridge.vs01DocumentId.trim() === sid) {
          bridgeHandoffSnapshotRef.current = bridge;
          bridgeHydratedSeedSid.current = sid;
          const saved = loadVs01DraftState(sid);
          const bridgeCps =
            bridge.counterparties?.length > 0 ? bridge.counterparties : initialCounterparties();
          const cps = saved && saved.counterparties.length > 0
            ? mergeBridgeEmailsIntoSavedCounterparties(saved.counterparties, bridgeCps)
            : bridgeCps;
          const titleForUi = (saved?.agreementTitle || bridge.agreementTitle || "").trim() || "Agreement";
          flushSync(() => {
            setAgreementTitle(titleForUi);
            setCreatorName(saved?.creatorName || bridge.creatorName || "");
            setCreatorEmail(saved?.creatorEmail || bridge.creatorEmail || "");
            setCounterparties(cps);
            setAgreementTitleUserEdited(Boolean(titleForUi));
            setDocumentMeta({
              fileName: `${titleForUi.replace(/[/\\]/g, "-")}.pdf`,
              source: "upload",
            });
            if (saved) {
              setSenderPlacedFields(saved.senderPlacedFields);
              setRecipientPlacedFields(saved.recipientPlacedFields);
              setSenderMessage(saved.senderMessage || "");
              if (saved.senderSignatureRef) setSenderSignatureRef(saved.senderSignatureRef);
            }
          });
          const nextStep: Vs01Step = saved ? saved.step : 2;
          // eslint-disable-next-line no-console
          console.info("[vs01-paid-pro-skip-details]", {
            seedDocumentId: sid,
            bridgeSource: bridge.source ?? null,
            signerFirst: bridge.signerFirst ?? null,
            senderFirstLawdogHandoff: bridge.senderFirstLawdogHandoff ?? null,
            nextStep,
            hydratedFromSaved: Boolean(saved),
          });
          // eslint-disable-next-line no-console
          console.info("[vs01-bridge-hydrate]", {
            agreementId: bridge.agreementId,
            vs01DocumentId: bridge.vs01DocumentId,
            agreementTitle: bridge.agreementTitle,
            targetStep: bridge.targetStep,
            nextStep,
            paidProAgreementHandoff: true,
            counterpartiesCount: cps.length,
            savedFieldCount: saved ? saved.senderPlacedFields.length + saved.recipientPlacedFields.length : 0,
          });
          if (saved) {
            // eslint-disable-next-line no-console
            console.info("[vs01-draft-state-hydrate-applied]", {
              documentId: sid,
              step: saved.step,
              senderPlacedFields: saved.senderPlacedFields.length,
              recipientPlacedFields: saved.recipientPlacedFields.length,
              counterparties: saved.counterparties.length,
            });
          }
          const fs = (saved ? Math.max(nextStep, saved.furthestStep) : nextStep) as Vs01Step;
          setFurthestStep((prev) => ((fs > prev ? fs : prev) as Vs01Step));
          goToStep(nextStep);
          bridgeParams.delete("agreement_bridge");
          const qs = bridgeParams.toString();
          window.setTimeout(() => {
            try {
              window.history.replaceState(
                window.history.state,
                "",
                qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
              );
            } catch {
              /* ignore */
            }
          }, 0);
          return;
        }

        /* Non-bridge seed path: hydrate saved draft state if available. */
        const saved = loadVs01DraftState(sid);
        bridgeHydratedSeedSid.current = sid;
        if (saved && saved.senderPlacedFields.length > 0) {
          flushSync(() => {
            if (saved.agreementTitle) setAgreementTitle(saved.agreementTitle);
            if (saved.creatorName) setCreatorName(saved.creatorName);
            if (saved.creatorEmail) setCreatorEmail(saved.creatorEmail);
            if (saved.senderMessage) setSenderMessage(saved.senderMessage);
            if (saved.counterparties.length > 0) setCounterparties(saved.counterparties);
            setSenderPlacedFields(saved.senderPlacedFields);
            setRecipientPlacedFields(saved.recipientPlacedFields);
            if (saved.senderSignatureRef) setSenderSignatureRef(saved.senderSignatureRef);
          });
          // eslint-disable-next-line no-console
          console.info("[vs01-draft-state-hydrate-applied]", {
            documentId: sid,
            step: saved.step,
            senderPlacedFields: saved.senderPlacedFields.length,
            recipientPlacedFields: saved.recipientPlacedFields.length,
            counterparties: saved.counterparties.length,
          });
          const fs = Math.max(saved.step, saved.furthestStep) as Vs01Step;
          setFurthestStep((prev) => ((fs > prev ? fs : prev) as Vs01Step));
          goToStep(saved.step);
        } else {
          setFurthestStep((prev) => (1 > prev ? 1 : prev));
          goToStep(1);
        }
      } catch (e) {
        console.error("[Vs01Wizard] seed document load failed", e);
        if (!cancelled) setError("Could not load this document. Check the link or start a new packet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedDocumentId, goToStep, hideStepper]);

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
    if (paidProAgreementBridgeSkip) return;
    if (step !== 1) return;
    if (agreementTitleUserEdited) return;
    if (!documentMeta) return;
    setAgreementTitle(defaultAgreementTitle(documentMeta));
  }, [paidProAgreementBridgeSkip, step, documentMeta, agreementTitleUserEdited]);

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
    const did = documentId?.trim();
    clearPaidProVs01PostSignHandoff();
    clearPaidProAgreementBridgeSkipMarker();
    clearAgreementVs01BridgeSession();
    if (did) clearVs01DraftState(did, "reset_all");
    bridgeHandoffSnapshotRef.current = null;
    bridgeHydratedSeedSid.current = null;
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
  }, [documentId]);

  /* ---- Auto-save draft state on meaningful changes ---- */
  const draftStateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const did = (documentId || "").trim();
    if (!did) return;
    if (step < 1) return;
    if (draftStateSaveTimerRef.current) clearTimeout(draftStateSaveTimerRef.current);
    draftStateSaveTimerRef.current = setTimeout(() => {
      saveVs01DraftState({
        v: 1,
        documentId: did,
        step,
        furthestStep,
        agreementTitle,
        creatorName,
        creatorEmail,
        senderMessage,
        counterparties,
        senderPlacedFields,
        recipientPlacedFields,
        senderSignatureRef,
        savedAt: Date.now(),
      });
    }, 400);
    return () => {
      if (draftStateSaveTimerRef.current) clearTimeout(draftStateSaveTimerRef.current);
    };
  }, [
    documentId,
    step,
    furthestStep,
    agreementTitle,
    creatorName,
    creatorEmail,
    senderMessage,
    counterparties,
    senderPlacedFields,
    recipientPlacedFields,
    senderSignatureRef,
  ]);

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
      ) : hideStepper && step === 0 ? null : paidProAgreementBridgeSkip ? (
        <p className="mb-4 text-center text-sm leading-relaxed text-slate-400" aria-live="polite">
          E-sign setup
        </p>
      ) : (
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
            <p className="vs01-card-help text-center text-slate-300">
              {paidProAgreementBridgeSkip ? "Loading signing workspace…" : "Loading your document…"}
            </p>
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
        {step === 1 && !paidProAgreementBridgeSkip ? (
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
            creatorEmail={creatorEmail.trim() ? creatorEmail.trim() : undefined}
            senderMessage={senderMessage}
            agreementBridgePlacementCopy={paidProAgreementBridgeSkip}
            fields={senderPlacedFields}
            onFieldsChange={setSenderPlacedFields}
            onBack={() => goToStep(paidProAgreementBridgeSkip ? 0 : 1)}
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
              if (recipientPlacedFields.length === 0) return;
              const linkedAgreementId = bridgeHandoffSnapshotRef.current?.agreementId?.trim();
              const rid = receiptId?.trim();
              const did = documentId?.trim();
              if (paidProAgreementBridgeSkip && linkedAgreementId && rid && did) {
                const named = counterparties
                  .map((c, recipientIndex) => ({ c, recipientIndex }))
                  .filter(({ c }) => c.name.trim().length > 0);
                const signers = named.map(({ c, recipientIndex }) => ({
                  counterpartyId: c.id,
                  displayName: c.name.trim(),
                  email: c.email.trim(),
                  signingUrl: buildVs01RecipientSigningUrl({
                    recipientIndex,
                    recipientName: c.name.trim(),
                    recipientEmail: c.email.trim(),
                    counterpartyId: c.id,
                    documentId: did,
                    receiptId: rid,
                    recipientFieldsForSigner: recipientPlacedFields.filter((f) => f.counterpartyId === c.id),
                  }),
                }));
                const payload: PaidProVs01PostSignHandoffV1 = {
                  v: 1,
                  agreementId: linkedAgreementId,
                  agreementTitle: agreementTitle.trim() || "Agreement",
                  vs01DocumentId: did,
                  receiptId: rid,
                  receiptHashSha256: receiptHashSha256?.trim() ?? null,
                  savedAt: new Date().toISOString(),
                  signers,
                };
                writePaidProVs01PostSignHandoff(payload);
                // eslint-disable-next-line no-console
                console.info("[flow] vs01_signature_complete", {
                  agreementId: linkedAgreementId,
                  receiptId: rid,
                  signerCount: signers.length,
                  vs01DocumentId: did,
                });
                // eslint-disable-next-line no-console
                console.info("[vs01-paid-pro-workspace-navigate]", {
                  agreementId: linkedAgreementId,
                  receiptId: rid,
                  signerCount: signers.length,
                  vs01DocumentId: did,
                });
                clearVs01DraftState(did, "post_sign_navigate");
                navigate(`/app/agreements/${encodeURIComponent(linkedAgreementId)}?vs01_saved=1`);
                return;
              }
              goToStep(4);
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
