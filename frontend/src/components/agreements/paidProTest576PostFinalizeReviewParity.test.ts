/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import { classifyPaidProCorpusLifecycleDiff } from "./paidProCorpusLifecycleDiff";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  resolvePaidProInlineSignerSetupMounted,
  shouldArmPaidProFirstReviewSignerSetupLatch,
} from "./signerSetupPartyIdentity";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * TEST576 — dashboard paid-create: after the user finalizes signer details the authoritative signing
 * snapshot threads party street addresses into the notice stanzas (TEST575). That threading changes the
 * snapshot corpus relative to the frozen canonical SoT, but the change is confined to the Notices
 * section, so `paid-pro-review-sot-parity` must treat it as an ALLOWED notice/contact-hydration delta —
 * not a dirty `substantive_clause_change`. Additionally, a stale inline-setup latch must never re-arm
 * signer setup once the user finalized (only "Edit signer details" re-opens it).
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

/**
 * Role-header 4-party accepted server_full_draft with an execution/signature tail. Well-formed legal
 * prose (blank line between numbered clauses) so notice hydration is surgical — matching the production
 * server_full_draft the dashboard freezes (live evidence: canonical_freeze -> signer_finalize lenDelta
 * ≈ 4 street addresses, not a whole-document reflow).
 */
const CLAUSES = Array.from(
  { length: 12 },
  (_, i) =>
    `${i + 1}. Section ${i + 1}. The parties shall perform the obligations described in this section in good faith throughout the term of this Agreement, subject to the limitations set forth herein.`,
).join("\n\n");

const NOTICE_STANZA = (entity: string, attn: string, email: string): string =>
  [`If to ${entity}:`, entity, `Attn: ${attn}`, `Email: ${email}`].join("\n");

const CANONICAL_FREEZE = [
  "CONSULTING SERVICES AGREEMENT",
  "",
  `This Agreement is entered into by and among ${REDWOOD}, ${SUMMIT}, ${BLUE_HARBOR}, and ${IRON_GATE}.`,
  "",
  CLAUSES,
  "",
  "13. Notices.",
  "",
  "Notices under this Agreement must be in writing and delivered to the addresses set forth below.",
  "",
  NOTICE_STANZA(REDWOOD, "Emily Carter, Chief Executive Officer", "emily.carter@redwoodbiologics.com"),
  "",
  NOTICE_STANZA(SUMMIT, "Daniel Brooks, Managing Partner", "daniel.brooks@summitaiconsulting.com"),
  "",
  NOTICE_STANZA(BLUE_HARBOR, "Sophia Martinez, Director of Implementation", "sophia.martinez@blueharborsystems.com"),
  "",
  NOTICE_STANZA(IRON_GATE, "Michael Reynolds, Chief Security Officer", "michael.reynolds@irongatesecurity.com"),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement as of the Effective Date.",
  "",
  "CLIENT:",
  REDWOOD,
  "By: ______________________",
  "Name: Emily Carter",
  "Title: Chief Executive Officer",
  "",
  "SERVICE PROVIDER:",
  SUMMIT,
  "By: ______________________",
  "Name: Daniel Brooks",
  "Title: Managing Partner",
].join("\n");

/** Surgical address hydration — exactly what production threads into each notice stanza (Address line). */
function surgicalAddressHydration(corpus: string): string {
  const addrByEmail: Record<string, string> = {
    "emily.carter@redwoodbiologics.com": REDWOOD_ADDR,
    "daniel.brooks@summitaiconsulting.com": SUMMIT_ADDR,
    "sophia.martinez@blueharborsystems.com": BLUE_HARBOR_ADDR,
    "michael.reynolds@irongatesecurity.com": IRON_GATE_ADDR,
  };
  return corpus.replace(/Email: (\S+)/g, (m, email: string) =>
    addrByEmail[email] ? `${m}\nAddress: ${addrByEmail[email]}` : m,
  );
}

/** The finalize snapshot's notice threading via the shared helper (integration coverage). */
function threadAddresses(corpus: string): string {
  const { text } = ensureOperativeIfToNoticeDelivery(corpus, FOUR_PARTIES, {
    intakeText: null,
    draftPartyNames: FOUR_PARTIES.map((p) => p.partyLegalName),
  });
  return text;
}

const SIGNER_FIELD_ONLY_ALLOWED = new Set([
  "signer_metadata_only",
  "execution_block_hydration_only",
  "whitespace_or_line_width_only",
  "display_normalization_only",
  "identical",
  "notice_contact_hydration_only",
]);

describe("TEST576 notice-address hydration is an allowed review-parity delta", () => {
  const signerFinalizeCorpus = surgicalAddressHydration(CANONICAL_FREEZE);

  it("threads each provided street address into the notice stanzas (shared helper)", () => {
    expect(CANONICAL_FREEZE).not.toContain("710 Discovery Parkway");
    const threaded = threadAddresses(CANONICAL_FREEZE);
    for (const addr of [REDWOOD_ADDR, SUMMIT_ADDR, BLUE_HARBOR_ADDR, IRON_GATE_ADDR]) {
      expect(threaded).toContain(addr.split(",")[0]!.trim());
    }
  });

  it("classifies canonical_freeze -> signer_finalize as notice_contact_hydration_only", () => {
    // The [paid-pro-corpus-diff] canonical_freeze -> signer_finalize transition (raw vs raw).
    expect(classifyPaidProCorpusLifecycleDiff(CANONICAL_FREEZE, signerFinalizeCorpus)).toBe(
      "notice_contact_hydration_only",
    );
  });

  it("stays a signer/notice-only delta after display normalization (canonical vs review_render)", () => {
    // review_render is the display-normalized snapshot; the raw canonical SoT is NOT display-normalized.
    // The parity audit compares those two directly, so the classifier must tolerate the reflow and still
    // recognize a notice/contact-only delta (was previously mis-classified as substantive_clause_change).
    const reviewRender = preparePaidProReviewDisplayPlain(signerFinalizeCorpus).text;
    const classification = classifyPaidProCorpusLifecycleDiff(CANONICAL_FREEZE, reviewRender);
    expect(SIGNER_FIELD_ONLY_ALLOWED.has(classification)).toBe(true);
    expect(classification).not.toBe("substantive_clause_change");
  });

  it("still flags a genuine clause change outside the Notices section as substantive", () => {
    const mutated = CANONICAL_FREEZE.replace(
      "1. Section 1. The parties shall perform the obligations described in this section in good faith throughout the term of this Agreement, subject to the limitations set forth herein.",
      "1. Section 1. The provider shall indemnify the client for all third-party claims without any cap on liability whatsoever under this Agreement.",
    );
    expect(classifyPaidProCorpusLifecycleDiff(CANONICAL_FREEZE, mutated)).toBe(
      "substantive_clause_change",
    );
  });

  it("parity treats notice_contact_hydration_only as a signer/notice-field-only delta", () => {
    // The parity invariant passes when the classification is in its signer-field-only allow list.
    const paritySrc = readFileSync(join(__dirname, "paidProReviewSotParity.ts"), "utf8");
    const allowList = paritySrc.slice(
      paritySrc.indexOf("SIGNER_FIELD_ONLY_CLASSIFICATIONS"),
      paritySrc.indexOf("SIGNER_FIELD_ONLY_CLASSIFICATIONS") + 400,
    );
    expect(allowList).toContain('"notice_contact_hydration_only"');
  });
});

describe("TEST576 signer setup never re-arms after finalize", () => {
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

  it("does not re-arm when finalized even if a stale inline-setup latch lingers", () => {
    // The core TEST576 regression: `alreadyLatched` (a stale edit-phase latch) must NOT win over
    // signerMetadataFinalized. Previously this returned true and re-emitted arm_latch.
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        signerMetadataFinalized: true,
        alreadyLatched: true,
      }),
    ).toBe(false);
  });

  it("does not re-arm once signing preparation was requested (advance path)", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        signerMetadataFinalized: false,
        signaturePreparationRequested: true,
        alreadyLatched: true,
      }),
    ).toBe(false);
  });

  it("keeps arming during the edit phase (finalize latch cleared, setup latched)", () => {
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        ...baseLatchArgs,
        signerMetadataFinalized: false,
        alreadyLatched: true,
      }),
    ).toBe(true);
  });

  it("keeps inline signer setup unmounted after finalize despite a stale latch", () => {
    const mountArgs = {
      hasAcceptedPaidProAuthority: true,
      premiumPaidDocumentSurface: true,
      premiumRecipientUxActive: false,
      createUiStageIsDraft: true,
      signaturePreparationRequested: false,
    } as const;
    expect(
      resolvePaidProInlineSignerSetupMounted({
        ...mountArgs,
        signerSetupLatched: true,
        signerMetadataFinalized: true,
      }),
    ).toBe(false);
    // "Edit signer details" clears the finalize latch → setup re-mounts.
    expect(
      resolvePaidProInlineSignerSetupMounted({
        ...mountArgs,
        signerSetupLatched: true,
        signerMetadataFinalized: false,
      }),
    ).toBe(true);
  });
});

describe("TEST576 AgreementBuilderIntake wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
  const signerSetupSrc = readFileSync(join(__dirname, "signerSetupPartyIdentity.ts"), "utf8");

  it("finalize/prep checks precede the alreadyLatched short-circuit", () => {
    const fn = signerSetupSrc.slice(
      signerSetupSrc.indexOf("export function shouldArmPaidProFirstReviewSignerSetupLatch"),
      signerSetupSrc.indexOf("export function shouldArmPaidProFirstReviewSignerSetupLatch") + 2600,
    );
    const finalizeIdx = fn.indexOf("if (args.signerMetadataFinalized) return false;");
    const latchedIdx = fn.indexOf("if (args.alreadyLatched) return true;");
    expect(finalizeIdx).toBeGreaterThan(-1);
    expect(latchedIdx).toBeGreaterThan(-1);
    expect(finalizeIdx).toBeLessThan(latchedIdx);
  });

  it("the inline signer-setup mount is gated by signerMetadataFinalized", () => {
    expect(signerSetupSrc).toContain("if (args.signerMetadataFinalized) return false;");
    // Both mount call sites forward the finalized state (snapshot OR sticky latch).
    const mountCallCount = (
      intake.match(/signerMetadataFinalized:\s*\n?\s*hasAuthoritativeSigningSnapshot\(\) \|\| paidProSignerMetadataFinalizedLatch/g) || []
    ).length;
    expect(mountCallCount).toBeGreaterThanOrEqual(2);
  });
});
