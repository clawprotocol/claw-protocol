/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DRAFT_LOADING_STRUCTURING } from "../../launch/simpleProduct/proConversionCopy";
import {
  mapPaidProStickyCtaToPrimaryCta,
  resolvePaidProStickyCta,
} from "./paidProStickyCta";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST518 — signer setup sticky CTA state", () => {
  it("sticky CTA shows signer setup state when inline signer setup is latched", () => {
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.phase).toBe("signer_details_required");
    expect(sticky.showStickyBar).toBe(true);
    const mapped = mapPaidProStickyCtaToPrimaryCta(sticky);
    expect(mapped.label).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(mapped.label).not.toBe(DRAFT_LOADING_STRUCTURING);
    expect(mapped.disabled).toBe(false);
    expect(mapped.reason).toBe("paid_pro_signer_details_required");
  });

  it("filling signer names and emails enables signer_details_complete CTA", () => {
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.phase).toBe("signer_details_complete");
    const mapped = mapPaidProStickyCtaToPrimaryCta(sticky);
    expect(mapped.disabled).toBe(false);
    expect(mapped.label).not.toBe(DRAFT_LOADING_STRUCTURING);
    expect(mapped.reason).toBe("paid_pro_signer_details_complete");
  });

  it("intake wires signer-setup surface into paidProFirstReviewSurfaceActive for sticky CTA", () => {
    expect(intakeSrc).toContain("paidProSignerSetupStickyCtaSurfaceActive");
    expect(intakeSrc).toContain("paidProCanonicalReviewSignerSetupActive");
    expect(intakeSrc).toMatch(
      /paidProFirstReviewSurfaceActive[\s\S]{0,220}paidProSignerSetupStickyCtaSurfaceActive/,
    );
  });

  it("intake does not keep Structuring CTA after signer setup mounts with source of truth", () => {
    expect(intakeSrc).toContain("!paidProCanonicalReviewSignerSetupActive");
    expect(intakeSrc).toContain("!hasPaidProSourceOfTruth()");
    expect(intakeSrc).toMatch(
      /!paidProFirstReviewCorpusReady[\s\S]{0,240}!paidProCanonicalReviewSignerSetupActive/,
    );
    expect(intakeSrc).toContain("corpusText: null");
    expect(intakeSrc).toContain("resolveLegalEntitiesForCanonicalMetadata");
  });

  it("prefill runs when canonical review signer setup is active", () => {
    expect(intakeSrc).toMatch(
      /signerPrefillSurfaceActive[\s\S]{0,180}paidProCanonicalReviewSignerSetupActive/,
    );
    expect(intakeSrc).toMatch(
      /premiumRecipientUxActive && !paidProCanonicalReviewSignerSetupActive/,
    );
  });
});
