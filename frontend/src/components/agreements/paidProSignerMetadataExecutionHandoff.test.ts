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
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { setPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import { resolvePaidProAuthoritativeDisplayPlain } from "./paidProAuthoritativeRenderGate";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { collectPaidProSignerMetadataHandoffDiagnostics } from "./paidProSignerMetadataHandoffDiagnostics";
import { extractExecutionBlockSignerLines } from "./paidProSignerMetadataHandoffExtract";

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc.";

const SOT_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${BLUE_CANYON} ("Client") and ${IRON_VALE} ("Service Provider").`,
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE_CANYON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON_VALE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

function liveUi() {
  return {
    partyCount: 2,
    recipient1Name: BLUE_CANYON,
    recipient2Name: IRON_VALE,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [] as string[],
    partySignerNames: ["Anthem H Blanchard", "Ivan Vee"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "138 Main St."],
  };
}

const renderOpts = () => ({
  draft: {
    title: "Consulting Agreement",
    parties: [
      { name: BLUE_CANYON, role: "Client" },
      { name: IRON_VALE, role: "Service Provider" },
    ],
  } as import("./intakeSmartDefaults").ParsedDraftShape,
  intakeText: "consulting between Blue Canyon and Iron Vale",
  liveSignerMetadataUi: liveUi(),
});

describe("paidProSignerMetadataExecutionHandoff", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
  });

  it("renders human signer name/title in execution block during signer-metadata session without mutating SoT", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    const sotBefore = getPaidProSourceOfTruthText();
    setPaidProReviewSignerMetadataSessionActive(true);

    const opts = renderOpts();
    const review = getPaidProDocumentForSurface("review", opts)!.text;
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;

    expect(getPaidProSourceOfTruthText()).toBe(sotBefore);
    for (const corpus of [review, copy, signerSetup]) {
      expect(corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
      expect(corpus).toMatch(/Title:\s*Member/i);
      expect(corpus).toMatch(/Name:\s*Ivan Vee/i);
      expect(corpus).toMatch(/Title:\s*Manager/i);
      expect(corpus).not.toMatch(/Name:\s*Blue Canyon Analytics LLC/i);
      expect(corpus).not.toMatch(/Name:\s*Iron Vale Systems Inc/i);
    }
    expect(copy).toBe(review);

    const invariant = analyzePaidProExecutionBlockInvariant(review, { expectedParties: 2 });
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.ok).toBe(true);
  });

  it("diagnostics report authority → hydration → execution block → copy parity", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setPaidProReviewSignerMetadataSessionActive(true);
    const opts = renderOpts();
    const review = resolvePaidProAuthoritativeDisplayPlain(opts);
    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    const rows = collectPaidProSignerMetadataHandoffDiagnostics({
      ...opts,
      previewPlain: review,
      copyPlain: copy,
    });
    expect(rows[0]?.universalAuthority.signerName).toBe("Anthem H Blanchard");
    expect(rows[0]?.reviewHydrationParties.signerName).toBe("Anthem H Blanchard");
    expect(rows[0]?.executionBlockRendered.nameLine).toBe("Anthem H Blanchard");
    expect(rows[0]?.copiedPlainText.nameLine).toBe("Anthem H Blanchard");
    expect(rows[1]?.executionBlockRendered.nameLine).toBe("Ivan Vee");
    expect(extractExecutionBlockSignerLines(copy, 0).nameLine).toBe("Anthem H Blanchard");
  });

  it("uses consumed authority when not in live session and signer metadata is complete", () => {
    establishPaidProSourceOfTruth({ text: SOT_BODY, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(buildLivePaidProSignerMetadataAuthority(liveUi()));
    const review = getPaidProDocumentForSurface("review", renderOpts())!.text;
    expect(review).toMatch(/Name:\s*Anthem H Blanchard/i);
  });
});
