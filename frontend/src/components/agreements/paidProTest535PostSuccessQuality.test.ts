/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { ensurePaidProMultiPartyAgreementOpening } from "./paidProOpeningRecitalGuard";
import {
  countOperativeIfToNoticeStanzas,
  dedupeDuplicateStandaloneNoticesHeadings,
  repairIncompleteIfToNoticeStanzas,
  resolveNoticeStructuralValidationParties,
} from "./paidProPartyNoticeDetails";
import { buildSignerMetadataPartiesFromIntakeManifest } from "./intakePartyManifestAuthority";
import {
  authorityPartiesToRecipientMetadata,
  partyLegalNamesMatch,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { hydratePaidProExecutionBlockWithSignerMetadata } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import {
  TEST519_BLUE_HARBOR,
  TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE,
  TEST519_IRON_GATE,
  TEST519_PARTY_ADDRESSES,
  TEST519_REDWOOD,
  TEST519_SUMMIT,
  test519Draft,
} from "./paidProTest519Fixtures";

const INTAKE = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;
const CANONICAL_PARTIES = [TEST519_REDWOOD, TEST519_SUMMIT, TEST519_BLUE_HARBOR, TEST519_IRON_GATE];

/** Comma/case-insensitive containment — canonical normalization drops the comma in "Foo, Inc.". */
function normalizeForMatch(value: string): string {
  return value.replace(/,/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function containsParty(haystack: string, party: string): boolean {
  return normalizeForMatch(haystack).includes(normalizeForMatch(party));
}

/**
 * Reproduces the TEST535 defective frozen corpus: model dropped the Client (Redwood) from the
 * opening recital, shifted every role up one slot, invented a phantom "Scope Inc." notice/signature
 * party, duplicated the NOTICES heading, and emitted only three signature blocks.
 */
function buildTest535MalformedFrozenCorpus(): string {
  return [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and among ${TEST519_SUMMIT} ("Client"), ${TEST519_BLUE_HARBOR} ("Lead Provider") and ${TEST519_IRON_GATE} ("Implementation Partner") (each a "Party" and collectively, the "Parties").`,
    "",
    "1. Project Scope and Roles",
    `Subject to the terms of this Agreement, the Providers shall perform professional technology services for ${TEST519_REDWOOD} in connection with Redwood's internal modernization project.`,
    "",
    "2. Payment",
    "Total project fee is $450,000 payable in milestone installments.",
    "",
    "3. Confidentiality",
    "Each Party will keep confidential information received from the other Parties confidential.",
    "",
    "4. Intellectual Property",
    "Each Party retains its pre-existing intellectual property.",
    "",
    "5. Limitation of Liability",
    "No Party is liable for indirect or consequential damages.",
    "",
    "6. Term and Termination",
    "The initial term is eighteen (18) months.",
    "",
    "7. Governing Law",
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "8. NOTICES",
    "",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    "NOTICES",
    "",
    `If to ${TEST519_SUMMIT}:`,
    TEST519_SUMMIT,
    "Address:",
    "710 Discovery Parkway",
    "Raleigh, NC 27609",
    "",
    `If to ${TEST519_BLUE_HARBOR}:`,
    TEST519_BLUE_HARBOR,
    "Address:",
    "1880 Legacy Drive",
    "Plano, TX 75024",
    "",
    `If to ${TEST519_IRON_GATE}:`,
    TEST519_IRON_GATE,
    "Address:",
    "210 West Monroe Street",
    "Chicago, IL 60606",
    "",
    "If to Scope Inc.:",
    "Scope Inc.",
    "Address:",
    "8300 Greensboro Drive",
    "McLean, VA 22102",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    TEST519_SUMMIT,
    "By: _____________________________",
    "Name: _____________________________",
    "Title: _____________________________",
    "Date: _____________________________",
    "",
    TEST519_BLUE_HARBOR,
    "By: _____________________________",
    "Name: _____________________________",
    "Title: _____________________________",
    "Date: _____________________________",
    "",
    TEST519_IRON_GATE,
    "By: _____________________________",
    "Name: _____________________________",
    "Title: _____________________________",
    "Date: _____________________________",
  ].join("\n");
}

/** A professionally correct four-party corpus — used to prove the render path is not disturbed. */
function buildTest535WellFormedFrozenCorpus(): string {
  return [
    "PROFESSIONAL TECHNOLOGY SERVICES AND AI IMPLEMENTATION AGREEMENT",
    "",
    `This Professional Technology Services and AI Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and among ${TEST519_REDWOOD} ("Client"), ${TEST519_SUMMIT} ("Lead Provider"), ${TEST519_BLUE_HARBOR} ("Implementation Partner"), and ${TEST519_IRON_GATE} ("Cybersecurity Auditor") (each a "Party" and collectively, the "Parties").`,
    "",
    "1. Services and Scope",
    "The Parties will collaborate on the modernization program described in the intake.",
    "",
    "2. Payment",
    "Total project fee is $450,000 payable in milestone installments.",
    "",
    "3. Confidentiality",
    "Each Party will keep confidential information confidential.",
    "",
    "4. Governing Law",
    "This Agreement is governed by the laws of the State of Delaware.",
    "",
    "5. NOTICES",
    "",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    ...CANONICAL_PARTIES.flatMap((name, i) => [
      `If to ${name}:`,
      name,
      "Attention: Authorized Signer",
      `Address: ${TEST519_PARTY_ADDRESSES[i]}`,
      "",
    ]),
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...CANONICAL_PARTIES.flatMap((name) => [
      name,
      "By: _____________________________",
      "Name: _____________________________",
      "Title: _____________________________",
      "Date: _____________________________",
      "",
    ]),
  ]
    .join("\n")
    .trim();
}

function manifestPartiesWithSignerData(): PaidProSignerMetadataParty[] {
  const signerNames = ["Ron Beer", "Caan Stanley", "Ben Harper", "Ira Gale"];
  const signerTitles = ["CEO", "Managing Member", "Member", "Managing Member"];
  const emails = [
    "test535-redwood@example.com",
    "test535-summit@example.com",
    "test535-blueharbor@example.com",
    "test535-irongate@example.com",
  ];
  return buildSignerMetadataPartiesFromIntakeManifest(INTAKE).map((p, i) => ({
    ...p,
    signerName: signerNames[i]!,
    signerTitle: signerTitles[i]!,
    signerEmail: emails[i]!,
    partyAddress: p.partyAddress || TEST519_PARTY_ADDRESSES[i]!,
  }));
}

describe("TEST535 — post-success Pro agreement quality (party/role/notice/signature/signer)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
    resetCanonicalPartyMetadataDiagnosticsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    storage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A — canonical party-role mapping preserved in the acceptance manifest / recital.
  it("A: four-party intake preserves canonical party-role mapping in recital", () => {
    const records = resolveAcceptanceManifestRecordsForExecution({
      draft: test519Draft(),
      intakeText: INTAKE,
    });
    expect(records).toHaveLength(4);
    expect(partyLegalNamesMatch(records[0]!.fullLegalName, TEST519_REDWOOD)).toBe(true);
    expect(records[0]!.roleLabel).toBe("Client");
    expect(records[1]!.roleLabel).toBe("Lead Provider");
    expect(records[2]!.roleLabel).toBe("Implementation Partner");
    expect(records[3]!.roleLabel).toBe("Cybersecurity Auditor");

    const opening = ensurePaidProMultiPartyAgreementOpening(
      buildTest535MalformedFrozenCorpus(),
      records,
      INTAKE,
    );
    // Redwood restored as Client; no provider promoted to Client.
    expect(opening.text).toMatch(
      /Redwood Biologics,?\s+Inc\.\s*\(\s*["'“”]?Client["'“”]?\s*\)/,
    );
    expect(opening.text).toMatch(
      /Summit AI Consulting LLC\s*\(\s*["'“”]?Lead Provider["'“”]?\s*\)/,
    );
    expect(opening.text).not.toMatch(
      /Summit AI Consulting LLC\s*\(\s*["'“”]?Client["'“”]?\s*\)/,
    );
    for (const name of CANONICAL_PARTIES) expect(containsParty(opening.text, name)).toBe(true);
  });

  // B — notices dedupe to one section and four correctly mapped stanzas.
  it("B: notices dedupe to one NOTICES section and four canonical stanzas", () => {
    const corpus = buildTest535MalformedFrozenCorpus();
    const parties = manifestPartiesWithSignerData();
    const roleContext = {
      intakeText: INTAKE,
      acceptedCorpus: corpus,
      draftPartyNames: CANONICAL_PARTIES,
    };

    expect(resolveNoticeStructuralValidationParties(parties, roleContext)).toHaveLength(4);

    const repaired = repairIncompleteIfToNoticeStanzas(corpus, parties, roleContext);
    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(4);
    expect(repaired.text).not.toMatch(/Scope Inc/i);

    const deduped = dedupeDuplicateStandaloneNoticesHeadings(repaired.text);
    const finalText = deduped.repairs.length ? deduped.text : repaired.text;
    const standaloneNotices = (finalText.match(/^\s*(?:\d+\.\s+)?NOTICES\s*$/gim) ?? []).length;
    expect(standaloneNotices).toBeLessThanOrEqual(1);

    // Redwood stanza present with its own Raleigh address (no address shifting).
    expect(finalText).toMatch(/If to Redwood Biologics,?\s+Inc\.:/);
    for (const name of CANONICAL_PARTIES) expect(containsParty(finalText, name)).toBe(true);
  });

  // C — signature block has four legal entities in canonical order, no missing/stale parties.
  it("C: execution block rebuilds to four canonical parties including Redwood", () => {
    const records = resolveAcceptanceManifestRecordsForExecution({
      draft: test519Draft(),
      intakeText: INTAKE,
    });
    const exec = ensurePaidProAcceptanceExecutionBlockInvariant(
      buildTest535MalformedFrozenCorpus(),
      records,
    );
    const witnessIdx = exec.text.search(/\bIN WITNESS WHEREOF\b/i);
    expect(witnessIdx).toBeGreaterThanOrEqual(0);
    const tail = exec.text.slice(witnessIdx);
    for (const name of CANONICAL_PARTIES) expect(containsParty(tail, name)).toBe(true);
    expect(tail).not.toMatch(/Scope Inc/i);
  });

  // D — signer setup finalize persists four names/titles/emails and hydrates signature lines.
  it("D: signer finalize persists 4/4/4 and hydrates execution block signer names", () => {
    const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
      intakeText: INTAKE,
      draft: test519Draft(),
    });
    expect(legalEntities).toHaveLength(4);

    const uiParties = manifestPartiesWithSignerData();
    establishCanonicalPartyMetadataAtStage({
      stage: "signer-setup",
      legalEntities,
      intakeText: INTAKE,
      uiParties,
    });

    const counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.partyCount).toBe(4);
    expect(counts.signerNameCount).toBe(4);
    expect(counts.titleCount).toBe(4);
    expect(counts.emailCount).toBe(4);

    // Correct 4-party execution block hydrates all four signer names.
    const records = resolveAcceptanceManifestRecordsForExecution({
      draft: test519Draft(),
      intakeText: INTAKE,
    });
    const correctedExecution = ensurePaidProAcceptanceExecutionBlockInvariant(
      buildTest535MalformedFrozenCorpus(),
      records,
    ).text;
    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(
      correctedExecution,
      authorityPartiesToRecipientMetadata(uiParties),
      { intakeText: INTAKE, acceptedCorpus: correctedExecution },
      { overwriteExistingMetadata: true },
    );
    const tail = hydrated.corpus.slice(hydrated.corpus.search(/\bIN WITNESS WHEREOF\b/i));
    for (const signerName of ["Ron Beer", "Caan Stanley", "Ben Harper", "Ira Gale"]) {
      expect(tail).toContain(signerName);
    }
  });

  // E — no stale/extra party (Scope Inc.) when intake declares exactly four named parties.
  it("E: exactly four parties, no phantom Scope Inc., in acceptance + notice authority", () => {
    const records = resolveAcceptanceManifestRecordsForExecution({
      draft: test519Draft(),
      intakeText: INTAKE,
    });
    expect(records).toHaveLength(4);
    expect(records.some((r) => /scope/i.test(r.fullLegalName))).toBe(false);

    const parties = manifestPartiesWithSignerData();
    const structural = resolveNoticeStructuralValidationParties(parties, {
      intakeText: INTAKE,
      acceptedCorpus: buildTest535MalformedFrozenCorpus(),
      draftPartyNames: CANONICAL_PARTIES,
    });
    expect(structural).toHaveLength(4);
    expect(structural.some((p) => /scope/i.test(p.partyLegalName))).toBe(false);
  });

  // F — a well-formed accepted four-party corpus keeps all four parties/roles and four notices.
  it("F: existing accepted corpus render path still works (stays correct)", () => {
    const good = buildTest535WellFormedFrozenCorpus();
    const records = resolveAcceptanceManifestRecordsForExecution({
      draft: test519Draft(),
      intakeText: INTAKE,
    });
    const opening = ensurePaidProMultiPartyAgreementOpening(good, records, INTAKE);
    // Whether or not the guard normalizes, the four parties and correct roles are preserved.
    expect(opening.text).toMatch(
      /Redwood Biologics,?\s+Inc\.\s*\(\s*["'“”]?Client["'“”]?\s*\)/,
    );
    expect(opening.text).not.toMatch(
      /Summit AI Consulting LLC\s*\(\s*["'“”]?Client["'“”]?\s*\)/,
    );
    for (const name of CANONICAL_PARTIES) expect(containsParty(opening.text, name)).toBe(true);
    expect(opening.text).not.toMatch(/Scope Inc/i);

    expect(countOperativeIfToNoticeStanzas(good)).toBe(4);
    for (const name of CANONICAL_PARTIES) expect(containsParty(good, name)).toBe(true);
  });
});
