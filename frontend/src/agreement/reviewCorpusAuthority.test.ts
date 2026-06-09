import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  draftHasAcceptedProposalWithoutOpenPending,
  findLastAcceptedProposalProposer,
  resolveAcceptedReviewCorpusFromDraft,
} from "./reviewCorpusAuthority";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import { writeReviewFirstPinnedCorpus } from "../launch/simpleProduct/reviewFirstSendSurface";

function appliedDraft(): AgreementDraft {
  const corpus = [
    "CONSULTING AGREEMENT",
    ...Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "8. Notices",
    "All notices required or permitted under this Agreement shall be in writing.",
  ].join("\n");
  return {
    id: "ag_test309",
    title: "Consulting",
    jurisdiction: "DE",
    parties: [
      { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
      { id: "p-iron", name: "Iron Vale Systems Inc.", role: "reviewer" },
    ],
    purpose: corpus,
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [
      {
        event_type: "recipient_proposal_pending",
        at: "2026-06-07T21:00:00.000Z",
        value: {
          proposal_id: "prop-1",
          proposer_id: "p-iron",
          instruction: "Renumber section 8",
          draft: { purpose: corpus },
        },
      },
      {
        event_type: "recipient_proposal_applied",
        at: "2026-06-07T22:00:00.000Z",
        value: { proposal_id: "prop-1" },
      },
    ],
  } as AgreementDraft;
}

describe("reviewCorpusAuthority", () => {
  it("detects last accepted proposal proposer when no open proposals remain", () => {
    const draft = appliedDraft();
    expect(findLastAcceptedProposalProposer(draft.audit_log)?.proposerId).toBe("p-iron");
    expect(draftHasAcceptedProposalWithoutOpenPending(draft)).toBe(true);
  });

  it("prefers accepted draft corpus over stale pinned session corpus", () => {
    const draft = appliedDraft();
    const stalePin = "STALE PIN ".repeat(80);
    writeReviewFirstPinnedCorpus("ag_test309", stalePin);
    const resolved = resolveReviewFirstDisplayCorpus(draft);
    expect(resolved?.text).toContain("8. Notices");
    expect(resolved?.text).not.toContain("STALE PIN");
    expect(resolved?.source).not.toBe("review_first_pinned_corpus");
  });

  it("prefers accepted purpose over stale server_full_document_text", () => {
    const corrected = [
      "CONSULTING AGREEMENT",
      ...Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
      "",
      "8. Notices",
      "All notices required or permitted under this Agreement shall be in writing.",
      "City: Albuquerque",
    ].join("\n");
    const draft = {
      ...appliedDraft(),
      purpose: corrected,
      server_full_document_text: "STALE SERVER CORPUS ".repeat(20),
    } as AgreementDraft;
    const resolved = resolveAcceptedReviewCorpusFromDraft(draft);
    expect(resolved?.text).toContain("Albuquerque");
    expect(resolved?.text).not.toContain("STALE SERVER CORPUS");
    expect(resolved?.source).toBe("document_text");
  });
});
