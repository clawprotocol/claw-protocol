/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";

const stylesSrc = readFileSync(join(__dirname, "PremiumAgreementReadonlyView.tsx"), "utf8");

describe("PaidProCanonicalPlainReviewDocument", () => {
  afterEach(() => cleanup());

  it("renders numbered section headings with premium-doc-section-heading class", () => {
    const { container } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={"MUTUAL CONSULTING AGREEMENT\n\n1. SCOPE OF SERVICES\n\nProvider delivers services."}
        tailPaddingClass="pb-12"
        compactTopPadding={false}
        authoritativeSource="paidProSourceOfTruth"
      />,
    );
    const heading = container.querySelector("h2.premium-doc-section-heading");
    expect(heading?.textContent).toBe("1. SCOPE OF SERVICES");
    expect(stylesSrc).toMatch(/h2\.premium-doc-section-heading\{[^}]*letter-spacing:normal/);
    expect(stylesSrc).not.toMatch(/\.premium-readonly-doc h2\{[^}]*letter-spacing:0\.14em/);
  });
});
