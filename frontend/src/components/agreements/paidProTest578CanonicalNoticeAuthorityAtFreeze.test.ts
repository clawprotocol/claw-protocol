/** @vitest-environment jsdom */
/**
 * TEST578 — canonical notice authority at freeze for generic manifest fallback corpora.
 *
 * When no intake/draft party context exists, freeze must still establish operative notice stanzas
 * from the generic manifest without spurious role-corruption or fused-heading rejections.
 */
import { describe, expect, it } from "vitest";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  finalizePaidProCanonicalNoticeAuthorityForFreeze,
  resolvePaidProNoticeAuthorityPartiesForFreeze,
} from "./paidProNoticeContactAuthority";
import { repairFusedNoticesHeadingToPriorClause } from "./paidProPartyNoticeDetails";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

/**
 * Shared fixture raw length is ~10k; post-normalize prepare can shrink ~1.2k chars
 * (post-signature pads are dropped). Expand operative supplements before IN WITNESS
 * so prepared/established text stays > SUBSTANTIVE_SERVER_DRAFT_MIN_LEN.
 */
const PAID_BODY = expandOperativeCorpusWithUniqueSupplements(
  SHARED_ACCEPTED_PAID_BODY,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
);

describe("TEST578 canonical notice authority at freeze", () => {
  it("defuses a Notices heading fused onto prior clause prose", () => {
    const fused = "Services continue through completion.12. Notices\nIf to Acme Corp:\nAcme Corp";
    const repaired = repairFusedNoticesHeadingToPriorClause(fused);
    expect(repaired.repairs).toContain("notice:defuse_fused_notices_heading");
    expect(repaired.text).toMatch(/\n\n12\. NOTICES/);
    expect(repaired.text).not.toMatch(/e\.12\. Notices/i);
  });

  it("freeze gates pass for generic manifest server_full_draft without intake", () => {
    const prep = preparePaidProFreezeCandidateText({
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test578",
    });
    const gate = evaluatePaidProFreezeCandidateGates(prep, {
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test578",
    });
    expect(gate.ok).toBe(true);
    expect(gate.rejectReason).toBeNull();
    // Commercial no-invent: generic Party 1/Party 2 notice scaffolding is not synthesized
    // when freeze has no authoritative legal entities (deferred to signer setup).
    expect(gate.text).not.toMatch(/^If to Party 1:/im);
    expect(gate.text).not.toMatch(/^If to Party 2:/im);
  });

  it("SoT establishment succeeds for PAID_BODY routing fixture", () => {
    expect(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN).toBe(10_000);
    const prep = preparePaidProFreezeCandidateText({
      text: PAID_BODY,
      source: "server_full_draft",
      surface: "test578_sot",
    });
    // Assert prepared-text length (not obsolete raw length); establish may still
    // apply notice authority that slightly expands the committed corpus.
    expect(prep.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const record = establishPaidProSourceOfTruth({
      text: PAID_BODY,
      source: "server_full_draft",
    });
    expect(record.source).toBe("server_full_draft");
    expect(record.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(record.text.length).toBeGreaterThanOrEqual(prep.text.length);
  });

  it("four-party intake notices pass structural validation with authority-aligned parties", () => {
    const intake = [
      "Create a Professional Technology Services Agreement between the following four parties:",
      "",
      "Redwood Biologics Inc (Client)",
      "Summit AI Consulting LLC (Lead Provider)",
      "Blue Harbor Systems LLC (Implementation Partner)",
      "Iron Gate Security LLC (Cybersecurity Auditor)",
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
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(corpus, {
      intakeText: intake,
    });
    const violations = validateNoticesClauseFamilyStructuralIntegrity(finalized.text, {
      parties,
      phase: "post_acceptance",
      intakeText: intake,
      acceptedCorpus: finalized.text,
    });
    expect(violations.map((v) => v.code)).not.toContain("notice_stanza_role_corruption");
    expect(violations.map((v) => v.code)).not.toContain("missing_party_notice_stanzas");
  });
});
