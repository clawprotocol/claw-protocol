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
