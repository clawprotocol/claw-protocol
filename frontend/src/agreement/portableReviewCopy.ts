/**
 * Shared UX copy for portable review: reviewers work in their own tools, then
 * return suggested text; LawDog diffs and both sides confirm before the draft changes.
 */

/** Preamble added when the recipient pastes text they revised elsewhere (stored with the proposal). */
export const PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE =
  "The following are review notes and suggested edits the recipient brought back here — incorporate where it fits the draft:";

/**
 * Composes the recipient revision message from free-text instruction plus optional pasted import.
 * `hasExternal` is true when the second block (pasted import) is present.
 */
export function buildRecipientRevisionText(
  instruction: string,
  externalPasted: string
): { text: string; hasExternal: boolean } {
  const ext = externalPasted.trim();
  const externalBlock =
    ext.length > 0
      ? [PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE, ext].join("\n\n")
      : "";
  const inst = instruction.trim();
  const text = [inst, externalBlock].filter(Boolean).join("\n\n");
  return { text, hasExternal: ext.length > 0 };
}

export const PORTABLE_REVIEW_HEADER = "Review in your preferred tool";
export const PORTABLE_REVIEW_SUB =
  "Copy the draft, edit elsewhere if you like, then paste or import back. Preview before sending — nothing changes until the sender accepts.";
/** Shown inside Request changes → Save or review elsewhere (outside-review workflow). */
export const RECIPIENT_OUTSIDE_REVIEW_WORKFLOW =
  "Copy or download, edit elsewhere, then paste or import a .txt / .md file back here.";
export const PORTABLE_REVIEW_PASTE_LABEL = "Paste or import";
export const PORTABLE_REVIEW_PASTE_PLACEHOLDER =
  "Paste the full agreement or the sections you changed. Or import a .txt / .md file.";
/** Review-first paste guardrail — shown on the suggest-revision intake surface. */
export const REVIEW_FIRST_PASTE_GUARD_COPY =
  "Paste the complete agreement text, not screenshots. LawDog will ignore headers, footers, and formatting noise and show only material wording changes.";
export const PORTABLE_REVIEW_OCR_FOOTNOTE =
  "Plain text and Markdown files import here. Other formats: copy text out and paste.";

/** Recipient “Request changes” panel — copy/export disclosure (agreement-focused, no share/marketing framing). */
export const RECIPIENT_COPY_EXPORT_SECTION_TITLE = "Save or review elsewhere";
export const RECIPIENT_COPY_EXPORT_SECTION_HELPER = RECIPIENT_OUTSIDE_REVIEW_WORKFLOW;
export const RECIPIENT_COPY_EXPORT_PREVIEW_LINE =
  "Preview before sending. Revisions do not change the original until accepted.";

export const RECIPIENT_DRAFT_IMPORT_READ_ERROR =
  "Couldn't read that file. Try plain text for now.";

/** When PDF text cannot be read (scanned/image-only, corrupt, or empty text layer) or extraction fails. */
export const RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK =
  "We couldn't extract readable text from this file. Try a selectable-text PDF, TXT, or Markdown file.";

/** After PDF extraction + sanitization, agreement body is too thin to compare (likely scanned PDF or noise). */
export const RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT =
  "Could not confidently extract enough text from this PDF. Try a text-based PDF export, TXT, Markdown, or paste the agreement.";

/** Shown when a PDF had readable text but sanitizer stripped agreement-shaped body; we routed to notes/suggestions. */
export const RECIPIENT_PDF_IMPORT_ROUTED_TO_SUGGESTIONS =
  "This looks like review notes or clause suggestions, not a full revised agreement. You can send these as suggestions, apply them to the draft, or upload a full revised agreement.";

/** Shown while reading the file and building the preview (workspace upload / import). */
export const RECIPIENT_REVISED_IMPORT_PREPARING = "Preparing comparison…";

/** When `draft` is not yet available but the user already picked a file. */
export const RECIPIENT_DRAFT_IMPORT_AGREEMENT_NOT_READY =
  "The agreement is still loading. Wait a moment, then upload your revised draft again.";

/** Defensive: compare runner ref missing (should not happen in production). */
export const RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING =
  "Could not start comparison. Refresh the page and try again, or paste your revised text instead.";

/** Extracted file had no usable agreement body after normalization. */
export const RECIPIENT_DRAFT_IMPORT_EMPTY_BODY =
  "That file had no usable agreement text to compare. Try a different file or paste the agreement.";

/** Trust line for previews / decision menus (compose surface avoids repeating it). */
export const RECIPIENT_WORKSPACE_TRUST_LINE = "Nothing changes until the sender accepts.";
export const RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES = "Suggestions are not signatures.";
export const RECIPIENT_WANT_COPY_HEADING = "Review somewhere else?";
export const RECIPIENT_WANT_COPY_BODY =
  "Download the draft, edit it with your lawyer or AI tool, then upload the revised version back here.";
/** Want-a-copy dropzone: warm tip about notes + compare-before-send (no legal advice). */
export const RECIPIENT_WANT_COPY_UPLOAD_TIP =
  'Tip: you can add a short "Why I changed this" note at the bottom of your revised draft. LawDog will compare the draft before anything is sent.';
/** @deprecated Use {@link RECIPIENT_WANT_COPY_UPLOAD_TIP} (same string; kept for tests / scan sets). */
export const RECIPIENT_WANT_COPY_COMPARE_HELPER = RECIPIENT_WANT_COPY_UPLOAD_TIP;
/** Safety line under the dropzone — nothing sends until they review the comparison. */
export const RECIPIENT_WANT_COPY_LOOPBACK_CUE = "Nothing sends until you review the comparison.";
/** Post-accept, records-only want-a-copy card (no outside-review upload). */
export const RECIPIENT_WANT_COPY_RECORDS_HEADING = "Want a copy?";
export const RECIPIENT_WANT_COPY_RECORDS_BODY =
  "Download or copy the approved draft for your records.";
/** Tooltip for PDF export on the post-accept records card. */
export const RECIPIENT_RECORDS_APPROVED_PDF_BUTTON_TITLE =
  "Read-only export of the agreement draft you approved (for your records).";
/** Dropzone primary line (want-a-copy card). */
export const RECIPIENT_WANT_COPY_DROPZONE_PRIMARY = "Drag your revised draft here";
export const RECIPIENT_WANT_COPY_DROPZONE_SECONDARY = "PDF, TXT, or Markdown";
/** Compact line near paste/upload/edit in the revised-draft workspace. */
export const RECIPIENT_REVISED_WORKSPACE_NOTES_HINT =
  "Add notes at the bottom if you want to explain your changes.";
/** Primary upload on the want-a-copy card. */
export const RECIPIENT_WANT_COPY_UPLOAD_CTA = "Upload revised draft";
/** @deprecated Use {@link RECIPIENT_WANT_COPY_DROPZONE_SECONDARY}. */
export const RECIPIENT_WANT_COPY_UPLOAD_FORMAT_HELPER = RECIPIENT_WANT_COPY_DROPZONE_SECONDARY;
export const RECIPIENT_COPY_ACK_COPIED = "Copied!";

/** Top compose workspace (recipient revise tab). */
export const RECIPIENT_WORKSPACE_HEADLINE = "Suggest changes before anything is signed.";
export const RECIPIENT_WORKSPACE_SUBCOPY = "Choose the easiest way to respond.";
export const RECIPIENT_CARD_SMALL_TWEAK_TITLE = "Small tweak";
export const RECIPIENT_CARD_SMALL_TWEAK_BODY = "Ask for a few edits without rewriting the document.";
export const RECIPIENT_CARD_SMALL_TWEAK_CTA = "Request small changes";
export const RECIPIENT_CARD_BIGGER_REWRITE_TITLE = "Revised draft";
export const RECIPIENT_CARD_BIGGER_REWRITE_BODY =
  "Upload or paste an edited version and LawDog will compare it.";
export const RECIPIENT_CARD_BIGGER_REWRITE_CTA = "Upload revised draft";

/** Primary workflow — full-document compare + redline (recipient review). */
export const RECIPIENT_SEND_BACK_REVISED_TITLE = "Send back a revised version";
export const RECIPIENT_SEND_BACK_REVISED_HELPER =
  "Upload or paste an edited draft. LawDog will compare it with what you received.";
/** Revised-draft workspace — intro under headline (pick method + editing). */
export const RECIPIENT_SEND_BACK_REVISED_WORKSPACE_SUBCOPY =
  "Upload, paste, or edit your version. LawDog will compare it with the original.";
/** @deprecated Recipient UI uses send-back headline + {@link RECIPIENT_SEND_BACK_REVISED_WORKSPACE_SUBCOPY}. */
export const RECIPIENT_REVISE_METHOD_HEADLINE = "How do you want to revise it?";
/** Panel subcopy after method chosen (often empty — progressive disclosure). */
export const RECIPIENT_REVISED_PANEL_SUB = "";

/** Small tweak — instruction-only pipeline (mirrors legacy universal intake labels). */
export const RECIPIENT_QUICK_CHANGE_SECTION_TITLE = RECIPIENT_CARD_SMALL_TWEAK_TITLE;
export const RECIPIENT_QUICK_CHANGE_SECTION_HELPER =
  "Best for payment timing, dates, wording, or scope edits.";
/** @deprecated Small-tweak panel uses RECIPIENT_SMALL_TWEAK_HELPER only. */
export const RECIPIENT_QUICK_PANEL_SUB = "";
export const RECIPIENT_SMALL_TWEAK_HELPER = RECIPIENT_QUICK_CHANGE_SECTION_HELPER;
export const RECIPIENT_QUICK_REQUEST_LABEL = "Your request";
export const RECIPIENT_QUICK_REQUEST_PLACEHOLDER =
  "Example: Change payment terms from Net 15 to Net 30.";
export const RECIPIENT_SWITCH_TO_REVISED_DRAFT_LINK = "Need to upload a rewritten draft instead?";

export const RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL = "Upload revised draft";
export const RECIPIENT_PASTE_REVISED_PRIMARY_LABEL = "Paste revised text";
export const RECIPIENT_EDIT_INSIDE_LAWDOG = "Edit inside LawDog";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_PDF = "Download original PDF";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_TEXT = "Download original text";
/** Tooltip / native title for “Download draft PDF” (Review somewhere else — always baseline). */
export const RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE =
  "Sender’s original agreement draft only — no compare markup, redline, or revised upload text.";
/** Compare-panel exports: three separate PDF roles. */
export const RECIPIENT_EXPORT_REVIEW_DOWNLOAD_ORIGINAL_DRAFT_PDF = "Download original draft PDF";
export const RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REVISED_AGREEMENT_PDF = "Download revised agreement PDF";
export const RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REDLINE_PDF = "Download comparison";
/** Redline PDF when import matches the sender’s current draft (summary only, no tracked diff). */
export const RECIPIENT_EXPORT_IMPORT_NO_CHANGE_REDLINE_PDF =
  "Download comparison summary (no edits detected)";
/** Plain-text body for import no-change “redline summary” copy / .txt download (no machine diff). */
export const RECIPIENT_IMPORT_NO_CHANGE_PLAINTEXT_EXPORT =
  "No changes detected\n\nThe uploaded draft matches the sender's current agreement after routine PDF cleanup. There is no detailed redline to copy.";

/** Preview / redline summary (true agreement compare). */
export const RECIPIENT_PREVIEW_SUMMARY_HEADLINE = "Review proposed agreement changes";
export const RECIPIENT_PREVIEW_TRUST_SUBCOPY = RECIPIENT_WORKSPACE_TRUST_LINE;
/** Shown under the compare headline — send vs accept clarity. */
export const RECIPIENT_PREVIEW_COMPARE_TRUST_SUBCOPY =
  "Nothing is sent until you click Send. The sender still accepts before the draft changes.";

/** Transitional copy after choosing an uploaded revised draft (PDF / TXT / Markdown). */
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_TITLE = "Analyzing revised draft…";
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_SUB = "Preparing a compare with the agreement you received.";
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_CHECKLIST = [
  "Reading your revised draft",
  "Finding proposed changes",
  "Preparing compare",
] as const;

/** When heuristic split found commentary meant for the sender (not part of the agreement body). */
export const RECIPIENT_REVIEWER_NOTES_INCLUDED_BADGE = "Reviewer notes included";
export const RECIPIENT_REVIEWER_NOTES_ACCORDION_LABEL = "Why these changes were suggested";

/** Upload looked like commentary, not a full edited agreement — no redline until they bring a draft. */
export const RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE = "Reviewer notes found";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CARD_BODY =
  "This looks like review comments, not a rewritten agreement. LawDog kept it separate so your compare stays clean.";
/** Collapsed panel — full extracted text. */
export const RECIPIENT_UPLOAD_NOTES_ONLY_VIEW_FULL_NOTES = "View full notes";
export const RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_HEADING = "Suggested focus";
export const RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_BULLETS = [
  "Payment timing",
  "Scope boundaries",
  "Delivery delays",
  "Third-party services",
  "Ownership / reusable tools",
] as const;
export const RECIPIENT_UPLOAD_NOTES_ONLY_HELPER =
  "Upload or paste a full revised draft when you are ready to compare. Your notes stay separate until then.";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_SEND_NOTES = "Send notes to sender";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_TURN_SUGGESTIONS = "Turn into clause suggestions";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_UPLOAD = "Upload revised agreement";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_PASTE = "Paste revised agreement";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_QUICK = "Use these as a quick change request";
export const RECIPIENT_UPLOAD_NOTES_ONLY_DOWNLOAD_NOTES = "Download reviewer notes";

/** Compare panel — intent coverage (plain language). */
/** @deprecated Prefer {@link RECIPIENT_BUSINESS_REVIEW_INTENT_NOT_INLINE}. */
export const RECIPIENT_INTENT_NOT_AUTOMATICALLY_INSERTED =
  "Related wording was grouped into the summary above.";
/** Shown for instruction rows that are not expanded (no compare-engine phrasing). */
export const RECIPIENT_BUSINESS_REVIEW_INTENT_NOT_INLINE =
  "Related wording was grouped into the summary above.";
/** When exact clause mapping is weak — card face + optional CTA to full redline. */
export const RECIPIENT_BUSINESS_REVIEW_CARD_WEAK_WORLING_LINE =
  "This section was substantially revised. Open Full legal redline to see the exact changed wording.";
/** Opens the collapsed full legal redline section (no modal). */
/** Primary CTA from business-review cards into the clause-level redline surface. */
export const RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE = "Open in advanced redline";
/** Secondary hint under {@link RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE}. */
export const RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE_HINT = "Jumps to insert/delete markup on the Advanced redline tab.";
/** Compare fallback modal — opens optional full redline surface. */
export const RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE = "Open in full redline";
/** @deprecated Use {@link RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE}. */
export const RECIPIENT_VIEW_IN_FULL_LEGAL_REDLINE = RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE;
/** User-safe — avoids “match failure” tone. */
export const RECIPIENT_INTENT_NEEDS_MANUAL_PLACEMENT = "This wording is not shown anchored to a single clause in the text below";
export const RECIPIENT_INTENT_REVIEW_BEFORE_SENDING = "Review before sending";
export const RECIPIENT_PREVIEW_EXPORT_DETAILS_SUMMARY = "Downloads";
export const RECIPIENT_PREVIEW_SUGGESTION_DETAILS_SUMMARY = "Suggestion details";
/** Collapsible section: line-level agreement markup (default closed). */
export const RECIPIENT_AUDIT_MODE_SUMMARY = "Full legal redline";
/** @deprecated Use {@link RECIPIENT_AUDIT_MODE_SUMMARY}. */
export const RECIPIENT_PREVIEW_TECHNICAL_COMPARE_SUMMARY = RECIPIENT_AUDIT_MODE_SUMMARY;
export const RECIPIENT_AUDIT_MODE_SUBCOPY =
  "Optional line-by-line markup. Most reviewers decide from the summary and key revisions first.";
/** @deprecated User-facing gap chip uses {@link recipientPreviewGapChipLabel} instead. */
export const RECIPIENT_PREVIEW_ITEMS_TO_PLACE = "May need placement";

/** User-safe label for many instruction intents not shown inline in the compare. */
export function recipientPreviewGapChipLabel(count: number): string {
  if (count <= 0) return "";
  if (count >= 15) return "Several related updates summarized together";
  if (count === 1) return "1 proposed edit";
  return `${count} proposed edits`;
}

export const RECIPIENT_PREVIEW_IMPORT_FORMATTING_NOTE =
  "Some formatting from the uploaded file was cleaned before comparison.";
export const RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT =
  "Reviewer notes are separate from the agreement.";

/** PDF “audit reference” strip — counts only; no parser/compare jargon. */
export function recipientRedlineTechnicalAppendixSummaryLine(opts: {
  insertCount: number;
  deleteCount: number;
  changedBlockCount: number;
  segmentCount: number;
}): string {
  const { insertCount, deleteCount, changedBlockCount, segmentCount } = opts;
  return `For reference: ${insertCount} additions, ${deleteCount} removals, ${changedBlockCount} sections with revisions, and ${segmentCount} tracked spans (counts only — use the detailed redline in this PDF for line-level review).`;
}

/** Human review card — nothing leaves the recipient until the sender accepts. */
export const RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS =
  "Nothing is sent until the sender accepts.";

/** Subheading above the tracked redline (inside full legal redline). */
export const RECIPIENT_HUMAN_REVIEW_REDLINES_SUBHEAD = "Changed wording";
/** In-panel heading for clause-level panels (UI + PDF body). */
export const RECIPIENT_REDLINE_CHANGED_SECTIONS_HEADING = "Changed wording";
/** Short instruction under the changed-clause heading (recipient full redline). */
export const RECIPIENT_REDLINE_CHANGED_WORDING_INSTRUCTION =
  "These are the clauses that appear to have changed. Use the buttons above to jump between review areas.";

/** Condensed revised-draft presentation (recipient compare). */
export const RECIPIENT_CONDENSED_REVISION_BANNER =
  "This upload appears to be a condensed revised draft. LawDog grouped related changes for review.";
/** Shown directly under the clean / compare / advanced segmented control. */
export const RECIPIENT_CONDENSED_TOGGLE_GUIDANCE =
  "Review the proposed version first. Use Compare changes if you want to inspect what changed.";
export const RECIPIENT_CONDENSED_COMPARE_FOCUS_LABEL = "Compare focus areas";
/** Non-interactive chips above the clean proposed draft (condensed mode). */
export const RECIPIENT_CONDENSED_COMPARE_FOCUS_CHIPS: readonly string[] = [
  "Payment",
  "Scope",
  "Ownership",
  "Third-party services",
  "Acceptance",
  "Timeline",
];
export const RECIPIENT_CONDENSED_EXPORT_METRICS_DETAILS_SUMMARY = "Export versions & detailed metrics";
export const RECIPIENT_CONDENSED_TAB_CLEAN = "Clean proposed version";
export const RECIPIENT_CONDENSED_TAB_CHANGED = "Compare changes";
export const RECIPIENT_CONDENSED_TAB_ADVANCED = "Advanced redline";
export const RECIPIENT_ADVANCED_REDLINE_INTRO =
  "This view is for line-by-line inspection. The clean proposed version is what would be sent.";
export const RECIPIENT_ADVANCED_REDLINE_SECONDARY =
  "Most reviewers use Clean proposed version and Compare changes first; open this tab only when you need insert/delete markup.";
export const RECIPIENT_NOT_RESTAT_ORIGINAL_INTRO =
  "Some unchanged or unaddressed original sections are not repeated in this condensed draft.";
export const RECIPIENT_NOT_RESTAT_ORIGINAL_DETAILS_SUMMARY = "Original sections not directly restated";
export const RECIPIENT_NOT_RESTAT_ORIGINAL_FOOTNOTE =
  "These may remain from the original unless the sender accepts a replacement draft that omits them. Absence in this upload does not mean they were deleted from your agreement.";
export const RECIPIENT_EXPORT_PDF_CLEAN_PROPOSED_HEADING = "Clean proposed revision";
export const RECIPIENT_EXPORT_PDF_KEY_CHANGED_WORDING_HEADING = "Key changed wording by topic";
export const RECIPIENT_EXPORT_PDF_ADVANCED_MARKUP_APPENDIX_HEADING = "Advanced legal markup (appendix)";
export const RECIPIENT_EXPORT_PDF_NOT_RESTAT_APPENDIX_HEADING = "Original sections not directly restated";
export const RECIPIENT_FOCUS_COMPARE_SCROLL_MISS_NOTE =
  "Could not jump to an exact clause in the redline. Showing the best matching revision.";
/** Shown when prior/revised clause text cannot be shown reliably (avoid bogus title vs dash pairs). */
export const RECIPIENT_FOCUS_COMPARE_MULTI_SECTION_SUMMARY =
  "This topic was summarized from multiple changed sections. Open the advanced redline to review all related changes.";
export const RECIPIENT_FOCUS_COMPARE_BEST_MATCH_HEADING = "Best matching section";
export const RECIPIENT_FOCUS_COMPARE_BUSINESS_NOTE_LABEL = "Business note";
/** Optional disclosure inside compare modal — raw text, not styled redline. */
export const RECIPIENT_FOCUS_COMPARE_SHOW_LEGAL_MARKUP = "Show legal markup (raw text)";
/** Closed disclosure wrapping raw insert/delete markup (UI + PDF). */
export const RECIPIENT_SHOW_ADVANCED_LEGAL_MARKUP = "Show advanced legal markup";
/** Optional line-by-line markup inside a clause prior/revised panel. */
export const RECIPIENT_SHOW_LINE_BY_LINE_MARKUP = "Show line-by-line markup";
/** Default-on filter for full legal redline scroll surface. */
export const RECIPIENT_ONLY_CHANGED_SECTIONS = "Only changed sections";
/** Optional: show full agreement structure when off. */
export const RECIPIENT_SHOW_UNCHANGED_CONTEXT = "Show unchanged context";
/** Sticky navigator label above review-area chips. */
export function recipientRedlineReviewAreasLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return "Review areas";
  return `${n} review ${n === 1 ? "area" : "areas"}`;
}

/** Primary CTA on Business Review cards and dense section shortcuts. */
export const RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING = "Compare this change";
/** @deprecated Alias — use {@link RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING}. */
export const RECIPIENT_VIEW_CHANGED_WORDING = RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING;
/** Secondary line under preview CTA (desktop + mobile). */
export const RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT = "Opens original vs proposed wording in a short panel.";
/** @deprecated Use {@link RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING}. */
export const RECIPIENT_BUSINESS_REVIEW_VIEW_EXACT_WORDING = RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING;
export const RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE = "Exact wording";

/** Redline PDF export: collapsed block when alignment is noisy (avoid duplicate body replay). */
export const RECIPIENT_EXPORT_SECTION_SUBSTANTIALLY_REVISED =
  "Section substantially revised — see the summary above; full wording appears in the detailed redline below.";
/** PDF body: after human summary / key revisions — readable changed-clause section. */
export const RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE = "Changed wording";
/** @deprecated Use {@link RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE} (same string). */
export const RECIPIENT_EXPORT_PDF_CHANGED_SECTIONS_HEADING = RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE;
/** Semantic negotiation panels (whole-section rewrite mode). */
export const RECIPIENT_SEMANTIC_PRIOR_LABEL = "Prior wording";
export const RECIPIENT_SEMANTIC_REVISED_LABEL = "Revised wording";
export const RECIPIENT_SEMANTIC_REDLINE_INTRO =
  "Where a section was heavily rewritten, prior and revised wording are shown for readability. Optional line-by-line markup remains inside each section.";
export const RECIPIENT_SEMANTIC_LINE_BY_LINE_DETAILS = "Optional line-by-line markup";
export const RECIPIENT_BUSINESS_REVIEW_WHY_DETAILS = "Why this matters";
/** PDF appendix: numeric reference only. */
export const RECIPIENT_EXPORT_PDF_APPENDIX_REFERENCE = "Reference counts";
/** PDF appendix heading for separated reviewer text. */
export const RECIPIENT_EXPORT_PDF_APPENDIX_EXTRACTED_NOTES_HEADING =
  "Additional extracted review notes — not part of agreement";
/** Collapsed disclosure for insert/delete/section counts inside full legal redline. */
export const RECIPIENT_DETAILED_EDIT_METRICS_SUMMARY = "Detailed edit metrics";
/** In-panel summary for optional extracted reviewer commentary (collapsed by default). */
export const RECIPIENT_ADDITIONAL_EXTRACTED_REVIEW_NOTES = "Additional extracted review notes";
/** Optional raw instruction / intent lines (collapsed by default). */
export const RECIPIENT_INTENT_RAW_DETAIL_HEADING = "Request detail (optional)";
export const RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING = "Key revisions to review";
export const RECIPIENT_BUSINESS_REVIEW_NO_CHANGES_SECTION = "No changes to";
export const RECIPIENT_BUSINESS_REVIEW_MOST_IMPORTANT_HEADING = "Key revisions";
export const RECIPIENT_BUSINESS_REVIEW_RECOMMENDED_FOCUS_HEADING = "Review focus";
export const RECIPIENT_BUSINESS_REVIEW_OTHER_EDITS_LINE =
  "Most other edits appear clarifying or operational.";
export const RECIPIENT_BUSINESS_REVIEW_GROUPED_READABILITY = "Some revisions are shown together for clarity.";
export const RECIPIENT_BUSINESS_REVIEW_SUBSTANTIAL_REWRITE_SUMMARY =
  "A few sections were substantially rewritten and are summarized above.";

/** Collapsed panel for reviewer-only commentary (alias of {@link RECIPIENT_ADDITIONAL_EXTRACTED_REVIEW_NOTES}). */
export const RECIPIENT_REVIEWER_NOTES_PANEL_SUMMARY = RECIPIENT_ADDITIONAL_EXTRACTED_REVIEW_NOTES;

/** Shown when a noisy block is collapsed to avoid duplicate full-document inserts in the redline. */
export const RECIPIENT_REDLINE_SECTION_COLLAPSED_NOTE =
  "Section updated — download the proposed PDF for the full revised wording in this area.";

export function recipientRedlineUnchangedSectionsHiddenLabel(count: number): string {
  const n = Math.max(1, Math.floor(count));
  return n === 1
    ? "1 unchanged section is hidden so you can focus on what changed."
    : `${n} unchanged sections are hidden so you can focus on what changed.`;
}

/** Clause-suggestions surface (structured list upload). */
export const RECIPIENT_CLAUSE_SUGGESTIONS_TITLE = "Suggested protections";
export const RECIPIENT_CLAUSE_SUGGESTIONS_SUB =
  "These read as clause-style suggestions, not a full rewritten agreement. Compare opens after you upload or paste a revised draft.";
export const RECIPIENT_CLAUSE_SUGGESTION_STATUS_READY = "Ready to send";
export const RECIPIENT_CLAUSE_SUGGESTION_STATUS_NEEDS_PLACEMENT = "Follow up with sender";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_SEND = "Send suggestions only";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_APPLY = "Apply suggestions to draft";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_UPLOAD = "Upload full revised draft";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_PASTE = "Paste revised agreement";
export const RECIPIENT_CLAUSE_SUGGESTIONS_DOWNLOAD = "Download suggestions";

/** Assisted compose + preview toolbars. */
export const RECIPIENT_BTN_PREVIEW_CHANGES = "Preview changes";
/** Primary compare CTA in revised-draft flow (calls assisted redline). */
export const RECIPIENT_BTN_REVIEW_CHANGES = "Compare drafts";
/** @deprecated No longer shown as a tab; kept for tests referencing assisted label history. */
export const RECIPIENT_ASSISTED_COMPOSE_TAB_LABEL = "Suggest changes";
export const RECIPIENT_BTN_SEND_CHANGES = "Send changes";
/** Shown under Send when reviewing a condensed clean revised draft. */
export const RECIPIENT_BTN_SEND_CLEAN_PROPOSED_SUBCOPY =
  "Sends the clean proposed version from your preview — not the compare markup.";
export const RECIPIENT_BTN_CONTINUE_EDITING = "Continue editing";
export const RECIPIENT_BTN_DOWNLOAD_REDLINE_PDF = "Download comparison";

/** @deprecated Manual compare removed from recipient review UI (panel may still exist for tooling). */
export const RECIPIENT_DIRECT_COMPARE_LABEL = "Manual compare";

/** Visible “work elsewhere” card (download-first professional workflow). */
export const RECIPIENT_WORK_ELSEWHERE_TITLE = "Work somewhere else";
export const RECIPIENT_WORK_ELSEWHERE_BODY =
  "Download the original, edit it with your lawyer or AI tool, then upload the revised version.";
/** @deprecated Use RECIPIENT_WORK_ELSEWHERE_* */
export const RECIPIENT_REVIEW_ELSEWHERE_TITLE = RECIPIENT_WORK_ELSEWHERE_TITLE;
/** @deprecated Use RECIPIENT_WORK_ELSEWHERE_* */
export const RECIPIENT_REVIEW_ELSEWHERE_BODY = RECIPIENT_WORK_ELSEWHERE_BODY;
/** File import — plain text / Markdown. */
export const RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL = RECIPIENT_WANT_COPY_UPLOAD_CTA;

/** Owner workspace: same portable flow, but apply/discard is local. */
export const OWNER_PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise in your preferred tool, then bring back suggested edits. LawDog will organize the differences. Your saved draft does not change until you preview and apply, or you discard the preview.";

/** Read-only: client-side two-paste diff; does not affect the live draft. */
export const DIRECT_COMPARE_MODE_INTRO =
  "Optionally compare two full-text versions side by side. LawDog highlights additions, deletions, and common themes to help you align. Use assisted preview if you want LawDog to merge into fields.";
export const DIRECT_COMPARE_DISCLAIMER = "Nothing changes until accepted. This panel is for review only.";
