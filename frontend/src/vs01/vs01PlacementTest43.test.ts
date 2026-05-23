import { describe, expect, it } from "vitest";
import {
  finalizeGuidedProAgreementCorpus,
} from "../components/agreements/guidedDealCompletion/guidedFinalCorpusFinalizer";
import {
  normalizeGuidedCorpusHeadingArtifacts,
  normalizePartyNameSpacingInCorpus,
  prepareGuidedSigningCorpusCleanup,
} from "../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning";
import { corpusSignatureBlocksHaveRequiredByLines } from "../components/agreements/guidedDealCompletion/signatureRegion";
import { buildCanonicalSignerManifest } from "../components/agreements/guidedDealCompletion/guidedReviewSigningContinuity";
import { buildCanonicalFinalPartyManifestFromIdentities } from "../components/agreements/guidedDealCompletion/canonicalFinalPartyManifest";
import type { CanonicalPartyIdentity } from "../components/agreements/guidedDealCompletion/signerPartyIdentity";
import {
  buildAutoSignaturePacketForAllRoles,
} from "./vs01AutoSignaturePacket";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  corpusHasPrefilledSignatureIdentity,
  findSignatureLineAnchorsFromCorpusText,
} from "./vs01SignatureBlockAnchors";

const identities: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthemhayek@gmail.com",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "joe345@gmail.com",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

/** test43 malformed post-question corpus — names present but no By: anchors. */
const TEST43_MALFORMED_TAIL = `
IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
Name: Anthem H Blanchard
Title: Manager

SERVICE PROVIDER:
Joe Smith
Name: Joe Smith
`.trim();

const TEST43_MALFORMED_BODY = `
AI Automation Services Agreement

between Acme LLC("Client") and Joe Smith("Service Provider").

1. Purpose**
Scope of engagement.

2. Scope of Services**
Provider delivers automation services.

7. General Terms
Electronic Signatures are permitted.

${TEST43_MALFORMED_TAIL}

${"Operational and commercial terms filler. ".repeat(90)}
`.trim();

function test43Roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test43",
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe345@gmail.com", signerName: "Joe Smith" }],
  });
}

describe("VS01 placement test43 regression", () => {
  it("normalizes malformed headings and party parenthetical spacing", () => {
    const normalized = normalizeGuidedCorpusHeadingArtifacts(TEST43_MALFORMED_BODY);
    expect(normalized.text).toMatch(/Acme LLC\s+\("Client"\)/);
    expect(normalized.text).toMatch(/Joe Smith\s+\("Service Provider"\)/);
    expect(normalized.text).not.toMatch(/Purpose\*\*/);
    expect(normalized.text).not.toMatch(/Scope of Services\*\*/);
    expect(normalized.text).toMatch(/1\. Purpose\b/);
    expect(normalized.text).toMatch(/2\. Scope of Services\b/);
  });

  it("prepareGuidedSigningCorpusCleanup adds By lines and Date lines for VS01", () => {
    const manifest = buildCanonicalFinalPartyManifestFromIdentities(identities);
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST43_MALFORMED_BODY,
      partyManifest: manifest,
      signerIdentities: identities,
    });
    expect(corpusSignatureBlocksHaveRequiredByLines(cleaned.body, 2)).toBe(true);
    expect(cleaned.body).toMatch(/By:\s*_{3,}/i);
    expect(cleaned.body).toMatch(/Date:\s*_{3,}/i);
    expect(cleaned.repairs.some((r) => r.includes("signature"))).toBe(true);
  });

  it("prefilled identity detected when Name lines exist without title on individual signer", () => {
    const manifest = buildCanonicalFinalPartyManifestFromIdentities(identities);
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST43_MALFORMED_BODY,
      partyManifest: manifest,
      signerIdentities: identities,
    });
    expect(corpusHasPrefilledSignatureIdentity(cleaned.body)).toBe(true);
    expect(findSignatureLineAnchorsFromCorpusText(cleaned.body).length).toBe(2);
  });

  it("auto packet places 2 signature fields with high confidence, not 8 overlays", () => {
    const manifest = buildCanonicalFinalPartyManifestFromIdentities(identities);
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST43_MALFORMED_BODY,
      partyManifest: manifest,
      signerIdentities: identities,
    });
    const roles = test43Roles();
    const result = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: {
        typedName: "Anthem H Blanchard",
        initials: "AB",
        signerEmail: "anthemhayek@gmail.com",
      },
      corpusText: cleaned.body,
    });
    expect(result.placedCount).toBe(2);
    expect(result.confidence).toBe("high");
    expect(result.fields.every((f) => f.type === "signature")).toBe(true);
    expect(result.fields.some((f) => f.type === "printed_name")).toBe(false);
    expect(result.fields.some((f) => f.type === "text")).toBe(false);
    expect(result.fields.some((f) => f.type === "date")).toBe(false);
  });

  it("finalizer repairs test43 malformed corpus with canonical signature blocks", () => {
    const spaced = normalizePartyNameSpacingInCorpus(TEST43_MALFORMED_BODY);
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const partyManifest = buildCanonicalFinalPartyManifestFromIdentities(identities);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: spaced, paid: true }],
      guidedSession: null,
      signerIdentities: identities,
      signerManifest: manifest,
      partyManifest,
      originalIntake: "AI automation between Acme and Joe",
    });
    expect(result.ok).toBe(true);
    expect(corpusSignatureBlocksHaveRequiredByLines(result.body, 2)).toBe(true);
    expect(result.body).toMatch(/CLIENT:\s*\nAcme LLC[\s\S]*By:\s*_{3,}[\s\S]*Name: Anthem H Blanchard[\s\S]*Title: Manager/i);
    expect(result.body).toMatch(/SERVICE PROVIDER:\s*\nJoe Smith[\s\S]*By:\s*_{3,}[\s\S]*Name: Joe Smith/i);
    expect(result.body).not.toMatch(/Purpose\*\*/);
  });
});
