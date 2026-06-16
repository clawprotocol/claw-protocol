import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { fetchDocumentContent } from "./vs01Api";
import { setVs01DocumentPageLayouts } from "./vs01DocumentLayoutCache";
import { extractPdfPageLayoutsFromBlob } from "./vs01PdfPageLayout";
import type { Vs01PageTextLayout } from "./vs01PageTextLayout";
import type {
  Vs01Counterparty,
  Vs01RecipientPlacedField,
  Vs01SenderSignatureRef,
} from "./types";
import {
  ESIGN_INTENT_FINISH_SIGNING_ACTION,
  NOT_LEGAL_ADVICE,
  PRODUCT_NOT_LAW_FIRM,
  RECORDS_DOWNLOAD_KEEP_COPY_SHORT,
} from "../compliance/disclosureCopy";
import { labelForFieldType, type PlacedSigningField } from "./signingFields";
import { RecipientSigningFieldOverlay } from "./RecipientSigningFieldOverlay";
import {
  hideSenderTemplateFieldForRecipientSigner,
  recipientFieldBelongsToLockedSigner,
} from "./vs01SignerFieldAssignment";
import {
  countRecipientSigningActions,
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  logRecipientSigningActionCounts,
  recipientEditableFieldIsComplete,
  recipientFinishGateComplete,
  recipientFinishGateEditableFields,
  recipientSigningActionsLabel,
} from "./recipientSigningFieldUtils";
import { isVs01InitialsEnabledForPacket } from "./vs01RecipientSignerMarksHydration";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";
import { logVs01PersistedGeometryHash } from "./vs01AutoSignaturePacket";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";
import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";
import { resolveRecipientCanonicalSigningPacket } from "./resolveRecipientCanonicalSigningPacket";
import {
  hasVs01CanonicalPacketCached,
  loadVs01CanonicalPacketPortable,
  logVs01CanonicalPacketSeedUse,
  logVs01RecipientCanonicalSource,
  wasVs01CanonicalPacketFromServer,
  type Vs01CanonicalPacketPortableRole,
} from "./vs01CanonicalPacketSeed";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type RecipientSigningViewProps = {
  documentId: string | null;
  counterparties: Vs01Counterparty[];
  lockedCounterpartyId: string;
  /** Agreement id from signing URL — scopes sender reference overlay vs signer fields. */
  recipientAgreementId?: string | null;
  /** Stable role id from signing URL; optional for legacy links. */
  lockedSignerRoleId?: string | null;
  recipientFields: Vs01RecipientPlacedField[];
  senderPlacedFields: PlacedSigningField[];
  senderSignatureRef: Vs01SenderSignatureRef | null;
  onRecipientFieldsChange: Dispatch<SetStateAction<Vs01RecipientPlacedField[]>>;
  onError: (message: string | null) => void;
  onFinishSigning: () => void;
  /** When set, layout data in the link could not be read — do not show a false “no fields” empty state. */
  manifestDecodeError?: string | null;
  /** True when the URL included a signing-layout manifest query param (`vs01_rmanifest`). */
  manifestParamPresent?: boolean;
  /** Server packet fetch in flight — suppress false hydration-miss UI. */
  serverHydrationPending?: boolean;
};

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function SenderReferenceFieldContent({
  field,
  senderSignatureRef,
}: {
  field: PlacedSigningField;
  senderSignatureRef: Vs01SenderSignatureRef | null;
}) {
  const textVal = typeof field.value === "string" ? field.value : "";
  if (field.type === "signature") {
    if (senderSignatureRef?.mode === "type" && senderSignatureRef.typedName.trim()) {
      return <span className="vs01-sign-sender-ref-script">{senderSignatureRef.typedName.trim()}</span>;
    }
    if (senderSignatureRef?.mode === "draw") {
      return senderSignatureRef.imageDataUrl ? (
        <img className="vs01-sign-sender-ref-img" src={senderSignatureRef.imageDataUrl} alt="" />
      ) : (
        <span className="vs01-sign-sender-ref-meta">Drawn signature</span>
      );
    }
    if (senderSignatureRef?.mode === "upload") {
      return senderSignatureRef.imageDataUrl ? (
        <img className="vs01-sign-sender-ref-img" src={senderSignatureRef.imageDataUrl} alt="" />
      ) : (
        <span className="vs01-sign-sender-ref-meta">Image</span>
      );
    }
    return textVal.trim() ? (
      <span className="vs01-sign-sender-ref-script">{textVal.trim()}</span>
    ) : (
      <span className="vs01-sign-sender-ref-meta">Signature</span>
    );
  }
  if (field.type === "initials") {
    return (
      <span className="vs01-sign-sender-ref-initials">{textVal.trim().slice(0, 8) || "—"}</span>
    );
  }
  if (field.type === "printed_name") {
    return (
      <span className="vs01-sign-sender-ref-text">{textVal.trim() ? textVal : "Printed name"}</span>
    );
  }
  if (field.type === "text") {
    return (
      <span className="vs01-sign-sender-ref-text">{textVal.trim() ? textVal : "Text"}</span>
    );
  }
  if (field.type === "email") {
    return (
      <span className="vs01-sign-sender-ref-text">{textVal.trim() ? textVal : "Email"}</span>
    );
  }
  if (field.type === "date") {
    return (
      <span className="vs01-sign-sender-ref-text">{formatIsoDateDisplay(textVal)}</span>
    );
  }
  return null;
}

/**
 * Deep-link-only: review PDF, fill assigned recipient fields (no placement or geometry edits).
 */
export function RecipientSigningView({
  documentId,
  counterparties,
  lockedCounterpartyId,
  recipientAgreementId = null,
  lockedSignerRoleId = null,
  recipientFields,
  senderPlacedFields,
  senderSignatureRef,
  onRecipientFieldsChange,
  onError,
  onFinishSigning,
  manifestDecodeError = null,
  manifestParamPresent = false,
  serverHydrationPending = false,
}: RecipientSigningViewProps) {
  const cpById = useMemo(() => {
    const m = new Map<string, Vs01Counterparty>();
    for (const c of counterparties) m.set(c.id, c);
    return m;
  }, [counterparties]);

  const lockedCp = lockedCounterpartyId.trim();

  const prepareRoles = useMemo(() => {
    const aid = (recipientAgreementId ?? "").trim();
    if (!aid) return null;
    const did = documentId?.trim() ?? "";
    const portable = did ? loadVs01CanonicalPacketPortable(did) : null;
    if (portable && portable.roles.length >= 2) {
      return portable.roles.map((r: Vs01CanonicalPacketPortableRole) => ({
        roleId: r.roleId,
        partyIndex: r.partyIndex,
        partyId: r.partyId,
        entityName: r.entityName,
        partyName: r.partyName,
        roleLabel: r.roleLabel,
        signerName: r.signerName,
        signerTitle: r.signerTitle,
        signerEmail: r.signerEmail,
        reviewEmail: r.reviewEmail,
        isEntityParty: r.isEntityParty,
        requiresSignature: r.requiresSignature,
        vs01CounterpartyId: r.vs01CounterpartyId,
        kind: r.kind,
      }));
    }
    const lockRoleId = (lockedSignerRoleId ?? "").trim();
    if (lockRoleId) {
      const ownerCp = counterparties.find((c) => c.id === "owner") ?? null;
      const ownerFromFields =
        recipientFields.find((f) => f.assignedPartyIndex === 0 && f.type === "signature")?.counterpartyId.trim() ||
        "owner";
      const ownerId = ownerCp?.id ?? ownerFromFields;
      const ownerRow =
        cpById.get(ownerId) ??
        counterparties.find((c) => c.id === ownerId) ??
        (lockRoleId.includes(":i0:") ? counterparties[0] : null);
      const activeRow = cpById.get(lockedCp) ?? counterparties.find((c) => c.id === lockedCp);
      const isOwnerSession = lockRoleId.includes(":i0:") || lockedCp === ownerId;
      if (isOwnerSession && ownerRow) {
        return buildVs01PrepareSigningRoles({
          agreementId: aid,
          creatorName: ownerRow.name?.trim() || "Owner",
          creatorEmail: ownerRow.email?.trim() || ownerRow.signerEmail?.trim() || "",
          ownerSignerName: ownerRow.signerName ?? undefined,
          ownerSignerTitle: ownerRow.signerTitle ?? undefined,
          counterparties: counterparties.filter((c) => c.id !== ownerRow.id),
        });
      }
      if (activeRow && ownerRow) {
        return buildVs01PrepareSigningRoles({
          agreementId: aid,
          creatorName: ownerRow.name?.trim() || "Owner",
          creatorEmail: ownerRow.email?.trim() || ownerRow.signerEmail?.trim() || "",
          ownerSignerName: ownerRow.signerName ?? undefined,
          ownerSignerTitle: ownerRow.signerTitle ?? undefined,
          counterparties: [activeRow],
        });
      }
    }
    const ownerCpId =
      recipientFields.find((f) => f.assignedPartyIndex === 0 && f.type === "signature")?.counterpartyId.trim() ||
      "owner";
    const ownerRow =
      cpById.get(ownerCpId) ?? counterparties.find((c) => c.id === ownerCpId) ?? counterparties[0];
    const otherCps = counterparties.filter((c) => c.id !== ownerRow?.id);
    return buildVs01PrepareSigningRoles({
      agreementId: aid,
      creatorName: ownerRow?.name?.trim() || "Owner",
      creatorEmail: ownerRow?.email?.trim() || ownerRow?.signerEmail?.trim() || "",
      ownerSignerName: ownerRow?.signerName ?? undefined,
      ownerSignerTitle: ownerRow?.signerTitle ?? undefined,
      counterparties: otherCps,
    });
  }, [
    recipientAgreementId,
    documentId,
    recipientFields,
    counterparties,
    cpById,
    lockedCp,
    lockedSignerRoleId,
  ]);

  const documentFields = useMemo(() => {
    const lock = (lockedSignerRoleId ?? "").trim();
    if (lock) return recipientFields;
    if (!prepareRoles?.length) return recipientFields;
    if (!senderPlacedFields.length) return recipientFields;
    const ownerRole = prepareRoles[0];
    if (!ownerRole) return recipientFields;
    return buildRecipientSigningDocumentFields({
      ownerRole,
      roles: prepareRoles,
      recipientPlacedFields: recipientFields,
      senderPlacedFields,
    });
  }, [recipientFields, senderPlacedFields, prepareRoles, lockedSignerRoleId]);

  const portablePacket = useMemo(() => {
    const did = documentId?.trim() ?? "";
    return did ? loadVs01CanonicalPacketPortable(did) : null;
  }, [documentId]);

  const initialsEnabled = isVs01InitialsEnabledForPacket(portablePacket);

  const canonicalPacket = useMemo(() => {
    const did = documentId?.trim() ?? "";
    const aid = (recipientAgreementId ?? "").trim();
    if (!did || !aid || !prepareRoles?.length) return null;
    return resolveRecipientCanonicalSigningPacket({
      documentId: did,
      agreementId: aid,
      roles: prepareRoles,
      initialsEnabled,
      portablePacket,
    });
  }, [documentId, recipientAgreementId, prepareRoles, portablePacket, initialsEnabled]);

  const useCanonicalDocument = Boolean(canonicalPacket?.model.allowed);

  const documentFieldsForView = useMemo(() => {
    if (!initialsEnabled) {
      return documentFields.filter((f) => f.type !== "initials");
    }
    return documentFields;
  }, [documentFields, initialsEnabled]);

  const signer = cpById.get(lockedCp);
  const signerName =
    signer?.signerName?.trim() || signer?.name.trim() || "Signer";
  const signerEmail = signer?.email.trim() || "";

  const myFields = useMemo(
    () =>
      documentFieldsForView.filter((f) =>
        recipientFieldBelongsToLockedSigner(f, lockedCp, lockedSignerRoleId ?? null),
      ),
    [documentFieldsForView, lockedCp, lockedSignerRoleId],
  );

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || documentFields.length === 0) return;
    hydratedRef.current = true;
    logVs01PersistedGeometryHash("recipient_signing_hydration", documentFields);
    onRecipientFieldsChange((prev) => hydrateRecipientSigningFields(prev, cpById));
  }, [documentFields.length, cpById, onRecipientFieldsChange, documentFields]);

  useEffect(() => {
    const diag = typeof window !== "undefined" && window.localStorage?.getItem("lawdogVs01FieldDiag") === "1";
    const dev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
    if (!diag && !dev) return;
    // eslint-disable-next-line no-console
    console.info("[vs01-recipient-field-scope]", {
      lockedCounterpartyId: lockedCp,
      totalRecipientFields: recipientFields.length,
      scopedFieldCount: myFields.length,
      hasAgreementScope: Boolean((recipientAgreementId ?? "").trim()),
      signerRoleIdShort: lockedSignerRoleId ? lockedSignerRoleId.slice(0, 16) : null,
    });
  }, [lockedCp, recipientFields.length, myFields.length, recipientAgreementId, lockedSignerRoleId]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocReady, setPdfDocReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pageLayouts, setPageLayouts] = useState<Vs01PageTextLayout[] | null>(null);

  const pagesInnerRef = useRef<HTMLDivElement>(null);
  const [pageRenderWidth, setPageRenderWidth] = useState(520);
  const pageStackRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      if (!documentId?.trim()) {
        setPdfUrl(null);
        setPreviewError(null);
        setPageLayouts(null);
        setPreviewLoading(false);
        return;
      }

      if (serverHydrationPending) {
        setPreviewLoading(true);
        return;
      }

      if (useCanonicalDocument && canonicalPacket) {
        setPdfUrl(null);
        setPreviewError(null);
        setPageLayouts(null);
        setNumPages(canonicalPacket.model.pages.length);
        setPdfDocReady(true);
        setPreviewLoading(false);
        logVs01CanonicalPacketSeedUse({
          documentId: documentId.trim(),
          agreementId: (recipientAgreementId ?? "").trim(),
          corpusHash: canonicalPacket.corpusHash,
          source: canonicalPacket.seedSource,
          renderMode: "canonical",
        });
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.warn("[vs01-recipient-canonical-fallback]", {
          documentIdShort: documentId.trim().slice(0, 12),
          agreementIdShort: (recipientAgreementId ?? "").trim().slice(0, 16) || null,
          reason: !hasVs01CanonicalPacketCached(documentId.trim())
            ? "missing_canonical_packet"
            : "canonical_model_not_allowed",
        });
      }
      try {
        const blob = await fetchDocumentContent(documentId.trim());
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
        try {
          const layouts = await extractPdfPageLayoutsFromBlob(blob);
          if (!cancelled) {
            setPageLayouts(layouts);
            setVs01DocumentPageLayouts(documentId.trim(), layouts);
          }
        } catch {
          if (!cancelled) setPageLayouts(null);
          /* layout extraction is best-effort; manifest rects are authoritative */
        }
      } catch (e) {
        if (!cancelled) {
          setPdfUrl(null);
          setPreviewError(e instanceof Error ? e.message : String(e));
          setPageLayouts(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, useCanonicalDocument, canonicalPacket, recipientAgreementId, serverHydrationPending]);

  useEffect(() => {
    const did = documentId?.trim() ?? "";
    if (!did || import.meta.env.MODE === "test") return;

    let source: "portable_packet" | "server_packet" | "fallback_rebuild";
    let fallbackReason: string | undefined;
    if (useCanonicalDocument && canonicalPacket) {
      source = wasVs01CanonicalPacketFromServer(did) ? "server_packet" : "portable_packet";
    } else if (serverHydrationPending) {
      source = "fallback_rebuild";
      fallbackReason = "awaiting_server_hydration";
    } else {
      source = "fallback_rebuild";
      if (!(recipientAgreementId ?? "").trim()) fallbackReason = "missing_agreement_id";
      else if (!prepareRoles || prepareRoles.length < 2) fallbackReason = "insufficient_signing_roles";
      else if (!hasVs01CanonicalPacketCached(did)) fallbackReason = "missing_canonical_packet";
      else fallbackReason = "corpus_gate_or_model_blocked";
    }

    const portable = loadVs01CanonicalPacketPortable(did);
    const packetHashMatch =
      portable && canonicalPacket ? portable.seed.corpusHash === canonicalPacket.corpusHash : null;

    logVs01RecipientCanonicalSource({
      source,
      pageCount: canonicalPacket?.model.pages.length ?? (numPages > 0 ? numPages : null),
      fieldCount: documentFields.length,
      signerRoleIdShort: lockedSignerRoleId ? lockedSignerRoleId.slice(0, 16) : null,
      packetHashMatch,
      preparePacketHash: portable?.seed.corpusHash ?? canonicalPacket?.corpusHash ?? null,
      fallbackReason,
    });
  }, [
    documentId,
    useCanonicalDocument,
    canonicalPacket,
    serverHydrationPending,
    recipientAgreementId,
    prepareRoles,
    numPages,
    documentFields.length,
    lockedSignerRoleId,
  ]);

  useLayoutEffect(() => {
    const el = pagesInnerRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
      const target = mobile ? Math.max(320, Math.min(w - 8, 520)) : Math.max(160, w - 8);
      if (w > 48) setPageRenderWidth(target);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfUrl]);

  useEffect(() => {
    setCurrentPage(1);
    setNumPages(0);
    setPdfDocReady(false);
    setPreviewError(null);
  }, [documentId]);

  const registerPageStack = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    if (el) pageStackRefs.current.set(pageIndex, el);
    else pageStackRefs.current.delete(pageIndex);
  }, []);

  const updateField = useCallback(
    (id: string, patch: Partial<Vs01RecipientPlacedField>) => {
      onRecipientFieldsChange((prev) => {
        const target = prev.find((f) => f.id === id);
        if (
          !target ||
          !recipientFieldBelongsToLockedSigner(target, lockedCp, lockedSignerRoleId ?? null) ||
          !isRecipientSigningEditableType(target.type)
        ) {
          const diag = typeof window !== "undefined" && window.localStorage?.getItem("lawdogVs01FieldDiag") === "1";
          const dev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
          if (diag || dev) {
            // eslint-disable-next-line no-console
            console.warn("[vs01-recipient-role-scope]", {
          event: "cross_signer_field_blocked",
              fieldIdShort: id.slice(0, 8),
              reason: "not_assigned_to_locked_signer",
            });
          }
          return prev;
        }
        if (
          target?.autoInitials &&
          target.type === "initials" &&
          typeof patch.value === "string"
        ) {
          const cp = target.counterpartyId;
          return prev.map((f) =>
            f.autoInitials && f.type === "initials" && f.counterpartyId === cp
              ? { ...f, value: patch.value }
              : f
          );
        }
        return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      });
    },
    [onRecipientFieldsChange, lockedCp, lockedSignerRoleId]
  );

  const goPrev = useCallback(() => {
    setCurrentPage((p) => {
      const next = Math.max(1, p - 1);
      window.requestAnimationFrame(() =>
        pageStackRefs.current.get(next - 1)?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((p) => {
      if (numPages <= 0) return p;
      const next = Math.min(numPages, p + 1);
      window.requestAnimationFrame(() =>
        pageStackRefs.current.get(next - 1)?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
      return next;
    });
  }, [numPages]);

  const goTop = useCallback(() => {
    setCurrentPage(1);
    window.requestAnimationFrame(() =>
      pageStackRefs.current.get(0)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, []);

  const goBottom = useCallback(() => {
    if (numPages <= 0) return;
    setCurrentPage(numPages);
    window.requestAnimationFrame(() =>
      pageStackRefs.current.get(numPages - 1)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, [numPages]);

  const signingActionOpts = { initialsEnabled };

  const editableMyFields = useMemo(
    () => recipientFinishGateEditableFields(myFields, signingActionOpts),
    [myFields, initialsEnabled],
  );

  const allComplete =
    !manifestDecodeError && myFields.length > 0 && recipientFinishGateComplete(myFields, signingActionOpts);
  const signingActionCount = countRecipientSigningActions(editableMyFields, signingActionOpts);

  useEffect(() => {
    const missing = editableMyFields
      .filter((f) => !recipientEditableFieldIsComplete(f))
      .map((f) => f.id);
    logRecipientSigningActionCounts({
      signerRoleId: lockedSignerRoleId,
      agreementId: recipientAgreementId,
      totalScopedFields: myFields.length,
      actionableFields: editableMyFields.length,
      initialsEnabled,
      requiredCount: editableMyFields.length,
      completedCount: editableMyFields.filter((f) => recipientEditableFieldIsComplete(f)).length,
      missingFieldIds: missing,
    });
  }, [
    editableMyFields,
    initialsEnabled,
    lockedSignerRoleId,
    myFields.length,
    recipientAgreementId,
  ]);
  const placementSurface =
    useCanonicalDocument || Boolean(pdfUrl) || Boolean(documentId?.trim() && previewError);

  const docLoading = previewLoading || serverHydrationPending;

  const genuinelyNoFields = !manifestDecodeError && myFields.length === 0 && !manifestParamPresent;
  const hydrationMiss =
    !serverHydrationPending &&
    !manifestDecodeError &&
    myFields.length === 0 &&
    manifestParamPresent;
  const showEmptyFieldsHint = genuinelyNoFields || hydrationMiss;

  const emptyFieldsMessage = hydrationMiss
    ? "Your signing fields could not be loaded from this link. Ask the sender to resend the signing link, or try opening it in the same browser the sender used."
    : "This link does not include field placement data. Ask the sender to share an updated signing link after placing fields.";

  const handleFinish = useCallback(() => {
    if (manifestDecodeError) {
      onError(manifestDecodeError);
      return;
    }
    if (myFields.length === 0) {
      onError(
        hydrationMiss
          ? "Your signing fields could not be loaded. Ask the sender to resend your signing link."
          : "No fields are assigned to you. Ask the sender for an updated signing link."
      );
      return;
    }
    if (!allComplete) {
      const missing = editableMyFields.filter((f) => !recipientEditableFieldIsComplete(f));
      const remaining = missing.length;
      if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[vs01-recipient-finish-blocked]", {
          signerRoleIdShort: lockedSignerRoleId ? lockedSignerRoleId.slice(0, 20) : null,
          initialsEnabled,
          missingFieldIds: missing.map((f) => f.id),
          missingTypes: missing.map((f) => f.type),
        });
      }
      onError(
        remaining === 1
          ? initialsEnabled
            ? "Review the document, sign the highlighted signature box, and add initials if shown."
            : "Review the document and sign the highlighted signature box."
          : initialsEnabled
            ? `Complete your signature and initials (${remaining} remaining) before finishing.`
            : `Complete your signature (${remaining} remaining) before finishing.`,
      );
      return;
    }
    onError(null);
    onFinishSigning();
  }, [allComplete, editableMyFields, hydrationMiss, initialsEnabled, lockedSignerRoleId, manifestDecodeError, myFields.length, onError, onFinishSigning]);

  const updateFieldValue = useCallback(
    (id: string, value: string) => updateField(id, { value }),
    [updateField],
  );

  return (
    <section
      className="vs01-recipient-signing-view vs01-sign-step"
      aria-labelledby="vs01-recipient-signing-title"
    >
      <header className="vs01-recipient-signing-header">
        <h2 id="vs01-recipient-signing-title" className="vs01-card-title">
          Review and sign
        </h2>
        <p className="vs01-recipient-signing-subtitle">
          {initialsEnabled
            ? "Complete your signature and initials. Other signers' fields are shown for context and stay locked until they sign."
            : "Complete your signature. Other signers' fields are shown for context and stay locked until they sign."}
        </p>
        <p className="vs01-recipient-signing-signer">
          <span className="vs01-recipient-signing-name">{signerName}</span>
          {signerEmail ? (
            <>
              <span className="vs01-recipient-signing-sep" aria-hidden>
                {" · "}
              </span>
              <span className="vs01-recipient-signing-email">{signerEmail}</span>
            </>
          ) : null}
          {signingActionCount > 0 ? (
            <span className="vs01-recipient-signing-field-count">
              {" · "}
              {recipientSigningActionsLabel(signingActionCount, signingActionOpts)}
            </span>
          ) : null}
        </p>
      </header>

      {manifestDecodeError ? (
        <div className="vs01-recipient-signing-manifest-error" role="alert">
          {manifestDecodeError}
        </div>
      ) : null}

      <div className="vs01-recipient-signing-doc-wrap">
        {placementSurface && !docLoading ? (
          <div className="vs01-sign-page-bar" aria-label="Page navigation">
            <button
              type="button"
              className="vs01-sign-page-btn"
              disabled={numPages <= 0 || currentPage <= 1}
              onClick={goTop}
            >
              Top
            </button>
            <button type="button" className="vs01-sign-page-btn" disabled={currentPage <= 1} onClick={goPrev}>
              Prev
            </button>
            <span className="vs01-sign-page-label">
              Page {numPages > 0 ? currentPage : 1}
              {numPages > 0 ? ` of ${numPages}` : ""}
            </span>
            <button
              type="button"
              className="vs01-sign-page-btn"
              disabled={numPages <= 0 || currentPage >= numPages}
              onClick={goNext}
            >
              Next
            </button>
            <button
              type="button"
              className="vs01-sign-page-btn"
              disabled={numPages <= 0 || currentPage >= numPages}
              onClick={goBottom}
            >
              Bottom
            </button>
          </div>
        ) : null}

        <div className="vs01-sign-scroll vs01-recipient-signing-scroll">
          {docLoading ? (
            <div className="vs01-sign-preview-fallback" role="status">
              {serverHydrationPending ? "Loading signing fields…" : "Loading document…"}
            </div>
          ) : useCanonicalDocument && canonicalPacket ? (
            <div
              className="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge"
              data-testid="vs01-recipient-canonical-render"
            >
              <div ref={pagesInnerRef} className="vs01-sign-pages-inner">
                {canonicalPacket.model.pages.map((page) => {
                  const fieldsHere = documentFieldsForView.filter((f) => f.page === page.pageIndex);
                  const senderFieldsHere = senderPlacedFields.filter(
                    (f) =>
                      f.page === page.pageIndex &&
                      !hideSenderTemplateFieldForRecipientSigner(
                        f,
                        recipientAgreementId,
                        lockedSignerRoleId,
                      ),
                  );
                  return (
                    <div
                      key={page.pageIndex}
                      ref={(el) => registerPageStack(page.pageIndex, el)}
                      className="vs01-sign-page-stack"
                      data-vs01-sign-page={page.pageIndex}
                    >
                      <div
                        className="vs01-sign-page-surface vs01-sign-page-surface--canonical"
                        style={{
                          width: VS01_PACKET_PAGE_WIDTH_PT,
                          height: VS01_PACKET_PAGE_HEIGHT_PT,
                        }}
                      >
                        <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />
                        <div className="vs01-sign-page-placement-host">
                          <div
                            className="vs01-sign-placement-click-layer vs01-sign-placement-click-layer--idle vs01-sign-placement-click-layer--inert"
                            aria-hidden
                          />
                          <div
                            className={`vs01-sign-overlay${fieldsHere.length > 0 || senderFieldsHere.length > 0 ? " vs01-sign-overlay--placed" : ""}`}
                            role="presentation"
                          >
                            {senderFieldsHere.map((field) => {
                              const cssRect = normalizedPdfRectToCssPercent(field);
                              return (
                                <div
                                  key={`sender-ref-${field.id}`}
                                  className={`vs01-sign-sender-ref-box vs01-sign-sender-ref-box--${field.type}`}
                                  style={{
                                    position: "absolute",
                                    left: cssRect.left,
                                    top: cssRect.top,
                                    width: cssRect.width,
                                    height: cssRect.height,
                                    zIndex: 2,
                                  }}
                                  aria-hidden
                                >
                                  <SenderReferenceFieldContent
                                    field={field}
                                    senderSignatureRef={senderSignatureRef}
                                  />
                                </div>
                              );
                            })}
                            {fieldsHere.map((field) => (
                              <RecipientSigningFieldOverlay
                                key={field.id}
                                field={field}
                                lockedCounterpartyId={lockedCp}
                                lockedSignerRoleId={lockedSignerRoleId}
                                recipientAgreementId={recipientAgreementId}
                                cpById={cpById}
                                onUpdateValue={updateFieldValue}
                                canonicalCompact
                                signerCount={Math.max(
                                  2,
                                  new Set(documentFields.map((f) => f.assignedPartyIndex ?? 0)).size,
                                )}
                                pageFieldObstacles={fieldsHere
                                  .filter((f) => f.id !== field.id)
                                  .map((f) => ({
                                    x: f.x,
                                    y: f.y,
                                    width: f.width,
                                    height: f.height,
                                  }))}
                                pageTextRects={page.textBlocks.map((text) => ({
                                  x: text.x,
                                  y: text.y,
                                  width: text.width,
                                  height: text.height,
                                }))}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : pdfUrl || (documentId?.trim() && previewError) ? (
            <div className="vs01-sign-doc-pages-wrap vs01-sign-doc-surface">
              {pdfUrl ? (
                previewError ? (
                  <div className="vs01-sign-preview-fallback" role="alert">
                    <strong>Preview unavailable.</strong> {previewError}
                  </div>
                ) : (
                  <div ref={pagesInnerRef} className="vs01-sign-pages-inner">
                    {!pdfDocReady ? (
                      <div className="vs01-sign-pdf-loading" role="status">
                        Rendering PDF…
                      </div>
                    ) : null}
                    <Document
                      key={documentId ?? pdfUrl}
                      file={pdfUrl}
                      onLoadSuccess={({ numPages: n }) => {
                        setNumPages(n);
                        setPdfDocReady(true);
                        setPreviewError(null);
                      }}
                      onLoadError={(err) => {
                        setPdfDocReady(false);
                        setNumPages(0);
                        setPreviewError(typeof err?.message === "string" ? err.message : "Failed to load PDF");
                      }}
                      loading={null}
                    >
                      {pdfDocReady && numPages > 0
                        ? Array.from({ length: numPages }, (_, p) => {
                            const fieldsHere = documentFields.filter((f) => f.page === p);
                            const senderFieldsHere = senderPlacedFields.filter(
                              (f) =>
                                f.page === p &&
                                !hideSenderTemplateFieldForRecipientSigner(
                                  f,
                                  recipientAgreementId,
                                  lockedSignerRoleId,
                                ),
                            );
                            const hasRecipientOnPage = fieldsHere.length > 0;
                            const hasSenderOnPage = senderFieldsHere.length > 0;
                            const pageTextRects = pageLayouts?.find((layout) => layout.pageIndex === p)?.textRects ?? [];
                            return (
                              <div
                                key={p}
                                ref={(el) => registerPageStack(p, el)}
                                className="vs01-sign-page-stack"
                                data-vs01-sign-page={p}
                              >
                                <div className="vs01-sign-page-surface vs01-sign-page-surface--footer-safe">
                                  <Page
                                    pageNumber={p + 1}
                                    width={pageRenderWidth}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                  >
                                    <div className="vs01-sign-page-placement-host">
                                      {hasSenderOnPage ? (
                                        <div className="vs01-sign-sender-ref-layer" aria-hidden>
                                          {senderFieldsHere.map((field) => {
                                            const cssRect = normalizedPdfRectToCssPercent(field);
                                            return (
                                              <div
                                                key={`sender-ref-${field.id}`}
                                                className={`vs01-sign-sender-ref-box vs01-sign-sender-ref-box--${field.type}`}
                                                style={{
                                                  left: cssRect.left,
                                                  top: cssRect.top,
                                                  width: cssRect.width,
                                                  height: cssRect.height,
                                                }}
                                              >
                                                <span className="vs01-sign-sender-ref-label">
                                                  {labelForFieldType(field.type)}
                                                </span>
                                                <span className="vs01-sign-sender-ref-yours">Yours</span>
                                                <SenderReferenceFieldContent
                                                  field={field}
                                                  senderSignatureRef={senderSignatureRef}
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                      <div
                                        className="vs01-sign-placement-click-layer vs01-sign-placement-click-layer--idle vs01-sign-placement-click-layer--inert"
                                        aria-hidden
                                      />
                                      <div
                                        className={`vs01-sign-overlay${
                                          hasRecipientOnPage || hasSenderOnPage ? " vs01-sign-overlay--placed" : ""
                                        }`}
                                        role="presentation"
                                      >
                                        {fieldsHere.map((field) => (
                                          <RecipientSigningFieldOverlay
                                            key={field.id}
                                            field={field}
                                            lockedCounterpartyId={lockedCp}
                                            lockedSignerRoleId={lockedSignerRoleId}
                                            recipientAgreementId={recipientAgreementId}
                                            cpById={cpById}
                                            onUpdateValue={updateFieldValue}
                                            canonicalCompact
                                            signerCount={Math.max(
                                              2,
                                              new Set(
                                                documentFields.map((f) => f.assignedPartyIndex ?? 0),
                                              ).size,
                                            )}
                                            pageFieldObstacles={fieldsHere
                                              .filter((f) => f.id !== field.id)
                                              .map((f) => ({
                                                x: f.x,
                                                y: f.y,
                                                width: f.width,
                                                height: f.height,
                                              }))}
                                            pageTextRects={pageTextRects}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </Page>
                                  <div className="vs01-pdf-footer-watermark-shim" aria-hidden />
                                </div>
                              </div>
                            );
                          })
                        : null}
                    </Document>
                  </div>
                )
              ) : previewError ? (
                <div className="vs01-sign-preview-fallback" role="alert">
                  <strong>Preview unavailable.</strong> {previewError}
                </div>
              ) : (
                <div className="vs01-sign-placeholder-doc" aria-hidden />
              )}
            </div>
          ) : (
            <div className="vs01-sign-preview-fallback" role="region" aria-label="Preview unavailable">
              {previewError ? (
                <>
                  <strong>Preview unavailable.</strong> {previewError}
                </>
              ) : (
                <>No document is available for this link.</>
              )}
            </div>
          )}
        </div>

        {showEmptyFieldsHint && placementSurface && !docLoading ? (
          <p className="vs01-recipient-signing-empty" role="status">
            {emptyFieldsMessage}
          </p>
        ) : null}

        <p className="vs01-sign-doc-foot-hint vs01-recipient-signing-foot">
          {placementSurface && !docLoading && !manifestDecodeError
            ? initialsEnabled
              ? "Review the document, sign the highlighted signature box, and add initials if shown."
              : "Review the document and sign the highlighted signature box."
            : null}
        </p>
      </div>

      <div className="vs01-recipient-signing-footer-actions">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary"
          disabled={!allComplete}
          onClick={handleFinish}
        >
          Finish signing
        </button>
        {editableMyFields.length > 0 && !allComplete ? (
          <p className="vs01-recipient-signing-progress">
            {editableMyFields.filter((f) => recipientEditableFieldIsComplete(f)).length} of{" "}
            {editableMyFields.length} signing actions complete
          </p>
        ) : null}
      </div>

      <details className="vs01-recipient-signing-intent">
        <summary className="vs01-recipient-signing-intent__toggle">{ESIGN_INTENT_FINISH_SIGNING_ACTION}</summary>
        <div className="vs01-recipient-signing-intent__body">
          <p className="vs01-recipient-signing-intent__secondary">{RECORDS_DOWNLOAD_KEEP_COPY_SHORT}</p>
          <p className="vs01-recipient-signing-intent__product">
            {PRODUCT_NOT_LAW_FIRM} {NOT_LEGAL_ADVICE}
          </p>
        </div>
      </details>
    </section>
  );
}
