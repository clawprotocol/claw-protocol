/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import { substitutePartyPlaceholdersInUserFacingText } from "./partyPlaceholderDisplay";
import { detectRecipientReviewPresentationMode } from "./recipientReviewPresentationMode";

/**
 * Long baseline HTML shape (numbered clauses) used with a short “Sarah-style” revised memo
 * so {@link detectRecipientReviewPresentationMode} selects condensed_clean_revision — the
 * same shape that drives {@link RecipientCondensedRevisionSurface} in integration tests
 * (see recipientCondensedCleanRevisionQA.test.tsx).
 */
const LONG_HTML_CONDENSED =
  "<article>" +
  Array.from(
    { length: 7 },
    (_, i) =>
      `<p>${i + 1}. The parties acknowledge operational constraints and allocate risk as commercially reasonable for consulting deliverables. ` +
      "The consultant shall perform professional services and maintain confidentiality. ".repeat(6) +
      "</p>",
  ).join("") +
  "</article>";

describe("detectRecipientReviewPresentationMode — condensed Sarah-style vs identical re-upload", () => {
  const draftSanitizeContext = ["Consulting", "Consulting services.", "Net 30 upon invoice.", "Acme", "Consultant"].join(
    "\n",
  );

  it("classifies Sarah-style short revised memo vs long baseline as condensed_clean_revision", () => {
    const currentPlain = htmlToPlainTextForLegalRedline(
      substitutePartyPlaceholdersInUserFacingText(LONG_HTML_CONDENSED, draftSanitizeContext),
    );
    const proposedPlain =
      "Sarah Collins proposed revised draft for QA testing\n\n" +
      "This condensed draft reflects key clarifications below.\n\n" +
      "1. Payment terms Net 45 upon invoice with expedited review.\n\n" +
      "2. Scope limited to advisory services only without implementation duties.\n\n" +
      "Additional operative context for length. ".repeat(8).trim();

    expect(currentPlain.length).toBeGreaterThanOrEqual(2500);
    expect(proposedPlain.length).toBeGreaterThanOrEqual(400);
    expect(detectRecipientReviewPresentationMode({ currentPlain, proposedPlain })).toBe("condensed_clean_revision");
  });

  it("classifies identical current and proposed as full_clause_redline (same path as import no-material compare)", () => {
    const currentPlain = htmlToPlainTextForLegalRedline(
      substitutePartyPlaceholdersInUserFacingText(LONG_HTML_CONDENSED, draftSanitizeContext),
    );
    expect(detectRecipientReviewPresentationMode({ currentPlain, proposedPlain: currentPlain })).toBe(
      "full_clause_redline",
    );
  });
});
