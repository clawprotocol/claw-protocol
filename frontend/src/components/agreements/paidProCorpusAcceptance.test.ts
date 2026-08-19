import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { detectPaidProMalformedServicesOpening } from "./paidProOpeningRecitalGuard";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  isPaidProFinishedAgreement,
  isUnacceptablePipelineProSource,
  rejectCrossPromptContamination,
  rejectPaidProStitchedOrThinShell,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

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

const BLUE_CANYON_QA = "Blue Canyon Analytics LLC";
const IRON_VALE_QA = "Iron Vale Systems Inc";

const QA_SERVICES_INTAKE = [
  "Professional services agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "Scope: internal automation tooling and AI-assisted reporting workflows.",
  "Fee $8,500 total with 50% upfront and 50% on completion.",
  "Delaware law governs. Electronic signatures acceptable.",
].join(" ");

describe("paid pro corpus acceptance", () => {
  it("rejects malformed naked party-name opening before repair; accepts after safe display guard", () => {
    const malformed = [
      BLUE_CANYON_QA,
      "1. Scope of Services",
      "AI workflow and automation deliverables.",
      "Fee $8,500: 50% upfront, 50% on completion.",
      "Governing law: Delaware.",
      "Termination, confidentiality, and electronic signatures apply.",
      "x".repeat(2_500),
    ].join("\n");
    const draft = {
      parties: [
        { name: BLUE_CANYON_QA, role: "Client" },
        { name: IRON_VALE_QA, role: "Service Provider" },
      ],
    } as ParsedDraftShape;
    const contract = resolveAgreementIntentContract(QA_SERVICES_INTAKE);
    const records = resolveCanonicalPartyIdentitiesFromIntake(QA_SERVICES_INTAKE, [
      BLUE_CANYON_QA,
      IRON_VALE_QA,
    ]);
    expect(detectPaidProMalformedServicesOpening(malformed, records)).toBe(true);

    const safe = applyAcceptedProCorpusSafeDisplay(malformed, { draft, intakeText: QA_SERVICES_INTAKE });
    // Safe display rebuilds a defined opening recital — do not invent a specific consulting title
    // when intake does not authorize one. Naked party-name lead-in must be gone.
    expect(safe.text).toMatch(/^This Agreement is between\b/m);
    expect(safe.text).toContain(BLUE_CANYON_QA);
    expect(safe.text).toContain(IRON_VALE_QA);
    expect(safe.text).not.toMatch(new RegExp(`^${BLUE_CANYON_QA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "m"));
    const accepted = validatePaidProOutput({
      text: safe.text,
      rawIntake: QA_SERVICES_INTAKE,
      intentContract: contract,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(accepted.ok, accepted.reasons.join(", ")).toBe(true);
  });

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
Final payment due within **thirty (30) days**; effective **May 1, 2026**. **Two revision** rounds. **Pre-existing** tools. **Notices under this Agreement may be given by email** and electronic mail. Terms cover **confidential** use and **IP** between the **parties**. The parties **shall** cooperate.

IN WITNESS WHEREOF, the parties execute this Agreement.

CLIENT:
Anthem Blanchard
By: _________________________
Name: Anthem Blanchard
Title: Client

DEVELOPER:
Sarah Collins
By: _________________________
Name: Sarah Collins
Title: Developer
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

  it(
    "validates a model-paraphrased freelance software + website body for the full CryptoSpaces prompt (varied wording, Schedule A, Client/Developer)",
    () => {
    const FREELANCE = `I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total. $3,000 due upfront, $4,500 due on final delivery. Work includes homepage redesign, mobile optimization, analytics setup, email capture funnel, and performance improvements. Project starts May 1, 2026 and final delivery is due within 30 days. Two revision rounds included. Client owns final deliverables after full payment. Developer keeps pre-existing tools and code libraries. Both parties keep confidential information private. Oklahoma law governs. Notices by email are acceptable.`.trim();
    const contract = resolveAgreementIntentContract(FREELANCE);
    expect(contract.intent_id).toBe("software_web_dev");
    const longBody = [
      "INDEPENDENT DEVELOPER & WEB SERVICES MASTER AGREEMENT",
      "",
      "1. The Client and Developer identified below (Anthem Blanchard; Sarah Collins) engage for the cryptospaces.net project.",
      "2. Governing law: the laws of the State of Oklahoma shall apply. This is not a Delaware law agreement.",
      "3. The total of Seven Thousand Five Hundred Dollars (USD) shall be as follows: Three Thousand and 00/100 Dollars (USD) upon execution; Four Thousand Five Hundred and 00/100 Dollars (USD) upon final acceptance.",
      "4. The completion target is May 31, 2026, consistent with 30 calendar days’ performance following the start date of May 1, 2026, or thirty (30) days, whichever framing appears in the exhibits.",
      "5. 2 revision rounds, two (2) rounds, are included. Developer’s background IP, pre-existing code, libraries, and frameworks are retained.",
      "6. Notices under this Agreement may be given by email. Confidential information remains protected.",
      "7. Signatures. Client and Developer. Schedule A: deliverables may be updated by SOW.",
      "",
      "IN WITNESS WHEREOF, the parties execute this Agreement.",
      "",
      "CLIENT:",
      "Anthem Blanchard",
      "By: _________________________",
      "Name: Anthem Blanchard",
      "Title: Client",
      "",
      "DEVELOPER:",
      "Sarah Collins",
      "By: _________________________",
      "Name: Sarah Collins",
      "Title: Developer",
      "",
      // Substantive pad — varied prose (not repetitive stubs) so freeze/validation stays O(n).
      Array.from({ length: 40 }, (_, i) =>
        `Supplemental commercial detail ${i + 1}. CryptoSpaces.net homepage, mobile, analytics, and email funnel work for Client Anthem Blanchard by Developer Sarah Collins under Oklahoma law with email notices.`,
      ).join("\n"),
    ].join("\n");
    const v = validatePaidProOutput({ text: longBody, rawIntake: FREELANCE, intentContract: contract, draft: null });
    expect(v.ok, v.reasons.join(", ")).toBe(true);
  },
  20_000,
  );
});
