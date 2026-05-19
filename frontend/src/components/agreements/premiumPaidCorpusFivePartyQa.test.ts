import { describe, expect, it } from "vitest";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  rejectPremiumBodyForProRender,
  rejectPremiumDegradedFiller,
} from "./premiumFullDraftClientAcceptance";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";

const QA_SAAS_RESELLER_INTAKE =
  "Create a SaaS reseller and white-label services agreement between Redwood Peak Ventures LLC, Atlas Harbor Technologies Inc., Meridian Workforce Group LLC, Prairie Signal Holdings LP, and NovaGrid Systems LLC. Scope includes white-label deployment of workflow automation software, API integrations, and enterprise data protections. Total fee $124,750. Governing law Delaware. Include confidentiality, indemnification, and electronic signatures.";

/** Production Ironclad / 5-party joint rollout intake (Texas law). */
export const IRONCLAD_JOINT_ROLLOUT_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

Main people involved:

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com

The deal should cover white-label AI workflow software, API integrations, onboarding and migration help, analytics dashboards, monitoring, support, and ongoing maintenance.

Total contract value is $187,500 paid over 6 milestone payments tied to deployment stages and launch targets.

Initial term should be 24 months with automatic yearly renewal unless someone gives 45 days notice.

Use Texas law.

Please include normal enterprise protections like confidentiality, cybersecurity/data protection obligations, IP ownership, liability limits, indemnification, uptime/SLA expectations, dispute resolution, non-solicitation/non-circumvention, audit rights, force majeure, termination rights, and electronic signatures.`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

const FIVE_PARTIES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Meridian Workforce Group LLC",
  "Prairie Signal Holdings LP",
  "NovaGrid Systems LLC",
] as const;

const FIVE_SIGNERS = ["Ethan Cole", "Maya Bennett", "Lucas Reed", "Olivia Hart", "Adrian Vale"] as const;

function padOperative(core: string, targetLen = 26_000): string {
  const pad = "\n\nThe parties agree to cooperate in good faith on commercial terms. ".repeat(400);
  let t = core;
  while (t.length < targetLen) t += pad;
  return t;
}

function buildFivePartyPaidCorpus(opts?: { signatureBracketStubs?: boolean }): string {
  const partyBlock = FIVE_PARTIES.join(", ");
  const signerLines = FIVE_PARTIES.map((p, i) => {
    const person = FIVE_SIGNERS[i];
    if (opts?.signatureBracketStubs) {
      return `${p}\nBy: [SIGNATURE]\nName: [NAME] — ${person}\nTitle: [TITLE]\nDate: [DATE]\nEmail: [EMAIL]`;
    }
    return `${p}\nBy: _________________________\nName: ${person}\nTitle: Authorized Signatory`;
  }).join("\n\n");

  const core = [
    "SAAS RESELLER AND WHITE-LABEL SERVICES AGREEMENT",
    "",
    `This Agreement is entered into among ${partyBlock}.`,
    "",
    "1. Scope. White-label deployment, API integrations, analytics, and maintenance.",
    "2. Fees. Total project fee of $124,750 across milestone payments.",
    "3. Confidentiality. Mutual protection of confidential information and trade secrets.",
    "4. Indemnification. Commercially reasonable mutual indemnities.",
    "5. Governing Law. Laws of the State of Delaware.",
    "",
    "IN WITNESS WHEREOF:",
    signerLines,
  ].join("\n");

  return padOperative(core);
}

describe("five-party paid Pro corpus acceptance (production QA)", () => {
  it("accepts long paid corpus with five real entities and signers", () => {
    const body = buildFivePartyPaidCorpus();
    const intake = QA_SAAS_RESELLER_INTAKE;
    expect(rejectPremiumDegradedFiller(body).ok).toBe(true);
    const acc = rejectPremiumBodyForProRender(body, {
      intakeLower: intake.toLowerCase(),
      intakeText: intake,
      partyNames: [...FIVE_PARTIES],
    });
    expect(acc.ok, acc.reasons.join("; ")).toBe(true);
    const v = validatePaidProOutput({
      text: body,
      rawIntake: intake,
      draft: { parties: FIVE_PARTIES.map((name) => ({ name, role: "party" })) } as never,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join("; ")).toBe(true);
  });

  it("accepts confidentiality / commercial protections title without degraded-filler rejection", () => {
    const body = buildFivePartyPaidCorpus().replace(
      "SAAS RESELLER AND WHITE-LABEL SERVICES AGREEMENT",
      "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
    );
    expect(rejectPremiumDegradedFiller(body).ok).toBe(true);
    const acc = rejectPremiumBodyForProRender(body, {
      intakeLower: QA_SAAS_RESELLER_INTAKE.toLowerCase(),
      intakeText: QA_SAAS_RESELLER_INTAKE,
      partyNames: [...FIVE_PARTIES],
    });
    expect(acc.ok, acc.reasons.join("; ")).toBe(true);
  });

  it("repairs signature-line bracket stubs when real parties are present", () => {
    const raw = buildFivePartyPaidCorpus({ signatureBracketStubs: true });
    const fin = finalizeUserVisibleAgreementPlainText(raw, {
      intakeRaw: QA_SAAS_RESELLER_INTAKE,
      partyNames: [...FIVE_PARTIES],
      surface: "test",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);
    expect(fin.text).not.toMatch(/\[\s*NAME\s*\]/i);
    expect(fin.repaired.some((r) => r.startsWith("sig_line:"))).toBe(true);
    expect(fin.text).toContain("Redwood Peak Ventures LLC");
  });

  it("still rejects hard unresolved internal slots", () => {
    const bad = `${buildFivePartyPaidCorpus()}\n\nNotice to [PARTY_9] at [INSERT ADDRESS HERE].`;
    const fin = finalizeUserVisibleAgreementPlainText(bad, {
      intakeRaw: QA_SAAS_RESELLER_INTAKE,
      partyNames: [...FIVE_PARTIES],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remaining.some((x) => /PARTY_9|INSERT/i.test(x))).toBe(true);
  });

  it("accepts 30k Ironclad body with exactly five signature placeholder tokens (production gate)", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const sig = IRONCLAD_PARTIES.map(
      (p) => `${p} By: [SIGNATURE] Name: [PARTY_NAME] Title: [TITLE] Date: [DATE]`,
    ).join(" ");
    const core = [
      "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
      `Among ${IRONCLAD_PARTIES.join(", ")}.`,
      "1. Scope. AI workflow software and infrastructure rollout.",
      "2. Fees. $187,500 milestone payments.",
      "IN WITNESS WHEREOF:",
      sig,
    ].join(" ");
    const body = padOperative(core, 30_000);

    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "ironclad_production_gate",
    });
    expect(fin.remainingFatal, fin.remainingFatal.join("; ")).toHaveLength(0);
    expect(fin.ok).toBe(true);

    const acc = rejectPremiumBodyForProRender(body, {
      intakeLower: intake.toLowerCase(),
      intakeText: intake,
      partyNames: null,
    });
    expect(acc.ok, acc.reasons.join("; ")).toBe(true);

    const v = validatePaidProOutput({
      text: body,
      rawIntake: intake,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join("; ")).toBe(true);
  });

  it("accepts [CLIENT_NAME] inside signature block on long paid body", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const body = padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n` +
        "x".repeat(2500) +
        `\nSIGNATURES\n${IRONCLAD_PARTIES[0]}\nBy: [SIGNATURE]\n[CLIENT_NAME]\nName: [NAME]\nTitle: [TITLE]\nDate: [DATE]`,
      20_000,
    );
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);
  });

  it("accepts Ironclad joint-rollout paid body with signature field stubs (production shape)", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const signers = ["Ethan Cole", "Maya Bennett", "Lucas Reed", "Olivia Hart", "Adrian Vale"];
    const sigBlock = IRONCLAD_PARTIES.map((p, i) => {
      const person = signers[i];
      return `${p}\nBy: [SIGNATURE]\nName: [PARTY_NAME] — ${person}\nTitle: [TITLE]\nDate: [DATE]\nEmail: [EMAIL]\nInitials: [INITIALS]`;
    }).join("\n\n");
    const core = [
      "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
      "",
      `This Agreement is among ${IRONCLAD_PARTIES.join(", ")}.`,
      "",
      "1. Scope. White-label AI workflow software, API integrations, onboarding, analytics, and maintenance.",
      "2. Fees. Total contract value of $187,500 across six milestone payments.",
      "3. Term. Twenty-four (24) months with annual renewal and 45-day notice.",
      "4. Governing Law. Laws of the State of Texas.",
      "5. Confidentiality, cybersecurity, IP ownership, indemnification, SLA, and dispute resolution.",
      "",
      "Effective as of [DATE OF AGREEMENT].",
      "",
      "IN WITNESS WHEREOF:",
      sigBlock,
    ].join("\n");
    const body = padOperative(core, 27_000);

    expect(rejectPremiumDegradedFiller(body).ok).toBe(true);
    const acc = rejectPremiumBodyForProRender(body, {
      intakeLower: intake.toLowerCase(),
      intakeText: intake,
      partyNames: null,
    });
    expect(acc.ok, acc.reasons.join("; ")).toBe(true);

    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "ironclad_qa",
    });
    expect(fin.ok, fin.remainingFatal.join("; ")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);
    expect(fin.text).not.toMatch(/\[\s*NAME\s*\]/i);
    expect(fin.text.length).toBeGreaterThan(20_000);

    const v = validatePaidProOutput({
      text: body,
      rawIntake: intake,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok, v.reasons.join("; ")).toBe(true);
  });

  it("accepts HTML-wrapped Ironclad body with [PARTY_NAME] signature stubs and no merged parties", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const sig = IRONCLAD_PARTIES.map(
      (p) => `<p>${p}</p><p>By: [SIGNATURE]</p><p>Name: [PARTY_NAME]</p><p>Title: [TITLE]</p>`,
    ).join("");
    const html = `<div><h1>CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT</h1><p>${IRONCLAD_PARTIES.join(
      ", ",
    )}</p><p>${"Operative clause. ".repeat(8000)}</p><h2>SIGNATURES</h2>${sig}</div>`;
    const acc = rejectPremiumBodyForProRender(html, {
      intakeLower: intake.toLowerCase(),
      intakeText: intake,
      partyNames: null,
    });
    expect(acc.ok, acc.reasons.join("; ")).toBe(true);
  });

  it("rejects [INSERT PAYMENT TERMS] in Payment section of Ironclad-scale body", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const body = `${padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n\n2. PAYMENT\nFees: [INSERT PAYMENT TERMS HERE].\n` +
        "x".repeat(2000),
      10_000,
    )}\nIN WITNESS WHEREOF:\n[NAME]`;
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /INSERT/i.test(x))).toBe(true);
  });

  it("rejects [DESCRIBE SERVICES] in Scope section", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const body = `${padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n\n1. SCOPE\nServices: [DESCRIBE SERVICES HERE].\n` +
        "x".repeat(2000),
      10_000,
    )}\nSIGNATURES\n[NAME]`;
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /DESCRIBE/i.test(x))).toBe(true);
  });

  it("rejects operative [CLIENT_NAME] in first half of agreement body", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const body = `${padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n\n3. OBLIGATIONS\n[CLIENT_NAME] shall deliver all work product.\n` +
        "x".repeat(2000),
      10_000,
    )}`;
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /CLIENT_NAME/i.test(x))).toBe(true);
  });

  it("rejects [CLIENT LEGAL NAME] in operative obligations (first half)", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const body = `${padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\n\n3. OBLIGATIONS\n[CLIENT LEGAL NAME] shall deliver all work product.\n` +
        "x".repeat(2000),
      10_000,
    )}`;
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: intake,
      partyNames: null,
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /CLIENT[\s_]*LEGAL[\s_]*NAME/i.test(x))).toBe(true);
  });

  it("rejects operative [PARTY_1] and [INSERT PAYMENT TERMS] in Ironclad-scale body", () => {
    const intake = IRONCLAD_JOINT_ROLLOUT_INTAKE;
    const bad = `${padOperative(
      `AGREEMENT among ${IRONCLAD_PARTIES.join(", ")}.\nFees: [INSERT PAYMENT TERMS HERE].\nNotice to [PARTY_1].\n` +
        "x".repeat(1200),
      8_000,
    )}\nIN WITNESS WHEREOF:\n[NAME]`;
    const fin = finalizeUserVisibleAgreementPlainText(bad, {
      intakeRaw: intake,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((x) => /INSERT/i.test(x))).toBe(true);
  });

  it("detects agreement family from original intake, not thin starter routing label", () => {
    const fromIntake = detectAgreementFamily(QA_SAAS_RESELLER_INTAKE);
    expect(fromIntake).not.toBe("generic_business_agreement");
    const fromThinStarter = detectAgreementFamily(
      "Agreement / Software development / technical services / annual payment",
    );
    expect(fromThinStarter).toBe("generic_business_agreement");
    const contract = resolveAgreementIntentContract(QA_SAAS_RESELLER_INTAKE);
    expect(contract.intent_id).toMatch(/software_web_dev|consulting_services/);
  });
});
