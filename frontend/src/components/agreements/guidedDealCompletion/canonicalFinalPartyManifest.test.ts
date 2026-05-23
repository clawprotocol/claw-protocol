import { describe, expect, it } from "vitest";
import {
  applyCanonicalManifestPlaceholdersToCorpus,
  formatCanonicalFinalPartyManifestLines,
  isEmailLikePartyName,
  isTemplatePartyPlaceholderName,
  manifestToCanonicalPartyIdentities,
  resolveCanonicalFinalPartyManifest,
  scanFatalPartyPlaceholdersAfterManifestApply,
} from "./canonicalFinalPartyManifest";
import { finalizeGuidedProAgreementCorpus } from "./guidedFinalCorpusFinalizer";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { GuidedCompletionSession } from "./types";

const PLACEHOLDER_BODY = `
SERVICES AGREEMENT

This agreement is between [Your Company Name] and [Service Provider Name].
Client address: [Your Company's Address]
Provider address: [Service Provider's Address]

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
`.trim() +
  "\n\n" +
  "Commercial safeguard paragraph. ".repeat(130) +
  `

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
[Your Company Name]
Name: ________________________

SERVICE PROVIDER:
[Service Provider Name]
Name: ________________________
`;

function session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test35",
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

describe("canonicalFinalPartyManifest (test35)", () => {
  it("rejects template draft party names and email-as-party", () => {
    expect(isTemplatePartyPlaceholderName("[Your Company Name]")).toBe(true);
    expect(isTemplatePartyPlaceholderName("Your Company Name")).toBe(true);
    expect(isEmailLikePartyName("legal@acme.test")).toBe(true);
  });

  it("does not promote client representative signer name to partyName when entity name missing", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(manifest.parties[0].partyName).toBe("");
    expect(manifest.parties[0].signerName).toBe("Anthem Blanchard");
    expect(manifest.parties[1].partyName).toBe("Joe Smith");
  });

  it("prefers recipient legal name over stale draft placeholders", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["[Your Company Name]", "[Service Provider Name]"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(manifest.parties[0].partyName).toBe("Acme LLC");
    expect(manifest.parties[0].signerName).toBe("Anthem H Blanchard");
    expect(manifest.parties[0].roleLabel).toBe("Client");
    expect(manifest.parties[0].signerKind).toBe("entity_representative");
    expect(manifest.parties[0].isSenderSide).toBe(true);
    expect(manifest.parties[1].partyName).toBe("Joe Smith");
    expect(manifest.parties[1].signerName).toBe("Joe Smith");
    expect(manifest.parties[1].roleLabel).toBe("Service Provider");
    expect(manifest.parties[1].signerKind).toBe("individual");
    expect(manifest.parties[1].isSenderSide).toBe(false);
    const lines = formatCanonicalFinalPartyManifestLines(manifest);
    expect(lines.join("\n")).toContain("Client: Acme LLC (Anthem H Blanchard, Manager)");
    expect(lines.join("\n")).not.toContain("[Your Company Name]");
  });

  it("replaces hydrated premium placeholders and does not block on address placeholders", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["[Your Company Name]", "[Service Provider Name]"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const patched = applyCanonicalManifestPlaceholdersToCorpus(PLACEHOLDER_BODY, manifest);
    expect(patched.text).toContain("Acme LLC");
    expect(patched.text).toContain("Joe Smith");
    expect(patched.text).not.toMatch(/\[Your Company Name\]|\[Service Provider Name\]/i);
    const scan = scanFatalPartyPlaceholdersAfterManifestApply({ body: patched.text, manifest });
    expect(scan.ok).toBe(true);
  });

  it("finalizer succeeds for hydrated body with bracket placeholders and valid manifest", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["[Your Company Name]", "[Service Provider Name]"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const identities = manifestToCanonicalPartyIdentities(manifest);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium_with_signers", body: PLACEHOLDER_BODY, paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: buildCanonicalSignerManifest({ identities, signFirst: true }),
      partyManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(true);
    expect(result.body).toMatch(/Acme LLC/);
    expect(result.body).toMatch(/Joe Smith/);
    expect(result.body).not.toMatch(/\[Your Company Name\]|\[Service Provider Name\]|Your Company Name|Service Provider Name/i);
    const copyHash = result.diagnostics.finalHash;
    expect(copyHash).toBe(result.diagnostics.finalHash);
  });

  it("surfaces actionable block when party name truly missing", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["", ""],
      partySignerTitles: ["", ""],
      recipient1Name: "",
      recipient2Name: "Joe Smith",
      recipient1Email: "",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["[Your Company Name]", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const scan = scanFatalPartyPlaceholdersAfterManifestApply({
      body: PLACEHOLDER_BODY,
      manifest,
    });
    expect(scan.ok).toBe(false);
    expect(scan.missingPartyReason).toBe("client_party_name_missing");
  });
});
