import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  isPaidProFinishedAgreement,
  isUnacceptablePipelineProSource,
  rejectCrossPromptContamination,
  rejectPaidProStitchedOrThinShell,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem Blanchard, developer Sarah Collins, Oklahoma.
  $7,500 total: $3,000 on start, $4,500 on final. thirty days. May 1, 2026. two (2) revision rounds.
  pre-existing code and libraries. Notices by electronic mail. Email notices ok.
`.trim();

function padProBody(core: string, minLen: number): string {
  const clause =
    " The parties shall each perform. Confidentiality, IP, limitation of liability, and indemnity apply. ";
  let t = core;
  while (t.length < minLen) t += clause;
  return t;
}

describe("paid pro corpus acceptance", () => {
  it("rejects estate intake with founder/vesting/60-40 body (cross-prompt)", () => {
    const rawIntake = "My siblings need rules for dad's estate tonight.";
    const t =
      "The parties agree to a 60/40 vesting arrangement between two founders and a four-year cliff for founder equity.";
    const x = rejectCrossPromptContamination(t, rawIntake.toLowerCase());
    expect(x.ok).toBe(false);
    const v = validatePaidProOutput({ text: t, rawIntake });
    expect(v.ok).toBe(false);
  });

  it("rejects stitched LawDog pro preview intro as paid output", () => {
    const rawIntake = "We need a simple referral agreement for two parties.";
    const t =
      "This LawDog Pro preview organizes your structured fields into fuller sections for serious review.\n\n1. Scope\n2. Payment\n3. Term\n4. Law\n5. Termination";
    const s = rejectPaidProStitchedOrThinShell(t, rawIntake);
    expect(s.ok).toBe(false);
  });

  it("flags unacceptable pipeline sources for pro", () => {
    expect(isUnacceptablePipelineProSource("fallback_preview")).toBe(true);
    expect(isUnacceptablePipelineProSource("rejected_paid_corpus")).toBe(true);
    expect(isUnacceptablePipelineProSource("stale_intake")).toBe(true);
    expect(isUnacceptablePipelineProSource("server_full_draft")).toBe(false);
  });

  it("pro surface fails when readonly is server but pipeline is fallback (not a finished pro agreement)", () => {
    const text =
      "This LawDog Pro preview organizes your structured fields into fuller sections for serious review.\n\nBody text that would otherwise be long enough.";
    const r = isPaidProFinishedAgreement({
      text: text,
      rawIntake: "Referral: 20% to Party B on cleared deposits.",
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "fallback_preview",
      stale: false,
    });
    expect(r.ok).toBe(false);
  });

  it("validates a long pro web body with client/developer and concrete facts (Oklahoma, CryptoSpaces, amounts, notices)", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    expect(contract.intent_id).toBe("software_web_dev");
    const lead = `
# Web Development Agreement

## Parties
**Client (Anthem Blanchard)** engages **Developer (Sarah Collins)** for the **CryptoSpaces** engagement.

Governing law: the laws of the **State of Oklahoma** (Oklahoma). Total **$7,500**; **$3,000** deposit, **$4,500** balance.
Final payment due within **thirty (30) days**; effective **May 1, 2026**. **Two revision** rounds. **Pre-existing** tools. **Notices** by **email** and **electronic mail**. Terms cover **confidential** use and **IP** between the **parties**. The parties **shall** cooperate.
    `;
    const text = padProBody(lead, 12_000);
    const v = validatePaidProOutput({ text, rawIntake: WEB_INTAKE, intentContract: contract, draft: null });
    expect(v.ok).toBe(true);
  });

  it("fails a thin five-slot style starter (same gate as isLikelyFiveSectionStarterShellPro + intent contract)", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
    const thin = `1. Scope of Services / Purpose
Short.
2. Payment terms
Short.
3. Term and effective date
Short.
4. Governing law
Short.
5. Termination
Short.`;
    const v = validatePaidProOutput({ text: thin, rawIntake: WEB_INTAKE, intentContract: contract, draft: null });
    expect(v.ok).toBe(false);
  });
});
