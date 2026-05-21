export type GuidedAppliedChange = {
  questionKey: string;
  answerLabel: string;
  recommendationReason: string | null;
  targetSectionLabel: string;
  summary: string;
  anchorFound: boolean;
  changedSnippet: string;
  timestamp: number;
};
