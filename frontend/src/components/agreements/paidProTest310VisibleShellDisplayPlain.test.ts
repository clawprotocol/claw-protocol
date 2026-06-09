import { afterEach, describe, expect, it } from "vitest";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resolveCanonicalPlainForVisibleShell,
} from "./paidProVisibleDocumentShell";
import { resetPaidProTest310DisplaySourceLogsForTests } from "./paidProFirstReviewDisplayAuthority";

const CANONICAL_PLAIN = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "1. SCOPE OF SERVICES",
  "Provider delivers services as described.",
  "",
  ...Array.from({ length: 34 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

describe("Test310 visible shell display plain routing", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProTest310DisplaySourceLogsForTests();
  });

  it("resolveCanonicalPlainForVisibleShell uses review render plain when SoT present", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const resolved = resolveCanonicalPlainForVisibleShell({
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
    });
    expect(resolved.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(resolved.source).toBe("paidProReviewRenderPlain");
    expect(resolved.plain).toContain("MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT");
  });
});
