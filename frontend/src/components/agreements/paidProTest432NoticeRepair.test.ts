import { describe, expect, it } from "vitest";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countOperativeIfToNoticeStanzas, repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  buildTest432PreparedAcceptCorpus,
  buildTest432ServerFullDraftWithIncompleteNotices,
  TEST432_INTAKE,
  test432Draft,
} from "./paidProTest432Fixtures";

describe("test432 notice repair", () => {
  it("rebuilds two stanzas from incomplete notices", () => {
    const prepared = preparePaidProServerDocumentForAcceptance(
      buildTest432ServerFullDraftWithIncompleteNotices(),
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test" },
    );
    const parties = resolvePartiesForReviewRender({ draft: test432Draft(), intakeText: TEST432_INTAKE });
    const repaired = repairIncompleteIfToNoticeStanzas(prepared.text, parties, {
      intakeText: TEST432_INTAKE,
      draftPartyNames: test432Draft().parties.map((p) => String((p as { name?: string }).name ?? "")),
      acceptedCorpus: prepared.text,
    });
    expect(countOperativeIfToNoticeStanzas(repaired.text)).toBe(2);
    expect(repaired.text.length).toBeGreaterThan(5000);
  });

  it("freeze commit preserves two operative stanzas for prepared accept corpus", () => {
    const prepared = preparePaidProServerDocumentForAcceptance(
      buildTest432PreparedAcceptCorpus(),
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test" },
    );
    const freeze = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
      surface: "test",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(2);
    expect(freeze.text.length).toBeGreaterThan(5000);
  });
});
