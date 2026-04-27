/**
 * LawDog “Universal Review Intake” copy: neutral compare / merge framing.
 * For QA and tests, keep user-visible strings in this file or portably in portableReviewCopy.
 */

/** Banned in recipient/owner review UX: prefer calm, collaborative language. */
export const BANNED_HOSTILE_REVIEW_TOKENS = [
  "quality gate",
  "redline war",
  "adverse",
  "dispute",
  "fight",
] as const;

export const BRING_BACK_SUGGESTED_EDITS_TITLE = "Bring back suggested edits";
export const UNIVERSAL_REVIEW_INTRO =
  "Use LawDog Assist, your lawyer, your own AI tool, or Word. Paste suggested edits here and LawDog will organize the differences.";

export const MODE_SUGGEST_PLAIN_ENGLISH = "Suggest in plain English";
export const MODE_PASTE_REVISED_DRAFT = "Paste revised draft";
export const MODE_UPLOAD_FILE = "Upload file";
export const UPLOAD_FILE_COMPARISON_COMING_SOON = "Upload file comparison coming soon.";

/** Shown under the universal intro in recipient review. */
export const NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE =
  "Nothing changes for the agreement until both sides confirm.";

export const MATERIAL_CHANGE_SUMMARY_LABEL = "Material change summary";

export const OWNER_INCOMING_SUGGESTED_EDITS_HEADING = "Suggested edits";
export const PLAIN_ENGLISH_FIELD_LABEL = "Your notes in plain English";
export const PASTE_OPTIONAL_NOTE_LABEL = "Optional short note (optional)";

import {
  DIRECT_COMPARE_DISCLAIMER,
  DIRECT_COMPARE_MODE_INTRO,
  OWNER_PORTABLE_REVIEW_SUB,
  PORTABLE_REVIEW_HEADER,
  PORTABLE_REVIEW_OCR_FOOTNOTE,
  PORTABLE_REVIEW_PASTE_LABEL,
  PORTABLE_REVIEW_PASTE_PLACEHOLDER,
  PORTABLE_REVIEW_SUB,
} from "./portableReviewCopy";

/**
 * All user-visible strings from this file + the portable review / direct compare
 * copy used in the same screens (for banned-token guard in tests only).
 */
export function allReviewIntakeQaStringScanSet(): string[] {
  return [
    BRING_BACK_SUGGESTED_EDITS_TITLE,
    UNIVERSAL_REVIEW_INTRO,
    MODE_SUGGEST_PLAIN_ENGLISH,
    MODE_PASTE_REVISED_DRAFT,
    MODE_UPLOAD_FILE,
    UPLOAD_FILE_COMPARISON_COMING_SOON,
    NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE,
    MATERIAL_CHANGE_SUMMARY_LABEL,
    OWNER_INCOMING_SUGGESTED_EDITS_HEADING,
    PLAIN_ENGLISH_FIELD_LABEL,
    PASTE_OPTIONAL_NOTE_LABEL,
    PORTABLE_REVIEW_HEADER,
    PORTABLE_REVIEW_SUB,
    PORTABLE_REVIEW_PASTE_LABEL,
    PORTABLE_REVIEW_PASTE_PLACEHOLDER,
    PORTABLE_REVIEW_OCR_FOOTNOTE,
    OWNER_PORTABLE_REVIEW_SUB,
    DIRECT_COMPARE_MODE_INTRO,
    DIRECT_COMPARE_DISCLAIMER,
  ];
}
