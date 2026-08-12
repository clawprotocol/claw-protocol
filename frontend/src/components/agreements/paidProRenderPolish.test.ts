import { describe, expect, it } from "vitest";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import {
  substitutePaidProIntakeContactPlaceholders,
} from "./paidProIntakeContactSubstitution";
import {
  preserveFullLegalPartyNamesInOpeningAndSignatures,
} from "./paidProPartyNamePreserve";
import { applyPaidProRenderPolish, verifyIntakeEmailsPreserved } from "./paidProRenderPolish";

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

describe("applyPaidProRenderPolish", () => {
  it("preserves exact intake emails and never injects legal entity text into domains", () => {
    const contacts = IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n");
    const body = padOperative(
      [
        "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        contacts,
        "IN WITNESS WHEREOF:",
        "Ironclad\nBy: _________________________",
        "Harborline\nBy: _________________________",
        "Northwind\nBy: _________________________",
        "Silver Mesa\nBy: _________________________",
        "VertexGrid\nBy: _________________________",
      ].join("\n"),
      25_000,
    );

    const polished = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });

    expect(polished.contactSub.replacedEmailCount).toBe(5);
    expect(polished.emailGuard.mutatedEmailCount).toBe(0);

    for (const email of IRONCLAD_EMAILS) {
      expect(polished.text).toContain(email);
    }
    expect(polished.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(polished.text).not.toMatch(/@Ironclad Systems Group LLC/i);
    expect(polished.text).not.toMatch(/@Harborline Data Solutions Inc\./i);
  });

  it("opening recital in first 1,000 chars uses full legal party names", () => {
    /**
     * Behavioral contract (updated with role-defined recital polish):
     * - OLD: short trade-name aliases in parens, e.g. Ironclad Systems Group LLC (“Ironclad”)
     * - NEW: full legal names with role-defined terms, e.g. Ironclad Systems Group LLC (“Client”)
     * Full legal names must appear; the short comma-separated trade-name list must not remain.
     */
    const body = padOperative(
      "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.\nKEY CONTACTS\n[EMAIL_1]\n",
      20_000,
    );
    const { text } = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });
    const opening = text.slice(0, 1200);
    for (const party of IRONCLAD_PARTIES) {
      expect(opening).toContain(party);
    }
    expect(opening).toMatch(/\(\s*[“"](?:Client|Service Provider|Party)[”"]\s*\)/i);
    expect(opening).not.toMatch(/among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid/i);
  });

  it("strips manual signature grids; full legal names stay in KEY CONTACTS not witness tail", () => {
    const body = padOperative(
      [
        `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.`,
        "KEY CONTACTS",
        IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n"),
        "IN WITNESS WHEREOF:",
        "Ironclad\nBy: _________________________",
        "Harborline\nBy: _________________________",
        "Northwind\nBy: _________________________",
        "Silver Mesa\nBy: _________________________",
        "VertexGrid\nBy: _________________________",
      ].join("\n"),
      22_000,
    );
    const { text } = applyPaidProRenderPolish(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });
    const contacts = text.slice(text.indexOf("KEY CONTACTS"), text.search(/IN WITNESS WHEREOF/i));
    for (const party of IRONCLAD_PARTIES) {
      expect(contacts).toContain(party);
    }
    const sig = text.slice(text.search(/IN WITNESS WHEREOF/i));
    expect(sig).toMatch(/LawDog signing workflow/i);
    expect(sig).not.toMatch(/\nIronclad\nBy:/);
    expect(sig).not.toMatch(/\nVertexGrid\nBy:/);
    expect(sig).not.toContain("Signatory 1");
  });

  it("party expansion after email substitution does not corrupt domains (regression)", () => {
    const body = padOperative(
      [
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "KEY CONTACTS",
        IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`).join("\n\n"),
      ].join("\n"),
      18_000,
    );
    const sub = substitutePaidProIntakeContactPlaceholders(body, IRONCLAD_JOINT_ROLLOUT_INTAKE, {
      surface: "test",
    });
    const expanded = preserveFullLegalPartyNamesInOpeningAndSignatures(
      sub.text,
      [...IRONCLAD_PARTIES],
      IRONCLAD_JOINT_ROLLOUT_INTAKE,
    );
    for (const email of IRONCLAD_EMAILS) {
      expect(expanded).toContain(email);
    }
    expect(verifyIntakeEmailsPreserved(IRONCLAD_JOINT_ROLLOUT_INTAKE, expanded).mutatedEmailCount).toBe(0);
  });

  it("finalize keeps operative payment placeholders fatal and substitutes contact emails", () => {
    const body = padOperative(
      [
        "AGREEMENT among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "2. PAYMENT\nFees: [INSERT PAYMENT TERMS HERE].\n",
        "KEY CONTACTS\n[EMAIL_1]\n[EMAIL_2]\n[EMAIL_3]\n[EMAIL_4]\n[EMAIL_5]",
      ].join("\n"),
      20_000,
    );
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((t) => /PAYMENT/i.test(t))).toBe(true);
    for (const email of IRONCLAD_EMAILS) {
      expect(fin.text).toContain(email);
    }
  });
});
