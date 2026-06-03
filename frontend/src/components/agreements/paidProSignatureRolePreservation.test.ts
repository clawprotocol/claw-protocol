import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import {
  authorityPartiesToCanonicalPartyIdentities,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProSignatureRolePreservation", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
  });

  it("preserves Client and Service Provider roles from intake when recipient order differs", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const session = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const intake = fixture.intakeText;

    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: PAID_PRO_HARDENING_PROVIDER,
      recipient2Name: PAID_PRO_HARDENING_CLIENT,
      recipient1Email: "provider@test.com",
      recipient2Email: "client@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Provider Signer", "Client Signer"],
      partySignerTitles: ["VP", "CEO"],
      partyAddresses: ["200 Oak Ave", "100 Main St"],
    });

    const roleContext = { intakeText: intake, draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER] };
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties, roleContext);
    const client = identities.find((id) => id.blockHeading === "CLIENT");
    const provider = identities.find((id) => id.blockHeading === "SERVICE PROVIDER");
    expect(client?.partyDisplayName).toContain("Blue Canyon");
    expect(provider?.partyDisplayName).toMatch(/Iron Vale/);

    setConsumedPaidProSignerMetadataAuthority(authority);
    const manifest = buildCanonicalFinalPartyManifestFromAuthority(authority, roleContext);
    expect(manifest.parties.find((p) => p.role === "client")?.partyName).toContain("Blue Canyon");
    expect(manifest.parties.find((p) => p.role === "service_provider")?.partyName).toMatch(/Iron Vale/);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: session.acceptedText,
      authority,
      intakeRaw: intake,
      surface: "test_role_preservation_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    const witnessIdx = hydrated.corpus.search(/\bIN WITNESS WHEREOF\b/i);
    const signatureTail = witnessIdx >= 0 ? hydrated.corpus.slice(witnessIdx) : hydrated.corpus;
    expect(signatureTail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(signatureTail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);

    expect(hydrated.corpus).not.toMatch(/Party Notice Details:/i);
    expect(signatureTail).toMatch(/Email for Notice:/i);
  });
});
