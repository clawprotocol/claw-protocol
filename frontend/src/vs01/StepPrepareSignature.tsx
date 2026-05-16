import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ESIGN_INTENT_SIGN_DOCUMENT_ACTION,
  NOT_LEGAL_ADVICE,
  PRODUCT_NOT_LAW_FIRM,
  RECORDS_DOWNLOAD_KEEP_COPY_SHORT,
} from "../compliance/disclosureCopy";
import { completeSignSession, createSignSession, fetchDocumentContent } from "./vs01Api";
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import { firstPlausibleEmailInSignerRef, isPlausibleEmail } from "./detailsStepValidation";
import type {
  Vs01Counterparty,
  Vs01LoadingState,
  Vs01RecipientPlacedField,
  Vs01SenderSignatureRef,
} from "./types";
import {
  evaluatePreparePacketGateFromRoles,
  findPrepareSigningRole,
  logVs01RequiredProgress,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import {
  buildPrepareAutoInitialsEveryPage,
  createPrepareStampedSenderField,
} from "./vs01PrepareFieldPlacement";
import { PrepareSigningFieldBody } from "./vs01PrepareSigningFieldRender";
import { ownerPadFromPlacementContext } from "./vs01FieldValueResolution";
import {
  buildPrepareTemplateValueContext,
  logVs01FieldInputFocus,
  logVs01PlacementClickRole,
  logVs01PlacementFieldRejected,
  prepareTemplateCornerLabel,
} from "./vs01PrepareTemplateField";
import { useVs01PrepareRoleAuthorityOptional } from "./Vs01PrepareRoleAuthorityContext";
import {
  SIGNING_FIELD_TOOLS,
  buildAutoInitialsFields,
  createPlacedFieldAtClick,
  defaultValueForType,
  fieldsToManifest,
  labelForFieldType,
  resizeBoundsForPlacementField,
  resolveSenderEmailForEmailFieldPlacement,
  type PlacedSigningField,
  type SigningFieldType,
} from "./signingFields";

const INTENT_OPTIONS = ["agree_and_sign"] as const;

export type StepPrepareSignatureProps = {
  defaultSignerRef: string;
  documentId: string | null;
  contentSha256: string | null;
  receiptId: string | null;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  onSigned: (payload: {
    receiptId: string;
    receiptHashSha256: string;
    receipt: unknown;
    senderPlacedFields: PlacedSigningField[];
    senderSignatureRef: Vs01SenderSignatureRef | null;
  }) => void;
  counterparties: Vs01Counterparty[];
  /** When set, Email placement tool prefills from this address. */
  creatorEmail?: string;
  senderMessage: string;
  /** Paid Pro agreement → VS01 bridge: placement-first framing (not “sign your document” yet). */
  agreementBridgePlacementCopy?: boolean;
  /** Paid Pro prepare flow: roles for signer-bound placement (sidebar). */
  prepareSignerRoles?: Vs01PrepareSigningRole[];
  prepareActiveSignerRoleId?: string;
  onPrepareActiveSignerRoleChange?: (roleId: string) => void;
  /** Recipient-layer fields (step 3) included in prepare packet gate on this step. */
  prepareRecipientPlacedFields?: Vs01RecipientPlacedField[];
  /** Pre-populate placed fields (e.g. from saved draft state on refresh). */
  /** Controlled placed-fields array — parent is source of truth. */
  fields: PlacedSigningField[];
  /** Called on every field mutation (add/remove/move/resize/value edit). Parent must apply the update. */
  onFieldsChange: (fields: PlacedSigningField[]) => void;
  onBack?: () => void;
  onContinue?: () => void;
};

const STEP_ID = "prepare-sign" as const;

/** Corner label on placed fields (Step 3, first person). */
function signingPlacementCornerLabel(t: SigningFieldType, field?: PlacedSigningField): string {
  let base: string;
  switch (t) {
    case "signature":
      base = "Your signature";
      break;
    case "initials":
      base = "Your initials";
      break;
    case "printed_name":
      base = "Printed name";
      break;
    case "text":
      base = "Text";
      break;
    case "email":
      base = "Email";
      break;
    case "date":
      base = "Date";
      break;
    default:
      base = labelForFieldType(t);
  }
  const sub = field?.assignedSignerRoleLabel?.trim();
  if (sub) return `${base} · ${sub}`;
  return base;
}

type SignatureMode = "type" | "draw" | "upload";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function roundNorm(n: number): string {
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

function nameFromSignerRef(ref: string): string {
  const first = ref.split("·")[0]?.trim();
  return first || ref.trim();
}

function initialsFromName(name: string): string {
  const t = name.trim();
  if (!t) return "";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] ?? "";
    const b = parts[parts.length - 1][0] ?? "";
    return (a + b).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Step 2 — Signing: field tools + click-to-place on hit layer, same sign-session API.
 */
export function StepPrepareSignature({
  defaultSignerRef,
  documentId,
  contentSha256,
  receiptId,
  loading,
  setLoading,
  onError,
  onSigned,
  counterparties,
  creatorEmail,
  senderMessage,
  agreementBridgePlacementCopy = false,
  prepareSignerRoles,
  prepareActiveSignerRoleId,
  prepareRecipientPlacedFields = [],
  fields,
  onFieldsChange,
  onBack,
  onContinue,
}: StepPrepareSignatureProps) {
  const signerEmailForPlacement =
    resolveSenderEmailForEmailFieldPlacement(creatorEmail, defaultSignerRef) || undefined;

  const prepareRoleCtx = useVs01PrepareRoleAuthorityOptional();
  const prepareRecipientPlacedFieldsRef = useRef(prepareRecipientPlacedFields);
  prepareRecipientPlacedFieldsRef.current = prepareRecipientPlacedFields;

  const displayRoleId =
    agreementBridgePlacementCopy && prepareRoleCtx
      ? prepareRoleCtx.displayRoleId
      : (prepareActiveSignerRoleId ?? "").trim();
  const activePrepareRole =
    agreementBridgePlacementCopy && prepareRoleCtx
      ? prepareRoleCtx.activeRole
      : prepareSignerRoles?.find((r) => r.roleId === displayRoleId) ?? prepareSignerRoles?.[0] ?? null;
  const ownerPrepareRole =
    agreementBridgePlacementCopy && prepareRoleCtx
      ? prepareRoleCtx.ownerRole
      : prepareSignerRoles?.[0] ?? null;

  const preparePacketGate = useMemo(() => {
    if (!agreementBridgePlacementCopy || !prepareSignerRoles?.length) return null;
    return evaluatePreparePacketGateFromRoles(prepareSignerRoles, fields, prepareRecipientPlacedFields);
  }, [agreementBridgePlacementCopy, prepareSignerRoles, fields, prepareRecipientPlacedFields]);

  useEffect(() => {
    if (!preparePacketGate || !prepareSignerRoles?.length) return;
    logVs01RequiredProgress(preparePacketGate, prepareSignerRoles);
    prepareRoleCtx?.authority.logRoleProgress(
      preparePacketGate,
      fields,
      prepareRecipientPlacedFields,
    );
  }, [preparePacketGate, prepareSignerRoles, fields, prepareRecipientPlacedFields, prepareRoleCtx]);

  const advanceToNextIncompleteSigner = useCallback(() => {
    if (!prepareRoleCtx) return;
    prepareRoleCtx.advanceToNextSigner(fieldsRef.current, prepareRecipientPlacedFieldsRef.current);
  }, [prepareRoleCtx]);

  const fieldMatchesActive = useCallback(
    (field: PlacedSigningField) => {
      if (!agreementBridgePlacementCopy || !ownerPrepareRole || !displayRoleId) return true;
      return prepareRoleCtx
        ? prepareRoleCtx.fieldMatchesActiveRole(field)
        : field.assignedSignerRoleId === displayRoleId;
    },
    [agreementBridgePlacementCopy, ownerPrepareRole, displayRoleId, prepareRoleCtx],
  );

  const busySession = loading === "session";
  const busyComplete = loading === "complete";
  const busy = busySession || busyComplete;

  const [intent] = useState<string>(INTENT_OPTIONS[0]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocReady, setPdfDocReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onFieldsChangeRef = useRef(onFieldsChange);
  onFieldsChangeRef.current = onFieldsChange;

  if (typeof window !== "undefined" && window.localStorage?.getItem("lawdogVs01FieldDiag") === "1") {
    // eslint-disable-next-line no-console
    console.info("[vs01-step-prepare-fields-props]", { controlledCount: fields.length });
  }

  /** Stable setter that mimics useState — resolves functional updates against latest prop value. */
  const setFields = useCallback(
    (next: PlacedSigningField[] | ((prev: PlacedSigningField[]) => PlacedSigningField[])) => {
      const prev = fieldsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      if (resolved === prev) return;
      if (
        resolved.length === prev.length &&
        resolved.every((f, i) => f === prev[i])
      ) {
        return;
      }
      onFieldsChangeRef.current(resolved);
    },
    [],
  );

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<SigningFieldType>("signature");
  /** When set, the next click on the document places this field type once, then clears. */
  const [armedTool, setArmedTool] = useState<SigningFieldType | null>(null);
  const activeToolForEmailLogRef = useRef(activeTool);
  const armedToolForEmailLogRef = useRef(armedTool);
  activeToolForEmailLogRef.current = activeTool;
  armedToolForEmailLogRef.current = armedTool;

  const [autoInitialsEveryPage, setAutoInitialsEveryPage] = useState(false);
  const [skippedAutoPages, setSkippedAutoPages] = useState<Set<number>>(() => new Set());

  const [signatureMode, setSignatureMode] = useState<SignatureMode>("type");
  const [typedName, setTypedName] = useState(() => nameFromSignerRef(defaultSignerRef));
  const [initials, setInitials] = useState(() => initialsFromName(nameFromSignerRef(defaultSignerRef)));
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const uploadRevokeRef = useRef<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const [placementPopId, setPlacementPopId] = useState<string | null>(null);
  const [showDragHint, setShowDragHint] = useState(false);
  const dragHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const pagesInnerRef = useRef<HTMLDivElement>(null);
  const [pageRenderWidth, setPageRenderWidth] = useState(520);
  const pageSurfaceRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageStackRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const typedNameRef = useRef(typedName);
  const initialsRef = useRef(initials);
  typedNameRef.current = typedName;
  initialsRef.current = initials;
  const dragStartRef = useRef<{
    fieldId: string;
    pointerX: number;
    pointerY: number;
    boxX: number;
    boxY: number;
  } | null>(null);

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

  const emailDefaultLogKeyRef = useRef("");
  useEffect(() => {
    const se = resolveSenderEmailForEmailFieldPlacement(creatorEmail, defaultSignerRef);
    const ce = (creatorEmail ?? "").trim();
    const refParsed = (firstPlausibleEmailInSignerRef(defaultSignerRef) ?? "").trim();
    const domainHint = (addr: string) => {
      const at = addr.indexOf("@");
      if (at < 1 || at >= addr.length - 1) return null;
      return addr.slice(at + 1).toLowerCase();
    };
    const resolvedSource =
      isPlausibleEmail(ce) && se === ce
        ? "creator_prop"
        : isPlausibleEmail(refParsed) && se === refParsed
          ? "signer_ref"
          : se
            ? "resolved_other"
            : "none";
    const key = `${ce}|${defaultSignerRef}|${resolvedSource}`;
    if (emailDefaultLogKeyRef.current === key) return;
    emailDefaultLogKeyRef.current = key;
    // eslint-disable-next-line no-console
    console.info("[vs01-email-default-source]", {
      hasCreatorEmail: isPlausibleEmail(ce),
      hasSignerRefEmail: isPlausibleEmail(refParsed),
      resolvedSource,
      creatorEmailDomain: domainHint(ce) ?? null,
      signerRefEmailDomain: domainHint(refParsed) ?? null,
      selectedType: armedToolForEmailLogRef.current ?? activeToolForEmailLogRef.current,
      resolvedHasValue: Boolean(se),
    });
  }, [creatorEmail, defaultSignerRef]);

  useEffect(() => {
    if (agreementBridgePlacementCopy) return;
    const se = resolveSenderEmailForEmailFieldPlacement(creatorEmail, defaultSignerRef);
    if (!isPlausibleEmail(se)) return;
    setFields((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (f.type !== "email") return f;
        if ((f.value ?? "").trim() !== "") return f;
        changed = true;
        return { ...f, value: se };
      });
      return changed ? next : prev;
    });
  }, [agreementBridgePlacementCopy, creatorEmail, defaultSignerRef]);

  useEffect(() => {
    const base = nameFromSignerRef(defaultSignerRef);
    setTypedName(base);
  }, [defaultSignerRef]);

  useEffect(() => {
    if (!initialsTouched) {
      setInitials(initialsFromName(typedName));
    }
  }, [typedName, initialsTouched]);

  useEffect(() => {
    setSelectedFieldId(null);
    setCurrentPage(1);
    setNumPages(0);
    setPdfDocReady(false);
    setPreviewError(null);
    setAutoInitialsEveryPage(false);
    setSkippedAutoPages(new Set());
    setArmedTool(null);
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
      if (w > 48) setPageRenderWidth(Math.max(160, w - 16));
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

  useEffect(() => {
    setSkippedAutoPages((prev) => {
      const next = new Set<number>();
      for (const p of prev) {
        if (p < numPages) next.add(p);
      }
      return next;
    });
  }, [numPages]);

  useEffect(() => {
    return () => {
      if (uploadRevokeRef.current) {
        URL.revokeObjectURL(uploadRevokeRef.current);
      }
    };
  }, []);

  const signReady =
    signatureMode === "type"
      ? typedName.trim().length > 0
      : signatureMode === "draw"
        ? hasDrawn
        : uploadPreviewUrl != null;

  const hasSignatureOnDoc = fields.some((f) => f.type === "signature");
  const flowStep3Ready = signReady && hasSignatureOnDoc;
  const flowStep3ReadyEffective = agreementBridgePlacementCopy ? hasSignatureOnDoc : flowStep3Ready;

  const ownerPadForFields = useMemo(
    () =>
      ownerPadFromPlacementContext({
        typedName: typedNameRef.current,
        initials: initialsRef.current,
        signerEmail: signerEmailForPlacement,
      }),
    [typedName, initials, signerEmailForPlacement],
  );

  const signerForApi = defaultSignerRef.trim() || "signer";

  const pageIndex0 = currentPage - 1;

  const selectedField = selectedFieldId ? fields.find((f) => f.id === selectedFieldId) : undefined;

  const updateField = useCallback(
    (id: string, patch: Partial<PlacedSigningField>) => {
      setFields((prev) => {
        const target = prev.find((f) => f.id === id);
        const syncAutoInitialsGeom =
          autoInitialsEveryPage &&
          target?.autoInitials === true &&
          target.type === "initials" &&
          (patch.x !== undefined ||
            patch.y !== undefined ||
            patch.width !== undefined ||
            patch.height !== undefined);

        if (syncAutoInitialsGeom && target) {
          const nx = parseFloat(roundNorm(patch.x !== undefined ? patch.x : target.x));
          const ny = parseFloat(roundNorm(patch.y !== undefined ? patch.y : target.y));
          const nw = parseFloat(roundNorm(patch.width !== undefined ? patch.width : target.width));
          const nh = parseFloat(roundNorm(patch.height !== undefined ? patch.height : target.height));
          return prev.map((f) =>
            f.autoInitials && f.type === "initials"
              ? { ...f, x: nx, y: ny, width: nw, height: nh }
              : f
          );
        }

        return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      });
    },
    [autoInitialsEveryPage]
  );

  const removeField = useCallback((id: string) => {
    const target = fieldsRef.current.find((f) => f.id === id);
    if (target?.autoInitials) {
      setSkippedAutoPages((s) => new Set(s).add(target.page));
    }
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldId((cur) => (cur === id ? null : cur));
  }, []);

  /** Add/remove auto-initials slots only when toggle, page count, or skipped pages change — not on every name keystroke. */
  useEffect(() => {
    if (!autoInitialsEveryPage) {
      if (fieldsRef.current.some((f) => f.autoInitials)) {
        setFields((prev) => prev.filter((f) => !f.autoInitials));
      }
      setSkippedAutoPages((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    if (numPages <= 0) return;

    const ownerValueCtx = {
      typedName: typedNameRef.current,
      initials: initialsRef.current,
      signerEmail: signerEmailForPlacement,
    };

    setFields((prev) => {
      const activeRoleId = displayRoleId;
      const manual = prev.filter(
        (f) =>
          !f.autoInitials ||
          (agreementBridgePlacementCopy &&
            activeRoleId &&
            (f.assignedSignerRoleId ?? "").trim() !== activeRoleId),
      );
      if (agreementBridgePlacementCopy) {
        const activeRole =
          prepareRoleCtx?.activeRole ?? findPrepareSigningRole(prepareSignerRoles, displayRoleId);
        if (activeRole) {
          const auto = buildPrepareAutoInitialsEveryPage({
            role: activeRole,
            pageCount: numPages,
            skippedPages: skippedAutoPages,
            existingFields: prev,
            valueCtx: ownerValueCtx,
          });
          return [...manual, ...auto];
        }
      }
      const auto = buildAutoInitialsFields(numPages, ownerValueCtx, skippedAutoPages, manual);
      return [...manual, ...auto];
    });
  }, [
    autoInitialsEveryPage,
    numPages,
    skippedAutoPages,
    agreementBridgePlacementCopy,
    displayRoleId,
    prepareRoleCtx,
    prepareSignerRoles,
    signerEmailForPlacement,
  ]);

  /** Keep auto-initials text in sync when the user edits initials/name, without rebuilding positions. */
  useEffect(() => {
    if (!autoInitialsEveryPage) return;
    setFields((prev) =>
      prev.map((f) => {
        if (!f.autoInitials || f.type !== "initials") return f;
        if (agreementBridgePlacementCopy) {
          const roleId = (f.assignedSignerRoleId ?? "").trim();
          const role = findPrepareSigningRole(prepareSignerRoles, roleId);
          if (!role || role.kind !== "owner") return f;
          const ctx = buildPrepareTemplateValueContext(role, {
            typedName,
            initials,
            signerEmail: signerEmailForPlacement,
          });
          return { ...f, value: defaultValueForType("initials", ctx) };
        }
        return {
          ...f,
          value: defaultValueForType("initials", {
            typedName,
            initials,
            signerEmail: signerEmailForPlacement,
          }),
        };
      }),
    );
  }, [
    autoInitialsEveryPage,
    typedName,
    initials,
    signerEmailForPlacement,
    agreementBridgePlacementCopy,
    prepareSignerRoles,
  ]);

  const onPagePlacementClick = useCallback(
    (pageIndex0: number, ev: React.MouseEvent<HTMLDivElement>) => {
      if (busy || armedTool == null) {
        // eslint-disable-next-line no-console
        console.info("[vs01-placement-page-click]", { tool: armedTool, page: pageIndex0, blockedReason: busy ? "busy" : "not_armed" });
        return;
      }
      const t = ev.target as HTMLElement;
      if (t.closest?.(".vs01-sign-placement-box")) {
        // eslint-disable-next-line no-console
        console.info("[vs01-placement-page-click]", { tool: armedTool, page: pageIndex0, blockedReason: "clicked_existing_field" });
        return;
      }
      const surface = ev.currentTarget.parentElement as HTMLElement | null;
      if (!surface) {
        // eslint-disable-next-line no-console
        console.info("[vs01-placement-page-click]", { tool: armedTool, page: pageIndex0, blockedReason: "no_surface" });
        return;
      }
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        // eslint-disable-next-line no-console
        console.info("[vs01-placement-page-click]", { tool: armedTool, page: pageIndex0, blockedReason: "zero_rect", w: rect.width, h: rect.height });
        return;
      }

      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      // eslint-disable-next-line no-console
      console.info("[vs01-placement-page-click]", { tool: armedTool, page: pageIndex0, x: px.toFixed(3), y: py.toFixed(3) });
      const valueCtx = {
        typedName: typedNameRef.current,
        initials: initialsRef.current,
        signerEmail: signerEmailForPlacement,
      };
      let nf: PlacedSigningField | null = null;
      if (agreementBridgePlacementCopy && prepareRoleCtx) {
        logVs01PlacementClickRole({
          tool: armedTool,
          page: pageIndex0,
          authorityRoleId: prepareRoleCtx.authority.getActiveRoleId(),
          displayRoleId,
        });
        const placed = createPrepareStampedSenderField({
          authority: prepareRoleCtx.authority,
          type: armedTool,
          page: pageIndex0,
          clickX: px,
          clickY: py,
          valueCtx,
          existingFields: fieldsRef.current,
          visualRoleId: prepareRoleCtx.authority.getActiveRoleId(),
        });
        if (!placed.ok) {
          logVs01PlacementFieldRejected({
            reason: placed.reason,
            tool: armedTool,
            page: pageIndex0,
          });
          return;
        }
        nf = placed.field;
      } else {
        nf = createPlacedFieldAtClick(armedTool, pageIndex0, px, py, valueCtx);
      }
      setFields((prev) => {
        const next = [...prev, nf!];
        if (prepareRoleCtx) {
          queueMicrotask(() =>
            prepareRoleCtx.afterPlacement(next, prepareRecipientPlacedFieldsRef.current),
          );
        }
        return next;
      });
      setSelectedFieldId(nf.id);
      setCurrentPage(pageIndex0 + 1);
      setArmedTool(null);
      setPlacementPopId(nf.id);
      window.setTimeout(() => setPlacementPopId(null), 380);
      if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
      setShowDragHint(true);
      dragHintTimerRef.current = setTimeout(() => {
        setShowDragHint(false);
        dragHintTimerRef.current = null;
      }, 2200);
    },
    [armedTool, busy, signerEmailForPlacement, agreementBridgePlacementCopy, prepareRoleCtx, displayRoleId]
  );

  useEffect(() => {
    return () => {
      if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
    };
  }, []);

  const onBoxPointerDown = useCallback(
    (ev: PointerEvent<HTMLDivElement>, field: PlacedSigningField) => {
      if (busy || resizing) return;
      if (agreementBridgePlacementCopy && !fieldMatchesActive(field)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if ((ev.target as HTMLElement).closest(".vs01-sign-placement-resize-handle")) return;
      if ((ev.target as HTMLElement).closest(".vs01-sign-field-inline-input")) return;
      if (
        (field.type === "text" ||
          field.type === "email" ||
          field.type === "printed_name" ||
          field.type === "date") &&
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
    [busy, resizing, selectedFieldId, agreementBridgePlacementCopy, fieldMatchesActive]
  );

  const onPlacementBoxClick = useCallback(
    (ev: MouseEvent<HTMLDivElement>, field: PlacedSigningField) => {
      if (agreementBridgePlacementCopy && !fieldMatchesActive(field)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      ev.stopPropagation();
      setSelectedFieldId(field.id);
    },
    [agreementBridgePlacementCopy, fieldMatchesActive],
  );

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
      updateField(field.id, { x: parseFloat(roundNorm(nx)), y: parseFloat(roundNorm(ny)) });
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
  }, [dragging, updateField]);

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
      updateField(field.id, {
        width: parseFloat(roundNorm(nw)),
        height: parseFloat(roundNorm(nh)),
      });
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
  }, [resizing, updateField]);

  const onResizeHandlePointerDown = useCallback(
    (ev: PointerEvent<HTMLButtonElement>, field: PlacedSigningField) => {
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

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#faf8f5";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    lastPtRef.current = null;
  }, []);

  useEffect(() => {
    if (signatureMode !== "draw") return;
    clearCanvas();
  }, [signatureMode, clearCanvas]);

  useLayoutEffect(() => {
    if (signatureMode !== "draw") return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#faf8f5";
    ctx.fillRect(0, 0, c.width, c.height);
  }, [signatureMode]);

  const canvasDraw = useCallback(
    (ev: React.MouseEvent<HTMLCanvasElement>, end: boolean) => {
      const c = canvasRef.current;
      if (!c || busy) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const r = c.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * c.width;
      const py = ((ev.clientY - r.top) / r.height) * c.height;

      if (ev.type === "mousedown") {
        drawingRef.current = true;
        lastPtRef.current = { x: px, y: py };
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2.25;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(px, py);
        setHasDrawn(true);
        return;
      }
      if (end) {
        drawingRef.current = false;
        lastPtRef.current = null;
        return;
      }
      if (ev.type === "mousemove" && (!drawingRef.current || ev.buttons !== 1)) return;
      if (!drawingRef.current || !lastPtRef.current) return;
      ctx.beginPath();
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
      ctx.lineTo(px, py);
      ctx.stroke();
      lastPtRef.current = { x: px, y: py };
    },
    [busy]
  );

  const onUploadPick = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (uploadRevokeRef.current) {
      URL.revokeObjectURL(uploadRevokeRef.current);
      uploadRevokeRef.current = null;
    }
    setUploadPreviewUrl(null);
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    uploadRevokeRef.current = url;
    setUploadPreviewUrl(url);
  }, []);

  const handleSign = useCallback(async () => {
    if (agreementBridgePlacementCopy) {
      onError(null);
      onContinue?.();
      return;
    }
    if (!documentId?.trim() || !contentSha256?.trim()) {
      onError("Finalize a document first (missing document id or content hash).");
      return;
    }
    if (!flowStep3ReadyEffective || fields.length === 0) {
      onError(
        agreementBridgePlacementCopy
          ? "Place at least one signature field on the document before continuing."
          : "Create your signature and place a signature field on the document first.",
      );
      return;
    }
    onError(null);

    let drawOrUploadDataUrl: string | null = null;
    if (signatureMode === "upload" && uploadPreviewUrl) {
      try {
        const res = await fetch(uploadPreviewUrl);
        const blob = await res.blob();
        drawOrUploadDataUrl = await new Promise<string | null>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
      } catch {
        drawOrUploadDataUrl = null;
      }
    } else if (signatureMode === "draw" && canvasRef.current && hasDrawn) {
      try {
        drawOrUploadDataUrl = canvasRef.current.toDataURL("image/png");
      } catch {
        drawOrUploadDataUrl = null;
      }
    }

    const hasSigField = fields.some((f) => f.type === "signature");
    const senderSignatureRef: Vs01SenderSignatureRef | null = hasSigField
      ? {
          mode: signatureMode,
          typedName: typedName.trim(),
          imageDataUrl:
            signatureMode === "upload" || signatureMode === "draw" ? drawOrUploadDataUrl : undefined,
        }
      : null;

    setLoading("session");
    try {
      const sessionRes = await createSignSession(documentId.trim(), contentSha256.trim());
      const sid =
        (typeof sessionRes.session === "object" &&
          sessionRes.session !== null &&
          "session_id" in sessionRes.session &&
          typeof (sessionRes.session as { session_id: unknown }).session_id === "string" &&
          (sessionRes.session as { session_id: string }).session_id.trim()) ||
        (typeof sessionRes.session_id === "string" ? sessionRes.session_id.trim() : "");
      if (!sid) {
        throw new Error("Response missing session_id");
      }

      setLoading("complete");
      const field_manifest = fieldsToManifest(fields);
      const completeRes = await completeSignSession(sid, {
        signer_ref: signerForApi,
        intent: intent || "agree_and_sign",
        field_manifest,
      });

      const rid =
        typeof completeRes.receipt_id === "string" ? completeRes.receipt_id.trim() : "";
      const rhash =
        typeof completeRes.receipt_hash_sha256 === "string"
          ? completeRes.receipt_hash_sha256.trim()
          : "";
      if (!rid || !rhash) {
        throw new Error("Response missing receipt_id or receipt_hash_sha256");
      }
      onSigned({
        receiptId: rid,
        receiptHashSha256: rhash,
        receipt: completeRes.receipt ?? null,
        senderPlacedFields: fields.map((f) => ({ ...f })),
        senderSignatureRef,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }, [
    agreementBridgePlacementCopy,
    contentSha256,
    documentId,
    fields,
    flowStep3ReadyEffective,
    hasDrawn,
    intent,
    onContinue,
    onError,
    onSigned,
    setLoading,
    signatureMode,
    signerForApi,
    typedName,
    uploadPreviewUrl,
  ]);

  const canContinueToHandoff = Boolean(receiptId);
  const named = counterparties.filter((c) => c.name.trim());

  const placementSurface = Boolean(pdfUrl) || Boolean(documentId?.trim() && previewError);

  const primaryDisabled = busy || Boolean(receiptId) || !flowStep3ReadyEffective;

  const placementArmed = armedTool != null;

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

  const onAutoInitialsToggle = useCallback((checked: boolean) => {
    setAutoInitialsEveryPage(checked);
    if (checked) {
      setSkippedAutoPages(new Set());
    }
  }, []);

  if (typeof window !== "undefined" && window.localStorage?.getItem("lawdogVs01FieldDiag") === "1") {
    // eslint-disable-next-line no-console
    console.info("[vs01-step-prepare-fields-render]", { renderedFieldCount: fields.length });
  }

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-prepare-title" className="vs01-sign-step">
      <header className="vs01-sign-step-header">
        <h2 id="vs01-step-prepare-title" className="vs01-card-title">
          {agreementBridgePlacementCopy ? "Prepare for e-signing" : "Sign your document"}
        </h2>
        <p className="vs01-card-help vs01-sign-step-lead">
          {agreementBridgePlacementCopy
            ? "Place required signature fields for each party. Reviewers already approved this draft — you are preparing the signing packet, not signing yet."
            : "Choose a field type, use Place on document, then click once where it should go."}
        </p>
      </header>

      <div className="vs01-sign-workspace">
        <div className="vs01-sign-doc-col">
          {placementArmed && placementSurface && !previewLoading ? (
            <div className="vs01-sign-armed-banner" role="status">
              Click once on the document to place your {labelForFieldType(armedTool)}.
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
              <button
                type="button"
                className="vs01-sign-page-btn"
                disabled={busy || currentPage <= 1}
                onClick={goPrev}
              >
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
                            const fieldsHere = fields
                              .filter((f) => f.page === p)
                              .slice()
                              .sort((a, b) => {
                                if (a.id === selectedFieldId) return 1;
                                if (b.id === selectedFieldId) return -1;
                                return 0;
                              });
                            return (
                              <div
                                key={p}
                                ref={(el) => registerPageStack(p, el)}
                                className="vs01-sign-page-stack"
                                data-vs01-sign-page={p}
                              >
                                <div
                                  ref={(el) => registerPageSurface(p, el)}
                                  className="vs01-sign-page-surface vs01-sign-page-surface--footer-safe"
                                >
                                  <Page
                                    pageNumber={p + 1}
                                    width={pageRenderWidth}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                  />
                                  <div className="vs01-pdf-footer-watermark-shim" aria-hidden />
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
                                    className={`vs01-sign-overlay${fieldsHere.length > 0 ? " vs01-sign-overlay--placed" : ""}`}
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
                                      const isActiveRoleField =
                                        !agreementBridgePlacementCopy || fieldMatchesActive(field);
                                      return (
                                        <div
                                          key={field.id}
                                          data-field-id={field.id}
                                          className={`vs01-sign-placement-box vs01-sign-placement-box--${field.type}${
                                            field.autoInitials ? " vs01-sign-placement-box--auto-initials" : ""
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
                                          <span className="vs01-sign-placement-label">
                                            {agreementBridgePlacementCopy
                                              ? prepareTemplateCornerLabel(
                                                  field.type,
                                                  findPrepareSigningRole(
                                                    prepareSignerRoles,
                                                    field.assignedSignerRoleId,
                                                  ),
                                                )
                                              : signingPlacementCornerLabel(field.type, field)}
                                          </span>
                                          {agreementBridgePlacementCopy ? (
                                            <PrepareSigningFieldBody
                                              field={field}
                                              role={findPrepareSigningRole(
                                                prepareSignerRoles,
                                                field.assignedSignerRoleId,
                                              )}
                                              ownerPreview={{
                                                signatureMode,
                                                typedName,
                                                hasDrawn,
                                                uploadPreviewUrl,
                                              }}
                                              ownerPad={ownerPadForFields}
                                              isSelected={isSel}
                                              busy={busy}
                                              onValueChange={(value) => updateField(field.id, { value })}
                                              onInputFocus={() =>
                                                logVs01FieldInputFocus({
                                                  fieldId: field.id.slice(0, 12),
                                                  fieldType: field.type,
                                                })
                                              }
                                            />
                                          ) : (
                                            <>
                                          {field.type === "signature" ? (
                                            <div className="vs01-sign-placement-signature-body">
                                              {signatureMode === "type" && typedName.trim() ? (
                                                <span className="vs01-sign-placement-script">{typedName.trim()}</span>
                                              ) : null}
                                              {signatureMode === "type" && !typedName.trim() ? (
                                                <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
                                              ) : null}
                                              {signatureMode === "draw" ? (
                                                hasDrawn ? (
                                                  <span className="vs01-sign-placement-meta">Drawn signature</span>
                                                ) : (
                                                  <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
                                                )
                                              ) : null}
                                              {signatureMode === "upload" && uploadPreviewUrl ? (
                                                <img
                                                  className="vs01-sign-placement-img"
                                                  src={uploadPreviewUrl}
                                                  alt=""
                                                />
                                              ) : null}
                                              {signatureMode === "upload" && !uploadPreviewUrl ? (
                                                <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
                                              ) : null}
                                            </div>
                                          ) : null}
                                          {field.type === "initials" ? (
                                            <span className="vs01-sign-placement-initials">
                                              {textVal.trim().slice(0, 8) || "Your initials"}
                                            </span>
                                          ) : null}
                                          {field.type === "printed_name" ? (
                                            isSel && !busy ? (
                                              <input
                                                type="text"
                                                className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                value={textVal}
                                                placeholder="Printed name"
                                                autoComplete="name"
                                                aria-label="Printed name on document"
                                                onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                onPointerDown={(ev) => ev.stopPropagation()}
                                                onClick={(ev) => ev.stopPropagation()}
                                              />
                                            ) : (
                                              <span className="vs01-sign-placement-text">
                                                {textVal.trim() ? textVal : "Printed name"}
                                              </span>
                                            )
                                          ) : null}
                                          {field.type === "text" ? (
                                            isSel && !busy ? (
                                              <input
                                                type="text"
                                                className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                value={textVal}
                                                placeholder="Title, email, custom blank…"
                                                autoComplete="off"
                                                aria-label="Text on document"
                                                onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                onPointerDown={(ev) => ev.stopPropagation()}
                                                onClick={(ev) => ev.stopPropagation()}
                                              />
                                            ) : (
                                              <span className="vs01-sign-placement-text">
                                                {textVal.trim() ? textVal : "Add text"}
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
                                                aria-label="Email on document"
                                                onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                onPointerDown={(ev) => ev.stopPropagation()}
                                                onClick={(ev) => ev.stopPropagation()}
                                              />
                                            ) : (
                                              <span className="vs01-sign-placement-text">
                                                {textVal.trim() ? textVal : "Email"}
                                              </span>
                                            )
                                          ) : null}
                                          {field.type === "date" ? (
                                            isSel && !busy ? (
                                              <input
                                                type="date"
                                                className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                value={textVal}
                                                aria-label="Date on document"
                                                onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                onPointerDown={(ev) => ev.stopPropagation()}
                                                onClick={(ev) => ev.stopPropagation()}
                                              />
                                            ) : (
                                              <span className="vs01-sign-placement-text">
                                                {textVal.trim() ? formatIsoDateDisplay(textVal) : "Date"}
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
                ? "Scroll the document area (mouse wheel, trackpad, or scrollbar) if a page is off-screen. Drag the field to move it; use the corner handle to resize."
                : placementArmed
                  ? "Scroll the document area (mouse wheel, trackpad, or scrollbar) to reach every page, then click once where the field should go."
                  : "Scroll the document area (mouse wheel, trackpad, or scrollbar) to review every page. Use Place on document in the toolbar, then click once on the page to add a field."
              : null}
          </p>
        </div>

        <aside className="vs01-sign-rail" aria-label="Signing controls">
          {agreementBridgePlacementCopy && prepareSignerRoles && prepareSignerRoles.length > 0 ? (
            <div className="vs01-prepare-role-picker mb-3" role="group" aria-label="Signer role for field placement">
              <p className="vs01-sign-rail-line text-xs font-medium text-slate-500 dark:text-slate-400">
                Placing fields for
              </p>
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
                      onClick={() => {
                        prepareRoleCtx?.setActiveRole(r.roleId, "user_select");
                        setSelectedFieldId(null);
                        setArmedTool(null);
                      }}
                    >
                      {r.entityName?.trim() || (r.kind === "owner" ? "Owner" : "Signer")}
                    </button>
                  );
                })}
              </div>
              {preparePacketGate ? (
                <ul className="vs01-prepare-role-progress mt-2 text-xs" aria-label="Required fields per signer">
                  {prepareSignerRoles.map((r) => {
                    const miss = preparePacketGate.missingByParty[r.roleId] ?? [];
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
                        {done ? " — complete" : ` — needs: ${miss.join(", ")}`}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {preparePacketGate && !preparePacketGate.canFinish ? (
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
          ) : null}
          <div className="vs01-sign-rail-brief vs01-sign-rail-brief--compact">
            <p className="vs01-sign-rail-line">
              <span className="vs01-sign-rail-k">You</span>
              <span className="vs01-sign-rail-v">{signerForApi}</span>
            </p>
            {named.length > 0 ? (
              <div className="vs01-sign-rail-recipients">
                <span className="vs01-sign-rail-k" id="vs01-sign-rail-recipients-label">
                  Recipients ({named.length})
                </span>
                <ul className="vs01-sign-rail-recipient-list" aria-labelledby="vs01-sign-rail-recipients-label">
                  {named.map((c) => (
                    <li key={c.id} className="vs01-sign-rail-recipient-item">
                      <span className="vs01-sign-rail-recipient-name">{c.name.trim()}</span>
                      {agreementBridgePlacementCopy ? (
                        <span className="vs01-sign-rail-recipient-email">
                          Signer: {c.signerName?.trim() || "Signer name needed"}
                          {c.signerTitle?.trim() ? ` · ${c.signerTitle.trim()}` : ""}
                        </span>
                      ) : null}
                      {c.email.trim() ? (
                        <span className="vs01-sign-rail-recipient-email">{c.email.trim()}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {senderMessage.trim() ? (
              <p className="vs01-sign-rail-note">{senderMessage.trim()}</p>
            ) : null}
          </div>

          <div className="vs01-sign-toolbar" role="toolbar" aria-label="Choose what to place">
            {agreementBridgePlacementCopy && activePrepareRole ? (
              <p className="vs01-sign-placing-for-role" role="status">
                Placing fields for: <strong>{activePrepareRole.entityName}</strong>
                {activePrepareRole.kind === "owner" ? (
                  <span className="vs01-sign-placing-for-role-tag"> (you / sender)</span>
                ) : (
                  <span className="vs01-sign-placing-for-role-tag"> (counterparty)</span>
                )}
              </p>
            ) : null}
            <p className="vs01-sign-toolbar-hint">Choose what to place</p>
            <div className="vs01-sign-toolbar-btns">
              {SIGNING_FIELD_TOOLS.map(({ type }) => (
                <button
                  key={type}
                  type="button"
                  className={`vs01-sign-tool-btn${activeTool === type ? " vs01-sign-tool-btn--active" : ""}`}
                  disabled={busy}
                  onClick={() => {
                    setActiveTool(type);
                    setArmedTool(null);
                    // eslint-disable-next-line no-console
                    console.info("[vs01-placement-tool-selected]", { tool: type, placementMode: "off" });
                  }}
                >
                  {labelForFieldType(type)}
                </button>
              ))}
            </div>
            <div className="vs01-sign-placement-mode">
              <p className="vs01-sign-placement-mode-status">
                Placement mode: <strong>{placementArmed ? "On" : "Off"}</strong>
              </p>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto vs01-sign-place-cta"
                disabled={busy || !placementSurface || previewLoading}
                onClick={() => {
                  setArmedTool(activeTool);
                  // eslint-disable-next-line no-console
                  console.info("[vs01-placement-tool-selected]", { tool: activeTool, placementMode: "on" });
                }}
              >
                Place {labelForFieldType(activeTool)} on document
              </button>
              {placementArmed ? (
                <p className="vs01-sign-placement-mode-hint">
                  Click once on the document to place your {labelForFieldType(armedTool)}.
                </p>
              ) : (
                <p className="vs01-sign-placement-mode-hint vs01-sign-placement-mode-hint--muted">
                  Not armed — clicks on the document will not add a field.
                </p>
              )}
            </div>
          </div>

          {selectedField ? (
            <div className="vs01-sign-selected-panel">
              <div className="vs01-sign-selected-head">
                <span className="vs01-sign-selected-title">{signingPlacementCornerLabel(selectedField.type)}</span>
                <button
                  type="button"
                  className="vs01-sign-remove-field"
                  disabled={busy}
                  onClick={() => removeField(selectedField.id)}
                >
                  Remove selected field
                </button>
              </div>
              <p className="vs01-sign-selected-note">
                Drag to move; drag the bottom-right corner to resize.
              </p>
            </div>
          ) : null}

          {!selectedField ? (
            <p className="vs01-sign-rail-helper">
              Pick a field type, tap Place on document, then click the preview once.
            </p>
          ) : null}

          <label className="vs01-sign-auto-initials">
            <input
              type="checkbox"
              checked={autoInitialsEveryPage}
              disabled={busy || numPages <= 0}
              onChange={(e) => onAutoInitialsToggle(e.target.checked)}
            />
            <span>Add my initials box to every page</span>
          </label>

          {!agreementBridgePlacementCopy ? (
          <div className="vs01-sign-signature-panel">
            <div className="vs01-sign-signature-panel-title">Your signature</div>
            <div className="vs01-sign-style-tabs" role="tablist" aria-label="Signature style">
              {(["type", "draw", "upload"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={signatureMode === m}
                  className={`vs01-sign-style-tab${signatureMode === m ? " vs01-sign-style-tab--active" : ""}`}
                  disabled={busy}
                  onClick={() => setSignatureMode(m)}
                >
                  {m === "type" ? "Type" : m === "draw" ? "Draw" : "Upload"}
                </button>
              ))}
            </div>

            {signatureMode === "type" ? (
              <div className="vs01-sign-type-block">
                <label className="vs01-field-label" htmlFor="vs01-sig-typed-name">
                  Full name
                </label>
                <input
                  id="vs01-sig-typed-name"
                  className="vs01-input"
                  value={typedName}
                  disabled={busy}
                  onChange={(ev) => setTypedName(ev.target.value)}
                  autoComplete="name"
                />
                <div className="vs01-sign-preview-row">
                  <span className="vs01-sign-preview-k">Signature</span>
                  <div className="vs01-sign-preview-script" aria-hidden>
                    {typedName.trim() || "Your name"}
                  </div>
                </div>
                <label className="vs01-field-label" htmlFor="vs01-sig-initials">
                  Initials
                </label>
                <input
                  id="vs01-sig-initials"
                  className="vs01-input"
                  value={initials}
                  disabled={busy}
                  onChange={(ev) => {
                    setInitialsTouched(true);
                    setInitials(ev.target.value);
                  }}
                  maxLength={8}
                />
                <div className="vs01-sign-preview-row">
                  <span className="vs01-sign-preview-k">Initials</span>
                  <div className="vs01-sign-preview-initials" aria-hidden>
                    {initials.trim() || "—"}
                  </div>
                </div>
              </div>
            ) : null}

            {signatureMode === "draw" ? (
              <div className="vs01-sign-draw-block">
                <p className="vs01-sign-draw-hint">Draw in the box with your mouse or finger.</p>
                <canvas
                  ref={canvasRef}
                  className="vs01-sign-draw-canvas"
                  width={280}
                  height={120}
                  onMouseDown={(e) => canvasDraw(e, false)}
                  onMouseMove={(e) => canvasDraw(e, false)}
                  onMouseUp={(e) => canvasDraw(e, true)}
                  onMouseLeave={(e) => canvasDraw(e, true)}
                />
                <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" disabled={busy} onClick={clearCanvas}>
                  Clear
                </button>
              </div>
            ) : null}

            {signatureMode === "upload" ? (
              <div className="vs01-sign-upload-block">
                <label className="vs01-sign-upload-label">
                  <input type="file" accept="image/*" className="vs01-sr-only" disabled={busy} onChange={onUploadPick} />
                  <span className="vs01-btn vs01-btn--secondary">Choose image</span>
                </label>
                {uploadPreviewUrl ? (
                  <img className="vs01-sign-upload-preview" src={uploadPreviewUrl} alt="Signature preview" />
                ) : (
                  <p className="vs01-sign-upload-hint">PNG or JPG works best.</p>
                )}
              </div>
            ) : null}
          </div>
          ) : null}

          {flowStep3ReadyEffective && !receiptId ? (
            <p className="vs01-sign-status-ready" role="status">
              {agreementBridgePlacementCopy ? "Ready to continue" : "Ready to sign"}
            </p>
          ) : null}

          {!receiptId && !agreementBridgePlacementCopy ? (
            <div className="vs01-sign-intent-hint" role="note">
              <p className="vs01-sign-intent-hint__primary">{ESIGN_INTENT_SIGN_DOCUMENT_ACTION}</p>
              <p className="vs01-sign-intent-hint__secondary">{RECORDS_DOWNLOAD_KEEP_COPY_SHORT}</p>
              <p className="vs01-sign-intent-hint__product">
                {PRODUCT_NOT_LAW_FIRM} {NOT_LEGAL_ADVICE}
              </p>
            </div>
          ) : null}

          {!receiptId && agreementBridgePlacementCopy ? (
            <p className="vs01-sign-rail-helper" role="note">
              You are placing template fields only. The sender does not sign here — each signer completes their own
              signing session from their link.
            </p>
          ) : null}

          <div className="vs01-sign-actions">
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" disabled={busy} onClick={() => onBack?.()}>
              Back
            </button>
            <button
              type="button"
              className={`vs01-btn vs01-btn--primary${receiptId ? " vs01-btn--signed-done" : ""}`}
              disabled={primaryDisabled}
              onClick={() => {
                if (agreementBridgePlacementCopy) {
                  onError(null);
                  onContinue?.();
                  return;
                }
                void handleSign();
              }}
            >
              {receiptId
                ? "Signature added ✓"
                : agreementBridgePlacementCopy
                  ? "Continue to recipient fields"
                  : busySession
                    ? "Working…"
                    : busyComplete
                      ? "Signing…"
                      : "Sign document"}
            </button>
            {canContinueToHandoff ? (
              <button type="button" className="vs01-btn vs01-btn--next-step" disabled={busy} onClick={() => onContinue?.()}>
                Continue to handoff →
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
