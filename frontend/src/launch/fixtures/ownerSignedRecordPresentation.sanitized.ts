/**
 * Sanitized committed fixtures for signed-record chrome title and signer-count
 * regressions. Two-, three-, and four-party papers plus an incomplete-signature
 * case. Not live-model output and not journey evidence.
 */
import { HARBOR_SANITIZED_PREMIUM_DOCUMENT } from "./harborCustomerMeaning.sanitized";
import {
  RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED,
  RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED,
} from "./releaseScopeMultiparty.sanitized";

export const OWNER_SIGNED_TWO_PARTY_CORPUS_SANITIZED = HARBOR_SANITIZED_PREMIUM_DOCUMENT;

export const OWNER_SIGNED_THREE_PARTY_CORPUS_SANITIZED = RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED;

export const OWNER_SIGNED_FOUR_PARTY_CORPUS_SANITIZED = RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED;

export const OWNER_SIGNED_TWO_PARTY_PARTIES_SANITIZED = [
  { id: "p1", name: "Harbor Peak Analytics LLC", role: "owner" },
  { id: "p2", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
] as const;

export const OWNER_SIGNED_THREE_PARTY_PARTIES_SANITIZED = [
  { id: "p1", name: "Stonebridge Wellness LLC", role: "owner" },
  { id: "p2", name: "NovaPath Learning Inc.", role: "reviewer" },
  { id: "p3", name: "ClearSpring Distribution LLC", role: "reviewer" },
] as const;

export const OWNER_SIGNED_FOUR_PARTY_PARTIES_SANITIZED = [
  { id: "p1", name: "Lumen Bioinformatics Inc.", role: "owner" },
  { id: "p2", name: "Thalassa Data Systems LLC", role: "reviewer" },
  { id: "p3", name: "Coastal Meridian Analytics LLC", role: "reviewer" },
  { id: "p4", name: "Vanguard Regulatory Sciences Ltd.", role: "reviewer" },
] as const;

export const OWNER_SIGNED_COORDINATOR_EXCLUDED_PARTIES_SANITIZED = [
  { id: "p1", name: "Alpha LLC", role: "party" },
  { id: "p2", name: "Beta Inc", role: "party" },
  { id: "coord", name: "LawDog Coordinator", role: "coordinator" },
] as const;

export const OWNER_SIGNED_NOTICE_ONLY_PARTY_SANITIZED = {
  id: "p-notice",
  name: "Notice Desk LLC",
  role: "reviewer",
  requiresSignature: false,
} as const;
