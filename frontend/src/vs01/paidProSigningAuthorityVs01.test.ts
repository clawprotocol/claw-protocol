import { afterEach, describe, expect, it } from "vitest";
import { createAuthoritativeSigningSnapshot, clearAuthoritativeSigningSnapshot } from "../components/agreements/authoritativeSigningSnapshot";
import { buildCanonicalFinalPartyManifestFromAuthority, buildLivePaidProSignerMetadataAuthority, setConsumedPaidProSignerMetadataAuthority } from "../components/agreements/paidProSignerMetadataAuthority";
import { resolveRecipientSetupForVs01Bridge } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import type { AgreementDraft } from "../agreement/agreementTypes";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

function draftFixture(): AgreementDraft {
  return {
    id: "ag_test",
    title: "MSA",
    jurisdiction: "Delaware",
    parties: [
      { id: "p0", name: BLUE, role: "client", email: "" },
      { id: "p1", name: IRON, role: "signer", email: "" },
    ],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [],
  } as AgreementDraft;
}

describe("paid Pro signing authority → VS01 bridge", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
  });

  it("resolveRecipientSetupForVs01Bridge prefers frozen authority over handoff/draft", () => {
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "anthem@test.com",
      recipient2Email: "ira@test.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
      partySignerTitles: ["Manager", "VP"],
      partyAddresses: ["100 Main", "200 Oak"],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);
    const manifest = buildCanonicalFinalPartyManifestFromAuthority(authority);
    createAuthoritativeSigningSnapshot({
      corpus: "corpus with signatures",
      signerMetadata: {
        partySignerNames: ["Anthem H Blanchard", "Ira Vernon"],
        partySignerTitles: ["Manager", "VP"],
        partyAddresses: ["100 Main", "200 Oak"],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "anthem@test.com",
        recipient2Email: "ira@test.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });

    const setup = resolveRecipientSetupForVs01Bridge(draftFixture(), {
      recipientPartySignerNames: ["Wrong", "Names"],
      recipientPartySignerTitles: ["", ""],
      recipientPartyEmails: ["x@y.com", "z@w.com"],
    });
    expect(setup).toBeTruthy();
    expect(setup!.recipientPartySignerNames![0]).toBe("Anthem H Blanchard");
    expect(setup!.recipientPartySignerNames![1]).toBe("Ira Vernon");
    expect(setup!.recipientPartySignerTitles![1]).toBe("VP");
    expect(setup!.recipientPartyEmails![0]).toBe("anthem@test.com");
    expect(setup!.recipientPartyEmails![1]).toBe("ira@test.com");
  });
});
