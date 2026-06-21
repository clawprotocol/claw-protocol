import { describe, expect, it } from "vitest";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import {
  containsUserVisiblePlaceholders,
  enforceProfessionalOutputIntegrity,
  hydrateUserVisibleContactPlaceholders,
} from "./professionalOutputIntegrity";
import {
  resolveAuthoritativeEmailForContactSlot,
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";

const TEST388_INTAKE = `Create a consulting agreement between ${RED} and ${HARBOR}.
Sarah Mitchell — CEO at Red Mesa — ${RED_EMAIL}
Michael Torres — President at Harbor Peak — ${HARBOR_EMAIL}
Texas law. Electronic signatures allowed.`;

function test388Parties() {
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

function test388NoticesCorpusWithPlaceholders() {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "10. Notices",
    "",
    "10.1 Delivery. Notices must be in writing.",
    "",
    "10.2 Notice Addresses. Notices must be sent to the following addresses:",
    "",
    `If to ${RED}:`,
    RED,
    "Attn: Sarah Mitchell, CEO",
    `Email: [EMAIL_1]`,
    "Address: 100 Mesa Drive, Austin, TX 78701",
    "",
    `If to ${HARBOR}:`,
    HARBOR,
    "Attn: Michael Torres, President",
    `Email: [EMAIL_2]`,
    "Address: 200 Peak Lane, Dallas, TX 75201",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

describe("TEST388 — professional output integrity", () => {
  it("resolveAuthoritativeEmailForContactSlot prefers intake then signer metadata", () => {
    const parties = test388Parties();
    expect(resolveAuthoritativeEmailForContactSlot(1, TEST388_INTAKE, parties)).toBe(RED_EMAIL);
    expect(resolveAuthoritativeEmailForContactSlot(2, TEST388_INTAKE, parties)).toBe(HARBOR_EMAIL);
    expect(resolveAuthoritativeEmailForContactSlot(1, "", parties)).toBe(RED_EMAIL);
    expect(resolveAuthoritativeEmailForContactSlot(2, "", parties)).toBe(HARBOR_EMAIL);
  });

  it("substitutes [EMAIL_1]/[EMAIL_2] in operative notices when authority parties exist but intake is empty", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const sub = substitutePaidProIntakeContactPlaceholders(body, "", {
      surface: "test388",
      authorityParties: parties,
    });
    expect(sub.replacedEmailCount).toBe(2);
    expect(sub.text).toContain(RED_EMAIL);
    expect(sub.text).toContain(HARBOR_EMAIL);
    expect(sub.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("substitutes operative notice placeholders when intake has emails but operative misuse gate would have blocked", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const sub = substitutePaidProIntakeContactPlaceholders(body, TEST388_INTAKE, {
      surface: "test388",
      authorityParties: parties,
    });
    expect(sub.text).toContain(RED_EMAIL);
    expect(sub.text).toContain(HARBOR_EMAIL);
    expect(sub.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("enforceProfessionalOutputIntegrity hydrates placeholders from authority without flattening notice stanzas", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const out = enforceProfessionalOutputIntegrity(body, {
      intakeRaw: TEST388_INTAKE,
      parties,
      surface: "test388",
    });
    expect(out.placeholdersRemaining).toBe(false);
    expect(out.text).toContain(RED_EMAIL);
    expect(out.text).toContain(HARBOR_EMAIL);
    expect(out.text).toMatch(/^If to Red Mesa Logistics LLC:/m);
    expect(out.text).toMatch(/^If to Harbor Peak Automation LLC:/m);
    expect(out.text).toContain("10.2 Notice Addresses");
    expect(out.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("repairIncompleteIfToNoticeStanzas rejects placeholder tokens and rebuilds from authority", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const repaired = repairIncompleteIfToNoticeStanzas(body, parties);
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.text).toContain(RED_EMAIL);
    expect(repaired.text).toContain(HARBOR_EMAIL);
    expect(repaired.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("applyPaidProReviewRenderSanitizer removes notice email placeholders on review surface", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const sanitized = applyPaidProReviewRenderSanitizer(body, parties, {
      intakeText: TEST388_INTAKE,
      draftPartyNames: [RED, HARBOR],
    });
    expect(containsUserVisiblePlaceholders(sanitized.text)).toBe(false);
    expect(sanitized.text).toContain(RED_EMAIL);
    expect(sanitized.text).toContain(HARBOR_EMAIL);
    expect(sanitized.text).toContain(RED);
    expect(sanitized.text).toContain(HARBOR);
    expect(sanitized.text).toMatch(/10\.\s*Notices/i);
  });

  it("finalizePaidProSigningCorpusText removes notice email placeholders on signing surface", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const finalized = finalizePaidProSigningCorpusText(body, parties, {
      intakeText: TEST388_INTAKE,
      draftPartyNames: [RED, HARBOR],
    });
    expect(containsUserVisiblePlaceholders(finalized.text)).toBe(false);
    expect(finalized.text).toContain(RED_EMAIL);
    expect(finalized.text).toContain(HARBOR_EMAIL);
    expect(finalized.repairs.some((r) => /output_integrity|notice/i.test(r))).toBe(true);
  });

  it("hydrateUserVisibleContactPlaceholders preserves party legal names and signer titles", () => {
    const parties = test388Parties();
    const body = test388NoticesCorpusWithPlaceholders();
    const hydrated = hydrateUserVisibleContactPlaceholders(body, TEST388_INTAKE, parties, "test388");
    expect(hydrated.text).toContain("Sarah Mitchell");
    expect(hydrated.text).toContain("Michael Torres");
    expect(hydrated.text).toContain("CEO");
    expect(hydrated.text).toContain("President");
    expect(hydrated.text).toContain(RED);
    expect(hydrated.text).toContain(HARBOR);
  });
});
