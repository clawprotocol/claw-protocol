import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  prepareGuidedSigningCorpusCleanup,
  selectGuidedSignatureTrackCorpus,
} from "./guidedFinalReviewToSigning";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedFinalReviewAuthoritativeBody";
import { resolveSimpleProFinalReviewCorpus } from "../simpleProFinalReviewCorpus";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import { resolveCanonicalFinalPartyManifest } from "./canonicalFinalPartyManifest";
import { buildGuidedVs01SigningHandoff, assertGuidedProVs01BridgeCorpusReady } from "./guidedVs01SigningHandoff";
import {
  readGuidedVs01SigningHandoffSession,
  writeGuidedVs01SigningHandoffSession,
  clearGuidedVs01SigningHandoffSession,
  mergeAgreementDraftWithGuidedSigningHandoff,
} from "./guidedVs01SigningHandoffSession";
import { resolveFinalVs01CorpusOrBlock } from "../../../vs01/vs01SigningCorpus";

const SHORT_HYDRATED = `${"Hydrated short draft from server. ".repeat(30)}`.slice(0, 2188);

function aiAutomationCorpus(): string {
  const manifest = resolveCanonicalFinalPartyManifest({
    partyCount: 2,
    partySignerNames: ["Anthem H Blanchard", ""],
    partySignerTitles: ["Manager", ""],
    recipient1Name: "Acme LLC",
    recipient2Name: "Joe Smith",
    recipient1Email: "anthem@example.test",
    recipient2Email: "joe@example.test",
    extraPartyReviewEmails: [],
    draftPartyNames: ["Acme LLC", "Joe Smith"],
    sendMode: "signature",
    recipientsDeferred: false,
  });
  const body = `
AI AUTOMATION SERVICES AGREEMENT

1. Purpose and Scope
Provider delivers AI automation services. ${"Operational detail with milestones, approvals, payment mechanics, workflow definitions, and human review checkpoints. ".repeat(28)}

2. Fees and Payment
Invoices are due Net 30 from receipt.

3. Confidentiality
Each party protects confidential information.

4. Ownership and Work Product
Client owns deliverables after payment.

5. Support and Service Levels
Provider offers commercially reasonable support.

6. Term and Termination
Either party may terminate with 30 days written notice.

7. Notices
Notices may be delivered electronically.

9. Electronic Signatures
The parties may sign electronically.

4.2.

**7.**

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
By: ______________________
Name: Joe Smith
Date: ____________________`.trim();
  return prepareGuidedSigningCorpusCleanup({ body, partyManifest: manifest }).body;
}

const sessionStore = new Map<string, string>();

describe("guided VS01 bridge handoff regression (failure shape)", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
    });
    clearGuidedVs01SigningHandoffSession();
  });

  it("keeps finalized guided corpus when hydrated draft is shorter or empty", () => {
    const corpus = aiAutomationCorpus();
    expect(corpus.length).toBeGreaterThan(3500);
    expect(corpus).not.toMatch(/^\s*4\.2\.\s*$/m);
    expect(corpus).not.toMatch(/^\s*\*\*7\.\*\*\s*$/m);
    expect(corpus).not.toMatch(/\*\*[^*]+\*\*/);

    const sectionNumbers = [...corpus.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)].map((m) => Number(m[1]));
    expect(sectionNumbers).toEqual(sectionNumbers.map((_, i) => i + 1));
    expect(sectionNumbers).toContain(8);

    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });
    writeGuidedVs01SigningHandoffSession(handoff);

    const emptyDraft: Record<string, unknown> = {
      parties: [{ name: "Acme LLC", email: "a@test.com" }, { name: "Joe Smith", email: "j@test.com" }],
      title: "MSA",
      document_text: "",
      server_full_document_text: "",
      premium_full_document_text: "",
    };

    const shortDraft = {
      ...emptyDraft,
      server_full_document_text: SHORT_HYDRATED,
      premium_full_document_text: SHORT_HYDRATED,
      document_text: SHORT_HYDRATED,
    };

    expect(readGuidedVs01SigningHandoffSession()?.corpusText.length).toBe(corpus.length);

    const resolution = resolveFinalVs01CorpusOrBlock({
      guidedSigningHandoff: readGuidedVs01SigningHandoffSession(),
      agreementCorpusText: corpus,
      draft: shortDraft as never,
      guidedPro: true,
      signatureRebuilt: true,
    });

    expect(resolution.allowed).toBe(true);
    expect(resolution.source).toBe("finalized_signer_applied_guided_corpus");
    expect(resolution.len).toBe(corpus.length);
    expect(resolution.source).not.toBe("rebuilt_witness_block");
  });

  it("assertGuidedProVs01BridgeCorpusReady blocks empty corpus before bridge", () => {
    const assertOk = assertGuidedProVs01BridgeCorpusReady(
      buildGuidedVs01SigningHandoff({
        corpusText: aiAutomationCorpus(),
        source: "finalized_signer_applied_guided_corpus",
      }),
    );
    expect(assertOk.ok).toBe(true);

    const assertBad = assertGuidedProVs01BridgeCorpusReady(
      buildGuidedVs01SigningHandoff({
        corpusText: "",
        source: "finalized_signer_applied_guided_corpus",
      }),
    );
    expect(assertBad.ok).toBe(false);
    expect(assertBad.reason).toBe("corpus_too_short");
  });

  it("aligns final review display, VS01 handoff, and signing track on the same finalized signer corpus", () => {
    const corpus = aiAutomationCorpus();
    const staleServer = `${corpus}\n\nStale server_full_document_text appendix.`;
    const stalePicker = `${corpus}\n\nStale picker_authoritative appendix.`;
    expect(staleServer.length).toBeGreaterThan(corpus.length);

    const finalReview = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "finalized_signer_applied_guided_corpus", body: corpus },
        { source: "server_full_document_text", body: staleServer },
        { source: "picker_authoritative", body: stalePicker },
      ],
      signingCorpusReady: true,
    });
    const display = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: finalReview.body,
      pickerPlain: stalePicker,
      finalReviewAuthorityOnly: true,
    });
    const track = selectGuidedSignatureTrackCorpus({ finalizedSignerApplied: corpus });
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: track.body,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });

    expect(finalReview.source).toBe("finalized_signer_applied_guided_corpus");
    expect(display.plainText).toBe(corpus);
    expect(track.body).toBe(corpus);
    expect(fingerprintAgreementBody(display.plainText)).toBe(handoff.corpusHash);
    expect(display.plainText).not.toContain("Stale server_full_document_text");
    expect(display.plainText).not.toContain("Stale picker_authoritative");
  });

  it("mergeAgreementDraftWithGuidedSigningHandoff writes corpus into draft fields", () => {
    const corpus = aiAutomationCorpus();
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
    });
    const merged = mergeAgreementDraftWithGuidedSigningHandoff(
      { parties: [], title: "T" } as never,
      handoff,
    );
    expect((merged as { server_full_document_text?: string }).server_full_document_text).toBe(corpus);
    expect((merged as { premium_full_document_text?: string }).premium_full_document_text).toBe(corpus);
  });
});
