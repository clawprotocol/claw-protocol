import { describe, expect, it } from "vitest";
import {
  maskEmailAddresses,
  maskProtectedSpans,
  restoreExactIntakeEmails,
  textContainsCorruptedEntityEmail,
  unmaskEmailAddresses,
  unmaskProtectedSpans,
} from "./paidProEmailMask";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";

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
