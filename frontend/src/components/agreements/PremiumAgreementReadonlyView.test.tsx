/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";

const componentSrc = readFileSync(join(__dirname, "PremiumAgreementReadonlyView.tsx"), "utf8");
const htmlSrc = readFileSync(join(__dirname, "premiumAgreementDocumentHtml.ts"), "utf8");

describe("PremiumAgreementReadonlyView mobile readability", () => {
  it("does not use text-align justify on contract paragraphs", () => {
    expect(componentSrc).not.toMatch(/text-align:\s*justify/);
    expect(componentSrc).not.toContain("text-justify");
    expect(htmlSrc).not.toMatch(/text-align:\s*justify/);
  });

  it("uses left-aligned paragraphs with normal word spacing", () => {
    expect(componentSrc).toContain("text-align:left");
    expect(componentSrc).toContain("word-spacing:normal");
  });

  it("renders readonly document without justify utility classes", () => {
    const { container } = render(
      <PremiumAgreementReadonlyView html="<p>Test paragraph for mobile layout.</p>" />,
    );
    expect(container.querySelector(".text-justify")).toBeNull();
    const style = container.querySelector("style");
    expect(style?.textContent ?? "").not.toMatch(/text-align:\s*justify/);
  });
});
