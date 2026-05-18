/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.stubGlobal("navigator", {
  clipboard: { writeText: mocks.writeText },
});

import { StarterDraftDocumentSurface } from "./StarterDraftDocumentSurface";
import {
  FREE_DRAFT_COPY_TEXT_COPIED,
  FREE_DRAFT_COPY_TEXT_LABEL,
} from "../../launch/simpleProduct/proConversionCopy";

const DRAFT = "NDA\n\nBoth parties agree to keep information confidential.";
const surfaceSrc = readFileSync(join(__dirname, "StarterDraftDocumentSurface.tsx"), "utf8");

afterEach(() => {
  cleanup();
  mocks.writeText.mockClear();
});

describe("StarterDraftDocumentSurface copy text", () => {

  it("renders Copy text beside edit wording on free draft preview", () => {
    render(<StarterDraftDocumentSurface value={DRAFT} onChange={() => {}} />);
    expect(screen.getByTestId("starter-draft-copy-text").textContent).toContain(FREE_DRAFT_COPY_TEXT_LABEL);
    expect(screen.getByRole("button", { name: /edit wording/i })).toBeTruthy();
  });

  it("copies current draft text and shows Copied feedback", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<StarterDraftDocumentSurface value={DRAFT} onChange={() => {}} />);

    fireEvent.click(screen.getByTestId("starter-draft-copy-text"));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith(DRAFT);
    });
    await waitFor(() => {
      expect(screen.getByTestId("starter-draft-copy-text").textContent).toContain(FREE_DRAFT_COPY_TEXT_COPIED);
    });
    expect(logSpy).toHaveBeenCalledWith("[free-draft-copy-text]", {
      source: "starter_review_preview",
      textLen: DRAFT.length,
    });
  });

  it("does not wire checkout or recipient navigation in the surface", () => {
    expect(surfaceSrc).not.toContain("beginAdvancedFullDraftCheckout");
    expect(surfaceSrc).not.toContain("handOffProductionDraftToRecipients");
    expect(surfaceSrc).not.toContain("continue_to_recipients");
    expect(surfaceSrc).toContain("logFreeDraftCopyText");
  });
});
