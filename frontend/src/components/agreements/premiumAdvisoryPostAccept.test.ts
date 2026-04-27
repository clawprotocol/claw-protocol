import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  isPaidProFinishedAgreement,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { fetchPremiumAdvisoryEnrichmentAfterAccept } from "./premiumAdvisoryPostAccept";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const WEB_INTAKE = `
  SaaS website API work for CryptoSpaces.net. Client Anthem, developer Sarah, Oklahoma.
  $7,500 total: $3,000 on start, $4,500 on final. thirty days. May 1, 2026. two (2) revision rounds.
  pre-existing code. Notices by email.
`.trim();

function padProBody(core: string, minLen: number): string {
  const clause =
    " The parties shall each perform. Confidentiality, IP, limitation of liability, and indemnity apply. ";
  let t = core;
  while (t.length < minLen) t += clause;
  return t;
}

describe("fetchPremiumAdvisoryEnrichmentAfterAccept", () => {
  const draft: ParsedDraftShape = {
    title: "Web Dev Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
    ],
    purpose: "Services",
    payment_terms: "$1",
    duration: "12m",
    due_date: null,
    effective_date: "Jan 1",
    payment: emptyPayment,
  };
  it("completes without throw when follow-on calls return null in test mode", async () => {
    const doc = "y".repeat(2000);
    const out = await fetchPremiumAdvisoryEnrichmentAfterAccept({
      draft,
      rawIntakeForSot: "intake",
      userGapAnswers: null,
      winningBodyText: doc,
    });
    expect(out.premiumReview).toBeNull();
    expect(out.premiumFinalizeAudit).toBeNull();
    expect(out.premiumReviewRoute).toBeNull();
  });
});

describe("post-accept authority (advisory 503 is irrelevant to paid-pro gate)", () => {
  it("rejected_paid_corpus still blocks finished pro", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
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
    const r = isPaidProFinishedAgreement({
      text,
      rawIntake: WEB_INTAKE,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "rejected_paid_corpus",
      stale: false,
      intentContract: contract,
    });
    expect(r.ok).toBe(false);
  });

  it("server_full_draft with validated body still produces finished pro (advisory failures are irrelevant to this gate)", () => {
    const contract = resolveAgreementIntentContract(WEB_INTAKE);
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
    const r = isPaidProFinishedAgreement({
      text,
      rawIntake: WEB_INTAKE,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "server_full_draft",
      stale: false,
      intentContract: contract,
    });
    expect(r.ok).toBe(true);
  });
});
