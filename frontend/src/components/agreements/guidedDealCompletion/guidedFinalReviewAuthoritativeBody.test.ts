import { describe, expect, it } from "vitest";
import {
  collectActionableGuidedAuthoritativePlaceholders,
  GUIDED_FINAL_REVIEW_REJECTED_SOURCES,
  resolveGuidedFinalReviewAuthoritativeBody,
  scanGuidedAuthoritativePlaceholders,
} from "./guidedFinalReviewAuthoritativeBody";
import {
  applyCanonicalManifestPlaceholdersToCorpus,
  resolveCanonicalFinalPartyManifest,
  scanFatalPartyPlaceholdersAfterManifestApply,
} from "./canonicalFinalPartyManifest";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";

const LONG_HYDRATED = "Hydrated guided corpus. ".repeat(120);
const LONG_STALE = "Stale starter with [Your Company Name] and Service Provider Name. ".repeat(120);
const SHORT_PREVIEW = "Preview starter [Your Company Name]. ".repeat(20);

const identities: CanonicalPartyIdentity[] = [
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

describe("guidedFinalReviewAuthoritativeBody", () => {
  it("prefers hydrated premium over stale last_accepted candidate when signing-ready", () => {
    const resolved = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "last_accepted_premium_candidate", body: LONG_STALE },
        { source: "hydrated_premium", body: LONG_HYDRATED },
      ],
      signerIdentities: identities,
      signingCorpusReady: true,
    });
    expect(resolved.source).toBe("hydrated_premium");
    expect(resolved.body.length).toBeGreaterThanOrEqual(1500);
    expect(resolved.body).toContain("Hydrated guided corpus.");
  });

  it("never selects hydrated_premium_with_signers before signing-ready", () => {
    const hydrated = "Hydrated with signers. ".repeat(140);
    const resolved = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [{ source: "hydrated_premium_with_signers", body: hydrated }],
      signerIdentities: identities,
      signingCorpusReady: false,
    });
    expect(resolved.source).toBe("none");
    expect(resolved.len).toBe(0);
  });

  it("rejects server and picker sources when signing-ready", () => {
    const signerApplied = "Signer-applied finalized corpus. ".repeat(130);
    const resolved = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "finalized_signer_applied_guided_corpus", body: signerApplied },
        { source: "server_full_document_text", body: `${signerApplied} stale server appendix`.repeat(2) },
        { source: "picker_authoritative", body: `${signerApplied} stale picker appendix`.repeat(2) },
      ],
      signerIdentities: identities,
      signingCorpusReady: true,
    });
    expect(resolved.source).toBe("finalized_signer_applied_guided_corpus");
    expect(resolved.body.trim()).toBe(signerApplied.trim());
    expect(resolved.body).not.toContain("stale server appendix");
    expect(resolved.body).not.toContain("stale picker appendix");
  });

  it("prefers finalized_signer_applied over hydrated_premium", () => {
    const signerApplied = "Signer-applied finalized corpus. ".repeat(130);
    const resolved = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "hydrated_premium", body: LONG_HYDRATED },
        { source: "finalized_signer_applied_guided_corpus", body: signerApplied },
      ],
      signerIdentities: identities,
      signingCorpusReady: true,
    });
    expect(resolved.source).toBe("finalized_signer_applied_guided_corpus");
  });

  it("never selects preview starter or draft fallback sources", () => {
    const resolved = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "rendered_preview", body: SHORT_PREVIEW.repeat(10) },
        { source: "draft_fallback", body: SHORT_PREVIEW.repeat(10) },
        { source: "hydrated_premium", body: LONG_HYDRATED },
      ],
      signingCorpusReady: true,
    });
    expect(resolved.source).toBe("hydrated_premium");
    expect(GUIDED_FINAL_REVIEW_REJECTED_SOURCES.has("rendered_preview")).toBe(true);
  });

  it("stale starter placeholders alone do not block when authoritative body is clean", () => {
    const staleScan = scanGuidedAuthoritativePlaceholders({
      body: LONG_STALE,
      source: "last_accepted_premium_candidate",
      signerIdentities: identities,
      signerManifestPresent: true,
    });
    expect(staleScan.ok).toBe(false);

    const authoritativeScan = scanGuidedAuthoritativePlaceholders({
      body: LONG_HYDRATED,
      source: "hydrated_premium",
      signerIdentities: identities,
      signerManifestPresent: true,
    });
    expect(authoritativeScan.ok).toBe(true);
    expect(collectActionableGuidedAuthoritativePlaceholders(LONG_HYDRATED)).toHaveLength(0);
  });

  it("address placeholders alone do not block after manifest repair", () => {
    const body = `${LONG_HYDRATED}\n[Your Company's Address]\n[Service Provider's Address]`;
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "a@example.test",
      recipient2Email: "b@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const patched = applyCanonicalManifestPlaceholdersToCorpus(body, manifest);
    const scan = scanFatalPartyPlaceholdersAfterManifestApply({ body: patched.text, manifest });
    expect(scan.ok).toBe(true);
  });
});
