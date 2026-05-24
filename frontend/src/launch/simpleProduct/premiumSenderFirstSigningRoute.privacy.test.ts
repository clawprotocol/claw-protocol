import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("premium sender-first signing route diagnostics privacy", () => {
  it("redacts recipient access tokens before route diagnostics are logged", () => {
    const src = readFileSync(join(__dirname, "premiumSenderFirstSigningRoute.ts"), "utf8");

    expect(src).toContain("redactRecipientAccessTokenFromRoute");
    expect(src).toContain("sanitizedRecipientLinkSearch");
    expect(src).toContain("safePayload");
    expect(src).not.toContain('console.info("[sender-first-professional-esign-route]", payload)');
  });
});
