/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).";

/** Tip polish may keep entity on the role line or the next line. */
const CLIENT_ENTITY_RE = /CLIENT\s*:\s*(?:\n\s*)?Blue Canyon Analytics LLC/i;
const PROVIDER_ENTITY_RE = /SERVICE\s+PROVIDER\s*:\s*(?:\n\s*)?Iron Vale Systems Inc/i;

function buildSwappedSignatureTail(): string {
  const base = [
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
  return expandOperativeCorpusWithUniqueSupplements(base, SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600);
}

function buildParentheticalSwappedSignatureTail(): string {
  const base = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. SCOPE. Provider will deliver AI workflow implementation services.",
    "2. FEES. Client will pay a fixed fee of $8,500.",
    "3. GOVERNING LAW. Delaware law governs.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `${PAID_PRO_HARDENING_CLIENT} (Service Provider)`,
    "By: __________________________",
    "Name: __________________________",
    "",
    `${PAID_PRO_HARDENING_PROVIDER} (Client)`,
    "By: __________________________",
    "Name: __________________________",
  ].join("\n");
  return expandOperativeCorpusWithUniqueSupplements(base, SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600);
}

describe("paidPro execution block role consistency", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProPipelineTestIsolation();
  });

  it("parses Blue Canyon as Client and Iron Vale as Service Provider from recital", () => {
    const roles = resolvePaidProPartyRolesFromAcceptedCorpus(buildSwappedSignatureTail());
    expect(roles.find((r) => r.role === "client")?.legalName).toContain("Blue Canyon");
    expect(roles.find((r) => r.role === "service_provider")?.legalName).toMatch(/Iron Vale/);
  });

  it("detects inverted execution block roles vs accepted corpus recital", () => {
    expect(detectExecutionBlockRoleInversion(buildSwappedSignatureTail())).toBe(true);
  });

  it("detects parenthetical execution block role inversion before signer metadata", () => {
    expect(detectExecutionBlockRoleInversion(buildParentheticalSwappedSignatureTail())).toBe(true);
  });

  it("defer render path reconciles parenthetical inversion without opening guard", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const inverted = buildParentheticalSwappedSignatureTail();
    establishPaidProSourceOfTruth({
      text: inverted,
      intakeText: INTAKE,
      draft: fixture.draft,
      source: "server_full_draft",
    });
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: INTAKE,
      deferSignerMetadataRepair: true,
    });
    expect(detectExecutionBlockRoleInversion(renderPlain)).toBe(false);
    const tail = renderPlain.slice(renderPlain.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).toMatch(CLIENT_ENTITY_RE);
    expect(tail).toMatch(PROVIDER_ENTITY_RE);
  });

  it("safe display repair reconciles swapped CLIENT / SERVICE PROVIDER blocks", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { text } = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    });
    expect(detectExecutionBlockRoleInversion(text)).toBe(false);
    const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).toMatch(CLIENT_ENTITY_RE);
    expect(tail).toMatch(PROVIDER_ENTITY_RE);
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
    expect(tail).toMatch(CLIENT_ENTITY_RE);
    expect(tail).toMatch(PROVIDER_ENTITY_RE);
  });

  it("hydrated signer metadata keeps corpus roles when recipient slot order differs", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const safe = applyAcceptedProCorpusSafeDisplay(buildSwappedSignatureTail(), {
      draft: fixture.draft,
      intakeText: INTAKE,
    }).text;
    // Safe display restores corpus roles; tip hydration follows recipient slot order, so keep
    // authority slots aligned with Client / Service Provider after reconcile.
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "client@test.com",
      recipient2Email: "provider@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Client Signer", "Provider Signer"],
      partySignerTitles: ["CEO", "VP"],
      partyAddresses: ["100 Main St", "200 Oak Ave"],
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
    expect(tail).toMatch(CLIENT_ENTITY_RE);
    expect(tail).toMatch(PROVIDER_ENTITY_RE);
    expect(tail).toMatch(/Name:\s*Client Signer/i);
    expect(tail).toMatch(/Name:\s*Provider Signer/i);
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
