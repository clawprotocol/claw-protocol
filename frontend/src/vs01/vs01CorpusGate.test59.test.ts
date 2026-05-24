import { describe, expect, it } from "vitest";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import {
  pickBestPaidProAuthoritativeCorpusPlain,
  resolveFinalVs01CorpusOrBlock,
  VS01_CORPUS_PREFERRED_MIN_LEN,
  VS01_SIGNING_CORPUS_MIN_LEN,
} from "./vs01SigningCorpus";
import { updateLastKnownGoodAuthoritativeDraftRef } from "../components/agreements/guidedDealCompletion/guidedCompletionRenderAuthority";

const SHORT_PREVIEW = `${"Free starter preview body for test59. ".repeat(30)}`.slice(0, 735);

function longPremiumCorpus(): string {
  return `${"Premium operative clause with mutual obligations and deliverables. ".repeat(62)}
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
Signature: _______________
Name: Joe Smith
Date: ____________________`;
}

const bridge: AgreementVs01BridgeSession = {
  vs01DocumentId: "doc-test59",
  agreementId: "agr-test59",
  agreementTitle: "MSA",
  creatorName: "Acme LLC",
  creatorEmail: "owner@acme.test",
  creatorSignerName: "Anthem H Blanchard",
  creatorSignerTitle: "Manager",
  counterparties: [
    {
      id: "cp-1",
      name: "Joe Smith",
      email: "joe@provider.test",
      signerName: "Joe Smith",
    },
  ],
  targetStep: 2,
  senderFirstLawdogHandoff: true,
};

describe("test59 VS01 corpus gate regression", () => {
  it("blocks short 735-char free-hash preview before premium snapshot completes", () => {
    const blocked = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: SHORT_PREVIEW,
      guidedPro: true,
      freeBaselinePlain: SHORT_PREVIEW,
      premiumInProgress: true,
      premiumComplete: false,
      bridge,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.premiumInProgress).toBe(true);
    expect(blocked.len).toBeLessThan(VS01_SIGNING_CORPUS_MIN_LEN);
  });

  it("after premium snapshot (~3300 chars), final corpus wins over short preview", () => {
    const premium = longPremiumCorpus();
    expect(premium.length).toBeGreaterThanOrEqual(VS01_CORPUS_PREFERRED_MIN_LEN);

    const shortFirst = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: SHORT_PREVIEW,
      hydratedPremiumPlain: SHORT_PREVIEW,
      premiumPipelinePlain: SHORT_PREVIEW,
      lastKnownGoodPlain: SHORT_PREVIEW,
      guidedPro: true,
      freeBaselinePlain: SHORT_PREVIEW,
      premiumInProgress: true,
      bridge,
    });
    expect(shortFirst.allowed).toBe(false);

    const final = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: premium,
      hydratedPremiumPlain: premium,
      premiumPipelinePlain: premium,
      lastKnownGoodPlain: premium,
      guidedPro: true,
      freeBaselinePlain: SHORT_PREVIEW,
      premiumInProgress: false,
      premiumComplete: true,
      bridge,
    });
    expect(final.allowed).toBe(true);
    expect(final.len).toBeGreaterThanOrEqual(VS01_CORPUS_PREFERRED_MIN_LEN);
    expect(fingerprintAgreementBody(final.corpus)).toBe(fingerprintAgreementBody(premium));
    expect(final.matchesFreeHash).toBe(false);
  });

  it("does not use decorative_fallback_signature_card for guided Pro final corpus", () => {
    const premium = longPremiumCorpus();
    const preview = resolvePremiumSignaturePreviewMode(premium, 2);
    expect(preview.hasCorpusSignatureBlock).toBe(true);
    expect(preview.mode).not.toBe("decorative_fallback_signature_card");
  });

  it("last-known-good refuses free/basic hash and does not shrink full premium corpus", () => {
    const ref = { current: SHORT_PREVIEW };
    const premium = longPremiumCorpus();
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, SHORT_PREVIEW, "seed", {
        paidProFlow: true,
        freeBaselinePlain: SHORT_PREVIEW,
      }),
    ).toBe(false);
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, premium, "premium_snapshot", {
        paidProFlow: true,
        freeBaselinePlain: SHORT_PREVIEW,
      }),
    ).toBe(true);
    expect(ref.current.length).toBeGreaterThanOrEqual(VS01_CORPUS_PREFERRED_MIN_LEN);
    expect(
      updateLastKnownGoodAuthoritativeDraftRef(ref, SHORT_PREVIEW, "shrink_attempt", {
        paidProFlow: true,
        freeBaselinePlain: SHORT_PREVIEW,
      }),
    ).toBe(false);
    expect(ref.current.length).toBeGreaterThanOrEqual(VS01_CORPUS_PREFERRED_MIN_LEN);
  });

  it("pickBestPaidProAuthoritativeCorpusPlain prefers 3300+ premium over 735 preview", () => {
    const premium = longPremiumCorpus();
    const picked = pickBestPaidProAuthoritativeCorpusPlain(
      [SHORT_PREVIEW, premium, SHORT_PREVIEW],
      SHORT_PREVIEW,
    );
    expect(picked.length).toBeGreaterThanOrEqual(VS01_CORPUS_PREFERRED_MIN_LEN);
    expect(fingerprintAgreementBody(picked)).toBe(fingerprintAgreementBody(premium));
  });
});
