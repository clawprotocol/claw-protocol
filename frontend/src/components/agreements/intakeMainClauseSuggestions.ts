/**
 * One-tap clause stubs for simple-create intake (appended to draft text; user fills placeholders).
 */

export type MainClauseSuggestion = {
  id: string;
  label: string;
  /** Appended as a new paragraph after existing intake buffer. */
  append: string;
};

export const MAIN_CLAUSE_SUGGESTIONS: MainClauseSuggestion[] = [
  {
    id: "governing_law",
    label: "Add governing law",
    append: "This agreement is governed by the laws of [State].",
  },
  {
    id: "termination",
    label: "Add termination clause",
    append: "Either party may terminate this agreement with [X] days written notice.",
  },
  {
    id: "late_fee",
    label: "Add late fee",
    append: "Late payments may incur a fee of [X]% per month.",
  },
  {
    id: "dispute_resolution",
    label: "Add dispute resolution",
    append: "Disputes arising under this agreement will be resolved through [mediation or binding arbitration] in [Jurisdiction].",
  },
];
