import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  STARTER_DOCUMENT_DONE_EDITING_LABEL,
  STARTER_DOCUMENT_EDIT_WORDING_LABEL,
  logStarterReviewDocumentRendered,
} from "../../launch/simpleProduct/guidedWorkflowCopy";

function splitAgreementDisplay(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty < 0) return { title: "Agreement", body: "" };
  const title = lines[firstNonEmpty].trim();
  const body = lines
    .slice(firstNonEmpty + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return { title, body };
}

export function StarterDraftDocumentSurface(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  editorRef?: RefObject<HTMLTextAreaElement | null>;
  id?: string;
  /** Increment to open edit mode from parent (e.g. Pro card “Edit this draft”). */
  editRequestNonce?: number;
}) {
  const { value, onChange, disabled, editorRef, id = "claw-starter-agreement-document", editRequestNonce } = props;
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editRequestNonce) return;
    setEditing(true);
    window.requestAnimationFrame(() => editorRef?.current?.focus());
  }, [editRequestNonce, editorRef]);
  const { title, body } = useMemo(() => splitAgreementDisplay(value), [value]);

  useEffect(() => {
    logStarterReviewDocumentRendered();
  }, []);

  const paperClass =
    "rounded-xl border border-stone-200/90 bg-[#faf8f4] shadow-[0_12px_40px_-18px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.9)_inset] ring-1 ring-stone-300/40";

  return (
    <div className={paperClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/80 bg-[#f3efe6] px-[clamp(1.25rem,4vw,2.25rem)] py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Agreement preview</p>
        <button
          type="button"
          className="rounded-md border border-stone-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled}
          onClick={() => {
            setEditing((v) => !v);
            if (!editing) {
              window.requestAnimationFrame(() => editorRef?.current?.focus());
            }
          }}
        >
          {editing ? STARTER_DOCUMENT_DONE_EDITING_LABEL : STARTER_DOCUMENT_EDIT_WORDING_LABEL}
        </button>
      </div>

      {editing ? (
        <textarea
          ref={editorRef}
          id={id}
          className="min-h-[min(52vh,36rem)] w-full resize-y border-0 bg-transparent px-[clamp(1.25rem,4vw,2.25rem)] py-8 font-serif text-[15px] leading-[1.88] tracking-[0.012em] text-stone-900 antialiased outline-none [text-wrap:pretty] selection:bg-amber-200/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/90 sm:text-[15.5px] sm:leading-[1.9]"
          style={{ fontFeatureSettings: '"kern" 1, "liga" 1' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
          disabled={disabled}
          aria-label="Agreement document"
        />
      ) : (
        <article
          className="max-h-[min(56vh,40rem)] overflow-y-auto px-[clamp(1.25rem,4vw,2.25rem)] py-8 font-serif text-[15px] leading-[1.88] tracking-[0.012em] text-stone-900 antialiased [text-wrap:pretty] sm:text-[15.5px] sm:leading-[1.9]"
          aria-label="Agreement document preview"
        >
          <h3 className="border-b border-stone-300/70 pb-4 text-center text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
            {title}
          </h3>
          {body ? (
            <div className="mt-6 space-y-4 whitespace-pre-wrap">
              {body.split(/\n{2,}/).map((block, i) => (
                <p key={i} className="text-stone-800">
                  {block.trim()}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-stone-600">{value.trim() || "Your agreement text will appear here."}</p>
          )}
          <div className="mt-10 border-t border-dashed border-stone-300/80 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Signatures</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {["Party A", "Party B"].map((label) => (
                <div key={label} className="rounded-lg border border-stone-200/90 bg-white/60 px-4 py-3">
                  <p className="text-xs font-medium text-stone-500">{label}</p>
                  <div className="mt-6 border-b border-stone-400/70" aria-hidden />
                  <p className="mt-2 text-[11px] text-stone-400">Name · Date</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
