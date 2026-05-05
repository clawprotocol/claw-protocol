/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Vs01Layout } from "./Vs01Layout";

describe("Vs01Layout recipient-facing surface", () => {
  it("omits eyebrow and avoids CLAW in the configurable footer sentence", () => {
    const { container } = render(
      <Vs01Layout
        hero={{
          title: "Review workspace",
          subtitle: "Read the agreement, suggest changes, or continue when it looks good.",
        }}
        footerEvidenceSentence="LawDog produces verifiable evidence records; verification is cryptographic and file-based."
      >
        <div>Child</div>
      </Vs01Layout>,
    );

    expect(container.textContent).not.toMatch(/\bCLAW\b/);
    expect(screen.getByRole("heading", { name: "Review workspace" })).toBeTruthy();
    expect(screen.queryByText("CLAW", { exact: true })).toBeNull();
  });
});
