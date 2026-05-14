import { describe, expect, it } from "vitest";
import type { LivePreviewModel } from "./liveDraftHeuristics";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { agreementTypeExplicitlyMatchesFlow, getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";

const QA_INTAKE = `Create a SaaS reseller and white-label services agreement between Redwood Peak Ventures LLC, Atlas Harbor Technologies Inc., Meridian Workforce Group LLC, Prairie Signal Holdings LP, and NovaGrid Systems LLC. Scope includes white-label deployment of workflow automation software, API integrations, onboarding support, analytics dashboards, and ongoing maintenance. Total fee $124,750 paid across 5 milestone payments tied to deployment phases. Term 18 months with automatic month-to-month renewal unless terminated with 30 days notice. Governing law Delaware. Include confidentiality, data security obligations, intellectual property ownership, limitation of liability, indemnification, uptime/service level expectations, non-solicitation, termination for cause and convenience, dispute resolution, force majeure, audit rights, and electronic signatures.`;

const baseLive: LivePreviewModel = {
  docTitle: "Employment Agreement",
  partiesLine: null,
  scopeLine: null,
  servicesLine: null,
  termLine: null,
  obligationsLine: null,
  compensationLine: null,
  scheduleLine: null,
  signerPlaceholdersLine: null,
  hasStructuredSignal: false,
  payment: { amount: null, cadence: null, valid: true },
};

describe("agreementTypeExplicitlyMatchesFlow", () => {
  it("detects directive phrasing for consulting", () => {
    expect(
      agreementTypeExplicitlyMatchesFlow(
        "Please make the type of agreement a consulting agreement between A and B.",
        "consulting",
      ),
    ).toBe(true);
  });

  it("detects type of agreement is consulting", () => {
    expect(agreementTypeExplicitlyMatchesFlow("We want the type of agreement is consulting.", "consulting")).toBe(true);
  });
});

describe("getCanonicalAgreementTypeForCreate", () => {
  it("does not mark consulting as suggested when raw states consulting agreement explicitly", () => {
    const raw =
      "Consulting agreement between Peaceful Journey LLC and Anthem Blanchard. $5k monthly. Delaware law. 12 months.";
    const canon = getCanonicalAgreementTypeForCreate(raw, baseLive);
    expect(canon.headline).toBe("Consulting Agreement");
    expect(canon.isSuggested).toBe(false);
  });

  it("uses live preview aligned with intake for consulting + LLC (not confidentiality)", () => {
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC";
    const live = buildLiveDraftPreview(raw);
    const canon = getCanonicalAgreementTypeForCreate(raw, live);
    expect(canon.headline).toBe("Consulting Agreement");
    expect(canon.flowId).toBe("consulting");
  });

  it("LawDog QA SaaS reseller + milestones: explicit headline wins over payment-plan flow", () => {
    const raw = QA_INTAKE;
    const live = buildLiveDraftPreview(raw);
    const canon = getCanonicalAgreementTypeForCreate(raw, live);
    expect(canon.headline).toBe("SaaS Reseller and White-Label Services Agreement");
    expect(canon.flowId).toBe("default");
    expect(canon.isSuggested).toBe(false);
  });
});
