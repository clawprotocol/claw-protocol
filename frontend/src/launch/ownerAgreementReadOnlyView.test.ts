import { describe, expect, it } from "vitest";
import {
  buildOwnerAgreementReadOnlyPath,
  plainCorpusToReadOnlyPreviewHtml,
} from "./ownerAgreementReadOnlyView";

describe("ownerAgreementReadOnlyView", () => {
  it("builds read-only owner agreement path", () => {
    expect(buildOwnerAgreementReadOnlyPath("ag-1")).toBe("/app/agreements/ag-1/view");
  });

  it("escapes plain corpus into read-only preview html", () => {
    const html = plainCorpusToReadOnlyPreviewHtml("Payment <within> thirty days");
    expect(html).toContain("Payment &lt;within&gt; thirty days");
    expect(html).toContain("Draft Agreement (non-binding template)");
  });
});
