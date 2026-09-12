import { useEffect, useState, type MouseEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchDocumentContent } from "../../vs01/vs01Api";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID, type QuickPdfField } from "./quickPdfEnvelope";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const FIELD_W = 0.32;
const FIELD_H = 0.1;

type Props = {
  documentId: string;
  pageCount: number;
  fields: QuickPdfField[];
  ownerName: string;
  recipientName: string;
  busy: boolean;
  onChange: (fields: QuickPdfField[]) => void;
};

export function QuickPdfPlacement(props: Props) {
  const { documentId, pageCount, fields, ownerName, recipientName, busy, onChange } = props;
  const [role, setRole] = useState(OWNER_ROLE_ID);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState(pageCount);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancel = false;
    void fetchDocumentContent(documentId)
      .then((blob) => {
        if (cancel) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (!cancel) setPreviewError(err instanceof Error ? err.message : "PDF preview unavailable.");
      });
    return () => {
      cancel = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  const pages = Math.max(pageCount, pdfPages, 1);

  const placeOnPage = (pageIndex: number, ev: MouseEvent<HTMLButtonElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.min(1 - FIELD_W, Math.max(0, (ev.clientX - rect.left) / rect.width - FIELD_W / 2));
    const y = Math.min(1 - FIELD_H, Math.max(0, (ev.clientY - rect.top) / rect.height - FIELD_H / 2));
    const next = fields.filter((field) => field.signer_role_id !== role);
    next.push({
      field_id: role === OWNER_ROLE_ID ? "fld_owner_sig" : "fld_recipient_sig",
      signer_role_id: role,
      field_type: "signature",
      page_index: pageIndex,
      x,
      y,
      w: FIELD_W,
      h: FIELD_H,
      required: true,
    });
    onChange(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="quick-pdf-place">
      <p className="text-sm text-slate-300">
        This workflow supports one recipient. Choose the signer, open the real PDF page, and place their signature.
        Default page-1 boxes are not used.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Signer for field placement">
        <button
          type="button"
          className={`vs01-btn min-h-11 ${role === OWNER_ROLE_ID ? "vs01-btn--primary" : "vs01-btn--secondary"}`}
          data-testid="quick-pdf-place-role-owner"
          disabled={busy}
          onClick={() => setRole(OWNER_ROLE_ID)}
        >
          Place for you ({ownerName || "owner"})
        </button>
        <button
          type="button"
          className={`vs01-btn min-h-11 ${role === RECIPIENT_ROLE_ID ? "vs01-btn--primary" : "vs01-btn--secondary"}`}
          data-testid="quick-pdf-place-role-recipient"
          disabled={busy}
          onClick={() => setRole(RECIPIENT_ROLE_ID)}
        >
          Place for recipient ({recipientName || "recipient"})
        </button>
      </div>
      {previewError ? <p className="text-xs text-slate-500">{previewError}</p> : null}
      <div className="flex min-w-0 flex-col gap-4">
        {pdfUrl ? (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages }) => setPdfPages(numPages)}
            loading={<p className="text-sm text-slate-400">Loading PDF…</p>}
          >
            {Array.from({ length: pages }, (_, pageIndex) => (
              <PlacementPage
                key={`pdf-${pageIndex}`}
                pageIndex={pageIndex}
                fields={fields}
                role={role}
                pdfUrl={pdfUrl}
                onPlace={placeOnPage}
              />
            ))}
          </Document>
        ) : (
          Array.from({ length: pages }, (_, pageIndex) => (
            <PlacementPage
              key={`slot-${pageIndex}`}
              pageIndex={pageIndex}
              fields={fields}
              role={role}
              onPlace={placeOnPage}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PlacementPage(props: {
  pageIndex: number;
  fields: QuickPdfField[];
  role: string;
  pdfUrl?: string | null;
  onPlace: (pageIndex: number, ev: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { pageIndex, fields, onPlace, pdfUrl } = props;
  return (
    <div className="min-w-0" data-testid={`quick-pdf-page-${pageIndex}`}>
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Page {pageIndex + 1}</p>
      <div className="relative min-h-56 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
        {pdfUrl ? (
          <Page pageNumber={pageIndex + 1} width={480} renderAnnotationLayer={false} renderTextLayer={false} />
        ) : (
          <div className="flex h-56 items-center justify-center text-xs text-slate-500">PDF page {pageIndex + 1}</div>
        )}
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-crosshair bg-transparent"
          data-testid={`quick-pdf-page-surface-${pageIndex}`}
          aria-label={`Place signature on page ${pageIndex + 1}`}
          onClick={(ev) => onPlace(pageIndex, ev)}
        />
        {fields
          .filter((field) => field.page_index === pageIndex)
          .map((field) => (
            <div
              key={field.field_id}
              data-testid={`quick-pdf-placed-${field.signer_role_id}`}
              className="pointer-events-none absolute z-20 rounded border text-center text-[10px] text-white"
              style={{
                left: `${field.x * 100}%`,
                top: `${field.y * 100}%`,
                width: `${field.w * 100}%`,
                height: `${field.h * 100}%`,
                borderColor: field.signer_role_id === OWNER_ROLE_ID ? "#34d399" : "#38bdf8",
                background: field.signer_role_id === OWNER_ROLE_ID ? "rgba(16,185,129,0.25)" : "rgba(14,165,233,0.25)",
              }}
            >
              {field.signer_role_id === OWNER_ROLE_ID ? "Your signature" : "Recipient signature"}
            </div>
          ))}
      </div>
    </div>
  );
}
