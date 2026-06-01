import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthoritativeSigningSnapshot, getAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import * as authoritativeSignerHydration from "../../authoritativeSignerHydration";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
} from "../../paidProFinalHydratedCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "../../paidProSignerMetadataAuthority";
import { shouldStagePaidProSignerMetadataLocally } from "../../paidProSignerMetadataCommitPolicy";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import {
  armPaidProHardeningSession,
  buildTest204SignerAuthority,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./paidProHardeningFixtures";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProHardening signer metadata typing performance", () => {
  beforeEach(() => {
    vi.spyOn(
      authoritativeSignerHydration,
      "buildHydratedAuthoritativeSigningCorpusFromAuthority",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  function armBaseline() {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    return {
      fixture,
      sotHash: getPaidProSourceOfTruth()?.hash ?? "",
      review: resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
      }),
      pin: readPaidProPinnedSignerAppliedCorpus(),
      snapHash: getAuthoritativeSigningSnapshot()?.hash ?? null,
    };
  }

  function assertCorpusFrozen(baseline: ReturnType<typeof armBaseline>) {
    expect(getPaidProSourceOfTruth()?.hash).toBe(baseline.sotHash);
    expect(
      resolvePaidProReviewRenderPlain({
        draft: baseline.fixture.draft,
        intakeText: baseline.fixture.intakeText,
      }),
    ).toBe(baseline.review);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe(baseline.pin);
    expect(getAuthoritativeSigningSnapshot()?.hash ?? null).toBe(baseline.snapHash);
    expect(readConsumedPaidProSignerMetadataAuthority()).toBeNull();
    expect(
      authoritativeSignerHydration.buildHydratedAuthoritativeSigningCorpusFromAuthority,
    ).not.toHaveBeenCalled();
  }

  it("stages metadata locally — consumed authority not promoted while typing", () => {
    const baseline = armBaseline();
    expect(shouldStagePaidProSignerMetadataLocally({ signerMetadataSessionActive: true })).toBe(
      true,
    );
    const ui = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "ivee23@me.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "M"],
      partySignerTitles: ["Manager", "Mem"],
      partyAddresses: ["1027 S. Rainbow Blvd., #124-apt", "138 Main St."],
    });
    void ui;
    assertCorpusFrozen(baseline);
  });

  it.each([
    ["signerName", { partySignerNames: ["Anthem H Blanchard", "M"] }],
    ["signerTitle", { partySignerTitles: ["Manager", "Mem"] }],
    ["partyAddress", { partyAddresses: ["1027 S. Rainbow Blvd., #124-apt", "138 Main St."] }],
    ["signerEmail", { recipient2Email: "ira@me.com" }],
  ] as const)("keystroke on %s leaves SoT, review, pin, and snapshot unchanged", (_label, patch) => {
    const baseline = armBaseline();
    void buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "ivee23@me.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
      partySignerTitles: ["Manager", "Member"],
      partyAddresses: ["1027 S. Rainbow Blvd., #124", "138 Main St., Clarkville, OH 23087"],
      ...patch,
    });
    assertCorpusFrozen(baseline);
  });

  it("hydration runs once on explicit finalize commit only", () => {
    const baseline = armBaseline();
    const authority = buildTest204SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    authoritativeSignerHydration.buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruth()?.text ?? "",
      authority,
      intakeRaw: baseline.fixture.intakeText,
      surface: "test_finalize",
      signatureRegionOnly: true,
    });
    expect(
      authoritativeSignerHydration.buildHydratedAuthoritativeSigningCorpusFromAuthority,
    ).toHaveBeenCalledTimes(1);
    expect(getPaidProSourceOfTruth()?.hash).toBe(baseline.sotHash);
    expect(hashPaidProCorpus(getPaidProSourceOfTruth()?.text ?? "")).toBe(baseline.sotHash);
  });
});
