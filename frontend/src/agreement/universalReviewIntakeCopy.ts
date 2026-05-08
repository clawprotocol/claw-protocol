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

/** Section heading in recipient request-changes flow (replaces legacy “Bring back suggested edits”). */
export const BRING_BACK_SUGGESTED_EDITS_TITLE = "Request changes";
export const UNIVERSAL_REVIEW_INTRO =
  "Read the draft, tweak it, preview a redline, then send suggestions. Nothing changes until the sender accepts.";

export const MODE_SUGGEST_PLAIN_ENGLISH = "Small tweak";
export const MODE_PASTE_REVISED_DRAFT = "Paste revised text";
export const MODE_EDIT_DRAFT = "Edit directly";
export const EDIT_DRAFT_TITLE = "Edit draft";
export const EDIT_DRAFT_HELPER =
  "Make edits here. We'll show a redline before anything is sent.";
export const EDIT_DRAFT_PREVIEW_HINT = "Review changes after editing";
export const MODE_UPLOAD_FILE = "Upload file";
export const UPLOAD_FILE_COMPARISON_COMING_SOON = "Upload comparison coming soon.";

/** Shown under the universal intro in recipient review (legacy scan set / tests). */
export const NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE =
  "Nothing changes unless the sender accepts.";

export const REVIEWER_OWNER_ACCEPTS_LINE = "The owner reviews and accepts changes.";
export const REVIEWER_NOT_AUTOMATIC_LINE = "Nothing here changes the agreement automatically.";

export const MATERIAL_CHANGE_SUMMARY_LABEL = "Material change summary";

export const OWNER_INCOMING_SUGGESTED_EDITS_HEADING = "Suggested edits";
export const PLAIN_ENGLISH_FIELD_LABEL = "What should change?";
export const PASTE_OPTIONAL_NOTE_LABEL = "Optional message to sender";

import {
  DIRECT_COMPARE_DISCLAIMER,
  DIRECT_COMPARE_MODE_INTRO,
  OWNER_PORTABLE_REVIEW_SUB,
  PORTABLE_REVIEW_HEADER,
  PORTABLE_REVIEW_OCR_FOOTNOTE,
  PORTABLE_REVIEW_PASTE_LABEL,
  PORTABLE_REVIEW_PASTE_PLACEHOLDER,
  PORTABLE_REVIEW_SUB,
  RECIPIENT_COPY_EXPORT_PREVIEW_LINE,
  RECIPIENT_COPY_EXPORT_SECTION_HELPER,
  RECIPIENT_COPY_EXPORT_SECTION_TITLE,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
  RECIPIENT_OUTSIDE_REVIEW_WORKFLOW,
  RECIPIENT_QUICK_CHANGE_SECTION_HELPER,
  RECIPIENT_QUICK_CHANGE_SECTION_TITLE,
  RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL,
  RECIPIENT_SEND_BACK_REVISED_HELPER,
  RECIPIENT_SEND_BACK_REVISED_TITLE,
  RECIPIENT_WORK_ELSEWHERE_BODY,
  RECIPIENT_WORK_ELSEWHERE_TITLE,
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
    MODE_EDIT_DRAFT,
    EDIT_DRAFT_TITLE,
    EDIT_DRAFT_HELPER,
    EDIT_DRAFT_PREVIEW_HINT,
    MODE_UPLOAD_FILE,
    UPLOAD_FILE_COMPARISON_COMING_SOON,
    NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE,
    REVIEWER_OWNER_ACCEPTS_LINE,
    REVIEWER_NOT_AUTOMATIC_LINE,
    MATERIAL_CHANGE_SUMMARY_LABEL,
    OWNER_INCOMING_SUGGESTED_EDITS_HEADING,
    PLAIN_ENGLISH_FIELD_LABEL,
    PASTE_OPTIONAL_NOTE_LABEL,
    PORTABLE_REVIEW_HEADER,
    PORTABLE_REVIEW_SUB,
    RECIPIENT_COPY_EXPORT_SECTION_TITLE,
    RECIPIENT_COPY_EXPORT_SECTION_HELPER,
    RECIPIENT_COPY_EXPORT_PREVIEW_LINE,
    RECIPIENT_OUTSIDE_REVIEW_WORKFLOW,
    RECIPIENT_DRAFT_IMPORT_READ_ERROR,
    RECIPIENT_SEND_BACK_REVISED_TITLE,
    RECIPIENT_SEND_BACK_REVISED_HELPER,
    RECIPIENT_QUICK_CHANGE_SECTION_TITLE,
    RECIPIENT_QUICK_CHANGE_SECTION_HELPER,
    RECIPIENT_WORK_ELSEWHERE_TITLE,
    RECIPIENT_WORK_ELSEWHERE_BODY,
    RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL,
    PORTABLE_REVIEW_PASTE_LABEL,
    PORTABLE_REVIEW_PASTE_PLACEHOLDER,
    PORTABLE_REVIEW_OCR_FOOTNOTE,
    OWNER_PORTABLE_REVIEW_SUB,
    DIRECT_COMPARE_MODE_INTRO,
    DIRECT_COMPARE_DISCLAIMER,
  ];
}
