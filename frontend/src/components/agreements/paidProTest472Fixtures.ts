/**
 * TEST472 — Evergreen/Eve, Atlas/Ann, Horizon/Hans, BrightPeak/Benton (TEST465 reproduction).
 */

import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "./paidProTest461Vs01PreparePacketFixtures";
import type { LiveSignerMetadataUiState } from "./paidProSignerMetadataAuthority";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

export const TEST472_ENTITIES = [
  TEST440_EVERGREEN,
  TEST440_ATLAS,
  TEST440_HORIZON,
  TEST440_BRIGHT_PEAK,
] as const;

export const TEST472_SIGNERS = [
  { name: "Eve Green", email: "cryptocurated21+e@gmail.com", title: "CEO" },
  { name: "Ann Center", email: "cryptocurated21+a@gmail.com", title: "CIO" },
  { name: "Hans Wiener", email: "cryptocurated21+h@gmail.com", title: "Member" },
  { name: "Benton Reese", email: "cryptocurated21+b@gmail.com", title: "Manager" },
] as const;

export function test472LiveUi(): LiveSignerMetadataUiState {
  return { ...TEST461_SIGNER_METADATA };
}

export function test472AuthorityParties(): PaidProSignerMetadataParty[] {
  return TEST472_ENTITIES.map((legal, partyIndex) => ({
    partyIndex,
    partyLegalName: legal,
    signerEmail: TEST472_SIGNERS[partyIndex]!.email,
    signerName: TEST472_SIGNERS[partyIndex]!.name,
    signerTitle: TEST472_SIGNERS[partyIndex]!.title,
    partyAddress: TEST461_SIGNER_METADATA.partyAddresses[partyIndex] ?? "",
  }));
}

/** Misaligned intake legal-entity order (simulates corpus vs UI slot drift). */
export const TEST472_SHUFFLED_LEGAL_ENTITIES = [
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_ATLAS,
  TEST440_HORIZON,
] as const;
