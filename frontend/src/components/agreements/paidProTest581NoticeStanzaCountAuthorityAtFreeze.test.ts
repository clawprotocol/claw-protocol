/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  finalizePaidProCanonicalNoticeAuthorityForFreeze,
  resolvePaidProNoticeAuthorityPartiesForFreeze,
} from "./paidProNoticeContactAuthority";
import {
  ensureOperativeNoticeStanzaCountAuthorityAtFreeze,
  ensureOperativeNoticeStanzaEntityLinesAtFreeze,
  resolveAuthoritativeNoticesRegionForFreeze,
  resolveCanonicalNoticePartyCount,
  noticeStanzaHasLegalEntityLine,
  noticeStanzaHasRoleLabelCorruption,
} from "./paidProPartyNoticeDetails";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  TEST423_IRONCLAD_JV_INTAKE,
  TEST423_JV_PARTIES,
} from "./paidProTest423Fixtures";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";

const PAID_BODY = SHARED_ACCEPTED_PAID_BODY;
const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const CORPUS_TWO_COMPLETE = [
  "11. NOTICES",
  "",
  "Notices under this Agreement must be in writing and delivered as set forth below.",
  "",
  `If to ${BLUE}:`,
  BLUE,
  "Attn: Jane Doe",
  "Email: jane@blue.test",
  "",
  `If to ${IRON}:`,
  IRON,
  "Attn: John Smith",
  "Email: john@iron.test",
  "",
  "IN WITNESS WHEREOF",
].join("\n");

function partiesFor(names: readonly string[]) {
  return names.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

describe("TEST581 — operative notice stanza count authority at freeze", () => {
  beforeEach(() => resetPaidProPipelineTestIsolation());
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
  });

  it("A. two-party complete family is preserved without mutation", () => {
    const parties = partiesFor([BLUE, IRON]);
    const roleContext = { acceptedCorpus: CORPUS_TWO_COMPLETE };
    const before = CORPUS_TWO_COMPLETE;
    const reconciled = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(before, parties, roleContext);
    expect(reconciled.repairs).toHaveLength(0);
    expect(reconciled.text).toBe(before);
    const violations = validateNoticesClauseFamilyStructuralIntegrity(reconciled.text, {
      parties,
      acceptedCorpus: reconciled.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("missing_party_notice_stanzas");
  });

  it("B. two-party partial family adds only the missing second stanza", () => {
    const partial = [
      "11. NOTICES",
      "",
      `If to ${BLUE}:`,
      BLUE,
      "provided during signer setup.",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const parties = partiesFor([BLUE, IRON]);
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(partial, {
      reviewParties: parties,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(finalized.text);
    expect((region.match(/^If to\s+/gim) || []).length).toBe(2);
    expect(finalized.text).toContain(IRON);
    expect((finalized.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("C. heading-only stanza is rebuilt, not counted as complete", () => {
    const headingOnly = [
      "11. NOTICES",
      "",
      "If to Party 1:",
      "Party 1",
      "provided during signer setup.",
      "",
      "If to Party 2:",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    expect(noticeStanzaHasLegalEntityLine("If to Party 2:")).toBe(false);
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({ acceptedCorpus: PAID_BODY });
    const hydrated = ensureOperativeNoticeStanzaEntityLinesAtFreeze(headingOnly, parties, {
      acceptedCorpus: headingOnly,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(hydrated.text);
    // Heading-only input is incomplete; rebuild uses entity-line notice authority.
    expect((region.match(/^If to\s+/gim) || []).length).toBe(2);
    expect(region).toMatch(/If to Harbor Peak Automation LLC:/i);
    expect(region).toMatch(/\nHarbor Peak Automation LLC\n/);
    expect(region).not.toMatch(/\nParty 2\n/);
  });

  it("D. four-party partial corpus receives exactly four ordered stanzas", () => {
    const intake = [
      "Create a four-party agreement between Redwood Biologics Inc, Summit AI Consulting LLC,",
      "Blue Harbor Systems LLC, and Iron Gate Security LLC.",
    ].join("\n");
    const partial = [
      "10. NOTICES",
      "",
      "If to Redwood Biologics Inc:",
      "Redwood Biologics Inc",
      "",
      "If to Summit AI Consulting LLC:",
      "Summit AI Consulting LLC",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
      intakeText: intake,
      acceptedCorpus: partial,
    });
    expect(resolveCanonicalNoticePartyCount(parties, { intakeText: intake })).toBe(4);
    const reconciled = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(partial, parties, {
      intakeText: intake,
      acceptedCorpus: partial,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(reconciled.text);
    expect((region.match(/^If to\s+/gim) || []).length).toBe(4);
    expect(region.indexOf("Blue Harbor Systems LLC")).toBeLessThan(region.indexOf("Iron Gate Security LLC"));
  });

  it("E. five-party intake authority produces five stanzas without fabrication", () => {
    // Lean Case-D-style partial corpus: exercise intake→stanza rebuild without the
    // Test423 minLen=5200 recovery padding + full freeze-gate path (E2 timeout source).
    const intake = TEST423_IRONCLAD_JV_INTAKE;
    const partial = [
      "JOINT AI INFRASTRUCTURE ROLLOUT AGREEMENT",
      "",
      "This Agreement is entered into by and among Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC.",
      "",
      "1. SERVICES AND SCOPE",
      "Joint AI software and infrastructure rollout.",
      "",
      "10. NOTICES",
      "",
      `If to ${TEST423_JV_PARTIES[0]}:`,
      TEST423_JV_PARTIES[0]!,
      "",
      `If to ${TEST423_JV_PARTIES[1]}:`,
      TEST423_JV_PARTIES[1]!,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n");
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
      intakeText: intake,
      acceptedCorpus: partial,
    });
    expect(resolveCanonicalNoticePartyCount(parties, { intakeText: intake })).toBe(5);
    const reconciled = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(partial, parties, {
      intakeText: intake,
      acceptedCorpus: partial,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(reconciled.text);
    expect((region.match(/^If to\s+/gim) || []).length).toBe(5);
    for (const party of TEST423_JV_PARTIES) {
      expect(region).toContain(party);
    }
    expect(region).toContain("VertexGrid Technologies LLC");
    expect(region.indexOf("Ironclad Systems Group LLC")).toBeLessThan(
      region.indexOf("VertexGrid Technologies LLC"),
    );
    const violations = validateNoticesClauseFamilyStructuralIntegrity(reconciled.text, {
      parties,
      intakeText: intake,
      acceptedCorpus: reconciled.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("empty_notice_entity_name");
    expect(violations.map((v) => v.code)).not.toContain("missing_party_notice_stanzas");
  });

  it("F. duplicate stanza for one party does not satisfy another party slot", () => {
    const duplicate = [
      "11. NOTICES",
      "",
      `If to ${BLUE}:`,
      BLUE,
      "provided during signer setup.",
      "",
      `If to ${BLUE}:`,
      BLUE,
      "provided during signer setup.",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const parties = partiesFor([BLUE, IRON]);
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(duplicate, {
      reviewParties: parties,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(finalized.text);
    const headings = region.match(/^If to\s+(.+?):/gim) ?? [];
    expect(headings.length).toBe(2);
    expect(region).toContain(IRON);
  });

  it("G. role-only labels trigger role corruption, not authoritative entity identity", () => {
    expect(
      noticeStanzaHasRoleLabelCorruption("If to Client:\nClient\nprovided during signer setup."),
    ).toBe(true);
  });

  it("H. frozen corpus and validation region both contain all required stanzas", () => {
    const prep = preparePaidProFreezeCandidateText({
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test581_region",
    });
    const gate = evaluatePaidProFreezeCandidateGates(prep, {
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test581_region",
    });
    const frozenCount = (gate.text.match(/^If to\s+/gim) || []).length;
    const regionCount = (resolveAuthoritativeNoticesRegionForFreeze(gate.text).match(/^If to\s+/gim) || [])
      .length;
    expect(frozenCount).toBeGreaterThanOrEqual(2);
    expect(regionCount).toBe(frozenCount);
  });

  it("I. entity lines inside If-to stanzas survive normalization (execution pollution guardrail)", () => {
    const prep = preparePaidProFreezeCandidateText({
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test581_pollution",
    });
    const gate = evaluatePaidProFreezeCandidateGates(prep, {
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test581_pollution",
    });
    const violations = validateNoticesClauseFamilyStructuralIntegrity(gate.text, {
      parties: resolvePaidProNoticeAuthorityPartiesForFreeze({ acceptedCorpus: gate.text }),
      acceptedCorpus: gate.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("notice_stanza_execution_pollution");
    expect(violations.map((v) => v.code)).not.toContain("empty_notice_entity_name");
  });

  it("J. freeze repair is idempotent for generic manifest", () => {
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({ acceptedCorpus: PAID_BODY });
    const once = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(PAID_BODY, parties, {
      acceptedCorpus: PAID_BODY,
    });
    const twice = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(once.text, parties, {
      acceptedCorpus: once.text,
    });
    expect(twice.repairs).toHaveLength(0);
    expect(twice.text).toBe(once.text);
  });

  it("validates stanza count for substantive two-party corpus", () => {
    const corpus = [
      "MASTER SERVICES AGREEMENT",
      "",
      `This Agreement is between ${BLUE} and ${IRON}.`,
      "",
      ...Array.from({ length: 40 }, (_, i) => `${i + 1}. Clause ${i + 1}.`),
      "",
      CORPUS_TWO_COMPLETE,
    ].join("\n");
    const parties = partiesFor([BLUE, IRON]);
    const reconciled = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(corpus, parties, {
      acceptedCorpus: corpus,
    });
    expect((resolveAuthoritativeNoticesRegionForFreeze(reconciled.text).match(/^If to\s+/gim) || []).length).toBe(
      2,
    );
  });
});
