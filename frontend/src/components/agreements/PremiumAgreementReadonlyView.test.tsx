/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";

const componentSrc = readFileSync(join(__dirname, "PremiumAgreementReadonlyView.tsx"), "utf8");
const htmlSrc = readFileSync(join(__dirname, "premiumAgreementDocumentHtml.ts"), "utf8");

describe("PremiumAgreementReadonlyView mobile readability", () => {
  afterEach(() => cleanup());

  it("does not use text-align justify on contract paragraphs", () => {
    expect(componentSrc).not.toMatch(/text-align:\s*justify/);
    expect(componentSrc).not.toContain("text-justify");
    expect(htmlSrc).not.toMatch(/text-align:\s*justify/);
  });

  it("uses left-aligned paragraphs with normal word spacing", () => {
    expect(componentSrc).toContain("text-align:left");
    expect(componentSrc).toContain("word-spacing:normal");
  });

  it("section headings use legal typography without decorative label tracking", () => {
    expect(componentSrc).toContain("h2.premium-doc-section-heading");
    expect(componentSrc).toMatch(/h2\.premium-doc-section-heading\{[^}]*letter-spacing:normal/);
    expect(componentSrc).toMatch(/h2\.premium-doc-section-heading\{[^}]*text-transform:none/);
    expect(componentSrc).not.toMatch(/h2\.premium-doc-section-heading\{[^}]*letter-spacing:0\.14em/);
    expect(componentSrc).not.toMatch(/\.premium-readonly-doc h2\{[^}]*letter-spacing:0\.14em/);
    expect(htmlSrc).toContain('class="premium-doc-section-heading"');
  });

  it("preserves agreement title styling independently from section headings", () => {
    expect(componentSrc).toMatch(/\.premium-readonly-doc h1\{[^}]*letter-spacing:0\.04em/);
    expect(componentSrc).toMatch(/\.premium-readonly-doc h1\{[^}]*text-transform:uppercase/);
  });

  it("renders readonly document without justify utility classes", () => {
    const { container } = render(
      <PremiumAgreementReadonlyView html="<p>Test paragraph for mobile layout.</p>" />,
    );
    expect(container.querySelector(".text-justify")).toBeNull();
    const style = container.querySelector("style");
    expect(style?.textContent ?? "").not.toMatch(/text-align:\s*justify/);
  });

  it("fullDocumentFlow removes nested scroll clipping from readonly article", () => {
    const { getByTestId } = render(
      <PremiumAgreementReadonlyView html="<p>Full paid Pro body.</p>" fullDocumentFlow />,
    );
    const article = getByTestId("premium-agreement-readonly-article");
    expect(article.className).toContain("overflow-visible");
    expect(article.className).not.toContain("overflow-y-auto");
    expect(article.className).not.toContain("max-h-[");
  });

  it("compactDocumentTopPadding enables mobile paper containment attrs and padding", () => {
    const { getByTestId } = render(
      <PremiumAgreementReadonlyView
        html="<h1>CONSULTING AND IMPLEMENTATION AGREEMENT</h1>"
        fullDocumentFlow
        compactDocumentTopPadding
      />,
    );
    const article = getByTestId("premium-agreement-readonly-article");
    expect(article.getAttribute("data-paid-pro-review-paper")).toBe("true");
    expect(article.className).toContain("max-[480px]:px-4");
    expect(article.className).toContain("overflow-x-hidden");
    expect(componentSrc).toContain("@media (max-width:480px)");
  });
});
