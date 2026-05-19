import { describe, expect, it } from "vitest";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
const IRONCLAD_JOINT_ROLLOUT_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Main people involved:

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;
import {
  extractIntakeContacts,
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import { preserveFullLegalPartyNamesInOpeningAndSignatures } from "./paidProPartyNamePreserve";

const IRONCLAD_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
] as const;

function padOperative(core: string, targetLen = 26_000): string {
  const pad = "\n\nThe parties agree to cooperate in good faith on commercial terms. ".repeat(400);
  let t = core;
  while (t.length < targetLen) t += pad;
  return t;
}

describe("paidProIntakeContactSubstitution", () => {
  it("extracts five ordered contacts from Ironclad intake bullets", () => {
    const contacts = extractIntakeContacts(IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(contacts.length).toBe(5);
    expect(contacts[0].email).toBe(IRONCLAD_EMAILS[0]);
    expect(contacts[0].name).toMatch(/Ethan Cole/i);
    expect(contacts[4].email).toBe(IRONCLAD_EMAILS[4]);
  });

  it("substitutes [EMAIL_1]..[EMAIL_5] in Key Contacts section with intake emails", () => {
    const contacts = IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n");
    const body = padOperative(
      [
        "AGREEMENT",
        `Among ${IRONCLAD_PARTIES.join(", ")}.`,
        "KEY CONTACTS",
        contacts,
      ].join("\n"),
      25_000,
    );
    const sub = substitutePaidProIntakeContactPlaceholders(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, {
      surface: "test",
    });
    expect(sub.replacedEmailCount).toBe(5);
    for (const email of IRONCLAD_EMAILS) {
      expect(sub.text).toContain(email);
    }
    expect(sub.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
  });

  it("substitutes [SIGNER_EMAIL_1] and [PARTY_EMAIL_1] in signature block", () => {
    const body = `AGREEMENT\nKEY CONTACTS\n[SIGNER_EMAIL_1]\n[PARTY_EMAIL_1]\n`;
    const sub = substitutePaidProIntakeContactPlaceholders(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, {
      surface: "test",
    });
    expect(sub.text).toContain(IRONCLAD_EMAILS[0]);
    expect(sub.text).not.toMatch(/\[\s*SIGNER_EMAIL_1\s*\]/i);
  });

  it("leaves operative Notice email [EMAIL_1] fatal when no substitute applies in finalize", () => {
    const body =
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n\n2. NOTICES\nNotice email: [EMAIL_1] for correspondence.\n` +
      "x".repeat(4000);
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: "",
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /EMAIL/i.test(x))).toBe(true);
  });

  it("applyPaidProRenderPolish keeps exact emails when party names appear in email domains", () => {
    const contacts = IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n");
    const body = padOperative(
      [
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        contacts,
      ].join("\n"),
      20_000,
    );
    const polished = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });
    for (const email of IRONCLAD_EMAILS) {
      expect(polished.text).toContain(email);
    }
    expect(polished.text).not.toMatch(/@Ironclad Systems Group LLC/i);
    expect(polished.emailGuard.mutatedEmailCount).toBe(0);
  });

  it("finalize replaces numbered emails and preserves full legal party names in preamble", () => {
    const sig = IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n");
    const body = padOperative(
      [
        "AGREEMENT among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        sig,
      ].join("\n"),
      20_000,
    );
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    for (const email of IRONCLAD_EMAILS) {
      expect(fin.text).toContain(email);
    }
    expect(fin.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(fin.text).toContain("Ironclad Systems Group LLC");
    expect(fin.text).toContain("Harborline Data Solutions Inc.");
  });
});

describe("paidProPartyNamePreserve", () => {
  it("expands short party labels to full legal names in opening only", () => {
    const short = "AGREEMENT among Ironclad, Harborline, and VertexGrid Technologies LLC.";
    const out = preserveFullLegalPartyNamesInOpeningAndSignatures(
      short,
      IRONCLAD_PARTIES,
      IRONCLAD_JOINT_ROLLOUT_INTAKE,
    );
    expect(out).toContain("Ironclad Systems Group LLC");
    expect(out).toContain("Harborline Data Solutions Inc.");
  });
});
