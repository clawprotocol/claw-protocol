import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { fetchDocumentContent } from "./vs01Api";
import type {
  Vs01Counterparty,
  Vs01RecipientFieldType,
  Vs01RecipientPlacedField,
  Vs01SenderSignatureRef,
} from "./types";
import {
  PREPARE_PACKET_FIELD_TOOLS,
  RECIPIENT_FIELD_TOOLS,
  autoInitialsColumnIndexOnPage,
  autoInitialsPlacementDims,
  computeRecipientRectFromClick,
  defaultRecipientFieldValue,
  findAutoInitialsMarginSlotOrNull,
  labelForFieldType,
  labelForPreparePlacedField,
  labelForRecipientFieldType,
  matchesPreparePacketTool,
  preparePacketToolKey,
  newSigningFieldId,
  rebuildRecipientAutoInitialsEveryPage,
  repositionAllRecipientAutoInitialsNonOverlapping,
  resizeBoundsForPlacementField,
  resolveRecipientEmailForEmailFieldPlacement,
  type PlacedSigningField,
} from "./signingFields";
import { RecipientPrintedNameFieldBody, RecipientSignatureFieldBody } from "./StepRecipientFields";
import {
  PrepareSigningFieldBody,
  prepareFieldDataAttributes,
} from "./vs01PrepareSigningFieldRender";
import { ownerPadFromPlacementContext } from "./vs01FieldValueResolution";
import { findPrepareSigningRole } from "./vs01SignerFieldAssignment";
import { prepareTemplateCornerLabel, prepareTemplateDisplayForField } from "./vs01PrepareTemplateField";
import { canFinishPreparingSigningPacket } from "../agreement/partySigningRoles";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { evaluatePreparePacketGateFromRoles, logVs01RequiredProgress } from "./vs01SignerFieldAssignment";
import {
  buildPrepareMissingBySignerSummary,
  evaluatePrepareFinishClick,
  formatPrepareMissingFieldLabel,
  logVs01PrepareFinishClick,
} from "./vs01PreparePacketCompletion";
import type { Vs01TextFieldPurpose } from "./signingFields";
import { createPrepareStampedRecipientField } from "./vs01PrepareFieldPlacement";
import {
  logVs01ActiveRoleAfterPlace,
  logVs01ActiveRoleBeforePlace,
  logVs01FieldCreated,
  placementSuccessMessage,
} from "./vs01PreparePlacementControl";
import { vs01DevKeepPlacingEnabled } from "./vs01PreparePacketChecklist";
import { useVs01PrepareRoleAuthorityOptional } from "./Vs01PrepareRoleAuthorityContext";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type StepCompleteAndSendProps = {
  documentId: string | null;
  counterparties: Vs01Counterparty[];
  recipientFields: Vs01RecipientPlacedField[];
  /** Sender fields from the signing step (read-only reference on the PDF). */
  senderPlacedFields?: PlacedSigningField[];
  senderSignatureRef?: Vs01SenderSignatureRef | null;
  /** Paid Pro agreement bridge: recipient placement completes a signing packet (not VS01 receipt step). */
  prepareSigningPacket?: boolean;
  /** Paid Pro packet prep: agreement id for per-role finish gate. */
  preparePacketAgreementId?: string | null;
  prepareCreatorName?: string;
  prepareCreatorEmail?: string;
  prepareSignerRoles?: Vs01PrepareSigningRole[];
  onRecipientFieldsChange: Dispatch<SetStateAction<Vs01RecipientPlacedField[]>>;
  onError: (message: string | null) => void;
  onBack?: () => void;
  onContinueToReceipt?: () => void;
};

const STEP_ID = "assign-recipient-fields" as const;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}


function roundNorm(n: number): string {
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function createRecipientFieldAtClick(
  type: Vs01RecipientFieldType,
  page: number,
  clickX: number,
  clickY: number,
  counterpartyId: string,
  recipientDisplayName: string,
  recipientEmail?: string
): Vs01RecipientPlacedField {
  const { x, y, width, height } = computeRecipientRectFromClick(type, clickX, clickY);
  return {
    id: newSigningFieldId(),
    counterpartyId,
    type,
    page,
    x,
    y,
    width,
    height,
    value: defaultRecipientFieldValue(type, recipientDisplayName, recipientEmail),
  };
}

function counterpartyName(map: Map<string, Vs01Counterparty>, id: string): string {
  return map.get(id)?.name.trim() || "Recipient";
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
 * Assign fields on the PDF for each counterparty (client-side placement; same anchoring as sender signing).
 */
export function StepCompleteAndSend({
  documentId,
  counterparties,
  recipientFields,
  senderPlacedFields = [],
  senderSignatureRef = null,
  prepareSigningPacket = false,
  preparePacketAgreementId = null,
  prepareCreatorName = "",
  prepareCreatorEmail = "",
  prepareSignerRoles,
  onRecipientFieldsChange,
  onError,
  onBack,
  onContinueToReceipt,
}: StepCompleteAndSendProps) {
  const busy = false;

  const prepareRoleCtx = useVs01PrepareRoleAuthorityOptional();

  const selectPrepareRole = useCallback(
    (roleId: string) => {
      prepareRoleCtx?.setActiveRole(roleId, "user_select");
      const role = prepareSignerRoles?.find((r) => r.roleId === roleId.trim());
      const cpId = role?.vs01CounterpartyId ?? "";
      if (cpId) setSelectedCounterpartyId(cpId);
      setSelectedFieldId(null);
      setArmedTool(null);
      setArmedTextPurpose(undefined);
    },
    [prepareRoleCtx, prepareSignerRoles],
  );

  const advanceToNextIncompleteSigner = useCallback(() => {
    if (!prepareRoleCtx) return;
    prepareRoleCtx.advanceToNextSigner(senderPlacedFields, fieldsRef.current);
  }, [prepareRoleCtx, senderPlacedFields]);

  const fieldMatchesActive = useCallback(
    (field: Vs01RecipientPlacedField) => {
      if (!prepareSigningPacket || !prepareRoleCtx) return true;
      return prepareRoleCtx.fieldMatchesActiveRole(field);
    },
    [prepareSigningPacket, prepareRoleCtx],
  );

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocReady, setPdfDocReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Vs01RecipientFieldType>("signature");
  const [activeTextPurpose, setActiveTextPurpose] = useState<Vs01TextFieldPurpose | undefined>();
  const [armedTool, setArmedTool] = useState<Vs01RecipientFieldType | null>(null);
  const [armedTextPurpose, setArmedTextPurpose] = useState<Vs01TextFieldPurpose | undefined>();
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);
  const placementNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setFinishBlockedVisible] = useState(false);

  const [placementPopId, setPlacementPopId] = useState<string | null>(null);
  const [showDragHint, setShowDragHint] = useState(false);
  const dragHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const pagesInnerRef = useRef<HTMLDivElement>(null);
  const [pageRenderWidth, setPageRenderWidth] = useState(520);
  const pageSurfaceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageStackRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const fieldsRef = useRef(recipientFields);
  fieldsRef.current = recipientFields;

  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string>("");
  const displayRoleId = prepareSigningPacket && prepareRoleCtx ? prepareRoleCtx.displayRoleId : "";
  const activePrepareRole =
    prepareSigningPacket && prepareRoleCtx
      ? prepareRoleCtx.activeRole
      : prepareSignerRoles?.find((r) => r.vs01CounterpartyId === selectedCounterpartyId) ?? null;
  const prepareOwnerPad = useMemo(
    () =>
      ownerPadFromPlacementContext({
        typedName: prepareCreatorName.trim(),
        initials: "",
        signerEmail: prepareCreatorEmail.trim() || undefined,
      }),
    [prepareCreatorName, prepareCreatorEmail],
  );
  const [recipientAutoInitialsEveryPage, setRecipientAutoInitialsEveryPage] = useState(false);
  const [skippedRecipientAutoByCp, setSkippedRecipientAutoByCp] = useState<Map<string, Set<number>>>(
    () => new Map()
  );
  const prevRecipientAutoToggleRef = useRef(false);
  const senderPlacedFieldsRef = useRef(senderPlacedFields);
  senderPlacedFieldsRef.current = senderPlacedFields;

  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{
    fieldId: string;
    pointerId: number;
    handleEl: HTMLButtonElement | null;
    pointerX: number;
    pointerY: number;
    startW: number;
    startH: number;
    x: number;
    y: number;
    page: number;
  } | null>(null);

  const dragStartRef = useRef<{
    fieldId: string;
    pointerX: number;
    pointerY: number;
    boxX: number;
    boxY: number;
  } | null>(null);

  const applyRecipientGeometryPatch = useCallback(
    (
      prev: Vs01RecipientPlacedField[],
      fieldId: string,
      patch: Partial<Pick<Vs01RecipientPlacedField, "x" | "y" | "width" | "height">>
    ): Vs01RecipientPlacedField[] => {
      const target = prev.find((f) => f.id === fieldId);
      if (!target) return prev;

      if (
        recipientAutoInitialsEveryPage &&
        !target.autoInitials &&
        target.type === "initials"
      ) {
        const page = target.page;
        const cpId = target.counterpartyId;
        const base = prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
        const rObs = base
          .filter((o) => o.page === page && !o.autoInitials)
          .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
        const sObs = senderPlacedFields
          .filter((s) => s.page === page)
          .map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
        const obstacles = [...rObs, ...sObs];
        const dims = autoInitialsPlacementDims();
        const col = autoInitialsColumnIndexOnPage(base, counterparties, cpId, page);
        const slot = findAutoInitialsMarginSlotOrNull(dims, obstacles, { columnOffset: col });
        return base
          .filter((f) => {
            if (f.autoInitials && f.type === "initials" && f.counterpartyId === cpId && f.page === page) {
              return Boolean(slot);
            }
            return true;
          })
          .map((f) => {
            if (f.autoInitials && f.type === "initials" && f.counterpartyId === cpId && f.page === page && slot) {
              return { ...f, ...slot };
            }
            return f;
          });
      }

      if (
        recipientAutoInitialsEveryPage &&
        target.autoInitials &&
        target.type === "initials" &&
        (patch.x !== undefined || patch.y !== undefined)
      ) {
        const nx = patch.x ?? target.x;
        const ny = patch.y ?? target.y;
        const dx = nx - target.x;
        const dy = ny - target.y;
        return prev.map((f) => {
          if (
            !f.autoInitials ||
            f.type !== "initials" ||
            f.counterpartyId !== target.counterpartyId
          ) {
            return f;
          }
          let x = f.x + dx;
          let y = f.y + dy;
          x = Math.min(Math.max(0, x), 1 - f.width);
          y = Math.min(Math.max(0, y), 1 - f.height);
          return {
            ...f,
            x: parseFloat(roundNorm(x)),
            y: parseFloat(roundNorm(y)),
          };
        });
      }

      if (!target.autoInitials || target.type !== "initials") {
        return prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
      }

      return prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
    },
    [recipientAutoInitialsEveryPage, senderPlacedFields, counterparties]
  );

  const namedCps = counterparties.filter((c) => c.name.trim());
  const cpById = useMemo(() => {
    const m = new Map<string, Vs01Counterparty>();
    for (const c of counterparties) m.set(c.id, c);
    return m;
  }, [counterparties]);

  useEffect(() => {
    if (namedCps.length === 0) {
      setSelectedCounterpartyId("");
      return;
    }
    if (!namedCps.some((c) => c.id === selectedCounterpartyId)) {
      setSelectedCounterpartyId(namedCps[0].id);
    }
  }, [namedCps, selectedCounterpartyId]);

  useEffect(() => {
    setSelectedFieldId(null);
    setArmedTool(null);
    setCurrentPage(1);
    setNumPages(0);
    setPdfDocReady(false);
    setPreviewError(null);
    setRecipientAutoInitialsEveryPage(false);
    setSkippedRecipientAutoByCp(new Map());
    prevRecipientAutoToggleRef.current = false;
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      if (!documentId?.trim()) {
        setPdfUrl(null);
        setPreviewError(null);
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const blob = await fetchDocumentContent(documentId.trim());
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setPdfUrl(null);
          setPreviewError(e instanceof Error ? e.message : String(e));
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
  }, [documentId]);

  useLayoutEffect(() => {
    const el = pagesInnerRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (w > 48) setPageRenderWidth(Math.max(160, w - 8));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfUrl]);

  const registerPageStack = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    if (el) pageStackRefs.current.set(pageIndex, el);
    else pageStackRefs.current.delete(pageIndex);
  }, []);

  const registerPageSurface = useCallback((pageIndex: number, el: HTMLDivElement | null) => {
    if (el) pageSurfaceRefs.current.set(pageIndex, el);
    else pageSurfaceRefs.current.delete(pageIndex);
  }, []);

  const updateField = useCallback(
    (id: string, patch: Partial<Vs01RecipientPlacedField>) => {
      onRecipientFieldsChange((prev) => {
        const target = prev.find((f) => f.id === id);
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
    [onRecipientFieldsChange]
  );

  const removeField = useCallback(
    (id: string) => {
      const f = fieldsRef.current.find((x) => x.id === id);
      if (f?.autoInitials) {
        setSkippedRecipientAutoByCp((prev) => {
          const next = new Map(prev);
          const s = new Set(next.get(f.counterpartyId) ?? []);
          s.add(f.page);
          next.set(f.counterpartyId, s);
          return next;
        });
      }
      onRecipientFieldsChange((prev) => prev.filter((x) => x.id !== id));
      setSelectedFieldId((cur) => (cur === id ? null : cur));
    },
    [onRecipientFieldsChange]
  );

  const selectedField = (() => {
    if (!selectedFieldId) return undefined;
    return recipientFields.find((x) => x.id === selectedFieldId);
  })();
  const pageIndex0 = currentPage - 1;
  const placementSurface = Boolean(pdfUrl) || Boolean(documentId?.trim() && previewError);
  const placementArmed =
    armedTool != null &&
    (prepareSigningPacket && prepareSignerRoles?.length
      ? Boolean(activePrepareRole?.vs01CounterpartyId)
      : namedCps.length > 0 && Boolean(selectedCounterpartyId));
  const prepareGate =
    prepareSigningPacket && prepareSignerRoles?.length
      ? evaluatePreparePacketGateFromRoles(prepareSignerRoles, senderPlacedFields, recipientFields)
      : prepareSigningPacket && (preparePacketAgreementId ?? "").trim()
        ? canFinishPreparingSigningPacket({
            agreementId: (preparePacketAgreementId ?? "").trim(),
            creatorName: (prepareCreatorName ?? "").trim(),
            creatorEmail: (prepareCreatorEmail ?? "").trim(),
            counterparties,
            senderPlacedFields,
            recipientPlacedFields: recipientFields,
          })
        : null;

  useEffect(() => {
    if (!prepareGate || !prepareSignerRoles?.length) return;
    logVs01RequiredProgress(prepareGate, prepareSignerRoles);
  }, [prepareGate, prepareSignerRoles]);

  const canContinue = prepareSigningPacket
    ? Boolean(prepareGate?.canFinish)
    : recipientFields.length > 0;

  const prepareMissingSummary = useMemo(() => {
    if (!prepareGate || !prepareSignerRoles?.length) return [];
    return buildPrepareMissingBySignerSummary(prepareGate, prepareSignerRoles);
  }, [prepareGate, prepareSignerRoles]);

  const handleFinishPreparePacket = useCallback(() => {
    const result = evaluatePrepareFinishClick(prepareGate, prepareSignerRoles ?? []);
    logVs01PrepareFinishClick({
      canFinish: result.allowed,
      incompleteSignerCount: result.allowed ? 0 : result.rows.length,
    });
    if (!result.allowed) {
      setFinishBlockedVisible(true);
      onError(result.message);
      if (result.focusRoleId) {
        prepareRoleCtx?.setActiveRole(result.focusRoleId, "auto_advance");
        const role = prepareSignerRoles?.find((r) => r.roleId === result.focusRoleId);
        if (role?.vs01CounterpartyId) setSelectedCounterpartyId(role.vs01CounterpartyId);
      }
      return;
    }
    setFinishBlockedVisible(false);
    onError(null);
    onContinueToReceipt?.();
  }, [prepareGate, prepareSignerRoles, prepareRoleCtx, onError, onContinueToReceipt]);

  const recipientOverlapKey = useMemo(() => {
    const id = selectedCounterpartyId.trim();
    if (!id) return "";
    return recipientFields
      .filter((f) => f.counterpartyId === id && !f.autoInitials)
      .map((f) => `${f.page},${roundNorm(f.x)},${roundNorm(f.y)},${roundNorm(f.width)},${roundNorm(f.height)}`)
      .join(";");
  }, [recipientFields, selectedCounterpartyId]);

  useEffect(() => {
    if (recipientAutoInitialsEveryPage) {
      prevRecipientAutoToggleRef.current = true;
      return;
    }
    if (prevRecipientAutoToggleRef.current && selectedCounterpartyId) {
      onRecipientFieldsChange((prev) => {
        const next = prev.filter((f) => !(f.autoInitials && f.counterpartyId === selectedCounterpartyId));
        return repositionAllRecipientAutoInitialsNonOverlapping(next, counterparties, senderPlacedFieldsRef.current);
      });
    }
    prevRecipientAutoToggleRef.current = false;
  }, [recipientAutoInitialsEveryPage, selectedCounterpartyId, counterparties, onRecipientFieldsChange]);

  useEffect(() => {
    if (!recipientAutoInitialsEveryPage || !selectedCounterpartyId.trim() || numPages <= 0) {
      return;
    }
    const skipped = skippedRecipientAutoByCp.get(selectedCounterpartyId) ?? new Set<number>();
    const cp = selectedCounterpartyId;

    onRecipientFieldsChange((prev) => {
      const rebuilt = rebuildRecipientAutoInitialsEveryPage(
        prev,
        cp,
        numPages,
        skipped,
        senderPlacedFieldsRef.current,
        counterparties
      );
      return repositionAllRecipientAutoInitialsNonOverlapping(rebuilt, counterparties, senderPlacedFieldsRef.current);
    });
  }, [
    recipientAutoInitialsEveryPage,
    selectedCounterpartyId,
    numPages,
    skippedRecipientAutoByCp,
    counterparties,
    onRecipientFieldsChange,
    recipientOverlapKey,
  ]);

  useEffect(() => {
    if (!prepareSigningPacket || !activePrepareRole?.vs01CounterpartyId) return;
    const cpId = activePrepareRole.vs01CounterpartyId;
    if (cpId !== selectedCounterpartyId) setSelectedCounterpartyId(cpId);
  }, [prepareSigningPacket, activePrepareRole, selectedCounterpartyId]);

  const onPagePlacementClick = useCallback(
    (pageIndex0: number, ev: MouseEvent<HTMLDivElement>) => {
      if (busy || armedTool == null) return;
      if (prepareSigningPacket) {
        if (!prepareRoleCtx?.activeRole?.vs01CounterpartyId) return;
      } else if (!selectedCounterpartyId) {
        return;
      }
      const t = ev.target as HTMLElement;
      if (t.closest?.(".vs01-sign-placement-box")) return;
      const surface = ev.currentTarget.parentElement as HTMLElement | null;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      let nf: Vs01RecipientPlacedField | null = null;
      const roleBeforeId = prepareRoleCtx?.authority.getActiveRoleId() ?? "";
      const roleBefore = findPrepareSigningRole(prepareSignerRoles, roleBeforeId);
      if (prepareSigningPacket && roleBefore) {
        logVs01ActiveRoleBeforePlace({
          roleIdShort: roleBefore.roleId.slice(0, 16),
          partyIndex: roleBefore.partyIndex,
          tool: armedTool,
          textPurpose: armedTool === "text" ? armedTextPurpose : undefined,
        });
      }
      if (prepareSigningPacket && prepareRoleCtx) {
        const role = prepareRoleCtx.activeRole;
        const cpId = role?.vs01CounterpartyId ?? "";
        if (!cpId || !role) return;
        const cpRow = cpById.get(cpId);
        const displayName =
          (role.signerName ?? "").trim() || counterpartyName(cpById, cpId);
        const emailForField =
          (role.signerEmail ?? role.reviewEmail ?? "").trim() ||
          resolveRecipientEmailForEmailFieldPlacement(cpRow?.email) ||
          undefined;
        nf = createPrepareStampedRecipientField({
          authority: prepareRoleCtx.authority,
          type: armedTool,
          page: pageIndex0,
          clickX: px,
          clickY: py,
          counterpartyId: cpId,
          displayName,
          email: emailForField,
          visualRoleId: displayRoleId,
          existingFields: fieldsRef.current,
          textPurpose: armedTool === "text" ? armedTextPurpose : undefined,
        });
        if (!nf) return;
        logVs01FieldCreated({
          roleIdShort: nf.assignedSignerRoleId?.slice(0, 16) ?? "",
          partyIndex: roleBefore?.partyIndex ?? nf.assignedPartyIndex ?? 0,
          fieldType: nf.type,
          textPurpose: nf.textPurpose,
          page: pageIndex0,
        });
      } else {
        const cpId = selectedCounterpartyId;
        const cpRow = cpById.get(cpId);
        nf = createRecipientFieldAtClick(
          armedTool,
          pageIndex0,
          px,
          py,
          cpId,
          counterpartyName(cpById, cpId),
          resolveRecipientEmailForEmailFieldPlacement(cpRow?.email) || undefined,
        );
      }
      onRecipientFieldsChange((prev) => {
        const next = [...prev, nf!];
        if (prepareRoleCtx) {
          queueMicrotask(() => prepareRoleCtx.afterPlacement(senderPlacedFields, next));
        }
        return next;
      });
      const roleAfterId = prepareRoleCtx?.authority.getActiveRoleId() ?? roleBeforeId;
      const roleAfter = findPrepareSigningRole(prepareSignerRoles, roleAfterId);
      if (prepareSigningPacket && roleAfter) {
        logVs01ActiveRoleAfterPlace({
          roleIdShort: roleAfter.roleId.slice(0, 16),
          partyIndex: roleAfter.partyIndex,
          unchanged: roleAfterId === roleBeforeId,
        });
      }
      if (prepareSigningPacket && nf && activePrepareRole) {
        const toolLabel = labelForPreparePlacedField(armedTool, armedTextPurpose);
        const msg = placementSuccessMessage(toolLabel, activePrepareRole.entityName ?? "");
        setPlacementNotice(msg);
        if (placementNoticeTimerRef.current) clearTimeout(placementNoticeTimerRef.current);
        placementNoticeTimerRef.current = setTimeout(() => {
          setPlacementNotice(null);
          placementNoticeTimerRef.current = null;
        }, 4500);
      }
      setSelectedFieldId(nf.id);
      setCurrentPage(pageIndex0 + 1);
      if (!vs01DevKeepPlacingEnabled()) {
        setArmedTool(null);
        setArmedTextPurpose(undefined);
      }
      setPlacementPopId(nf.id);
      window.setTimeout(() => setPlacementPopId(null), 380);
      if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
      setShowDragHint(true);
      dragHintTimerRef.current = setTimeout(() => {
        setShowDragHint(false);
        dragHintTimerRef.current = null;
      }, 2200);
    },
    [
      armedTool,
      armedTextPurpose,
      busy,
      cpById,
      selectedCounterpartyId,
      onRecipientFieldsChange,
      prepareSigningPacket,
      prepareSignerRoles,
      prepareRoleCtx,
      displayRoleId,
      senderPlacedFields,
      activePrepareRole,
    ]
  );

  useEffect(() => {
    return () => {
      if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
      if (placementNoticeTimerRef.current) clearTimeout(placementNoticeTimerRef.current);
    };
  }, []);

  const onBoxPointerDown = useCallback(
    (ev: PointerEvent<HTMLDivElement>, field: Vs01RecipientPlacedField) => {
      if (busy || resizing) return;
      if (prepareSigningPacket && !fieldMatchesActive(field)) {
        setSelectedFieldId(field.id);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if ((ev.target as HTMLElement).closest(".vs01-sign-placement-resize-handle")) return;
      if ((ev.target as HTMLElement).closest(".vs01-sign-field-inline-input")) return;
      if (
        (field.type === "date" ||
          field.type === "initials" ||
          field.type === "text" ||
          field.type === "email" ||
          field.type === "printed_name") &&
        selectedFieldId !== field.id
      ) {
        setSelectedFieldId(field.id);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      setSelectedFieldId(field.id);
      dragStartRef.current = {
        fieldId: field.id,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        boxX: field.x,
        boxY: field.y,
      };
      setDragging(true);
      (ev.currentTarget as HTMLDivElement).setPointerCapture(ev.pointerId);
    },
    [busy, resizing, selectedFieldId, prepareSigningPacket, fieldMatchesActive]
  );

  const onPlacementBoxClick = useCallback((ev: MouseEvent<HTMLDivElement>, field: Vs01RecipientPlacedField) => {
    ev.stopPropagation();
    setSelectedFieldId(field.id);
  }, []);

  useEffect(() => {
    if (!dragging || !dragStartRef.current) return;

    const onMove = (e: globalThis.PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const field = fieldsRef.current.find((f) => f.id === start.fieldId);
      if (!field) return;
      const surface = pageSurfaceRefs.current.get(field.page);
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const dx = (e.clientX - start.pointerX) / rect.width;
      const dy = (e.clientY - start.pointerY) / rect.height;
      const wn = clamp01(field.width);
      const hn = clamp01(field.height);
      let nx = start.boxX + dx;
      let ny = start.boxY + dy;
      nx = Math.min(Math.max(0, nx), 1 - wn);
      ny = Math.min(Math.max(0, ny), 1 - hn);
      onRecipientFieldsChange((prev) =>
        applyRecipientGeometryPatch(prev, field.id, {
          x: parseFloat(roundNorm(nx)),
          y: parseFloat(roundNorm(ny)),
        })
      );
    };

    const onUp = () => {
      dragStartRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onRecipientFieldsChange, applyRecipientGeometryPatch]);

  useEffect(() => {
    if (!resizing || !resizeStartRef.current) return;

    const onMove = (e: globalThis.PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const field = fieldsRef.current.find((f) => f.id === start.fieldId);
      if (!field) return;
      const surface = pageSurfaceRefs.current.get(field.page);
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = (e.clientX - start.pointerX) / rect.width;
      const dy = (e.clientY - start.pointerY) / rect.height;
      const b = resizeBoundsForPlacementField(field);
      const maxW = Math.min(b.maxW, 1 - start.x);
      const maxH = Math.min(b.maxH, 1 - start.y);
      let nw = start.startW + dx;
      let nh = start.startH + dy;
      nw = Math.min(Math.max(b.minW, nw), maxW);
      nh = Math.min(Math.max(b.minH, nh), maxH);
      onRecipientFieldsChange((prev) =>
        applyRecipientGeometryPatch(prev, field.id, {
          width: parseFloat(roundNorm(nw)),
          height: parseFloat(roundNorm(nh)),
        })
      );
    };

    const onUp = () => {
      const s = resizeStartRef.current;
      if (s?.handleEl) {
        try {
          s.handleEl.releasePointerCapture(s.pointerId);
        } catch {
          /* not capturing */
        }
      }
      resizeStartRef.current = null;
      setResizing(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizing, onRecipientFieldsChange, applyRecipientGeometryPatch]);

  const onResizeHandlePointerDown = useCallback(
    (ev: PointerEvent<HTMLButtonElement>, field: Vs01RecipientPlacedField) => {
      if (busy) return;
      ev.preventDefault();
      ev.stopPropagation();
      setSelectedFieldId(field.id);
      const el = ev.currentTarget;
      resizeStartRef.current = {
        fieldId: field.id,
        pointerId: ev.pointerId,
        handleEl: el,
        pointerX: ev.clientX,
        pointerY: ev.clientY,
        startW: field.width,
        startH: field.height,
        x: field.x,
        y: field.y,
        page: field.page,
      };
      setResizing(true);
      el.setPointerCapture(ev.pointerId);
    },
    [busy]
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

  const selectedCpName = selectedField ? counterpartyName(cpById, selectedField.counterpartyId) : "";

  return (
    <section
      data-vs01-step={STEP_ID}
      aria-labelledby="vs01-step-assign-recipient-title"
      className="vs01-sign-step vs01-recipient-assign-step"
    >
      <header className="vs01-sign-step-header">
        <h2 id="vs01-step-assign-recipient-title" className="vs01-card-title">
          Fields for the next signer
        </h2>
        <p className="vs01-card-help vs01-sign-step-lead">Place the spots they&apos;ll complete later.</p>
        <p className="vs01-recipient-assign-callout" role="note">
          Your fields from the previous step stay faded here for reference.
        </p>
      </header>

      <div className="vs01-sign-workspace">
        <div className="vs01-sign-doc-col">
          {placementArmed && placementSurface && !previewLoading ? (
            <div className="vs01-sign-armed-banner" role="status">
              Click once on the document to place a {labelForRecipientFieldType(armedTool)} field for the selected signer.
            </div>
          ) : null}

          {placementSurface && !previewLoading ? (
            <div className="vs01-sign-page-bar" aria-label="Page navigation">
              <button
                type="button"
                className="vs01-sign-page-btn"
                disabled={busy || numPages <= 0 || currentPage <= 1}
                onClick={goTop}
              >
                Top
              </button>
              <button type="button" className="vs01-sign-page-btn" disabled={busy || currentPage <= 1} onClick={goPrev}>
                Prev
              </button>
              <span className="vs01-sign-page-label">
                Page {numPages > 0 ? currentPage : 1}
                {numPages > 0 ? ` of ${numPages}` : ""}
              </span>
              <button
                type="button"
                className="vs01-sign-page-btn"
                disabled={busy || numPages <= 0 || currentPage >= numPages}
                onClick={goNext}
              >
                Next
              </button>
              <button
                type="button"
                className="vs01-sign-page-btn"
                disabled={busy || numPages <= 0 || currentPage >= numPages}
                onClick={goBottom}
              >
                Bottom
              </button>
            </div>
          ) : null}

          <div className="vs01-sign-scroll">
            {previewLoading ? (
              <div className="vs01-sign-preview-fallback" role="status">
                Loading document…
              </div>
            ) : pdfUrl || (documentId?.trim() && previewError) ? (
              <div
                className={`vs01-sign-doc-pages-wrap vs01-sign-doc-surface${placementArmed ? " vs01-sign-doc-surface--armed" : ""}`}
              >
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
                              const fieldsHere = recipientFields.filter((f) => f.page === p);
                              const senderFieldsHere = senderPlacedFields.filter((f) => f.page === p);
                              const hasRecipientOnPage = fieldsHere.length > 0;
                              const hasSenderOnPage = senderFieldsHere.length > 0;
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
                                      <div
                                        ref={(el) => registerPageSurface(p, el)}
                                        className="vs01-sign-page-placement-host"
                                      >
                                        {hasSenderOnPage ? (
                                          <div className="vs01-sign-sender-ref-layer" aria-hidden>
                                            {senderFieldsHere.map((field) => {
                                              const xFit = Math.min(field.x, 1 - field.width);
                                              const yFit = Math.min(field.y, 1 - field.height);
                                              return (
                                                <div
                                                  key={`sender-ref-${field.id}`}
                                                  className={`vs01-sign-sender-ref-box vs01-sign-sender-ref-box--${field.type}`}
                                                  style={{
                                                    left: `${xFit * 100}%`,
                                                    top: `${yFit * 100}%`,
                                                    width: `${field.width * 100}%`,
                                                    height: `${field.height * 100}%`,
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
                                          className={`vs01-sign-placement-click-layer${
                                            placementArmed
                                              ? " vs01-sign-placement-click-layer--armed"
                                              : " vs01-sign-placement-click-layer--idle"
                                          }`}
                                          aria-hidden
                                          onClick={placementArmed ? (ev) => onPagePlacementClick(p, ev) : undefined}
                                        />
                                        <div
                                          className={`vs01-sign-overlay${
                                            hasRecipientOnPage || hasSenderOnPage ? " vs01-sign-overlay--placed" : ""
                                          }`}
                                          role="presentation"
                                        >
                                          {showDragHint && p === pageIndex0 ? (
                                            <div className="vs01-sign-drag-hint" role="status">
                                              Drag to move
                                            </div>
                                          ) : null}
                                          {fieldsHere.map((field) => {
                                            const xFit = Math.min(field.x, 1 - field.width);
                                            const yFit = Math.min(field.y, 1 - field.height);
                                            const isSel = selectedFieldId === field.id;
                                            const pop = placementPopId === field.id;
                                            const textVal = typeof field.value === "string" ? field.value : "";
                                            const forName =
                                              field.assignedSignerRoleLabel?.trim() ||
                                              counterpartyName(cpById, field.counterpartyId);
                                            const fieldRole = prepareSigningPacket
                                              ? findPrepareSigningRole(
                                                  prepareSignerRoles,
                                                  field.assignedSignerRoleId,
                                                )
                                              : null;
                                            const fieldDisplay =
                                              prepareSigningPacket && fieldRole
                                                ? prepareTemplateDisplayForField(
                                                    field as PlacedSigningField,
                                                    fieldRole,
                                                    prepareOwnerPad,
                                                    { preparePacket: true },
                                                  )
                                                : null;
                                            const isActiveRoleField =
                                              !prepareSigningPacket || fieldMatchesActive(field);
                                            return (
                                              <div
                                                key={field.id}
                                                data-field-id={field.id}
                                                {...(fieldDisplay
                                                  ? prepareFieldDataAttributes(
                                                      field as PlacedSigningField,
                                                      fieldRole,
                                                      fieldDisplay,
                                                    )
                                                  : {})}
                                                className={`vs01-sign-placement-box vs01-sign-placement-box--${field.type}${
                                                  field.autoInitials ? " vs01-sign-placement-box--auto-initials" : ""
                                                }${
                                                  field.type === "signature" &&
                                                  (fieldRole?.kind ?? field.assignedSignerRoleKind) ===
                                                    "counterparty"
                                                    ? " vs01-sign-placement-box--counterparty-signature"
                                                    : field.type === "signature" ||
                                                        (field.type === "initials" && !field.autoInitials)
                                                      ? " vs01-recipient-pending-slot"
                                                      : ""
                                                }${isSel ? " vs01-sign-placement-box--selected" : ""}${
                                                  pop ? " vs01-sign-placement-box--pop" : ""
                                                }${!isActiveRoleField ? " vs01-sign-placement-box--other-role" : ""}`}
                                                style={{
                                                  left: `${xFit * 100}%`,
                                                  top: `${yFit * 100}%`,
                                                  width: `${field.width * 100}%`,
                                                  height: `${field.height * 100}%`,
                                                  zIndex: isSel ? 4 : 3,
                                                }}
                                                onPointerDown={(e) => onBoxPointerDown(e, field)}
                                                onClick={(e) => onPlacementBoxClick(e, field)}
                                              >
                                                {prepareSigningPacket && prepareSignerRoles ? (
                                                  <>
                                                    <span className="vs01-sign-placement-label">
                                                      {prepareTemplateCornerLabel(
                                                        field.type,
                                                        fieldRole,
                                                        (field as PlacedSigningField).textPurpose,
                                                      )}
                                                    </span>
                                                    <PrepareSigningFieldBody
                                                      field={field as PlacedSigningField}
                                                      role={fieldRole}
                                                      ownerPreview={{
                                                        signatureMode: "type",
                                                        typedName: prepareCreatorName.trim(),
                                                        hasDrawn: false,
                                                        uploadPreviewUrl: null,
                                                      }}
                                                      ownerPad={prepareOwnerPad}
                                                      preparePacketMode={prepareSigningPacket}
                                                      isSelected={isSel}
                                                      busy={busy}
                                                      onValueChange={(value) =>
                                                        updateField(field.id, { value })
                                                      }
                                                    />
                                                  </>
                                                ) : (
                                                  <>
                                                <span className="vs01-sign-placement-label">
                                                  {labelForRecipientFieldType(field.type)}
                                                  {forName ? ` · ${forName}` : ""}
                                                </span>
                                                {field.type === "signature" || field.type === "printed_name" ? null : (
                                                  <span className="vs01-recipient-assign-for">{forName}</span>
                                                )}
                                                {field.type === "signature" ? (
                                                  <RecipientSignatureFieldBody textVal={textVal} assigneeLabel={forName} />
                                                ) : null}
                                                {field.type === "initials" ? (
                                                  isSel && !busy ? (
                                                    <input
                                                      type="text"
                                                      className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                      value={textVal}
                                                      placeholder="Signer initials here"
                                                      maxLength={8}
                                                      autoComplete="off"
                                                      aria-label="Signer initials on document"
                                                      onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                      onPointerDown={(ev) => ev.stopPropagation()}
                                                      onClick={(ev) => ev.stopPropagation()}
                                                    />
                                                  ) : (
                                                    <span
                                                      className={`vs01-sign-placement-initials${!textVal.trim() ? " vs01-sign-placement-ph" : ""}`}
                                                    >
                                                      {textVal.trim().slice(0, 8) || "Signer initials here"}
                                                    </span>
                                                  )
                                                ) : null}
                                                {field.type === "printed_name" ? (
                                                  <RecipientPrintedNameFieldBody displayName={forName} />
                                                ) : null}
                                                {field.type === "text" ? (
                                                  isSel && !busy ? (
                                                    <input
                                                      type="text"
                                                      className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                      value={textVal}
                                                      placeholder="Text (title, email, custom blank…)"
                                                      autoComplete="off"
                                                      aria-label="Text field for signer"
                                                      onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                      onPointerDown={(ev) => ev.stopPropagation()}
                                                      onClick={(ev) => ev.stopPropagation()}
                                                    />
                                                  ) : (
                                                    <span
                                                      className={`vs01-sign-placement-text${
                                                        !textVal.trim() ? " vs01-sign-placement-ph" : ""
                                                      }${textVal.trim() ? " vs01-recipient-field-value-filled" : ""}`}
                                                    >
                                                      {textVal.trim() || "Signer adds text"}
                                                    </span>
                                                  )
                                                ) : null}
                                                {field.type === "email" ? (
                                                  isSel && !busy ? (
                                                    <input
                                                      type="email"
                                                      className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                      value={textVal}
                                                      placeholder="Email"
                                                      autoComplete="email"
                                                      aria-label="Email field for signer"
                                                      onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                      onPointerDown={(ev) => ev.stopPropagation()}
                                                      onClick={(ev) => ev.stopPropagation()}
                                                    />
                                                  ) : (
                                                    <span
                                                      className={`vs01-sign-placement-text${
                                                        !textVal.trim() ? " vs01-sign-placement-ph" : ""
                                                      }${textVal.trim() ? " vs01-recipient-field-value-filled" : ""}`}
                                                    >
                                                      {textVal.trim() || "Signer adds email"}
                                                    </span>
                                                  )
                                                ) : null}
                                                {field.type === "date" ? (
                                                  isSel && !busy ? (
                                                    <input
                                                      type="date"
                                                      className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                      value={textVal}
                                                      aria-label="Date for signer"
                                                      onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                      onPointerDown={(ev) => ev.stopPropagation()}
                                                      onClick={(ev) => ev.stopPropagation()}
                                                    />
                                                  ) : (
                                                    <span
                                                      className={`vs01-sign-placement-text${
                                                        !textVal.trim() ? " vs01-sign-placement-ph" : ""
                                                      }${textVal.trim() ? " vs01-recipient-field-value-filled" : ""}`}
                                                    >
                                                      {textVal.trim() ? formatIsoDateDisplay(textVal) : "Signer adds date"}
                                                    </span>
                                                  )
                                                ) : null}
                                                  </>
                                                )}
                                                {isSel && !busy ? (
                                                  <button
                                                    type="button"
                                                    className="vs01-sign-placement-resize-handle"
                                                    aria-label="Resize field"
                                                    tabIndex={-1}
                                                    onPointerDown={(e) => onResizeHandlePointerDown(e, field)}
                                                  />
                                                ) : null}
                                              </div>
                                            );
                                          })}
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
                  <>Finalize a document first to see it here.</>
                )}
              </div>
            )}
          </div>
          <p className="vs01-sign-doc-foot-hint">
            {placementSurface && !previewLoading
              ? selectedFieldId
                ? "Scroll the document area (mouse wheel, trackpad, or scrollbar) if a page is off-screen. Drag the field to move it; use the corner handle to resize. Recipients complete these spots later."
                : placementArmed
                  ? "Scroll the document area (mouse wheel, trackpad, or scrollbar) to reach every page, then click once where this recipient should sign or fill in."
                  : "Scroll the document area (mouse wheel, trackpad, or scrollbar) to review every page. Choose a recipient and a field type, then place spots where they should complete the agreement."
              : null}
          </p>
        </div>

        <aside className="vs01-sign-rail" aria-label="Recipient field controls">
          <div className="vs01-recipient-rail-panel">
            {prepareSigningPacket && prepareSignerRoles && prepareSignerRoles.length > 0 ? (
              <div className="vs01-prepare-role-picker" role="group" aria-label="Signer role for field placement">
                <span className="vs01-recipient-rail-heading" id="vs01-assign-recipient-heading">
                  Placing fields for
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {prepareSignerRoles.map((r) => {
                    const sel = displayRoleId === r.roleId;
                    return (
                      <button
                        key={r.roleId}
                        type="button"
                        className={
                          sel
                            ? "vs01-btn vs01-btn--primary text-left text-sm"
                            : "vs01-btn vs01-btn--secondary text-left text-sm"
                        }
                        onClick={() => selectPrepareRole(r.roleId)}
                      >
                        {r.entityName?.trim() || (r.kind === "owner" ? "Owner" : "Signer")}
                        {r.kind === "owner" ? " (you)" : ""}
                      </button>
                    );
                  })}
                </div>
                {activePrepareRole?.kind === "owner" ? (
                  <p className="vs01-recipient-rail-helper-copy mt-2">
                    Place owner/sender fields on the previous step. This step is for counterparty signers only.
                  </p>
                ) : null}
                {prepareGate ? (
                  <ul className="vs01-prepare-role-progress mt-2 text-xs" aria-label="Required fields per signer">
                    {prepareSignerRoles.map((r) => {
                      const miss = prepareGate.missingByParty[r.roleId] ?? [];
                      const done = miss.length === 0;
                      return (
                        <li
                          key={r.roleId}
                          className={
                            done
                              ? "vs01-prepare-role-progress-item vs01-prepare-role-progress-item--done"
                              : "vs01-prepare-role-progress-item"
                          }
                        >
                          <span className="font-medium">{r.entityName}</span>
                          {done ? " — complete" : ` — needs: ${miss.map(formatPrepareMissingFieldLabel).join(", ")}`}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {prepareGate && !prepareGate.canFinish ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--auto mt-2 text-sm"
                    disabled={busy}
                    onClick={advanceToNextIncompleteSigner}
                  >
                    Next signer
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <span className="vs01-recipient-rail-heading" id="vs01-assign-recipient-heading">
                  Who signs next?
                </span>
                {namedCps.length === 0 ? (
                  <p className="vs01-recipient-assign-warning">
                    Add at least one counterparty with a name in Details before placing fields.
                  </p>
                ) : (
                  <>
                    <select
                      id="vs01-assign-recipient-select"
                      className="vs01-input"
                      aria-labelledby="vs01-assign-recipient-heading"
                      value={selectedCounterpartyId}
                      disabled={busy}
                      onChange={(e) => setSelectedCounterpartyId(e.target.value)}
                    >
                      {namedCps.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name.trim()}
                          {c.email.trim() ? ` (${c.email.trim()})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="vs01-recipient-rail-helper-copy">
                      These spots are for the next signer.
                      <br />
                      Signature and initials stay blank until they sign.
                      <br />
                      Printed name shows where their name should appear.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          <div className="vs01-sign-toolbar" role="toolbar" aria-labelledby="vs01-assign-tools-heading">
            {prepareSigningPacket && activePrepareRole ? (
              <p className="vs01-sign-placing-for-role" role="status">
                Placing fields for: <strong>{activePrepareRole.entityName}</strong>
                {activePrepareRole.kind === "owner" ? (
                  <span className="vs01-sign-placing-for-role-tag"> (use previous step)</span>
                ) : (
                  <span className="vs01-sign-placing-for-role-tag"> (counterparty)</span>
                )}
              </p>
            ) : null}
            <p id="vs01-assign-tools-heading" className="vs01-sign-toolbar-hint vs01-recipient-rail-heading">
              Choose what to place
            </p>
            <div className="vs01-sign-toolbar-btns">
              {(prepareSigningPacket ? PREPARE_PACKET_FIELD_TOOLS : RECIPIENT_FIELD_TOOLS).map((tool) => {
                const t = tool.type;
                const purpose =
                  "textPurpose" in tool ? (tool.textPurpose as Vs01TextFieldPurpose | undefined) : undefined;
                const key = prepareSigningPacket ? preparePacketToolKey(tool) : t;
                const selected = prepareSigningPacket
                  ? matchesPreparePacketTool(activeTool, activeTextPurpose, tool)
                  : activeTool === t;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`vs01-sign-tool-btn${selected ? " vs01-sign-tool-btn--active" : ""}`}
                    disabled={busy || (!prepareSigningPacket && namedCps.length === 0)}
                    onClick={() => {
                      setActiveTool(t);
                      setActiveTextPurpose(purpose);
                      setArmedTool(null);
                      setArmedTextPurpose(undefined);
                    }}
                  >
                    {prepareSigningPacket ? tool.label : tool.label}
                  </button>
                );
              })}
            </div>
            <div className="vs01-sign-placement-mode" aria-labelledby="vs01-assign-place-heading">
              <p id="vs01-assign-place-heading" className="vs01-recipient-rail-heading">
                Place on document
              </p>
              <p className="vs01-sign-placement-mode-status">
                {placementArmed
                  ? "Placement mode: On — click once on the PDF."
                  : "Placement mode: Off — choose Place on document before clicking."}
              </p>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto vs01-sign-place-cta"
                disabled={busy || !placementSurface || previewLoading || namedCps.length === 0}
                onClick={() => {
                  setArmedTool(activeTool);
                  setArmedTextPurpose(activeTextPurpose);
                }}
              >
                {prepareSigningPacket
                  ? `Place ${labelForPreparePlacedField(activeTool, activeTextPurpose)} on document`
                  : "Place on document"}
              </button>
              {placementNotice ? (
                <p className="vs01-sign-placement-notice mt-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">
                  {placementNotice}
                </p>
              ) : null}
            </div>
          </div>

          <label className="vs01-sign-auto-initials">
            <input
              type="checkbox"
              checked={recipientAutoInitialsEveryPage}
              disabled={busy || numPages <= 0 || !selectedCounterpartyId}
              onChange={(e) => setRecipientAutoInitialsEveryPage(e.target.checked)}
            />
            <span>
              {prepareSigningPacket
                ? "Add initials for this signer on every page"
                : "Initials box on every page"}
            </span>
          </label>
          {prepareSigningPacket ? (
            <p className="vs01-prepare-initials-hint">
              Applies to the signer selected above. Repeat for each signer as you move through roles.
            </p>
          ) : null}

          {prepareSigningPacket && prepareGate && !prepareGate.canFinish ? (
            <div className="vs01-prepare-finish-blocked-panel" role="alert">
              <p className="vs01-prepare-finish-blocked-title">Required fields still missing</p>
              <ul className="vs01-prepare-finish-blocked-list">
                {prepareMissingSummary.map((row) => (
                  <li key={row.roleId}>
                    <strong>{row.entityName}</strong> still needs: {row.missingLabels.join(", ")}.{" "}
                    <button
                      type="button"
                      className="vs01-prepare-go-to-signer"
                      disabled={busy}
                      onClick={() => selectPrepareRole(row.roleId)}
                    >
                      Go to {row.entityName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedField ? (
            <div className="vs01-sign-selected-panel">
              <div className="vs01-sign-selected-head">
                <span className="vs01-sign-selected-title">
                  {labelForRecipientFieldType(selectedField.type)} · {selectedCpName}
                </span>
                <button
                  type="button"
                  className="vs01-sign-remove-field"
                  disabled={busy}
                  onClick={() => removeField(selectedField.id)}
                >
                  Remove selected field
                </button>
              </div>
              <p className="vs01-sign-selected-note">Drag to move; drag the bottom-right corner to resize.</p>
            </div>
          ) : null}

          {!selectedField ? (
            <p className="vs01-sign-rail-helper">
              Choose a field, click Place on document, then click the PDF.
            </p>
          ) : null}

          <div className="vs01-sign-actions">
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" disabled={busy} onClick={() => onBack?.()}>
              Back
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              disabled={prepareSigningPacket ? busy : !canContinue}
              onClick={() => {
                if (prepareSigningPacket) {
                  handleFinishPreparePacket();
                  return;
                }
                if (canContinue) {
                  onError(null);
                  onContinueToReceipt?.();
                }
              }}
            >
              {prepareSigningPacket ? "Finish preparing packet" : "Continue to receipt"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
