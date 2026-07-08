/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import { shouldArmPaidProFirstReviewSignerSetupLatch } from "./signerSetupPartyIdentity";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * TEST575 — dashboard paid-create: after the user finalizes signer details the flow must advance on
 * "Prepare for signing" and must NOT re-arm signer setup (signerMetadataFinalized must stay true),
 * and operative notices must carry the street address when a party provided one.
 */

const REDWOOD = "Redwood Biologics Inc";
const SUMMIT = "Summit AI Consulting LLC";
const BLUE_HARBOR = "Blue Harbor Systems LLC";
const IRON_GATE = "Iron Gate Security LLC";

const REDWOOD_ADDR = "710 Discovery Parkway, Raleigh, NC 27609";
const SUMMIT_ADDR = "1880 Legacy Drive, Plano, TX 75024";
const BLUE_HARBOR_ADDR = "210 West Monroe Street, Chicago, IL 60606";
const IRON_GATE_ADDR = "8300 Greensboro Drive, McLean, VA 22102";

function party(
  partyIndex: number,
  partyLegalName: string,
  signerName: string,
  signerTitle: string,
  signerEmail: string,
  partyAddress: string,
): PaidProSignerMetadataParty {
  return { partyIndex, partyLegalName, signerName, signerTitle, signerEmail, partyAddress };
}

const FOUR_PARTIES: PaidProSignerMetadataParty[] = [
  party(0, REDWOOD, "Emily Carter", "Chief Executive Officer", "emily.carter@redwoodbiologics.com", REDWOOD_ADDR),
  party(1, SUMMIT, "Daniel Brooks", "Managing Partner", "daniel.brooks@summitaiconsulting.com", SUMMIT_ADDR),
  party(2, BLUE_HARBOR, "Sophia Martinez", "Director of Implementation", "sophia.martinez@blueharborsystems.com", BLUE_HARBOR_ADDR),
  party(3, IRON_GATE, "Michael Reynolds", "Chief Security Officer", "michael.reynolds@irongatesecurity.com", IRON_GATE_ADDR),
];

/** A NOTICES section whose stanzas carry entity/Attn/Email but NO street address (the live bug). */
const NOTICES_WITHOUT_ADDRESSES = [
  "CONSULTING SERVICES AGREEMENT",
  "",
  `This Agreement is entered into by and among ${REDWOOD}, ${SUMMIT}, ${BLUE_HARBOR}, and ${IRON_GATE}.`,
  "",
  ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Operative clause number ${i + 1} for the parties.`),
  "",
  "12. NOTICES",
  "",
  "Notices under this Agreement must be in writing and delivered as set forth below.",
  "",
  `If to ${REDWOOD}:`,
  REDWOOD,
  "Attn: Emily Carter, Chief Executive Officer",
  "Email: emily.carter@redwoodbiologics.com",
  "",
  `If to ${SUMMIT}:`,
  SUMMIT,
  "Attn: Daniel Brooks, Managing Partner",
  "Email: daniel.brooks@summitaiconsulting.com",
  "",
  `If to ${BLUE_HARBOR}:`,
  BLUE_HARBOR,
  "Attn: Sophia Martinez, Director of Implementation",
  "Email: sophia.martinez@blueharborsystems.com",
  "",
  `If to ${IRON_GATE}:`,
  IRON_GATE,
  "Attn: Michael Reynolds, Chief Security Officer",
  "Email: michael.reynolds@irongatesecurity.com",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n");

describe("TEST575 notices thread the provided street address", () => {
  it("adds each party's street address to its operative notice stanza when missing", () => {
    expect(NOTICES_WITHOUT_ADDRESSES).not.toContain(REDWOOD_ADDR);
    const { text, repairs } = ensureOperativeIfToNoticeDelivery(
      NOTICES_WITHOUT_ADDRESSES,
      FOUR_PARTIES,
      { intakeText: null, draftPartyNames: FOUR_PARTIES.map((p) => p.partyLegalName) },
    );
    expect(repairs.length).toBeGreaterThan(0);
    // Every provided street address is surfaced in the notices region.
    for (const addr of [REDWOOD_ADDR, SUMMIT_ADDR, BLUE_HARBOR_ADDR, IRON_GATE_ADDR]) {
      const street = addr.split(",")[0]!.trim();
      expect(text).toContain(street);
    }
    // The address is threaded without dropping the existing entity/Attn/Email content.
    expect(text).toContain("Attn: Emily Carter, Chief Executive Officer");
    expect(text).toContain("Email: emily.carter@redwoodbiologics.com");
  });

  it("does not fabricate an address when no party provided one", () => {
    const noAddressParties = FOUR_PARTIES.map((p) => ({ ...p, partyAddress: "" }));
    const { text } = ensureOperativeIfToNoticeDelivery(NOTICES_WITHOUT_ADDRESSES, noAddressParties, {
      intakeText: null,
      draftPartyNames: noAddressParties.map((p) => p.partyLegalName),
    });
    for (const street of ["710 Discovery Parkway", "1880 Legacy Drive"]) {
      expect(text).not.toContain(street);
    }
  });
});

describe("TEST575 post-finalize signer setup must not re-arm", () => {
  const baseLatchArgs = {
    hasAcceptedPaidProAuthority: true,
    premiumPaidDocumentSurface: true,
    premiumRecipientUxActive: false,
    createUiStageIsDraft: true,
    firstReviewSurfaceActive: true,
    hasCanonicalReviewCorpus: true,
    paidProSignatureDetailsReady: true,
    signaturePreparationRequested: false,
    alreadyLatched: false,
    deliveryTrackDecisionActive: false,
  } as const;

  it("never arms signer setup once signer metadata is finalized", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
  });

  it("arms signer setup pre-finalize (first-time confirmation) when no decision surface", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        signerMetadataFinalized: false,
      }),
    ).toBe(true);
  });
});

describe("TEST575 AgreementBuilderIntake wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
  const snapshotSrc = readFileSync(join(__dirname, "authoritativeSigningSnapshot.ts"), "utf8");

  it("pins a sticky finalize latch that keeps signerMetadataFinalized true through snapshot churn", () => {
    expect(intake).toContain("paidProSignerMetadataFinalizedLatch");
    // signerMetadataFinalized is snapshot OR the sticky latch.
    expect(intake).toContain(
      "hasAuthoritativeSigningSnapshot() || paidProSignerMetadataFinalizedLatch",
    );
    // finalize sets the latch true; editing signer details clears it.
    expect(intake).toContain("setPaidProSignerMetadataFinalizedLatch(true)");
    expect(intake).toContain("setPaidProSignerMetadataFinalizedLatch(false)");
  });

  it("advance path rebuilds a missing snapshot instead of re-finalizing forever", () => {
    const sendBlock = intake.slice(
      intake.indexOf("const handleProSendForSignature"),
      intake.indexOf("const handleProSendForSignature") + 2200,
    );
    // First-click finalize only when not already finalized (snapshot missing AND no sticky latch).
    expect(sendBlock).toContain("!hasAuthoritativeSigningSnapshot() &&");
    expect(sendBlock).toContain("!paidProSignerMetadataFinalizedLatch");
    // Advance branch accepts snapshot OR sticky latch, and rebuilds the snapshot if it went missing.
    expect(sendBlock).toContain(
      "hasAuthoritativeSigningSnapshot() || paidProSignerMetadataFinalizedLatch",
    );
    expect(sendBlock).toContain("markSigningPreparationRequested()");
  });

  it("threads party addresses into notices on the preserved signing corpus", () => {
    expect(snapshotSrc).toContain("threadPartyAddressesIntoNoticeStanzas");
    // Applied on both frozen preservation branches.
    const occurrences = snapshotSrc.split("threadPartyAddressesIntoNoticeStanzas(corpus, parties").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
