/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  finalizePaidProCanonicalNoticeAuthorityForFreeze,
  resolvePaidProNoticeAuthorityPartiesForFreeze,
} from "./paidProNoticeContactAuthority";
import {
  ensureOperativeNoticeStanzaEntityLinesAtFreeze,
  isCanonicalPositionalNoticeEntityIdentity,
  noticeStanzaHasLegalEntityLine,
  resolveAuthoritativeNoticesRegionForFreeze,
} from "./paidProPartyNoticeDetails";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

import {
  SHARED_ACCEPTED_PAID_BODY,
  SHARED_HARBOR_PEAK,
  SHARED_RED_MESA,
} from "./paidProSharedFixtureSystem";

const PAID_BODY = SHARED_ACCEPTED_PAID_BODY;
const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";

const CORPUS_WITH_ENTITIES = [
  "MASTER SERVICES AGREEMENT",
  "",
  `This Agreement is between ${BLUE_CANYON} and ${IRON_VALE}.`,
  "",
  ...Array.from({ length: 40 }, (_, i) => `${i + 1}. Clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  `CLIENT: ${BLUE_CANYON}`,
  "By: ___",
  "Name:",
  "Title:",
  "Date:",
  "",
  `SERVICE PROVIDER: ${IRON_VALE}`,
  "By: ___",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

describe("TEST580 — notice entity-line authority at freeze", () => {
  beforeEach(() => resetPaidProPipelineTestIsolation());
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
  });

  it("accepts canonical positional Party N identity as non-empty entity authority", () => {
    expect(isCanonicalPositionalNoticeEntityIdentity("Party 1")).toBe(true);
    expect(
      noticeStanzaHasLegalEntityLine("If to Party 1:\nParty 1\nprovided during signer setup."),
    ).toBe(true);
  });

  it("hydrates generic manifest stanzas with non-empty entity lines", () => {
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({ acceptedCorpus: PAID_BODY });
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(PAID_BODY, {
      surface: "test580_generic",
    });
    const hydrated = ensureOperativeNoticeStanzaEntityLinesAtFreeze(finalized.text, parties, {
      acceptedCorpus: finalized.text,
    });
    const region = resolveAuthoritativeNoticesRegionForFreeze(hydrated.text);
    // Approved tip behavior: entity-line notice authority (not generic Party N heads).
    expect(region).toMatch(new RegExp(`^If to ${SHARED_RED_MESA}:`, "im"));
    expect(region).toMatch(new RegExp(`^If to ${SHARED_HARBOR_PEAK}:`, "im"));
    expect(region).toMatch(new RegExp(`\\n${SHARED_RED_MESA}\\n`));
    expect(region).toMatch(new RegExp(`\\n${SHARED_HARBOR_PEAK}\\n`));
    expect(region).not.toMatch(/^If to Party 1:/im);
    expect(region).not.toMatch(/^If to Party 2:/im);
    const violations = validateNoticesClauseFamilyStructuralIntegrity(hydrated.text, {
      parties,
      acceptedCorpus: hydrated.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("empty_notice_entity_name");
  });

  it("TEST578 generic manifest freeze gates pass without empty_notice_entity_name", () => {
    const prep = preparePaidProFreezeCandidateText({
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test580",
    });
    const gate = evaluatePaidProFreezeCandidateGates(prep, {
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test580",
    });
    expect(gate.ok).toBe(true);
    expect(gate.rejectReason).toBeNull();
    expect(gate.text).toMatch(/^If to Party 1:/im);
    expect((gate.text.match(/^If to\s+/gim) || []).length).toBeGreaterThanOrEqual(2);
    expect((gate.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("preserves accepted-corpus legal entity names in notice entity lines", () => {
    const record = establishPaidProSourceOfTruth({
      text: CORPUS_WITH_ENTITIES,
      source: "paidProSourceOfTruth",
    });
    expect(record.text).toContain(BLUE_CANYON);
    expect(record.text).toContain(IRON_VALE);
    const region = resolveAuthoritativeNoticesRegionForFreeze(record.text);
    expect(region).toContain(BLUE_CANYON);
    expect(region).toContain(IRON_VALE);
    const violations = validateNoticesClauseFamilyStructuralIntegrity(record.text, {
      parties: resolvePaidProNoticeAuthorityPartiesForFreeze({ acceptedCorpus: record.text }),
      acceptedCorpus: record.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("empty_notice_entity_name");
    expect(violations.map((v) => v.code)).not.toContain("notice_stanza_execution_pollution");
  });

  it("four-party intake preserves four ordered entity lines", () => {
    const intake = [
      "Create a four-party agreement between Redwood Biologics Inc, Summit AI Consulting LLC,",
      "Blue Harbor Systems LLC, and Iron Gate Security LLC.",
    ].join("\n");
    const corpus = [
      "10. NOTICES",
      "",
      "If to Redwood Biologics Inc:",
      "Redwood Biologics Inc",
      "",
      "If to Summit AI Consulting LLC:",
      "Summit AI Consulting LLC",
      "",
      "If to Blue Harbor Systems LLC:",
      "Blue Harbor Systems LLC",
      "",
      "If to Iron Gate Security LLC:",
      "Iron Gate Security LLC",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
      intakeText: intake,
      acceptedCorpus: corpus,
    });
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(corpus, { intakeText: intake });
    const violations = validateNoticesClauseFamilyStructuralIntegrity(finalized.text, {
      parties,
      intakeText: intake,
      acceptedCorpus: finalized.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("empty_notice_entity_name");
    expect((finalized.text.match(/^If to\s+/gim) || []).length).toBeGreaterThanOrEqual(4);
  });
});
