import { useCallback, useEffect, useState } from "react";

export type PostGenerationPresentation = "summary" | "readonly" | "editor";

export function useAgreementPostGenerationPresentation(resetKey: string | null | undefined) {
  const [presentation, setPresentation] = useState<PostGenerationPresentation>("summary");

  useEffect(() => {
    setPresentation("summary");
  }, [resetKey]);

  const resetToSummary = useCallback(() => setPresentation("summary"), []);

  return {
    presentation,
    setPresentation,
    resetToSummary,
    isSummaryMode: presentation === "summary",
  };
}
