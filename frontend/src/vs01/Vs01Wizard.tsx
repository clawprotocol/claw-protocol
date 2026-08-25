import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { JOY_COPY } from "../joy/clawJoyCopy";
import { useAccess } from "../access/AccessContext";
import { UpgradeLimitNotice } from "../components/access/UpgradeLimitNotice";
import "./vs01.css";
import { StepAgreementDetails } from "./StepAgreementDetails";
import { RecipientSigningView } from "./RecipientSigningView";
import { StepCompleteAndSend } from "./StepCompleteAndSend";
import { StepSigningPacketStatus } from "./StepSigningPacketStatus";
import { StepDocument } from "./StepDocument";
import { StepDone } from "./StepDone";
import { Vs01DocumentsList } from "./Vs01DocumentsList";
import { StepPrepareSignature } from "./StepPrepareSignature";
import { detailsStepIsValid } from "./detailsStepValidation";
import type { PlacedSigningField } from "./signingFields";
import { getVs01UrlBootstrap } from "./vs01UrlBootstrap";
import { resolveReviewerEffectiveAccessToken } from "../agreement/reviewerTokenPersistence";
import { markAgreementFieldsPlacedCount, markAgreementPacketPrepared, isAgreementPacketPrepared } from "./vs01WorkspaceSigningStatus";
import { fetchDocumentContent, fetchDocumentEsignHandoff, getReceipt } from "./vs01Api";
import { useAuth } from "../auth/AuthProvider";
import { shouldDeferVs01SeedDocumentLoad } from "./vs01SeedDocumentAuthGate";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { stashHeroIntakePrefill } from "../launch/heroIntakePrefill";
import { prepareFreshMarketingEntry } from "../launch/marketingSession";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  canFinishPreparingSigningPacket,
  logVs01PartySigningRolesForBridgeSession,
  shouldBlockVs01SignatureCompleteTelemetry,
} from "../agreement/partySigningRoles";
import {
  clearAgreementVs01BridgeSession,
  clearPaidProAgreementBridgeSkipMarker,
  computePaidProAgreementBridgeSkip,
  esignHandoffPayloadToAgreementVs01Bridge,
  readAgreementVs01BridgeSession,
  readDurableAgreementVs01Bridge,
  readPaidProAgreementBridgeSkipMarker,
  writeAgreementVs01BridgeSession,
  type AgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { resolvePrepareBridgeSigningCorpus } from "./vs01PrepareBridgeCorpus";
import {
  isPaidSessionSignatureTrackBridge,
  vs01PaidSessionWorkspaceHydrateMinCorpusLen,
} from "../components/agreements/paidProPaidSessionLanding";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { buildVs01CanonicalPacketSeed, hasVs01CanonicalPacketCached, storeVs01CanonicalPacketSeed } from "./vs01CanonicalPacketSeed";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import {
  clearPaidProVs01PostSignHandoff,
  writePaidProVs01PostSignHandoff,
  type PaidProVs01PostSignHandoffV1,
} from "./vs01PaidProPostSignHandoff";
import { sha256Bytes } from "../utils/agreements/hash";
import {
  buildVs01PrepareSigningRolesForBridge,
} from "../components/agreements/paidProNPartySignerSetup";
import {
  migrateLegacyRecipientPlacedFields,
  migrateLegacySenderPlacedFields,
} from "./vs01SignerFieldAssignment";
import { buildFullPacketSigningManifestFields } from "./vs01SigningPacketManifest";
import { Vs01PrepareRoleAuthorityProvider } from "./Vs01PrepareRoleAuthorityContext";
import {
  buildOwnerPlacementValueContext,
  logVs01PrepareSignerMetadataUpdated,
  patchCounterpartySignerMetadataRaw,
  seedPrepareFieldsFromRoleSignerMetadata,
  syncRecipientFieldsForRoleSignerMetadata,
  syncSenderFieldsForRoleSignerMetadata,
} from "./vs01PrepareSignerMetadata";
import {
  buildPrepareMissingBySignerSummary,
  formatPrepareFinishBlockedMessage,
  logVs01PrepareFinishBlocked,
} from "./vs01PreparePacketCompletion";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import { sealPortablePacketEnvelopeProvenance } from "./vs01SigningEnvelopeProvenance";
import { dispatchSigningInvitesFromHandoff } from "./vs01SigningInviteDelivery";
import { paidProPacketReadyDashboardPath } from "./vs01PaidProPacketReadyNavigation";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import type { Vs01RecipientIdentityAuthority } from "./vs01RecipientIdentityAuthority";
import { logVs01LifecycleEvent } from "./vs01LifecycleAudit";
import { readSigningPacketStatus } from "./vs01SigningPacketStatusStore";
import { recordVs01SignerCompletion } from "./vs01SignerCompletionSync";
import {
  clearVs01DraftState,
  loadVs01DraftState,
  mergeBridgeMetadataIntoSavedCounterparties,
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
const RECIPIENT_AGREEMENT_ID = (VS01_URL_BOOT?.recipientAgreementId ?? "").trim();
const RECIPIENT_LOCKED_SIGNER_ROLE_ID = VS01_URL_BOOT?.recipientLockedSignerRoleId ?? null;
const RECIPIENT_ACCESS_TOKEN = (() => {
  const aid = (VS01_URL_BOOT?.recipientAgreementId ?? "").trim();
  if (!aid) return "";
  const fromBoot = (VS01_URL_BOOT?.recipientAccessToken ?? "").trim();
  if (fromBoot) return fromBoot;
  return resolveReviewerEffectiveAccessToken({ agreementId: aid }).token;
})();

const INITIAL_RECIPIENT_FIELDS: Vs01RecipientPlacedField[] =
  RECIPIENT_SIGNER_DEEP_LINK && VS01_URL_BOOT?.recipientHydratedFields
    ? VS01_URL_BOOT.recipientHydratedFields
    : [];

const RECIPIENT_NEEDS_SERVER_HYDRATION =
  RECIPIENT_SIGNER_DEEP_LINK &&
  Boolean(RECIPIENT_AGREEMENT_ID) &&
  Boolean((VS01_URL_BOOT?.documentId ?? "").trim()) &&
  (!hasVs01CanonicalPacketCached((VS01_URL_BOOT?.documentId ?? "").trim()) ||
    (INITIAL_RECIPIENT_FIELDS.length === 0 &&
      (VS01_URL_BOOT?.recipientManifestParamPresent ?? false)));

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
  const { enabled: authEnabled, loading: authLoading } = useAuth();
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
  const recipientAuthorityResolvedRef = useRef(false);
  const recipientAuthorityIdentityRef = useRef<Vs01RecipientIdentityAuthority | null>(null);
  /** Paid Pro `/app/esign/:id?agreement_bridge=1` — LawDog already collected signers; never show VS01 details step. */
  const [paidProAgreementBridgeSkip] = useState(() =>
    computePaidProAgreementBridgeSkip(seedDocumentId, hideStepper),
  );
  const [vs01LinkedAgreementId, setVs01LinkedAgreementId] = useState<string | null>(() =>
    RECIPIENT_AGREEMENT_ID || null,
  );
  const [prepareActiveSignerRoleId, setPrepareActiveSignerRoleId] = useState<string | null>(null);
  const [prepareCorpusText, setPrepareCorpusText] = useState<string | null>(null);
  const bridgeHydratedSeedSid = useRef<string | null>(null);
  const bridgeHandoffSnapshotRef = useRef<AgreementVs01BridgeSession | null>(null);
  const prepareInitialsEnabledRef = useRef(true);
  const [step, setStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.step ?? initialStep);
  /** Furthest step visited — gates Receipt until assign step satisfied. */
  const [furthestStep, setFurthestStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.furthestStep ?? initialStep);
  const [recipientLockedCpId, setRecipientLockedCpId] = useState<string | null>(
    () => RECIPIENT_LOCKED_CP_ID,
  );
  const [recipientLockedSignerRoleId, setRecipientLockedSignerRoleId] = useState<string | null>(
    () => RECIPIENT_LOCKED_SIGNER_ROLE_ID,
  );
  const [recipientPlacedFields, setRecipientPlacedFields] = useState<Vs01RecipientPlacedField[]>(
    () => INITIAL_RECIPIENT_FIELDS
  );
  const [recipientServerHydrationPending, setRecipientServerHydrationPending] = useState(
    () => RECIPIENT_NEEDS_SERVER_HYDRATION,
  );
  const [recipientAuthoritativeInitialsEnabled, setRecipientAuthoritativeInitialsEnabled] = useState<
    boolean | null | undefined
  >(() => (RECIPIENT_NEEDS_SERVER_HYDRATION ? null : undefined));
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
  const [creatorSignerName, setCreatorSignerName] = useState("");
  const [creatorSignerTitle, setCreatorSignerTitle] = useState("");
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

  useEffect(() => {
    const did = (documentId ?? "").trim();
    const aid = (vs01LinkedAgreementId ?? "").trim();
    const corpus = (prepareCorpusText ?? "").trim();
    const seedMinLen = vs01PaidSessionWorkspaceHydrateMinCorpusLen({
      agreementBridge: true,
      paidProHandoff: paidProAgreementBridgeSkip,
      paidSessionDurablePacket: true,
    });
    if (!paidProAgreementBridgeSkip || !did || !aid || corpus.length < seedMinLen) return;
    const seed = buildVs01CanonicalPacketSeed({
      documentId: did,
      agreementId: aid,
      corpusPlain: corpus,
      minCorpusLen: seedMinLen,
    });
    if (seed) storeVs01CanonicalPacketSeed(seed);
  }, [paidProAgreementBridgeSkip, documentId, vs01LinkedAgreementId, prepareCorpusText]);

  const [contentSha256, setContentSha256] = useState<string | null>(null);
  /** Set when document finalize succeeds — drives default agreement title. */
  const [documentMeta, setDocumentMeta] = useState<{
    fileName: string;
    source: Vs01DocumentIntakeSource;
  } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(() => VS01_URL_BOOT?.receiptId ?? null);
  const [receiptHashSha256, setReceiptHashSha256] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);
  const [packetHandoff, setPacketHandoff] = useState<PaidProVs01PostSignHandoffV1 | null>(null);

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
        hasAgreementId: Boolean(RECIPIENT_AGREEMENT_ID),
        signerRoleIdShort: RECIPIENT_LOCKED_SIGNER_ROLE_ID
          ? RECIPIENT_LOCKED_SIGNER_ROLE_ID.slice(0, 16)
          : null,
      });
      if (INITIAL_RECIPIENT_FIELDS.length === 0 && VS01_URL_BOOT?.recipientManifestParamPresent && !RECIPIENT_AGREEMENT_ID) {
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
    if (!RECIPIENT_SIGNER_DEEP_LINK || !recipientLockedCpId) return;
    if (recipientAuthorityResolvedRef.current) return;
    const agreementId = RECIPIENT_AGREEMENT_ID;
    const did = (documentId ?? VS01_URL_BOOT?.documentId ?? "").trim();
    if (!agreementId || !did) {
      setRecipientServerHydrationPending(false);
      setRecipientAuthoritativeInitialsEnabled(null);
      return;
    }
    let cancelled = false;
    setRecipientServerHydrationPending(true);
    const lockedCp = recipientLockedCpId;
    const recipientName =
      (VS01_URL_BOOT?.counterparties.find((c) => c.id === lockedCp)?.name ?? "").trim() ||
      (counterparties.find((c) => c.id === lockedCp)?.name ?? "").trim();
    const recipientEmail =
      (VS01_URL_BOOT?.counterparties.find((c) => c.id === lockedCp)?.email ?? "").trim() ||
      (counterparties.find((c) => c.id === lockedCp)?.email ?? "").trim();
    void bootstrapVs01RecipientSigningAuthority({
      agreementId,
      documentId: did,
      packetRevision: VS01_URL_BOOT?.packetRevision ?? null,
      recipientAccessToken: RECIPIENT_ACCESS_TOKEN,
      urlSignerRoleId: recipientLockedSignerRoleId,
      urlCounterpartyId: lockedCp,
      urlRecipientIndex: VS01_URL_BOOT?.recipientIndex ?? null,
      urlRecipientName: recipientName || "Recipient",
      urlRecipientEmail: recipientEmail,
    }).then((result) => {
      if (cancelled) return;
      setRecipientServerHydrationPending(false);
      if (result.ok) {
        recipientAuthorityResolvedRef.current = true;
        recipientAuthorityIdentityRef.current = result.identity;
        setRecipientLockedSignerRoleId(result.identity.lockedSignerRoleId);
        setRecipientLockedCpId(result.identity.lockedCounterpartyId);
        setRecipientPlacedFields(result.fields);
        setRecipientAuthoritativeInitialsEnabled(result.initialsEnabled);
        if (result.counterparties.length > 0) {
          setCounterparties(result.counterparties);
        }
        if (!vs01LinkedAgreementId) {
          setVs01LinkedAgreementId(agreementId);
        }
        // eslint-disable-next-line no-console
        console.info("[vs01-recipient-server-hydration]", {
          agreementIdShort: agreementId.slice(0, 16),
          documentIdShort: did.slice(0, 8),
          fieldCount: result.fields.length,
          source: "server_packet",
          signerCount: result.signerCount,
          initialsEnabled: result.initialsEnabled,
          identitySource: result.identity.source,
        });
        return;
      }
      if ("mismatch" in result && result.mismatch) {
        setRecipientAuthoritativeInitialsEnabled(null);
        setError(result.mismatch.message);
        return;
      }
      if ("inviteSuperseded" in result && result.inviteSuperseded) {
        setRecipientAuthoritativeInitialsEnabled(null);
        setError(
          result.message?.trim() || "This invite was replaced. Ask the sender for the latest link.",
        );
        return;
      }
      // Path rule: do not stay on “Loading signing fields…” after the packet miss.
      setRecipientAuthoritativeInitialsEnabled(undefined);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[vs01-recipient-server-hydration-miss]", {
          agreementIdShort: agreementId.slice(0, 16),
          documentIdShort: did.slice(0, 8),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, recipientLockedCpId]);

  useEffect(() => {
    bridgeHandoffSnapshotRef.current = null;
    bridgeHydratedSeedSid.current = null;
  }, [seedDocumentId]);

  useEffect(() => {
    if (!VS01_URL_BOOT) return;
    const receiptId = (VS01_URL_BOOT.receiptId ?? "").trim();
    if (!receiptId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReceipt(receiptId);
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

  const prepareSignerRoles = useMemo(() => {
    const aid = (vs01LinkedAgreementId ?? "").trim();
    if (!paidProAgreementBridgeSkip || !aid) return null;
    const bridge =
      readDurableAgreementVs01Bridge((documentId || seedDocumentId || "").trim()) ??
      readAgreementVs01BridgeSession();
    return buildVs01PrepareSigningRolesForBridge({
      agreementId: aid,
      creatorName,
      creatorEmail,
      ownerSignerName: creatorSignerName,
      ownerSignerTitle: creatorSignerTitle,
      counterparties,
      bridge,
    });
  }, [
    paidProAgreementBridgeSkip,
    vs01LinkedAgreementId,
    counterparties,
    creatorName,
    creatorEmail,
    creatorSignerName,
    creatorSignerTitle,
  ]);

  const handlePrepareSignerMetadataChange = useCallback(
    (args: { roleId: string; signerName?: string; signerTitle?: string }) => {
      const roles = prepareSignerRoles;
      if (!roles?.length) return;
      const role = roles.find((r) => r.roleId === args.roleId);
      if (!role) return;
      const valueCtx = buildOwnerPlacementValueContext({ creatorName, creatorEmail });
      let nextRole: (typeof roles)[number] = role;
      const aid = (vs01LinkedAgreementId ?? "").trim();
      if (role.kind === "owner") {
        const nextOwnerSigner =
          args.signerName !== undefined ? args.signerName : creatorSignerName;
        const nextOwnerTitle =
          args.signerTitle !== undefined ? args.signerTitle : creatorSignerTitle;
        if (args.signerName !== undefined) setCreatorSignerName(args.signerName);
        if (args.signerTitle !== undefined) setCreatorSignerTitle(args.signerTitle);
        if (aid) {
          const rebuilt = buildVs01PrepareSigningRolesForBridge({
            agreementId: aid,
            creatorName,
            creatorEmail,
            ownerSignerName: nextOwnerSigner,
            ownerSignerTitle: nextOwnerTitle,
            counterparties,
            bridge:
              bridgeHandoffSnapshotRef.current ??
              readDurableAgreementVs01Bridge((documentId || seedDocumentId || "").trim()) ??
              readAgreementVs01BridgeSession(),
          });
          const rebuiltRole = rebuilt.find((r) => r.roleId === args.roleId);
          if (rebuiltRole) {
            nextRole = rebuiltRole;
            const ctx = buildOwnerPlacementValueContext({
              creatorName,
              creatorEmail,
            });
            setSenderPlacedFields((fields) =>
              syncSenderFieldsForRoleSignerMetadata(fields, rebuiltRole, ctx),
            );
            setRecipientPlacedFields((fields) =>
              syncRecipientFieldsForRoleSignerMetadata(fields, rebuiltRole, ctx),
            );
          }
        }
      } else if (role.vs01CounterpartyId) {
        const cpId = role.vs01CounterpartyId;
        setCounterparties((prev) => {
          const nextCps = patchCounterpartySignerMetadataRaw(prev, cpId, {
            signerName: args.signerName,
            signerTitle: args.signerTitle,
          });
          if (aid) {
            const rebuilt = buildVs01PrepareSigningRolesForBridge({
              agreementId: aid,
              creatorName,
              creatorEmail,
              ownerSignerName: creatorSignerName,
              ownerSignerTitle: creatorSignerTitle,
              counterparties: nextCps,
              bridge:
              bridgeHandoffSnapshotRef.current ??
              readDurableAgreementVs01Bridge((documentId || seedDocumentId || "").trim()) ??
              readAgreementVs01BridgeSession(),
            });
            const rebuiltRole = rebuilt.find((r) => r.roleId === args.roleId);
            if (rebuiltRole) {
              nextRole = rebuiltRole;
              setSenderPlacedFields((fields) =>
                syncSenderFieldsForRoleSignerMetadata(fields, rebuiltRole, valueCtx),
              );
              setRecipientPlacedFields((fields) =>
                syncRecipientFieldsForRoleSignerMetadata(fields, rebuiltRole, valueCtx),
              );
            }
          }
          return nextCps;
        });
      }
      logVs01PrepareSignerMetadataUpdated({
        roleId: args.roleId,
        partyName: nextRole.partyName,
        signerName: nextRole.signerName ?? null,
        signerTitle: nextRole.signerTitle ?? null,
      });
    },
    [prepareSignerRoles, creatorName, creatorEmail, creatorSignerName, creatorSignerTitle, vs01LinkedAgreementId],
  );

  useEffect(() => {
    if (!prepareSignerRoles?.length) return;
    const ownerId = prepareSignerRoles[0]!.roleId;
    setPrepareActiveSignerRoleId((cur) => {
      if (cur && prepareSignerRoles.some((r) => r.roleId === cur)) return cur;
      return ownerId;
    });
  }, [prepareSignerRoles]);

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
      if (id === 3) return docFinalized && (paidProAgreementBridgeSkip || detailsOk) && (!!receiptId || paidProAgreementBridgeSkip);
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

  const completeBridgePreparePacket = useCallback(() => {
    const linkedAgreementId =
      (vs01LinkedAgreementId ?? "").trim() ||
      bridgeHandoffSnapshotRef.current?.agreementId?.trim() ||
      "";
    const did = documentId?.trim() ?? "";
    if (!linkedAgreementId || !did) {
      setError("Agreement or document is not ready yet.");
      return;
    }
    if (isAgreementPacketPrepared(linkedAgreementId)) {
      // eslint-disable-next-line no-console
      console.info("[vs01-packet-prepare-idempotent-skip]", { agreementId: linkedAgreementId });
      navigate(paidProPacketReadyDashboardPath());
      return;
    }
    const bridge =
      bridgeHandoffSnapshotRef.current ??
      readDurableAgreementVs01Bridge(did) ??
      readAgreementVs01BridgeSession();
    const result = handlePreparePacketContinue({
      agreementId: linkedAgreementId,
      agreementTitle,
      documentId: did,
      creatorName,
      creatorEmail,
      ownerSignerName: creatorSignerName,
      ownerSignerTitle: creatorSignerTitle,
      counterparties,
      senderPlacedFields,
      recipientPlacedFields,
      prepareCorpusPlain: prepareCorpusText,
      initialsEnabled: prepareInitialsEnabledRef.current,
      receiptId,
      receiptHashSha256,
      bridge,
    });
    if (!result.ok) {
      setError(result.finish.message);
      if (result.finish.focusRoleId) {
        setPrepareActiveSignerRoleId(result.finish.focusRoleId);
      }
      return;
    }
    writePaidProVs01PostSignHandoff(result.handoff);
    setPacketHandoff(result.handoff);
    clearVs01DraftState(did, "packet_ready_in_wizard");
    const placedCount = senderPlacedFields.length + recipientPlacedFields.length;
    if (placedCount > 0) {
      markAgreementFieldsPlacedCount(linkedAgreementId, placedCount);
    }
    // eslint-disable-next-line no-console
    console.info("[vs01-packet-prepared]", {
      agreementId: linkedAgreementId,
      documentIdShort: did.slice(0, 8),
      counterpartySignerCount: result.handoff.signers.length,
      totalParticipantCount: result.handoff.signers.length + 1,
      senderMustSignFirst: result.handoff.senderMustSignFirst ?? false,
      fieldsPlacedCount: placedCount,
    });
    const roles = result.roles;
    void (async () => {
      let portablePacket = result.portablePacket;
      if (portablePacket) {
        try {
          portablePacket = await sealPortablePacketEnvelopeProvenance({
            documentId: did,
            portable: portablePacket,
            roles,
          });
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Signing packet provenance could not be sealed against the accepted agreement.",
          );
          return;
        }
      }
      if (!portablePacket) {
        setError("The signing packet could not be built. Signing links were not sent.");
        return;
      }
      const delivery = await dispatchSigningInvitesFromHandoff(result.handoff, roles, {
        portablePacket,
        documentId: did,
        afterPayCeremony: Boolean(
          paidProAgreementBridgeSkip ||
            isPaidSessionSignatureTrackBridge(
              bridgeHandoffSnapshotRef.current ??
                readDurableAgreementVs01Bridge(did) ??
                readAgreementVs01BridgeSession(),
            ),
        ),
      });
      // eslint-disable-next-line no-console
      console.info("[vs01-signing-invites-dispatched]", {
        agreementIdShort: linkedAgreementId.slice(0, 16),
        attempted: delivery.attempted,
        ok: delivery.ok,
        sentCount: delivery.sentCount,
        skipReason: delivery.skipReason,
        packetDigestShort: portablePacket?.envelopeProvenance?.packetDigest?.slice(0, 16) ?? null,
        acceptedSoTDigestShort:
          portablePacket?.envelopeProvenance?.acceptedSoTDigest?.slice(0, 16) ?? null,
      });
      if (delivery.attempted && !delivery.ok) {
        setError(
          delivery.skipReason
            ? `Signing links could not be persisted (${delivery.skipReason}).`
            : "Signing links could not be persisted.",
        );
        return;
      }
      markAgreementPacketPrepared(linkedAgreementId);
      clearAgreementVs01BridgeSession();
      clearPaidProAgreementBridgeSkipMarker();
      // eslint-disable-next-line no-console
      console.info("[vs01-paid-pro-workspace-navigate]", {
        agreementId: linkedAgreementId,
        packetPrepareOnly: true,
        signerCount: result.handoff.signers.length,
        vs01DocumentId: did,
        destination: paidProPacketReadyDashboardPath(),
      });
      navigate(paidProPacketReadyDashboardPath());
    })();
  }, [
    vs01LinkedAgreementId,
    documentId,
    agreementTitle,
    creatorName,
    creatorEmail,
    creatorSignerName,
    creatorSignerTitle,
    counterparties,
    senderPlacedFields,
    recipientPlacedFields,
    receiptId,
    receiptHashSha256,
    navigate,
    prepareCorpusText,
  ]);

  useEffect(() => {
    if (!paidProAgreementBridgeSkip || step !== 2) return;
    const aid = (vs01LinkedAgreementId ?? "").trim();
    const did = documentId?.trim() ?? "";
    if (!aid || !did) return;
    logVs01LifecycleEvent({
      event: "vs01_prepare_started",
      agreementId: aid,
      documentId: did,
    });
  }, [paidProAgreementBridgeSkip, step, vs01LinkedAgreementId, documentId]);

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
    // Wait for AuthProvider session restore so clawAgreementHeaders can attach Bearer.
    if (shouldDeferVs01SeedDocumentLoad({ authEnabled, authLoading })) return;
    let cancelled = false;
    void (async () => {
      const hydrateLocalPaidProBridge = (): boolean => {
        if (bridgeHydratedSeedSid.current === sid) return true;
        const bridgeParams = new URLSearchParams(window.location.search);
        const agreementBridgeQuery = bridgeParams.get("agreement_bridge") === "1";
        // Durable packet (localStorage / session / in-memory) — not first-SPA agreement_bridge=1 only.
        const allowBridgeCorpusHydrate =
          sid.startsWith("local_doc_") || sid.startsWith("doc_");
        if (!allowBridgeCorpusHydrate) return false;
        const rawBridge = readDurableAgreementVs01Bridge(sid);
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
            (bridge !== null && bridge.vs01DocumentId.trim() === sid) ||
            (agreementBridgeQuery &&
              bridge !== null &&
              bridge.vs01DocumentId.trim() === sid));
        if (!paidProAgreementHandoff || !bridge || bridge.vs01DocumentId.trim() !== sid) return false;
        const corpus = (bridge.agreementCorpusText ?? "").trim();
        const hydrateMinLen = vs01PaidSessionWorkspaceHydrateMinCorpusLen({
          agreementBridge: allowBridgeCorpusHydrate || agreementBridgeQuery,
          paidProHandoff: paidProAgreementHandoff,
          paidSessionDurablePacket: true,
        });
        if (corpus.length < hydrateMinLen) return false;
        if (cancelled) return false;
        setDocumentId(sid);
        setContentSha256(`corpus:${fingerprintAgreementBody(corpus)}`);
        bridgeHandoffSnapshotRef.current = bridge;
        bridgeHydratedSeedSid.current = sid;
        logVs01PartySigningRolesForBridgeSession(bridge);
        const saved = loadVs01DraftState(sid);
        const bridgeCps =
          bridge.counterparties?.length > 0 ? bridge.counterparties : initialCounterparties();
        const cps = saved && saved.counterparties.length > 0
          ? mergeBridgeMetadataIntoSavedCounterparties(saved.counterparties, bridgeCps)
          : bridgeCps;
        const titleForUi = (saved?.agreementTitle || bridge.agreementTitle || "").trim() || "Agreement";
        const cn = saved?.creatorName || bridge.creatorName || "";
        const ce = saved?.creatorEmail || bridge.creatorEmail || "";
        const csn = saved?.creatorSignerName || bridge.creatorSignerName || "";
        const cst = saved?.creatorSignerTitle || bridge.creatorSignerTitle || "";
        const rolesForM = buildVs01PrepareSigningRolesForBridge({
          agreementId: bridge.agreementId,
          creatorName: cn,
          creatorEmail: ce,
          ownerSignerName: csn,
          ownerSignerTitle: cst,
          counterparties: cps,
          bridge,
        });
        const ownerR = rolesForM[0]!;
        flushSync(() => {
          setVs01LinkedAgreementId(bridge.agreementId);
          const signingCorpus = resolvePrepareBridgeSigningCorpus({
            agreementId: bridge.agreementId,
            draft: null,
            bridge,
          });
          setPrepareCorpusText(signingCorpus.corpus.trim() || corpus || null);
          setAgreementTitle(titleForUi);
          setCreatorName(cn);
          setCreatorEmail(ce);
          setCreatorSignerName(csn);
          setCreatorSignerTitle(cst);
          setCounterparties(cps);
          setAgreementTitleUserEdited(Boolean(titleForUi));
          setDocumentMeta({
            fileName: `${titleForUi.replace(/[/\\]/g, "-")}.pdf`,
            source: "upload",
          });
          const ownerCtxForSeed = buildOwnerPlacementValueContext({ creatorName: cn, creatorEmail: ce });
          const seedValueCtx = (role: (typeof rolesForM)[number]) =>
            role.kind === "owner"
              ? ownerCtxForSeed
              : { typedName: "", initials: "", signerEmail: undefined };
          setSenderPlacedFields((p) =>
            seedPrepareFieldsFromRoleSignerMetadata(
              migrateLegacySenderPlacedFields(p, ownerR),
              rolesForM,
              seedValueCtx,
            ),
          );
          setRecipientPlacedFields((p) =>
            seedPrepareFieldsFromRoleSignerMetadata(
              migrateLegacyRecipientPlacedFields(p, rolesForM),
              rolesForM,
              seedValueCtx,
            ),
          );
        });
        const nextStep: Vs01Step = saved ? saved.step : 2;
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
        return true;
      };

      if (hydrateLocalPaidProBridge()) return;

      try {
        const remote = await fetchDocumentEsignHandoff(sid);
        if (remote && !cancelled) {
          const mapped = esignHandoffPayloadToAgreementVs01Bridge(sid, remote);
          if (mapped) {
            writeAgreementVs01BridgeSession(mapped);
            if (hydrateLocalPaidProBridge()) return;
          }
        }
      } catch {
        /* fall through to document GET */
      }
      if (cancelled) return;

      try {
        const blob = await fetchDocumentContent(sid);
        const buf = await blob.arrayBuffer();
        const hex = (await sha256Bytes(buf)).toLowerCase();
        if (cancelled) return;
        setError(null);
        setDocumentId(sid);
        setContentSha256(hex);

        if (bridgeHydratedSeedSid.current === sid) {
          return;
        }

        const bridgeParams = new URLSearchParams(window.location.search);
        const agreementBridgeQuery = bridgeParams.get("agreement_bridge") === "1";
        const rawBridge = readDurableAgreementVs01Bridge(sid);
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
            (bridge !== null && bridge.vs01DocumentId.trim() === sid) ||
            (agreementBridgeQuery &&
              bridge !== null &&
              bridge.vs01DocumentId.trim() === sid));

        if (paidProAgreementHandoff && bridge && bridge.vs01DocumentId.trim() === sid) {
          bridgeHandoffSnapshotRef.current = bridge;
          bridgeHydratedSeedSid.current = sid;
          // eslint-disable-next-line no-console
          console.info("[vs01-mode-resolved]", {
            mode: bridge.agreementBridgeMode ?? null,
            bridgeSource: bridge.source ?? null,
            signerFirst: bridge.signerFirst ?? null,
            ownerIsPreparingPacket: bridge.ownerIsPreparingPacket ?? null,
            agreementIdShort: bridge.agreementId.trim().slice(0, 8),
            documentIdShort: sid.slice(0, 8),
          });
          logVs01PartySigningRolesForBridgeSession(bridge);
          const saved = loadVs01DraftState(sid);
          const bridgeCps =
            bridge.counterparties?.length > 0 ? bridge.counterparties : initialCounterparties();
          const cps = saved && saved.counterparties.length > 0
            ? mergeBridgeMetadataIntoSavedCounterparties(saved.counterparties, bridgeCps)
            : bridgeCps;
          const titleForUi = (saved?.agreementTitle || bridge.agreementTitle || "").trim() || "Agreement";
          const cn = saved?.creatorName || bridge.creatorName || "";
          const ce = saved?.creatorEmail || bridge.creatorEmail || "";
          const csn = saved?.creatorSignerName || bridge.creatorSignerName || "";
          const cst = saved?.creatorSignerTitle || bridge.creatorSignerTitle || "";
          const rolesForM = buildVs01PrepareSigningRolesForBridge({
            agreementId: bridge.agreementId,
            creatorName: cn,
            creatorEmail: ce,
            ownerSignerName: csn,
            ownerSignerTitle: cst,
            counterparties: cps,
            bridge,
          });
          if (import.meta.env.MODE !== "test") {
            // eslint-disable-next-line no-console
            console.info("[vs01-role-signer-metadata-resolved]", {
              roleCount: rolesForM.length,
              withSignerName: rolesForM.filter((r) => Boolean((r.signerName ?? "").trim())).length,
              withSignerTitle: rolesForM.filter((r) => Boolean((r.signerTitle ?? "").trim())).length,
            });
          }
          const ownerR = rolesForM[0]!;
          flushSync(() => {
            setVs01LinkedAgreementId(bridge.agreementId);
            const signingCorpus = resolvePrepareBridgeSigningCorpus({
              agreementId: bridge.agreementId,
              draft: null,
              bridge,
            });
            setPrepareCorpusText(
              signingCorpus.corpus.trim() || (bridge.agreementCorpusText ?? "").trim() || null,
            );
            setAgreementTitle(titleForUi);
            setCreatorName(cn);
            setCreatorEmail(ce);
            setCreatorSignerName(csn);
            setCreatorSignerTitle(cst);
            setCounterparties(cps);
            setAgreementTitleUserEdited(Boolean(titleForUi));
            setDocumentMeta({
              fileName: `${titleForUi.replace(/[/\\]/g, "-")}.pdf`,
              source: "upload",
            });
            const ownerCtxForSeed = buildOwnerPlacementValueContext({ creatorName: cn, creatorEmail: ce });
            const seedValueCtx = (role: (typeof rolesForM)[number]) =>
              role.kind === "owner"
                ? ownerCtxForSeed
                : { typedName: "", initials: "", signerEmail: undefined };
            if (saved) {
              const migratedSender = migrateLegacySenderPlacedFields(saved.senderPlacedFields, ownerR);
              const migratedRecipient = migrateLegacyRecipientPlacedFields(saved.recipientPlacedFields, rolesForM);
              setSenderPlacedFields(seedPrepareFieldsFromRoleSignerMetadata(migratedSender, rolesForM, seedValueCtx));
              setRecipientPlacedFields(
                seedPrepareFieldsFromRoleSignerMetadata(migratedRecipient, rolesForM, seedValueCtx),
              );
              setSenderMessage(saved.senderMessage || "");
              if (saved.senderSignatureRef) setSenderSignatureRef(saved.senderSignatureRef);
            } else {
              setSenderPlacedFields((p) =>
                seedPrepareFieldsFromRoleSignerMetadata(
                  migrateLegacySenderPlacedFields(p, ownerR),
                  rolesForM,
                  seedValueCtx,
                ),
              );
              setRecipientPlacedFields((p) =>
                seedPrepareFieldsFromRoleSignerMetadata(
                  migrateLegacyRecipientPlacedFields(p, rolesForM),
                  rolesForM,
                  seedValueCtx,
                ),
              );
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
            if (saved.creatorSignerName) setCreatorSignerName(saved.creatorSignerName);
            if (saved.creatorSignerTitle) setCreatorSignerTitle(saved.creatorSignerTitle);
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
        if (hydrateLocalPaidProBridge()) return;
        console.error("[Vs01Wizard] seed document load failed", e);
        if (!cancelled) setError("Could not load this document. Check the link or start a new packet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedDocumentId, goToStep, hideStepper, authEnabled, authLoading]);

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
    setCreatorSignerName("");
    setCreatorSignerTitle("");
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
        creatorSignerName: creatorSignerName.trim() || undefined,
        creatorSignerTitle: creatorSignerTitle.trim() || undefined,
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
    creatorSignerName,
    creatorSignerTitle,
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

  if (RECIPIENT_SIGNER_DEEP_LINK && recipientLockedCpId) {
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
                You're all set. A copy of the signed record will be available to the sender, and email
                delivery will be used when enabled. The sender will be notified when all signatures are
                complete.
              </p>
            </section>
          ) : (
            <RecipientSigningView
              documentId={documentId}
              counterparties={counterparties}
              lockedCounterpartyId={recipientLockedCpId}
              recipientAgreementId={RECIPIENT_AGREEMENT_ID || null}
              lockedSignerRoleId={recipientLockedSignerRoleId}
              packetRevision={VS01_URL_BOOT?.packetRevision ?? null}
              recipientFields={recipientPlacedFields}
              senderPlacedFields={senderPlacedFields}
              senderSignatureRef={senderSignatureRef}
              onRecipientFieldsChange={setRecipientPlacedFields}
              onError={setError}
              onFinishSigning={() => {
                if (!recipientAuthorityResolvedRef.current || !recipientAuthorityIdentityRef.current) {
                  setError(
                    "Your signing session could not be verified. Open the link from your email or ask the sender to resend.",
                  );
                  return;
                }
                const authority = recipientAuthorityIdentityRef.current;
                setRecipientSigningFinished(true);
                const aid = RECIPIENT_AGREEMENT_ID.trim();
                const roleKey = authority.lockedSignerRoleId.trim();
                if (aid && roleKey) {
                  void recordVs01SignerCompletion({
                    agreementId: aid,
                    documentId: documentId ?? "",
                    signerRoleId: roleKey,
                    partyIndex: authority.partyIndex,
                    participantId: authority.lockedCounterpartyId,
                    displayName:
                      counterparties.find((c) => c.id === authority.lockedCounterpartyId)?.signerName ??
                      authority.recipientName ??
                      null,
                    recipientFields: recipientPlacedFields,
                    recipientAccessToken: RECIPIENT_ACCESS_TOKEN || null,
                  }).then((result) => {
                    const snap = result.localSnapshot ?? readSigningPacketStatus(aid);
                    const remainingSigners = snap
                      ? Object.entries(snap.bySignerKey).filter(([, status]) => status !== "signed").length
                      : null;
                    logVs01LifecycleEvent({
                      event: "vs01_signer_completed",
                      agreementId: aid,
                      documentId: documentId ?? undefined,
                      signerRoleId: roleKey,
                      partyIndex: authority.partyIndex,
                      fieldType: "signature",
                      status: "signed",
                    });
                    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
                      // eslint-disable-next-line no-console
                      console.info("[vs01_signer_completed]", {
                        agreement_id: aid.slice(0, 16),
                        document_id: documentId?.slice(0, 16) ?? null,
                        signer_role_id: roleKey.slice(0, 24),
                        party_index: authority.partyIndex,
                        field_type: "signature",
                        signed_by: roleKey.slice(0, 24),
                        remaining_signers: remainingSigners,
                        server_synced: result.serverSynced,
                        fully_signed: result.fullySigned,
                        completion_emails_sent: result.completionEmailsSent,
                      });
                    }
                    if (result.fullySigned) {
                      logVs01LifecycleEvent({
                        event: "vs01_packet_fully_signed",
                        agreementId: aid,
                        documentId: documentId ?? undefined,
                      });
                    }
                  });
                }
              }}
              manifestDecodeError={VS01_URL_BOOT?.recipientManifestDecodeError ?? null}
              manifestParamPresent={VS01_URL_BOOT?.recipientManifestParamPresent ?? false}
              serverHydrationPending={recipientServerHydrationPending}
              authoritativeInitialsEnabled={recipientAuthoritativeInitialsEnabled}
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
        {paidProAgreementBridgeSkip && prepareSignerRoles?.length ? (
          <Vs01PrepareRoleAuthorityProvider
            prepareSignerRoles={prepareSignerRoles}
            prepareActiveSignerRoleId={prepareActiveSignerRoleId ?? undefined}
            onPrepareActiveSignerRoleChange={setPrepareActiveSignerRoleId}
          >
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
                prepareAgreementId={vs01LinkedAgreementId || null}
                prepareCorpusText={prepareCorpusText}
                prepareSignerRoles={prepareSignerRoles}
                prepareRecipientPlacedFields={recipientPlacedFields}
                onPrepareSignerMetadataChange={handlePrepareSignerMetadataChange}
                onPrepareInitialsEnabledChange={(enabled) => {
                  prepareInitialsEnabledRef.current = enabled;
                }}
                fields={senderPlacedFields}
                onFieldsChange={setSenderPlacedFields}
                onBack={() => goToStep(0)}
                onContinue={() => {
                  if (paidProAgreementBridgeSkip) {
                    completeBridgePreparePacket();
                    return;
                  }
                  if (receiptId) goToStep(3);
                }}
              />
            ) : null}
            {step === 3 && packetHandoff && prepareSignerRoles?.length ? (
              <StepSigningPacketStatus
                handoff={packetHandoff}
                prepareSignerRoles={prepareSignerRoles}
                senderPlacedFields={senderPlacedFields}
                recipientPlacedFields={recipientPlacedFields}
                creatorDisplayName={creatorName}
                onBack={() => goToStep(2)}
              />
            ) : null}
            {step === 3 && !packetHandoff ? (
              <StepCompleteAndSend
            documentId={documentId}
            counterparties={counterparties}
            recipientFields={recipientPlacedFields}
            onRecipientFieldsChange={setRecipientPlacedFields}
            senderPlacedFields={senderPlacedFields}
            senderSignatureRef={senderSignatureRef}
            prepareSigningPacket={paidProAgreementBridgeSkip}
            preparePacketAgreementId={vs01LinkedAgreementId}
            prepareCreatorName={creatorName}
            prepareCreatorEmail={creatorEmail}
            prepareSignerRoles={prepareSignerRoles}
            onError={setError}
            onBack={() => goToStep(2)}
            onContinueToReceipt={() => {
              const namedCounterparties = counterparties.filter((c) => c.name.trim().length > 0);
              if (
                !paidProAgreementBridgeSkip &&
                recipientPlacedFields.length === 0 &&
                namedCounterparties.length > 0
              ) {
                return;
              }
              const linkedAgreementId = bridgeHandoffSnapshotRef.current?.agreementId?.trim();
              const rid = receiptId?.trim() ?? "";
              const did = documentId?.trim();
              const bridgeMode = bridgeHandoffSnapshotRef.current?.agreementBridgeMode ?? null;
              const ownerPrep = bridgeHandoffSnapshotRef.current?.ownerIsPreparingPacket ?? false;
              const blockSigTelemetry = shouldBlockVs01SignatureCompleteTelemetry({
                agreementBridgeMode: bridgeMode,
                ownerIsPreparingPacket: ownerPrep,
              });

              if (!paidProAgreementBridgeSkip || !linkedAgreementId || !did) {
                if (!paidProAgreementBridgeSkip && recipientPlacedFields.length === 0) return;
                goToStep(4);
                return;
              }

              const roles = buildVs01PrepareSigningRolesForBridge({
                agreementId: linkedAgreementId,
                creatorName,
                creatorEmail,
                ownerSignerName: creatorSignerName,
                ownerSignerTitle: creatorSignerTitle,
                counterparties,
                bridge:
              bridgeHandoffSnapshotRef.current ??
              readDurableAgreementVs01Bridge((documentId || seedDocumentId || "").trim()) ??
              readAgreementVs01BridgeSession(),
              });
              const ownerRole = roles.find((r) => r.kind === "owner") ?? roles[0]!;

              if (!rid) {
                const gate = canFinishPreparingSigningPacket({
                  agreementId: linkedAgreementId,
                  creatorName,
                  creatorEmail,
                  counterparties,
                  senderPlacedFields,
                  recipientPlacedFields,
                });
                // eslint-disable-next-line no-console
                console.info("[vs01-packet-prepare-gate]", {
                  canFinish: gate.canFinish,
                  missingByParty: gate.missingByParty,
                  totalRequiredRoles: gate.totalRequiredRoles,
                  fieldsByRole: gate.fieldsByRole,
                });
                // eslint-disable-next-line no-console
                console.info("[vs01-required-progress]", {
                  canFinish: gate.canFinish,
                  missingRoleCount: Object.keys(gate.missingByParty).length,
                  roleProgress: roles.map((r) => ({
                    roleKind: r.kind,
                    partyIndex: r.partyIndex,
                    tally: gate.fieldsByRole[r.roleId],
                    missing: gate.missingByParty[r.roleId] ?? [],
                  })),
                });
                if (!gate.canFinish) {
                  const rows = buildPrepareMissingBySignerSummary(gate, roles);
                  logVs01PrepareFinishBlocked(rows);
                  setError(formatPrepareFinishBlockedMessage(rows));
                  return;
                }
              }

              const named = counterparties
                .map((c, recipientIndex) => ({ c, recipientIndex }))
                .filter(({ c }) => c.name.trim().length > 0);
              const packetManifestFields = buildFullPacketSigningManifestFields({
                ownerRole,
                roles,
                senderPlacedFields,
                recipientPlacedFields,
              });
              const signers = named.map(({ c, recipientIndex }) => {
                const role = roles.find((r) => r.vs01CounterpartyId === c.id);
                const signerRoleId = role?.roleId ?? "";
                return {
                  counterpartyId: c.id,
                  displayName: c.name.trim(),
                  email: (role?.signerEmail ?? c.email).trim(),
                  signingUrl: buildVs01RecipientSigningUrl({
                    recipientIndex,
                    recipientName: c.name.trim(),
                    recipientEmail: c.email.trim(),
                    counterpartyId: c.id,
                    documentId: did,
                    receiptId: rid || null,
                    recipientFieldsForSigner: packetManifestFields,
                    agreementId: linkedAgreementId,
                    signerRoleId: signerRoleId || null,
                  }),
                };
              });

              if (rid && !blockSigTelemetry) {
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

              if (rid && blockSigTelemetry) {
                // eslint-disable-next-line no-console
                console.warn("[vs01-obsolete-navigation-blocked]", {
                  reason: "prepare_mode_with_receipt_id",
                  receiptIdShort: rid.slice(0, 8),
                });
              }

              const payload: PaidProVs01PostSignHandoffV1 = {
                v: 1,
                agreementId: linkedAgreementId,
                agreementTitle: agreementTitle.trim() || "Agreement",
                vs01DocumentId: did,
                receiptId: "",
                receiptHashSha256: null,
                packetPrepareOnly: true,
                savedAt: new Date().toISOString(),
                signers,
              };
              writePaidProVs01PostSignHandoff(payload);
              // eslint-disable-next-line no-console
              console.info("[vs01-packet-prepared]", {
                agreementId: linkedAgreementId,
                documentIdShort: did.slice(0, 8),
                counterpartySignerCount: signers.length,
                totalParticipantCount: signers.length + 1,
                senderMustSignFirst: false,
                signingLinkCount: signers.filter((s) => s.signingUrl?.trim()).length,
              });
              // eslint-disable-next-line no-console
              console.info("[vs01-signing-links-created]", {
                agreementId: linkedAgreementId,
                vs01DocumentId: did,
                signerCount: signers.length,
              });
              // eslint-disable-next-line no-console
              console.info("[vs01-paid-pro-workspace-navigate]", {
                agreementId: linkedAgreementId,
                packetPrepareOnly: true,
                signerCount: signers.length,
                vs01DocumentId: did,
              });
              clearVs01DraftState(did, "packet_ready_navigate");
              navigate(`/app/agreements/${encodeURIComponent(linkedAgreementId)}?vs01_packet_ready=1`);
            }}
              />
            ) : null}
          </Vs01PrepareRoleAuthorityProvider>
        ) : (
          <>
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
                agreementBridgePlacementCopy={false}
                fields={senderPlacedFields}
                onFieldsChange={setSenderPlacedFields}
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
                prepareSigningPacket={false}
                onError={setError}
                onBack={() => goToStep(2)}
                onContinueToReceipt={() => {
                  if (recipientPlacedFields.length === 0) return;
                  goToStep(4);
                }}
              />
            ) : null}
          </>
        )}
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
