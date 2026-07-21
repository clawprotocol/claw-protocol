/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import {
  applyPaidProNoticeContactAuthority,
  assertPaidProNoticeContactAuthorityForFreeze,
} from "./paidProNoticeContactAuthority";
import { formatNoticeAddressLines } from "./paidProPartyNoticeDetails";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";
const RED_ADDR = "100 Commerce Way, Tulsa, OK 74103";
const HARBOR_ADDR = "250 Innovation Drive, Austin, TX 78701";

const TEST391_FULL_INTAKE = [
  `Create a consulting agreement between ${RED} and ${HARBOR}.`,
  `${RED}:`,
  "Sarah Mitchell, CEO",
  RED_EMAIL,
  RED_ADDR,
  `${HARBOR}:`,
  "Michael Torres, President",
  HARBOR_EMAIL,
  HARBOR_ADDR,
  "Texas law. Electronic signatures allowed.",
].join("\n");

function test391Draft(
  overrides?: Partial<{
    redEmail: string;
    harborEmail: string;
    redAddr: string;
    harborAddr: string;
  }>,
): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Texas",
    agreement_family: "consulting_agreement",
    parties: [
      {
        name: RED,
        role: "Client",
        email: overrides?.redEmail ?? RED_EMAIL,
        partyAddress: overrides?.redAddr ?? RED_ADDR,
      } as { name: string; role: string; email?: string; partyAddress?: string },
      {
        name: HARBOR,
        role: "Service Provider",
        email: overrides?.harborEmail ?? HARBOR_EMAIL,
        partyAddress: overrides?.harborAddr ?? HARBOR_ADDR,
      } as { name: string; role: string; email?: string; partyAddress?: string },
    ],
    purpose: "Logistics automation consulting and workflow implementation services.",
    payment_terms: "Fixed monthly fee.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

function test391Parties(overrides?: Parameters<typeof test391Draft>[0]) {
  const draft = test391Draft(overrides);
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: draft.parties?.[0]?.email ?? "",
    recipient2Email: draft.parties?.[1]?.email ?? "",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      (draft.parties?.[0] as { partyAddress?: string })?.partyAddress ?? "",
      (draft.parties?.[1] as { partyAddress?: string })?.partyAddress ?? "",
    ],
  }).parties;
}

function buildTest391CorpusWithEmailPlaceholders(): string {
  const operative = Array.from({ length: 12 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`).join(
    "\n",
  );
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is entered into by and between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    operative,
    "",
    "13. Notices",
    "13.1 Delivery. Notices must be in writing.",
    "13.2 Notice Addresses. Notices must be sent to:",
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

function repairThroughAcceptancePipeline(
  raw: string,
  intake: string,
  draft: ParsedDraftShape,
): string {
  const safe = applyAcceptedProCorpusSafeDisplay(raw, { draft, intakeText: intake });
  return assertPaidProNoticeContactAuthorityForFreeze(safe.text, {
    draft,
    intakeText: intake,
    surface: "test391_acceptance_pipeline",
  });
}

function noticesRegion(text: string): string {
  const start = text.search(/\bNotices\b/i);
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (start < 0) return text;
  return text.slice(start, witness >= 0 ? witness : text.length);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST391 — notice contact authority & optional contact display", () => {
  it("1) full intake contacts render real emails and multiline addresses with no [EMAIL_N]", () => {
    const draft = test391Draft();
    const parties = test391Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const raw = buildTest391CorpusWithEmailPlaceholders();
    const repaired = repairThroughAcceptancePipeline(raw, TEST391_FULL_INTAKE, draft);
    const region = noticesRegion(repaired);

    expect(region).toContain(`Email: ${RED_EMAIL}`);
    expect(region).toContain(`Email: ${HARBOR_EMAIL}`);
    expect(region).toContain("Address:");
    expect(region).toContain("100 Commerce Way");
    expect(region).toContain("Tulsa, OK 74103");
    expect(region).toContain("250 Innovation Drive");
    expect(region).toContain("Austin, TX 78701");
    expect(region).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(region).not.toMatch(/\[\s*ADDRESS_\d+\s*\]/i);
  });

  it("2) emails without addresses omit address blocks and never show address placeholders", () => {
    const draft = test391Draft({ redAddr: "", harborAddr: "" });
    const parties = test391Parties({ redAddr: "", harborAddr: "" });
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const raw = buildTest391CorpusWithEmailPlaceholders();
    const repaired = applyPaidProNoticeContactAuthority(raw, {
      draft,
      intakeText: TEST391_FULL_INTAKE.replace(RED_ADDR, "").replace(HARBOR_ADDR, ""),
    }).text;
    const region = noticesRegion(repaired);

    expect(region).toContain(RED_EMAIL);
    expect(region).toContain(HARBOR_EMAIL);
    expect(region).not.toMatch(/\[\s*ADDRESS_\d+\s*\]/i);
    expect(region).not.toMatch(/Address:\s*Not provided/i);
    expect(region).not.toMatch(/Address:\s*$/m);
  });

  it("3) addresses without emails omit email lines and never show email placeholders", () => {
    const draft = test391Draft({ redEmail: "", harborEmail: "" });
    const parties = test391Parties({ redEmail: "", harborEmail: "" });
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const intake = TEST391_FULL_INTAKE.replace(RED_EMAIL, "").replace(HARBOR_EMAIL, "");
    const raw = buildTest391CorpusWithEmailPlaceholders();
    const repaired = applyPaidProNoticeContactAuthority(raw, { draft, intakeText: intake }).text;
    const region = noticesRegion(repaired);

    expect(region).toContain("100 Commerce Way");
    expect(region).toContain("250 Innovation Drive");
    expect(region).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(region).not.toMatch(/Email:\s*Not provided/i);
    expect(region).not.toMatch(/Email:\s*$/m);
  });

  it("4) missing email and address omit contact lines without placeholder tokens", () => {
    const draft = test391Draft({
      redEmail: "",
      harborEmail: "",
      redAddr: "",
      harborAddr: "",
    });
    const parties = test391Parties({
      redEmail: "",
      harborEmail: "",
      redAddr: "",
      harborAddr: "",
    });
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const intake = `Create a consulting agreement between ${RED} and ${HARBOR}. Texas law.`;
    const raw = buildTest391CorpusWithEmailPlaceholders();
    const repaired = applyPaidProNoticeContactAuthority(raw, { draft, intakeText: intake }).text;
    const region = noticesRegion(repaired);

    expect(region).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(region).not.toMatch(/\[\s*ADDRESS_\d+\s*\]/i);
    expect(region).not.toMatch(/\bUNKNOWN\b/i);
    expect(region).not.toMatch(/\bTBD\b/i);
    expect(region).not.toMatch(/Email:\s*Not provided/i);
    expect(region).not.toMatch(/Address:\s*Not provided/i);
  });

  it("5) repaired acceptance body is the exact body frozen into paidProSourceOfTruth", () => {
    const draft = test391Draft();
    const parties = test391Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const raw = buildTest391CorpusWithEmailPlaceholders();
    markPaidProPipelineValidationPassed({ text: raw, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      draft,
      intakeText: TEST391_FULL_INTAKE,
    });

    const sot = getPaidProSourceOfTruthText();
    expect(sot).toBe(record.text);
    expect(sot).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(sot).toContain(RED_EMAIL);
    expect(sot).toContain(HARBOR_EMAIL);
    expect(sot).toContain("100 Commerce Way");
    expect(hashPaidProCorpus(sot)).not.toBe(hashPaidProCorpus(raw));
    expect(containsUnresolvedRenderTokens(sot)).toBe(false);
  });

  it("6) review, signer setup, and signing corpus surfaces share the same repaired body", () => {
    const draft = test391Draft();
    const parties = test391Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const raw = buildTest391CorpusWithEmailPlaceholders();
    const repaired = repairThroughAcceptancePipeline(raw, TEST391_FULL_INTAKE, draft);

    const review = applyPaidProReviewRenderSanitizer(repaired, parties, {
      intakeText: TEST391_FULL_INTAKE,
      draftPartyNames: [RED, HARBOR],
    }).text;
    const signing = finalizePaidProSigningCorpusText(repaired, parties, {
      intakeText: TEST391_FULL_INTAKE,
      draftPartyNames: [RED, HARBOR],
    }).text;

    expect(review).toContain(RED_EMAIL);
    expect(signing).toContain(RED_EMAIL);
    expect(review).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(signing).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(noticesRegion(review)).toContain(HARBOR_EMAIL);
    expect(noticesRegion(signing)).toContain(HARBOR_ADDR.split(",")[0]);
  });

  it("7) unresolved token bodies are blocked from authoritative freeze", () => {
    const draft = test391Draft({ redEmail: "", harborEmail: "", redAddr: "", harborAddr: "" });
    clearConsumedPaidProSignerMetadataAuthority();
    const unresolved = buildTest391CorpusWithEmailPlaceholders().replace(
      "This Agreement is entered into",
      "This Agreement between {{missing_entity}} and {{missing_counterparty}} is entered into",
    );
    const intake = `Create a consulting agreement between ${RED} and ${HARBOR}. Texas law.`;

    expect(() =>
      assertPaidProNoticeContactAuthorityForFreeze(unresolved, {
        draft,
        intakeText: intake,
        surface: "test391_freeze_block",
      }),
    ).toThrow(/paid-pro-notice-contact-authority-blocked/);
    expect(containsUnresolvedRenderTokens(unresolved)).toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("formatNoticeAddressLines splits US street/city/state for professional display", () => {
    expect(formatNoticeAddressLines(RED_ADDR)).toEqual([
      "100 Commerce Way",
      "Tulsa, OK 74103",
    ]);
  });
});

function hasPaidProSourceOfTruth(): boolean {
  return Boolean(getPaidProSourceOfTruthText()?.trim());
}
