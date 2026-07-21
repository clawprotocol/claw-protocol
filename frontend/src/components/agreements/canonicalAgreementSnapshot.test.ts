/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import {
  clearAuthoritativeAgreementDocument,
  getAuthoritativeAgreementDocument,
} from "./authoritativeAgreementDocument";
import {
  buildCanonicalAgreementSnapshot,
  canonicalSnapshotAlignsWithPaidProAuthority,
  clearFrozenCanonicalAgreementCorpus,
  getFrozenCanonicalAgreementCorpus,
  readAuthoritativeCorpusInvariant,
  resolveCanonicalSnapshotDiagnosticIntegrity,
  type CanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

const FIXTURE = "freeProQaTemplateATest204";

describe("canonicalAgreementSnapshot diagnostic integrity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeAgreementDocument();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("reports integrityOk true when working draft hash matches Paid Pro authority and invariant holds", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const sot = getPaidProSourceOfTruth()!;

    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "draft_ready_for_review",
      tier: "pro",
      candidates: [{ source: "canonical_working_draft", text: sot.text }],
      intakeText: fixture.intakeText,
      parties: fixture.draft.parties?.map((p) => ({
        name: p.name,
        role: p.role ?? null,
        email: null,
      })),
      signerState: { complete: false, signerCount: 2 },
      minLen: 500,
    });

    expect(snapshot.canonicalText).toBe(sot.text);
    expect(canonicalSnapshotAlignsWithPaidProAuthority(snapshot)).toBe(true);
    expect(readAuthoritativeCorpusInvariant({ canonicalHash: snapshot.hash }).invariantOk).toBe(true);

    const diagnostic = resolveCanonicalSnapshotDiagnosticIntegrity(snapshot);
    expect(diagnostic.reportedIntegrityOk).toBe(true);
    expect(diagnostic.authorityAligned).toBe(true);
    expect(diagnostic.authorityInvariantOk).toBe(true);
    expect(diagnostic.predicateIntegrityOk).toBe(snapshot.integrityOk);
  });

  it("elevates reported integrity when predicate is false but authority hash matches", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const sot = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus()!;

    const diagnosticSnapshot: CanonicalAgreementSnapshot = {
      ...frozen,
      source: "canonical_working_draft",
      sourceLabel: "canonical_working_draft",
      integrityOk: false,
      hash: sot.hash,
      len: sot.text.length,
      canonicalText: sot.text,
      bodyText: sot.text,
      frozen: false,
    };

    const diagnostic = resolveCanonicalSnapshotDiagnosticIntegrity(diagnosticSnapshot);
    expect(diagnostic.predicateIntegrityOk).toBe(false);
    expect(diagnostic.reportedIntegrityOk).toBe(true);
    expect(diagnostic.authorityAligned).toBe(true);
    expect(diagnostic.authorityInvariantOk).toBe(true);
  });

  it("reports integrityOk false for non-authoritative free_starter fallback", () => {
    const starterPlain = "Short starter preview.";
    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "draft_ready_for_review",
      tier: "starter",
      candidates: [{ source: "free_starter", text: starterPlain }],
      minLen: 120,
    });

    expect(canonicalSnapshotAlignsWithPaidProAuthority(snapshot)).toBe(false);
    const diagnostic = resolveCanonicalSnapshotDiagnosticIntegrity(snapshot);
    expect(diagnostic.authorityAligned).toBe(false);
    expect(snapshot.integrityOk).toBe(false);
    expect(diagnostic.reportedIntegrityOk).toBe(false);
  });

  it("does not mutate corpus text when resolving diagnostic integrity", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { acceptedText } = armPaidProHardeningSession({ fixture });
    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft",
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const before = getPaidProSourceOfTruth()!.text;
    const frozenBefore = getFrozenCanonicalAgreementCorpus()?.canonicalText ?? "";
    const docBefore = getAuthoritativeAgreementDocument()?.fullCorpusText ?? "";

    buildCanonicalAgreementSnapshot({
      surface: "draft_ready_for_review",
      tier: "pro",
      candidates: [{ source: "canonical_working_draft", text: before }],
      intakeText: fixture.intakeText,
      parties: fixture.draft.parties?.map((p) => ({ name: p.name, role: p.role ?? null })),
      minLen: 500,
    });

    expect(getPaidProSourceOfTruth()!.text).toBe(before);
    expect(getFrozenCanonicalAgreementCorpus()?.canonicalText ?? frozenBefore).toBe(frozenBefore);
    expect(getAuthoritativeAgreementDocument()?.fullCorpusText ?? docBefore).toBe(docBefore);
  });
});
