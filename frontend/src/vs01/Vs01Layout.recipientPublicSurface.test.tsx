/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Vs01Layout } from "./Vs01Layout";

describe("Vs01Layout recipient-facing surface", () => {
  it("omits eyebrow and avoids CLAW in the configurable footer sentence", () => {
    const { container } = render(
      <Vs01Layout
        hero={{
          title: "Review agreement",
          subtitle: "Read it, request edits, or approve it.",
        }}
        footerEvidenceSentence="LawDog produces verifiable evidence records; verification is cryptographic and file-based."
        recipientPublicFooter={true}
      >
        <div>Child</div>
      </Vs01Layout>,
    );

    expect(container.textContent).not.toMatch(/\bCLAW\b/);
    expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    expect(screen.queryByText("CLAW", { exact: true })).toBeNull();
    expect(screen.getAllByText("LawDog is software, not a law firm.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Verification is cryptographic and file-based.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Legal disclosures")).toBeTruthy();
  });
});
