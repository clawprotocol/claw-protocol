import type { BulkChecklistItem } from "./guidedQuestionConfig";

type Props = {
  items: readonly BulkChecklistItem[];
  title?: string;
};

export function GuidedBulkApplyChecklist({
  items,
  title = "Updating your Pro agreement…",
}: Props) {
  return (
    <div
      className="mt-4 rounded-lg border border-stone-200/90 bg-stone-50/90 px-4 py-3"
      role="status"
      aria-live="polite"
      data-testid="guided-bulk-apply-checklist"
    >
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.variableId} className="flex items-start gap-2 text-xs text-stone-700">
            <span className="mt-0.5 shrink-0 text-emerald-700" aria-hidden>
              ✓
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
