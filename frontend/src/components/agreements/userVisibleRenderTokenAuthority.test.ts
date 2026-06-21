import { describe, expect, it } from "vitest";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import {
  containsUnresolvedRenderTokens,
  enforceUserVisibleRenderTokenAuthority,
  resolveRenderTokenFromAuthority,
  scanUnresolvedRenderTokens,
} from "./userVisibleRenderTokenAuthority";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";

const TEST389_INTAKE = `Create a consulting agreement between ${RED} and ${HARBOR}.
Sarah Mitchell — CEO at Red Mesa — ${RED_EMAIL}
Michael Torres — President at Harbor Peak — ${HARBOR_EMAIL}
Texas law. Electronic signatures allowed.`;

function test389Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: RED_EMAIL,
    recipient2Email: HARBOR_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "100 Mesa Drive, Austin, TX 78701",
      "200 Peak Lane, Dallas, TX 75201",
    ],
  }).parties;
}

function test389NoticesBody() {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    ...Array.from({ length: 12 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "10. Notices",
    "10.2 Notice Addresses.",
    "",
    `If to ${RED}:`,
    RED,
    "Attn: Sarah Mitchell, CEO",
    "Email: [EMAIL_1]",
    "Address: [ADDRESS_1]",
    "",
    `If to ${HARBOR}:`,
    HARBOR,
    "Attn: Michael Torres, President",
    "Email: [EMAIL_2]",
    "Address: [ADDRESS_2]",
    "",
    "IN WITNESS WHEREOF.",
    `CLIENT: ${RED}`,
    "Name: [SIGNER_NAME_1]",
    `SERVICE PROVIDER: ${HARBOR}`,
    "Name: [SIGNER_NAME_2]",
  ].join("\n");
}

function padLong(body: string, minLen = 28_000): string {
  const pad = "\n\nCooperation clause. ".repeat(500);
  let t = body;
  while (t.length < minLen) t += pad;
  return t;
}

describe("TEST389 — user-visible render token authority", () => {
  it("Test389 scenario: resolves notice emails from intake + metadata", () => {
    const parties = test389Parties();
    const out = enforceUserVisibleRenderTokenAuthority(test389NoticesBody(), {
      intakeRaw: TEST389_INTAKE,
      parties,
      partyNames: [RED, HARBOR],
      surface: "test389",
    });
    expect(out.ok).toBe(true);
    expect(out.text).toContain(RED_EMAIL);
    expect(out.text).toContain(HARBOR_EMAIL);
    expect(out.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("Case A — authority only in intake", () => {
    const out = enforceUserVisibleRenderTokenAuthority(
      `Notices\nIf to Client:\nEmail: [EMAIL_1]\nIf to Provider:\nEmail: [EMAIL_2]`,
      { intakeRaw: TEST389_INTAKE, partyNames: [RED, HARBOR], surface: "case_a" },
    );
    expect(out.text).toContain(RED_EMAIL);
    expect(out.text).toContain(HARBOR_EMAIL);
    expect(out.ok).toBe(true);
  });

  it("Case B — authority only in signer metadata", () => {
    const parties = test389Parties();
    const out = enforceUserVisibleRenderTokenAuthority(
      `Notices\nIf to ${RED}:\nEmail: [EMAIL_1]\nIf to ${HARBOR}:\nEmail: [EMAIL_2]`,
      { intakeRaw: "", parties, surface: "case_b" },
    );
    expect(out.text).toContain(RED_EMAIL);
    expect(out.text).toContain(HARBOR_EMAIL);
    expect(out.ok).toBe(true);
  });

  it("Case C — authority from labeled intake blocks", () => {
    const labeledIntake = [
      "Party 1",
      `Legal Entity: ${RED}`,
      `Signer: Sarah Mitchell`,
      `Title: CEO`,
      `Email: ${RED_EMAIL}`,
      `Address: 100 Mesa Drive, Austin, TX`,
      "",
      "Party 2",
      `Legal Entity: ${HARBOR}`,
      `Signer: Michael Torres`,
      `Title: President`,
      `Email: ${HARBOR_EMAIL}`,
      `Address: 200 Peak Lane, Dallas, TX`,
    ].join("\n");
    const out = enforceUserVisibleRenderTokenAuthority(
      `Notices\nEmail: [EMAIL_1]\nEmail: [EMAIL_2]`,
      { intakeRaw: labeledIntake, surface: "case_c" },
    );
    expect(out.text).toContain(RED_EMAIL);
    expect(out.text).toContain(HARBOR_EMAIL);
    expect(out.ok).toBe(true);
  });

  it("Case D — authority missing blocks progression", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const out = enforceUserVisibleRenderTokenAuthority(
      `Agreement between {{missing_entity}} and {{missing_counterparty}}.`,
      { intakeRaw: "Generic services agreement.", surface: "case_d", blockOnUnresolved: true },
    );
    expect(out.blocked).toBe(true);
    expect(out.ok).toBe(false);
    expect(out.unresolvedTokens.length).toBeGreaterThan(0);
  });

  it("Case E — [ADDRESS_1] resolves from authority", () => {
    const parties = test389Parties();
    const out = enforceUserVisibleRenderTokenAuthority(`Notice address: [ADDRESS_1]`, {
      parties,
      intakeRaw: TEST389_INTAKE,
      surface: "case_e",
    });
    expect(out.text).toContain("100 Mesa Drive");
    expect(out.text).not.toMatch(/\[\s*ADDRESS_1\s*\]/i);
  });

  it("Case F — [SIGNER_NAME_2] resolves from authority", () => {
    const parties = test389Parties();
    const out = enforceUserVisibleRenderTokenAuthority(`Attn: [SIGNER_NAME_2]`, {
      parties,
      surface: "case_f",
    });
    expect(out.text).toContain("Michael Torres");
    expect(out.text).not.toMatch(/\[\s*SIGNER_NAME_2\s*\]/i);
  });

  it("Case G — {{company}} resolves from party authority", () => {
    const parties = test389Parties();
    const resolved = resolveRenderTokenFromAuthority("{{company}}", { parties });
    expect(resolved).toBe(RED);
    const out = enforceUserVisibleRenderTokenAuthority(`Between {{company}} and counterparty.`, {
      parties,
      surface: "case_g",
    });
    expect(out.text).toContain(RED);
    expect(out.text).not.toMatch(/\{\{\s*company\s*\}\}/i);
  });

  it("Case H — ${venue} resolves from intake jurisdiction", () => {
    const parties = test389Parties();
    const resolved = resolveRenderTokenFromAuthority("${venue}", {
      parties,
      intakeRaw: TEST389_INTAKE,
    });
    expect(resolved).toMatch(/Texas/i);
    const out = enforceUserVisibleRenderTokenAuthority(`Governing law: ${"${venue}"}.`, {
      parties,
      intakeRaw: TEST389_INTAKE,
      surface: "case_h",
    });
    expect(out.text).toMatch(/Texas/i);
    expect(out.text).not.toMatch(/\$\{\s*venue\s*\}/);
  });

  it("acceptance gate blocks long-corpus tail nonfatal [EMAIL_N] when authority exists", () => {
    const body = padLong(test389NoticesBody());
    expect(scanUnresolvedRenderTokens(body).some((m) => /EMAIL_1/i.test(m.token))).toBe(true);
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: TEST389_INTAKE,
      partyNames: [RED, HARBOR],
      surface: "test389_finalize",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.text).toContain(RED_EMAIL);
    expect(fin.text).toContain(HARBOR_EMAIL);
    expect(containsUnresolvedRenderTokens(fin.text)).toBe(false);
  });

  it("review and signing surfaces share terminal token authority", () => {
    const parties = test389Parties();
    const body = test389NoticesBody();
    const review = applyPaidProReviewRenderSanitizer(body, parties, {
      intakeText: TEST389_INTAKE,
      draftPartyNames: [RED, HARBOR],
    });
    const signing = finalizePaidProSigningCorpusText(body, parties, {
      intakeText: TEST389_INTAKE,
      draftPartyNames: [RED, HARBOR],
    });
    for (const text of [review.text, signing.text]) {
      expect(containsUnresolvedRenderTokens(text)).toBe(false);
      expect(text).toContain(RED_EMAIL);
      expect(text).toContain(HARBOR_EMAIL);
    }
  });
});
