import type { ReactNode } from "react";
import { AgreementReadySummaryCard } from "./AgreementReadySummaryCard";
import { AgreementDetailsReadOnlyPanel } from "./AgreementDetailsReadOnlyPanel";
import type { AgreementReadySummaryDraftSource } from "./agreementReadySummaryModel";
import type { PostGenerationPresentation } from "./useAgreementPostGenerationPresentation";

type Props = {
  draft: AgreementReadySummaryDraftSource;
  presentation: PostGenerationPresentation;
  onPresentationChange: (next: PostGenerationPresentation) => void;
  editorPanel: ReactNode;
  advancedPanel?: ReactNode;
  readonlyPreviewPanel?: ReactNode;
  className?: string;
  testId?: string;
};

export function AgreementPostGenerationFlow(props: Props) {
  const {
    draft,
    presentation,
    onPresentationChange,
    editorPanel,
    advancedPanel,
    readonlyPreviewPanel,
    className,
    testId,
  } = props;

  if (presentation === "summary") {
    return (
      <div className={className} data-testid={testId ?? "agreement-post-generation-flow"}>
        <AgreementReadySummaryCard
          draft={draft}
          onReviewAgreement={() => onPresentationChange("readonly")}
          onEditDetails={() => onPresentationChange("editor")}
          advancedPanel={advancedPanel}
        />
      </div>
    );
  }

  return (
    <div className={className} data-testid={testId ?? "agreement-post-generation-flow"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          onClick={() => onPresentationChange("summary")}
        >
          Back to summary
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {presentation === "readonly" ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => onPresentationChange("editor")}
            >
              Edit details
            </button>
          ) : null}
          {advancedPanel ? (
            <details className="rounded-lg border border-slate-800/60 bg-slate-950/25 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none [&::-webkit-details-marker]:hidden">
                Advanced options
              </summary>
              <div className="mt-2 space-y-3 border-t border-slate-800/50 pt-2">{advancedPanel}</div>
            </details>
          ) : null}
        </div>
      </div>
      {presentation === "readonly" ? (
        <>
          <AgreementDetailsReadOnlyPanel draft={draft} />
          {readonlyPreviewPanel ? (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold tracking-tight text-slate-100">Agreement preview</h3>
              <p className="text-xs leading-relaxed text-slate-500">Read-only preview — edit when you are ready.</p>
              {readonlyPreviewPanel}
            </div>
          ) : null}
        </>
      ) : (
        editorPanel
      )}
    </div>
  );
}
