import { afterEach, describe, expect, it } from "vitest";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { setPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import {
  buildPaidProFinalDisplayCopyParityPayload,
  buildPaidProHydrationAuthorityPayload,
  buildPaidProSignerAuthorityDiagnosticPayload,
  PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY,
} from "./paidProSignerAuthorityDiagnostics";
import { extractExecutionBlockSignerLines } from "./paidProSignerMetadataHandoffExtract";

const BLUE = PAID_PRO_HARDENING_CLIENT;
const IRON = PAID_PRO_HARDENING_PROVIDER;

const SOT_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

function liveUi() {
  return {
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [] as string[],
    partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "138 Main St., Clarkville, OH 23087"],
  };
}

const renderOpts = () => ({
  draft: {
    title: "Consulting Agreement",
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
  } as import("./intakeSmartDefaults").ParsedDraftShape,
  intakeText: "consulting between Blue Canyon and Iron Vale",
  liveSignerMetadataUi: liveUi(),
});

describe("Test306 signer metadata authority across surfaces", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
  });

  it("live signer session hydrates name/title in review, copy, display, and signer_setup", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setPaidProReviewSignerMetadataSessionActive(true);
    const opts = renderOpts();

    const review = getPaidProDocumentForSurface("review", opts)!.text;
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    const display = getPaidProDocumentForSurface("display", opts)!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;

    for (const corpus of [review, copy, display, signerSetup]) {
      expect(corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
      expect(corpus).toMatch(/Title:\s*Member/i);
      expect(corpus).toMatch(/Name:\s*Ira Vale/i);
      expect(corpus).toMatch(/Title:\s*Manager/i);
    }
    expect(copy).toBe(review);
    expect(display).toBe(review);

    const invariant = analyzePaidProExecutionBlockInvariant(review, { expectedParties: 2 });
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.ok).toBe(true);
  });

  it("consumed authority hydrates all surfaces when session is inactive", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(buildLivePaidProSignerMetadataAuthority(liveUi()));
    const opts = renderOpts();

    const review = getPaidProDocumentForSurface("review", opts)!.text;
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    expect(review).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(copy).toBe(review);
    expect(review).not.toMatch(/Email for Notice:/i);
    expect(review).not.toMatch(/Address for Notice:/i);
  });

  it("pinned corpus fallback preserves signer metadata on copy and export surfaces", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };

    const review = resolvePaidProReviewRenderPlain(opts);
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    const display = getPaidProDocumentForSurface("display", opts)!.text;
    const finalized = getPaidProDocumentForSurface("finalized", opts)!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;

    expect(copy).toBe(review);
    expect(display).toBe(review);
    expect(finalized).toBe(copy);
    expect(signerSetup).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(signerSetup).not.toMatch(/Email for Notice:/i);

    const parity = buildPaidProFinalDisplayCopyParityPayload({
      ...opts,
      reviewPlain: review,
      copyPlain: copy,
      exportPlain: finalized,
      signerPrepPlain: signerSetup,
    });
    expect(parity.signerNamesPresent).toBe(true);
    expect(parity.signerTitlesPresent).toBe(true);
    expect(parity.signerEmailsPresentInAuthority).toBe(true);
    expect(parity.displayHash).toBe(parity.copyHash);
  });

  it("diagnostics report authority, hydration counts, and contact policy", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(buildLivePaidProSignerMetadataAuthority(liveUi()));
    const opts = renderOpts();
    const review = getPaidProDocumentForSurface("review", opts)!.text;

    const authority = buildPaidProSignerAuthorityDiagnosticPayload({ ...opts, reviewPlain: review });
    expect(authority.signerNames).toEqual(["Anthem H Blanchard", "Ira Vale"]);
    expect(authority.signerEmails.every((e) => e.includes("@"))).toBe(true);
    expect(authority.visibleBodyPolicy).toEqual(PAID_PRO_SIGNER_CONTACT_BODY_VISIBILITY);

    const hydration = buildPaidProHydrationAuthorityPayload({ ...opts, reviewPlain: review });
    expect(hydration.hydratedSignerCount).toBe(2);
    expect(hydration.hydratedTitleCount).toBe(2);
    expect(hydration.hydratedEmailCount).toBe(2);

    expect(extractExecutionBlockSignerLines(review, 0).nameLine).toBe("Anthem H Blanchard");
    expect(extractExecutionBlockSignerLines(review, 1).nameLine).toBe("Ira Vale");
  });

  it("staging cache invalidates when signer name changes during live session", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setPaidProReviewSignerMetadataSessionActive(true);
    const baseOpts = renderOpts();

    const first = resolvePaidProReviewRenderPlain(baseOpts);
    expect(first).toMatch(/Name:\s*Anthem H Blanchard/i);

    const updatedOpts = {
      ...baseOpts,
      liveSignerMetadataUi: {
        ...liveUi(),
        partySignerNames: ["Sarah Mitchell", "Michael Torres"],
        partySignerTitles: ["CEO", "President"],
      },
    };
    const second = resolvePaidProReviewRenderPlain(updatedOpts);
    expect(second).toMatch(/Name:\s*Sarah Mitchell/i);
    expect(second).toMatch(/Name:\s*Michael Torres/i);
    expect(second).not.toMatch(/Name:\s*Anthem H Blanchard/i);
  });
});
