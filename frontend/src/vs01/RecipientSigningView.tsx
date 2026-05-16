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
import { labelForFieldType, labelForRecipientFieldType, type PlacedSigningField } from "./signingFields";
import { RecipientPrintedNameFieldBody, RecipientSignatureFieldBody } from "./StepRecipientFields";
import {
  hideSenderTemplateFieldForRecipientSigner,
  recipientFieldBelongsToLockedSigner,
} from "./vs01SignerFieldAssignment";

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
};

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function fieldIsComplete(f: Vs01RecipientPlacedField): boolean {
  const v = typeof f.value === "string" ? f.value.trim() : "";
  switch (f.type) {
    case "signature":
    case "initials":
      return v.length > 0;
    case "printed_name":
      return v.length > 0;
    case "text":
      return v.length > 0;
    case "email":
      return v.length > 0;
    case "date":
      return v.length > 0;
    default:
      return false;
  }
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
}: RecipientSigningViewProps) {
  const cpById = useMemo(() => {
    const m = new Map<string, Vs01Counterparty>();
    for (const c of counterparties) m.set(c.id, c);
    return m;
  }, [counterparties]);

  const lockedCp = lockedCounterpartyId.trim();
  const signer = cpById.get(lockedCp);
  const signerName = signer?.name.trim() || "Signer";
  const signerEmail = signer?.email.trim() || "";
  const explicitSignerName = (signer?.signerName ?? "").trim();
  const myFields = useMemo(
    () =>
      recipientFields.filter((f) =>
        recipientFieldBelongsToLockedSigner(f, lockedCp, lockedSignerRoleId ?? null),
      ),
    [recipientFields, lockedCp, lockedSignerRoleId],
  );

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
        if (!target || !recipientFieldBelongsToLockedSigner(target, lockedCp, lockedSignerRoleId ?? null)) {
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

  const allComplete =
    !manifestDecodeError && myFields.length > 0 && myFields.every(fieldIsComplete);
  const placementSurface = Boolean(pdfUrl) || Boolean(documentId?.trim() && previewError);

  const genuinelyNoFields = !manifestDecodeError && myFields.length === 0 && !manifestParamPresent;
  const hydrationMiss = !manifestDecodeError && myFields.length === 0 && manifestParamPresent;
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
      const remaining = myFields.filter((f) => !fieldIsComplete(f)).length;
      onError(`Complete ${remaining === 1 ? "the remaining field" : `all ${remaining} remaining fields`} before finishing.`);
      return;
    }
    onError(null);
    onFinishSigning();
  }, [allComplete, hydrationMiss, manifestDecodeError, myFields, onError, onFinishSigning]);

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
          Complete your assigned fields below, then choose Finish signing.
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
          {myFields.length > 0 ? (
            <span className="vs01-recipient-signing-field-count">
              {" · "}{myFields.length} field{myFields.length === 1 ? "" : "s"} assigned
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
        {placementSurface && !previewLoading ? (
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
          {previewLoading ? (
            <div className="vs01-sign-preview-fallback" role="status">
              Loading document…
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
                            const fieldsHere = myFields.filter((f) => f.page === p);
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
                                        className="vs01-sign-placement-click-layer vs01-sign-placement-click-layer--idle vs01-sign-placement-click-layer--inert"
                                        aria-hidden
                                      />
                                      <div
                                        className={`vs01-sign-overlay${
                                          hasRecipientOnPage || hasSenderOnPage ? " vs01-sign-overlay--placed" : ""
                                        }`}
                                        role="presentation"
                                      >
                                        {fieldsHere.map((field) => {
                                          const xFit = Math.min(field.x, 1 - field.width);
                                          const yFit = Math.min(field.y, 1 - field.height);
                                          const textVal = typeof field.value === "string" ? field.value : "";
                                          const forName = counterpartyName(cpById, field.counterpartyId);
                                          return (
                                            <div
                                              key={field.id}
                                              data-field-id={field.id}
                                              className={`vs01-sign-placement-box vs01-sign-placement-box--${field.type} vs01-recipient-signing-field${
                                                field.type === "signature" || field.type === "initials"
                                                  ? " vs01-recipient-pending-slot"
                                                  : ""
                                              }`}
                                              style={{
                                                left: `${xFit * 100}%`,
                                                top: `${yFit * 100}%`,
                                                width: `${field.width * 100}%`,
                                                height: `${field.height * 100}%`,
                                                zIndex: 3,
                                                cursor: "default",
                                              }}
                                            >
                                              <span className="vs01-sign-placement-label">
                                                {labelForRecipientFieldType(field.type)}
                                              </span>
                                              {field.type === "signature" || field.type === "printed_name" ? null : (
                                                <span className="vs01-recipient-assign-for">{forName}</span>
                                              )}
                                              {field.type === "signature" ? (
                                                <div className="vs01-recipient-signing-signature-stack">
                                                  <RecipientSignatureFieldBody textVal={textVal} assigneeLabel={forName} />
                                                  <input
                                                    type="text"
                                                    className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline vs01-recipient-signing-signature-input"
                                                    value={textVal}
                                                    placeholder="Type your name or signature"
                                                    autoComplete="off"
                                                    aria-label="Signature"
                                                    onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                    onPointerDown={(ev) => ev.stopPropagation()}
                                                  />
                                                </div>
                                              ) : null}
                                              {field.type === "initials" ? (
                                                <input
                                                  type="text"
                                                  className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                  value={textVal}
                                                  placeholder="Your initials"
                                                  maxLength={8}
                                                  autoComplete="off"
                                                  aria-label="Initials"
                                                  onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                  onPointerDown={(ev) => ev.stopPropagation()}
                                                />
                                              ) : null}
                                              {field.type === "printed_name" ? (
                                                explicitSignerName ? (
                                                  <RecipientPrintedNameFieldBody displayName={explicitSignerName} />
                                                ) : (
                                                  <input
                                                    type="text"
                                                    className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                    value={textVal}
                                                    placeholder="Authorized Signer Name"
                                                    autoComplete="name"
                                                    aria-label="Authorized signer printed name"
                                                    onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                    onPointerDown={(ev) => ev.stopPropagation()}
                                                  />
                                                )
                                              ) : null}
                                              {field.type === "text" ? (
                                                  <input
                                                    type="text"
                                                    className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                    value={textVal}
                                                    placeholder="Title"
                                                    autoComplete="organization-title"
                                                    aria-label="Title"
                                                    onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                    onPointerDown={(ev) => ev.stopPropagation()}
                                                  />
                                              ) : null}
                                              {field.type === "email" ? (
                                                <input
                                                  type="email"
                                                  className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                  value={textVal}
                                                  placeholder="Email"
                                                  autoComplete="email"
                                                  aria-label="Email field"
                                                  onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                  onPointerDown={(ev) => ev.stopPropagation()}
                                                />
                                              ) : null}
                                              {field.type === "date" ? (
                                                <input
                                                  type="date"
                                                  className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
                                                  value={textVal}
                                                  aria-label="Date"
                                                  onChange={(ev) => updateField(field.id, { value: ev.target.value })}
                                                  onPointerDown={(ev) => ev.stopPropagation()}
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
                <>No document is available for this link.</>
              )}
            </div>
          )}
        </div>

        {showEmptyFieldsHint && placementSurface && !previewLoading ? (
          <p className="vs01-recipient-signing-empty" role="status">
            {emptyFieldsMessage}
          </p>
        ) : null}

        <p className="vs01-sign-doc-foot-hint vs01-recipient-signing-foot">
          {placementSurface && !previewLoading && !manifestDecodeError
            ? "Scroll through the document to find every assigned field, then choose Finish signing."
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
        {myFields.length > 0 && !allComplete ? (
          <p className="vs01-recipient-signing-progress">
            {myFields.filter(fieldIsComplete).length} of {myFields.length} fields complete
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
