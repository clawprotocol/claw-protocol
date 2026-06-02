import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
  resolvePaidProPartyRolesFromAcceptedCorpus,
} from "./paidProAcceptedCorpusPartyRoles";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth, getPaidProDocumentForSurface } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).";

function buildSwappedSignatureTail(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. SCOPE. Provider will deliver AI workflow implementation services.",
    "2. FEES. Client will pay a fixed fee of $8,500.",
    "3. GOVERNING LAW. Delaware law governs.",
    "4. ELECTRONIC SIGNATURES. Counterparts and e-signatures are permitted.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    PAID_PRO_HARDENING_PROVIDER,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    PAID_PRO_HARDENING_CLIENT,
    "By: __________________________",
  ].join("\n");
}

describe("paidPro execution block role consistency", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("parses Blue Canyon as Client and Iron Vale as Service Provider from recital", () => {
    const roles = resolvePaidProPartyRolesFromAcceptedCorpus(buildSwappedSignatureTail());
    expect(roles.find((r) => r.role === "client")?.legalName).toContain("Blue Canyon");
    expect(roles.find((r) => r.role === "service_provider")?.legalName).toMatch(/Iron Vale/);
  });

  it("detects inverted execution block roles vs accepted corpus recital", () => {
    expect(detectExecutionBlockRoleInversion(buildSwappedSignatureTail())).toBe(true);
  });

  it("safe display repair reconciles swapped CLIENT / SERVICE PROVIDER blocks", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { text } = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    });
    expect(detectExecutionBlockRoleInversion(text)).toBe(false);
    const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);
  });

  it("post-polish display preserves Client / Service Provider orientation in signature block", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const safe = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    }).text;
    const { text } = polishProAgreementDisplayLayer(safe, {
      draft: fixture.draft,
      intakeText: INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);
  });

  it("hydrated signer metadata keeps corpus roles when recipient slot order differs", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const safe = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    }).text;
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
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: safe,
      authority,
      intakeRaw: INTAKE,
      surface: "test230_role_consistency",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    const tail = hydrated.corpus.slice(hydrated.corpus.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);
    const ordered = buildCorpusRoleIdentitiesForExecutionReconcile(safe);
    expect(ordered[0]?.blockHeading).toBe("CLIENT");
    expect(ordered[0]?.partyDisplayName).toContain("Blue Canyon");
  });

  it("accepted SoT hash matches display, copy, review, and signer_setup surfaces", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const session = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const safe = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    }).text;
    const source = establishPaidProSourceOfTruth({
      text: safe,
      intakeText: INTAKE,
      draft: fixture.draft,
      source: "server_full_draft",
    });
    expect(source.source).toBe("server_full_draft");
    for (const surface of ["display", "copy", "review", "signer_setup"] as const) {
      const doc = getPaidProDocumentForSurface(surface, { draft: fixture.draft, intakeText: INTAKE });
      expect(doc?.hash).toBe(source.hash);
      expect(doc?.text).toBe(source.text);
    }
    expect(session.acceptedText.length).toBeGreaterThan(100);
  });
});
