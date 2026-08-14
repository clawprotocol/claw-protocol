/**
 * On-screen agreement text editor for forced paid Pro post-finalize review route.
 */

import type { RefObject } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
  editorRef?: RefObject<HTMLTextAreaElement | null>;
  dirty?: boolean;
  saving?: boolean;
  savedAck?: boolean;
};

export function PaidProPostFinalizeAgreementEditor({
  value,
  onChange,
  onSave,
  onCancel,
  disabled = false,
  editorRef,
  dirty = false,
  saving = false,
  savedAck = false,
}: Props) {
  return (
    <div data-testid="paid-pro-post-finalize-agreement-editor">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50 sm:text-[13px]"
          disabled={disabled || saving || !dirty}
          onClick={onSave}
          data-testid="simple-pro-save-agreement-edits"
        >
          {saving ? "Saving…" : savedAck ? "Changes saved" : "Save changes"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-stone-400/90 bg-white/70 px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm transition hover:bg-white disabled:opacity-50 sm:text-[13px]"
          disabled={disabled}
          onClick={onCancel}
          data-testid="paid-pro-post-finalize-edit-cancel"
        >
          Cancel
        </button>
      </div>
      <textarea
        ref={editorRef}
        id="claw-agreement-preview-editor"
        className="min-h-[min(68vh,44rem)] max-h-[min(78vh,54rem)] w-full resize-y border-0 bg-transparent px-0 pb-8 pt-2 font-serif text-[15px] leading-[1.88] tracking-[0.012em] text-stone-900 antialiased outline-none [text-wrap:pretty] selection:bg-amber-200/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/90 sm:text-[15.5px] sm:leading-[1.9]"
        style={{ fontFeatureSettings: '"kern" 1, "liga" 1, "onum" 1' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        disabled={disabled || saving}
        aria-label="Agreement document"
        data-testid="simple-pro-edit-agreement-plain-input"
      />
      {saving ? (
        <p className="mt-1.5 text-[11px] font-medium text-stone-700" role="status">
          Saving changes…
        </p>
      ) : savedAck ? (
        <p
          className="mt-1.5 text-[11px] font-medium text-emerald-800"
          role="status"
          data-testid="simple-pro-save-ack"
        >
          Changes saved. The agreement text is updated.
        </p>
      ) : dirty ? (
        <p
          className="mt-1.5 text-[11px] font-medium text-amber-800"
          role="status"
          data-testid="simple-pro-unsaved"
        >
          Unsaved changes
        </p>
      ) : null}
    </div>
  );
}
