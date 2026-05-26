import { describe, expect, it } from "vitest";
import { assertNoBareProSkeletonClauses, SUE_LEE_QA_BAD_CORPUS } from "../proCorpusSkeletonSafety";
import {
  finalizeGuidedProAgreementCorpus,
  GUIDED_FINAL_CORPUS_MIN_LEN,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";

const identities: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme Automation LLC",
    email: "legal@acme.test",
    representativeName: "Avery Client",
    title: "CEO",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Botsmith Services LLC",
    email: "ops@botsmith.test",
    representativeName: "Blake Provider",
    title: "Managing Member",
    blockHeading: "SERVICE PROVIDER",
    isIndividual: false,
  },
];

const test33Identities: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthem@example.test",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "joe@example.test",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test32",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: {
      payment_timing: "Net 30",
      phase_payment_allocation: "Build-heavy split / phase allocation",
      saas_sla: "99.9% uptime",
      ip_ownership: "Company owns project deliverables",
      renewal_notice: "30 days notice",
    },
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

function paidBody(extra = ""): string {
  return `
SERVICES AGREEMENT

This Services Agreement is entered by and between Your Company Name, located at [Your Company's Address], and Service Provider Name, located at [Service Provider's Address].

1. Services and Scope
Provider will provide AI automation setup and support services.

2. Fees and Payment
Company will pay monthly fees.

3. Confidentiality
Each party will protect confidential information.

4. Ownership and Work Product
Ownership will be as stated in this Agreement.

5. Support
Provider will provide commercially reasonable support.

6. Term and Termination
The term continues until terminated.

${extra}
`.trim() + "\n\n" + "Commercial safeguard paragraph. ".repeat(130);
}

function finalize(body = paidBody()) {
  const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
  return finalizeGuidedProAgreementCorpus({
    candidates: [
      { source: "rendered_preview", body: "Free starter ".repeat(70), paid: false },
      { source: "last_accepted_premium_candidate", body, paid: true },
    ],
    guidedSession: session(),
    signerIdentities: identities,
    signerManifest: manifest,
    originalIntake: "AI automation setup/support agreement, $6k/mo, confidentiality, ownership, support, termination",
    freeBasicDraftPlain: "Free starter ".repeat(70),
  });
}

describe("guided final corpus finalizer (test32)", () => {
  it("produces final body with five recommended guided answers structurally present", () => {
    const result = finalize();
    expect(result.ok).toBe(true);
    expect(result.body).toMatch(/\bNet 30\b/i);
    expect(result.body).toMatch(/\b99\.9\s*%/i);
    expect(result.body).toMatch(/\b(?:30|thirty)\s+days?.{0,24}notice\b/i);
    expect(result.body).toMatch(/\b(?:Client|Company) owns the project deliverables\b/i);
    expect(result.body).toMatch(/\bbuild-heavy\b/i);
    expect(result.appliedAnswerIds).toHaveLength(5);
  });

  it("replaces signer identity placeholders and blocks generic party placeholders", () => {
    const result = finalize();
    expect(result.ok).toBe(true);
    expect(result.body).toContain("Acme Automation LLC");
    expect(result.body).toContain("Botsmith Services LLC");
    expect(result.body).not.toMatch(/Your Company Name|\[Your Company's Address\]|Service Provider Name|\[Service Provider's Address\]/i);
  });

  it("applies the Pro corpus safety gate before final review, review-first, and signing handoff", () => {
    const badQaBody = `
Professional Services Agreement

This Professional Services Agreement is entered into by party_a (the "Client") and party_b (the "Service Provider").

1. Purpose and Scope

2. Services
The Service Provider will provide workflow automation services to the Client.
(b) materially breaches this Agreement and fails to cure after notice.
(c) repeatedly fails to perform the services.

3. Fees and Payment
Client will pay invoices Net 30.
Invoices are payable Net 30.
Invoices are payable Net 30.
The Company will reimburse approved expenses.

4. Term and Termination
Either party may terminate this Agreement for convenience on 14 days written notice.
Either party may terminate this Agreement for convenience on 30 days written notice.

5. Electronic Signatures and Counterparts
The parties may execute this Agreement using electronic signatures and counterparts.

8. Miscellaneous
The parties agree that e-signatures and counterparts are valid.

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim() + "\n\n" + "Commercial safeguard paragraph. ".repeat(130);

    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "last_accepted_premium_candidate", body: badQaBody, paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: buildCanonicalSignerManifest({ identities, signFirst: true }),
      originalIntake: "AI automation setup/support agreement, Net 30, 30 days notice, client ownership",
    });

    expect(result.ok).toBe(true);
    const finalReviewCorpus = result.body;
    const reviewFirstMintedCorpus = result.body;
    const recipientReviewCorpus = result.body;
    const vs01SigningCorpus = result.body;
    for (const corpus of [finalReviewCorpus, reviewFirstMintedCorpus, recipientReviewCorpus, vs01SigningCorpus]) {
      expect(corpus).not.toMatch(/\bparty_a\b|\bparty_b\b|\bpartyA\b|\bpartyB\b/i);
      expect(corpus).not.toMatch(/^1\. Purpose and Scope\s*(?:\n\s*)*2\./m);
      expect(corpus).not.toMatch(/e-signatures and counterparts are valid/i);
      expect(corpus.match(/\bNet 30\b/g)).toHaveLength(1);
      expect(corpus).not.toMatch(/^\([bc]\)\s+/m);
      expect(corpus).not.toMatch(/\b14 days? written notice\b/i);
      expect(assertNoBareProSkeletonClauses(corpus).ok).toBe(true);
    }
    expect(result.body).toContain("Acme Automation LLC");
    expect(result.body).toContain("Botsmith Services LLC");
  });

  it("repairs Sue Lee QA bare skeleton corpus for final review and signing handoff", () => {
    const sueIdentities: CanonicalPartyIdentity[] = [
      {
        index: 0,
        partyDisplayName: "Sue Lee",
        email: "sue@example.com",
        representativeName: "Sue Lee",
        title: "Owner",
        blockHeading: "CLIENT",
        isIndividual: true,
      },
      {
        index: 1,
        partyDisplayName: "Example Provider LLC",
        email: "ops@example.com",
        representativeName: "Pat Provider",
        title: "Manager",
        blockHeading: "SERVICE PROVIDER",
        isIndividual: false,
      },
    ];
    const badBody =
      SUE_LEE_QA_BAD_CORPUS.trim() + "\n\n" + "Commercial safeguard paragraph. ".repeat(130);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "last_accepted_premium_candidate", body: badBody, paid: true }],
      guidedSession: session(),
      signerIdentities: sueIdentities,
      signerManifest: buildCanonicalSignerManifest({ identities: sueIdentities, signFirst: true }),
      originalIntake: "AI automation for Sue Lee, Net 30, 30 days notice, ownership and support",
    });

    expect(result.body.length).toBeGreaterThan(GUIDED_FINAL_CORPUS_MIN_LEN);
    expect(result.body).not.toMatch(/^1\. Purpose and Scope\s*(?:\n\s*)*2\./m);
    expect(result.body).toMatch(/Service Provider retains ownership of its pre-existing tools/i);
    expect(result.body).toMatch(/Each party will disclose information only as required by law/i);
    expect(result.body).not.toContain(
      "Invoices will be sent to the billing contact identified in the Notices section.",
    );
    expect(result.body).not.toMatch(/e-signatures and counterparts are valid/i);
    expect(assertNoBareProSkeletonClauses(result.body).ok).toBe(true);
  });

  it("blocks final corpus when signer manifest exists but placeholders remain unresolved", () => {
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "last_accepted_premium_candidate", body: paidBody(), paid: true }],
      guidedSession: session(),
      signerIdentities: [],
      signerManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(false);
    expect(result.unresolvedPlaceholders).toContain("client_party_name_missing");
  });

  it("copy/export/send/sign can consume the exact same finalized corpus hash", () => {
    const result = finalize();
    expect(result.ok).toBe(true);
    const copyHash = result.diagnostics.finalHash;
    const exportHash = result.diagnostics.finalHash;
    const reviewHash = result.diagnostics.finalHash;
    const signHash = result.diagnostics.finalHash;
    expect(new Set([copyHash, exportHash, reviewHash, signHash]).size).toBe(1);
  });

  it("signaturePolishCount 0 triggers signature block rebuild", () => {
    const result = finalize(paidBody("No signature block is present yet."));
    expect(result.ok).toBe(true);
    expect(result.diagnostics.signatureRebuilt).toBe(true);
    expect(result.body).toMatch(/IN WITNESS WHEREOF/i);
    expect(result.body).toMatch(/Name: Avery Client/);
  });

  it("rejects 734-char free starter corpus after paid Pro corpus exists", () => {
    const free = "Free starter rendered preview. ".repeat(28).slice(0, 734);
    const paid = paidBody("Paid Pro body selected.");
    expect(paid.length).toBeGreaterThan(GUIDED_FINAL_CORPUS_MIN_LEN);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [
        { source: "rendered_preview", body: free, paid: false },
        { source: "last_accepted_premium_candidate", body: paid, paid: true },
      ],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: buildCanonicalSignerManifest({ identities, signFirst: true }),
      originalIntake: "AI automation support agreement",
      freeBasicDraftPlain: free,
    });
    expect(result.ok).toBe(true);
    expect([
      "finalized_signer_applied_guided_corpus",
      "last_accepted_premium_candidate",
      "canonical_working_draft",
    ]).toContain(result.diagnostics.selectedSource);
    expect(result.diagnostics.rejected.some((r) => r.source === "rendered_preview")).toBe(true);
  });

  it("test33: final corpus has all guided evidence, clean placeholders, and Acme/Joe signature roles", () => {
    const manifest = buildCanonicalSignerManifest({ identities: test33Identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "last_accepted_premium_candidate", body: paidBody(), paid: true }],
      guidedSession: session(),
      signerIdentities: test33Identities,
      signerManifest: manifest,
      originalIntake: "AI automation setup/support agreement, $6k/mo, confidentiality, ownership, support, termination",
    });
    expect(result.ok).toBe(true);
    expect(validateFinalGuidedProCorpusBeforeFreeze({ body: result.body, guidedSession: session() }).ok).toBe(true);
    expect(result.body).toMatch(/\bNet 30\b/i);
    expect(result.body).toMatch(/\bbuild-heavy\b/i);
    expect(result.body).toMatch(/\b99\.9\s*%/i);
    expect(result.body).toMatch(/\b(?:Company|Client) owns the project deliverables\b/i);
    expect(result.body).toMatch(/\b30\s+days?.{0,30}notice\b/i);
    expect(result.body).not.toMatch(/\[Client's Full Legal Name\]|\[Client's Address\]|\[Service Provider's Address\]|Your Company Name|Service Provider Name|\[Your Company Name\]/i);
    expect(result.body).toMatch(/CLIENT:\s*\nAcme LLC\s*\nBy: __________________________\s*\nName: Anthem H Blanchard\s*\nTitle: Manager\s*\nDate: _________________________/);
    expect(result.body).toMatch(
      /SERVICE PROVIDER:\s*\nJoe Smith\s*\n(?:By|Signature):\s*_{2,}\s*\nName: Joe Smith\s*\nDate: _________________________/i,
    );
  });

  it("test33: prefers hydrated authority over weak last_accepted candidate by source priority", () => {
    const weak = `${paidBody("Weak body with no final answer evidence.")}\n\n${"Generic commercial filler. ".repeat(120)}`;
    const hydrated = `${paidBody("Hydrated authority.")}\n\nInvoices are due Net 30 from receipt.\nSchedule A phase allocation is build-heavy across build, rollout, and support.\nProvider will target 99.9% monthly availability.\nCompany owns the project deliverables and work product after payment, subject only to Provider pre-existing tools.\nEither party may terminate with 30 days written notice.\n`;
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [
        { source: "last_accepted_premium_candidate", body: weak, paid: true },
        { source: "hydrated_premium", body: hydrated, paid: true },
      ],
      guidedSession: session(),
      signerIdentities: test33Identities,
      signerManifest: buildCanonicalSignerManifest({ identities: test33Identities, signFirst: true }),
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(true);
    expect(["hydrated_premium", "canonical_working_draft", "finalized_signer_applied_guided_corpus"]).toContain(
      result.diagnostics.selectedSource,
    );
  });

  it("test33 regression: stale last_accepted placeholders do not block when hydrated authority is selected", () => {
    const stale = `${paidBody("Stale placeholders remain here.")}\nYour Company Name and Service Provider Name in body.\n`;
    const hydrated = `${paidBody("Hydrated authority with guided evidence.")}\n\nInvoices are due Net 30 from receipt.\nSchedule A phase allocation is build-heavy across build, rollout, and support.\nProvider will target 99.9% monthly availability.\nCompany owns the project deliverables and work product after payment.\nEither party may terminate with 30 days written notice.\n`;
    const manifest = buildCanonicalSignerManifest({ identities: test33Identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [
        { source: "last_accepted_premium_candidate", body: stale, paid: true },
        { source: "hydrated_premium", body: hydrated, paid: true },
        { source: "rendered_preview", body: "Free starter ".repeat(70), paid: false },
      ],
      guidedSession: session(),
      signerIdentities: test33Identities,
      signerManifest: manifest,
      originalIntake: "AI automation setup/support agreement",
      freeBasicDraftPlain: "Free starter ".repeat(70),
    });
    expect(result.ok).toBe(true);
    expect(["hydrated_premium", "canonical_working_draft", "finalized_signer_applied_guided_corpus"]).toContain(
      result.diagnostics.selectedSource,
    );
    expect(result.body).not.toMatch(/Your Company Name|Service Provider Name|\[Your Company Name\]/i);
    expect(result.body).toMatch(/Acme LLC/);
    expect(result.body).toMatch(/Joe Smith/);
  });
});
