/**
 * Single visible step for production create — only one stage’s UI mounts at a time.
 */
export const CreateUiStage = {
  INPUT: "INPUT",
  DRAFT: "DRAFT",
  RECIPIENTS: "RECIPIENTS",
} as const;
export type CreateUiStage = (typeof CreateUiStage)[keyof typeof CreateUiStage];

export function createUiStagePrimaryCta(stage: CreateUiStage, isGeneratingDraft: boolean, busyLabel: string): string {
  if (isGeneratingDraft) return busyLabel;
  switch (stage) {
    case CreateUiStage.INPUT:
      return "Create Draft";
    case CreateUiStage.DRAFT:
      return "Continue";
    case CreateUiStage.RECIPIENTS:
      return "Send";
    default:
      return "";
  }
}
