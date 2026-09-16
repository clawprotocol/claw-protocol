import { describe, expect, it } from "vitest";
import {
  maskEmailAddresses,
  maskProtectedSpans,
  restoreExactIntakeEmails,
  textContainsCorruptedEntityEmail,
  unmaskEmailAddresses,
  unmaskProtectedSpans,
  type RestoreExactEmailsOptions,
} from "./paidProEmailMask";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { enforceUserVisibleRenderTokenAuthority } from "./userVisibleRenderTokenAuthority";

const INTAKE = `* Ethan — ethan.cole@ironcladsg.com
* Maya — maya.bennett@harborlinedata.com`;

const EMAILS = ["ethan.cole@ironcladsg.com", "maya.bennett@harborlinedata.com"] as const;

describe("paidProEmailMask", () => {
  it("masks and restores emails byte-for-byte with ASCII bracket tokens", () => {
    const raw = `Contact: ${EMAILS[0]} and ${EMAILS[1]}`;
    const { text: masked, emails } = maskEmailAddresses(raw);
    expect(masked).toContain("[[LDG_EMAIL_0]]");
    expect(masked).not.toContain(EMAILS[0]);
    const restored = unmaskEmailAddresses(masked, emails);
    expect(restored).toBe(raw);
  });

  it("does not wipe pre-existing LDG masks when unmask table is empty", () => {
    const alreadyMasked = "Email: [[LDG_EMAIL_0]]\nEmail: [[LDG_EMAIL_1]]";
    expect(unmaskEmailAddresses(alreadyMasked, [])).toBe(alreadyMasked);
  });

  it("does not let underscore-rich legacy masks break on word-boundary expansion", () => {
    const { text: masked, emails } = maskProtectedSpans(`Notify ${EMAILS[0]}`);
    expect(masked).toMatch(/\[\[LDG_EMAIL_0\]\]/);
    const partyExpandSim = masked.replace(/ironclad/gi, "Ironclad Systems Group LLC");
    const out = unmaskProtectedSpans(partyExpandSim, emails, []);
    expect(out).toBe(`Notify ${EMAILS[0]}`);
  });

  it("repairs corrupted entity domains via restoreExactIntakeEmails", () => {
    const corrupted = "ethan.cole@Harborline Data Solutions Inc.com";
    const { text, repairedCount } = restoreExactIntakeEmails(corrupted, [EMAILS[0]]);
    expect(text).toBe(EMAILS[0]);
    expect(repairedCount).toBe(1);
    expect(textContainsCorruptedEntityEmail(text)).toBe(false);
  });

  it("preserves exact emails through full render polish with recital and signature rewrite", () => {
    const parties = ["Ironclad Systems Group LLC", "Harborline Data Solutions Inc."] as const;
    const body = [
      "This Agreement is entered into by and between Ironclad and Harborline.",
      `Contacts: [EMAIL_1] [EMAIL_2]`,
      "IN WITNESS WHEREOF:",
      "Ironclad\nBy: ___",
      "Harborline\nBy: ___",
    ].join("\n");
    const out = applyPaidProRenderPolish(body, INTAKE, [...parties], { surface: "test" });
    expect(out.emailGuard.mutatedEmailCount).toBe(0);
    expect(out.emailGuard.finalExactEmailCount).toBe(2);
    expect(out.text).toContain(EMAILS[0]);
    expect(out.text).toContain(EMAILS[1]);
    expect(out.text).not.toMatch(/@Ironclad Systems Group LLC/i);
  });
});

describe("approved email changes survive rendering restoration", () => {
  const oak = "Oak Street Holdings LLC";
  const pine = "Pine Creek Manufacturing Inc.";
  const oldEmail = "legal@old-company.com";
  const newEmail = "legal@new-company.com";
  const proposedEmail = "legal@proposed-reviewer.example";
  const intake = [
    `Delaware supply agreement between ${oak} and ${pine}.`,
    `Notices: ${oldEmail}`,
    "purchasing@pine-creek.example",
  ].join("\n");

  function confirmedParties(clientEmail: string): PaidProSignerMetadataParty[] {
    return [
      {
        partyIndex: 0,
        partyLegalName: oak,
        signerEmail: clientEmail,
        signerName: "Avery Oak",
        signerTitle: "Manager",
        partyAddress: "1 Oak Street, Wilmington, DE 19801",
      },
      {
        partyIndex: 1,
        partyLegalName: pine,
        signerEmail: "purchasing@pine-creek.example",
        signerName: "Casey Pine",
        signerTitle: "President",
        partyAddress: "9 Pine Creek Rd, Wilmington, DE 19802",
      },
    ];
  }

  function approvedRevisionCorpus(clientEmail: string): string {
    return [
      `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
      `If to ${oak}: ${clientEmail}`,
      `If to ${pine}: purchasing@pine-creek.example`,
    ].join("\n");
  }

  it("keeps an approved replacement through polish and a second polish pass", () => {
    const corpus = approvedRevisionCorpus(newEmail);
    const parties = confirmedParties(newEmail);
    const first = applyPaidProRenderPolish(corpus, intake, [oak, pine], {
      surface: "approved_email_revision",
      skipCache: true,
      authorityParties: parties,
    });
    expect(first.text).toContain(newEmail);
    expect(first.text).not.toContain(oldEmail);
    const intakeOnly = applyPaidProRenderPolish(corpus, intake, [oak, pine], {
      surface: "approved_email_revision_intake_only",
      skipCache: true,
    });
    expect(intakeOnly.text).toContain(newEmail);
    expect(intakeOnly.text).not.toContain(oldEmail);
    const second = applyPaidProRenderPolish(first.text, intake, [oak, pine], {
      surface: "approved_email_revision",
      skipCache: true,
      authorityParties: parties,
    });
    expect(second.text).toBe(first.text);
    expect(second.text).toContain(newEmail);
    expect(second.text).not.toContain(oldEmail);
  });

  it("does not reassign distinct party addresses that share a local part", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const emails = [
      "legal@mail.stonebridge.example",
      "legal@ops.novapath.example",
      "legal@clearspring.example",
    ] as const;
    const threeIntake = [
      `Oklahoma license among ${stone}, ${nova}, and ${clear}.`,
      emails[0],
      emails[1],
      emails[2],
    ].join("\n");
    const document = [
      `This Agreement is among ${stone} ("Licensor"), ${nova} ("Platform"), and ${clear} ("Distributor").`,
      `If to ${stone}: ${emails[0]}`,
      `If to ${nova}: ${emails[1]}`,
      `If to ${clear}: ${emails[2]}`,
    ].join("\n");
    const parties: PaidProSignerMetadataParty[] = [
      { partyIndex: 0, partyLegalName: stone, signerEmail: emails[0], signerName: "Sandra Wells", signerTitle: "Managing Member", partyAddress: "" },
      { partyIndex: 1, partyLegalName: nova, signerEmail: emails[1], signerName: "Caleb Price", signerTitle: "CPO", partyAddress: "" },
      { partyIndex: 2, partyLegalName: clear, signerEmail: emails[2], signerName: "Maya Coleman", signerTitle: "President", partyAddress: "" },
    ];
    const out = applyPaidProRenderPolish(document, threeIntake, [stone, nova, clear], {
      surface: "shared_local_part_emails",
      skipCache: true,
      authorityParties: parties,
    });
    expect(out.text).toContain(emails[0]);
    expect(out.text).toContain(emails[1]);
    expect(out.text).toContain(emails[2]);
    expect(out.text.match(/legal@mail\.stonebridge\.example/g)?.length).toBeGreaterThanOrEqual(1);
    expect(out.text).not.toMatch(
      /If to NovaPath Learning Inc[\s\S]{0,40}legal@mail\.stonebridge\.example/,
    );
    const restored = restoreExactIntakeEmails(document, [...emails]);
    expect(restored.text).toBe(document);
    expect(restored.repairedCount).toBe(0);
  });

  it("repairs a corrupted entity-domain address back to the confirmed revision email", () => {
    const corrupted = `If to ${oak}: legal@Oak Street Holdings LLC.com`;
    const confirmed = confirmedParties(newEmail);
    const { text, repairedCount } = restoreExactIntakeEmails(corrupted, [
      newEmail,
      "purchasing@pine-creek.example",
    ]);
    expect(repairedCount).toBeGreaterThan(0);
    expect(text).toContain(newEmail);
    expect(text).not.toMatch(/Oak Street Holdings LLC\.com/i);
    const gated = enforceUserVisibleRenderTokenAuthority(
      [
        `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
        corrupted,
        `If to ${pine}: purchasing@pine-creek.example`,
      ].join("\n"),
      { intakeRaw: intake, parties: confirmed, partyNames: [oak, pine], surface: "corrupt_email_repair" },
    );
    expect(gated.text).toContain(newEmail);
    expect(gated.text).not.toMatch(/Oak Street Holdings LLC\.com/i);
  });

  it("does not treat an unaccepted preview proposal as the restore source", () => {
    const preview = approvedRevisionCorpus(proposedEmail);
    const stillConfirmed = confirmedParties(oldEmail);
    const gated = enforceUserVisibleRenderTokenAuthority(preview, {
      intakeRaw: intake,
      parties: stillConfirmed,
      partyNames: [oak, pine],
      surface: "unaccepted_email_proposal",
    });
    expect(gated.text).toContain(oldEmail);
    expect(gated.text).not.toContain(proposedEmail);
    const fromPreviewOnly = restoreExactIntakeEmails(preview, [proposedEmail]);
    expect(fromPreviewOnly.text).toBe(preview);
  });
});

describe("restoreExactIntakeEmails — replacement boundaries", () => {
  function twice(text: string, emails: readonly string[], opts?: RestoreExactEmailsOptions) {
    const first = restoreExactIntakeEmails(text, emails, opts);
    const second = restoreExactIntakeEmails(first.text, emails, opts);
    return { first, second };
  }

  it("preserves a correct confirmed email and the following deadline clause", () => {
    const text = "Send notices to legal@new-company.com within five days.";
    const { first, second } = twice(text, ["legal@new-company.com"]);
    expect(first.text).toBe(text);
    expect(second.text).toBe(text);
    expect(first.repairedCount).toBe(0);
  });

  it("preserves a well-formed revised email and surrounding text when stale intake is supplied", () => {
    const text = "Send notices to legal@new-company.com within five days.";
    const { first, second } = twice(text, ["legal@old-company.com"]);
    expect(first.text).toBe(text);
    expect(second.text).toBe(text);
  });

  it("preserves two emails on one line joined by and copy", () => {
    const text =
      "Send notices to legal@new-company.com and copy purchasing@pine-creek.example within five days.";
    const { first, second } = twice(text, [
      "legal@new-company.com",
      "purchasing@pine-creek.example",
    ]);
    expect(first.text).toBe(text);
    expect(second.text).toBe(text);
  });

  it("repairs only an identifiable corrupted address and keeps following wording", () => {
    const text =
      "Send notices to ethan.cole@Harborline Data Solutions Inc.com within five days.";
    const expected =
      "Send notices to ethan.cole@ironcladsg.com within five days.";
    const { first, second } = twice(text, ["ethan.cole@ironcladsg.com"]);
    expect(first.text).toBe(expected);
    expect(second.text).toBe(expected);
  });

  it("keeps surrounding deadline text through the render-token restore path", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const body = [
      `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
      "Send notices to legal@new-company.com within five days.",
    ].join("\n");
    const intake = [
      `Delaware supply agreement between ${oak} and ${pine}.`,
      "legal@old-company.com",
    ].join("\n");
    const parties: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: oak,
        signerEmail: "legal@new-company.com",
        signerName: "Avery Oak",
        signerTitle: "Manager",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: pine,
        signerEmail: "purchasing@pine-creek.example",
        signerName: "Casey Pine",
        signerTitle: "President",
        partyAddress: "",
      },
    ];
    const out = enforceUserVisibleRenderTokenAuthority(body, {
      intakeRaw: intake,
      parties,
      partyNames: [oak, pine],
      surface: "email_restore_deadline_clause",
      skipNoticeRepair: true,
    });
    expect(out.text).toContain("Send notices to legal@new-company.com within five days.");
  });
});
