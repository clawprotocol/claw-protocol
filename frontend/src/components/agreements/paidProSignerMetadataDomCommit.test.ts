/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { LiveSignerMetadataUiState } from "./paidProSignerMetadataAuthority";
import {
  buildPaidProSignerMetadataAuthorityForFinalize,
  mergeLiveSignerMetadataUiWithDomCommit,
  readVisiblePaidProSignerMetadataDomValue,
} from "./paidProSignerMetadataDomCommit";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import * as paidProSourceOfTruth from "./paidProSourceOfTruth";
import * as authoritativeSigningSnapshot from "./authoritativeSigningSnapshot";

const CLIENT = "Blue Canyon Analytics LLC";
const IRON_VAL = "Iron Val Systems Inc";
const IRON_VALE = "Iron Vale Systems Inc";

function baseUi(overrides?: Partial<LiveSignerMetadataUiState>): LiveSignerMetadataUiState {
  return {
    partyCount: 2,
    recipient1Name: CLIENT,
    recipient2Name: IRON_VAL,
    recipient1Email: "client@example.com",
    recipient2Email: "provider@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", ""],
    partySignerTitles: ["CEO", ""],
    partyAddresses: ["", ""],
    ...overrides,
  };
}

function mountSignerInput(field: string, value: string): HTMLInputElement {
  const root = document.createElement("div");
  root.setAttribute("data-claw-recipient-setup", "1");
  const input = document.createElement("input");
  input.setAttribute("data-claw-recipient-field", field);
  input.value = value;
  Object.defineProperty(input, "getBoundingClientRect", {
    value: () => ({ width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 }),
  });
  root.appendChild(input);
  document.body.appendChild(root);
  return input;
}

describe("paidProSignerMetadataDomCommit", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("reads visible signer metadata from DOM fields", () => {
    mountSignerInput("r2-signer-name", "Michael Torres");
    expect(readVisiblePaidProSignerMetadataDomValue("r2-signer-name")).toBe("Michael Torres");
  });

  it("merges manually entered Party 2 signer name from DOM when React state is still empty", () => {
    mountSignerInput("r2-signer-name", "Michael Torres");
    const merged = mergeLiveSignerMetadataUiWithDomCommit(baseUi());
    expect(merged.partySignerNames[1]).toBe("Michael Torres");
  });

  it("prefers corrected Party 2 legal entity spelling from visible DOM over stale React state", () => {
    mountSignerInput("r2-name", IRON_VALE);
    const merged = mergeLiveSignerMetadataUiWithDomCommit(baseUi({ recipient2Name: IRON_VAL }));
    expect(merged.recipient2Name).toBe(IRON_VALE);
  });

  it("mobile Continue commits jurisdiction-corrected Party 2 legal entity from DOM over contaminated React state", () => {
    mountSignerInput("r2-name", "Jane Donaldson");
    const merged = mergeLiveSignerMetadataUiWithDomCommit(
      baseUi({ recipient2Name: "Jane Donaldson, Oklahoma law" }),
    );
    expect(merged.recipient2Name).toBe("Jane Donaldson");
    const authority = buildPaidProSignerMetadataAuthorityForFinalize(merged);
    expect(authority.parties[1]?.partyLegalName).toBe("Jane Donaldson");
    expect(authority.parties[1]?.partyLegalName).not.toMatch(/Oklahoma/i);
  });

  it("builds finalize authority from DOM-committed signer metadata", () => {
    mountSignerInput("r2-signer-name", "Michael Torres");
    mountSignerInput("r2-signer-title", "President");
    mountSignerInput("r2-name", IRON_VALE);
    const authority = buildPaidProSignerMetadataAuthorityForFinalize(baseUi());
    expect(authority.parties[1]?.partyLegalName).toBe(IRON_VALE);
    expect(authority.parties[1]?.signerName).toBe("Michael Torres");
    expect(authority.parties[1]?.signerTitle).toBe("President");
  });

  it("defers review render repair only while signer metadata session is active on accepted SoT", () => {
    vi.spyOn(paidProSourceOfTruth, "hasPaidProSourceOfTruth").mockReturnValue(true);
    vi.spyOn(authoritativeSigningSnapshot, "hasAuthoritativeSigningSnapshot").mockReturnValue(false);
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: true }),
    ).toBe(true);
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: false }),
    ).toBe(false);
  });
});
