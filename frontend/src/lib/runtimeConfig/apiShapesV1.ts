/**
 * Backend-facing envelopes — version metadata for safe evolution.
 * Presentation config stays separate from core agreement domain entities.
 */

import type { FeatureGateKey } from "../../config/featureFlags/keys";
import type { DynamicConfigRoot } from "../../config/dynamicConfig/types";

/** Client / server shared schema bump — increment when breaking shape changes */
export const RUNTIME_UI_CONFIG_SCHEMA_VERSION = "1";

export type RuntimeUiConfigV1 = {
  schemaVersion: typeof RUNTIME_UI_CONFIG_SCHEMA_VERSION;
  /** Partial feature gate overrides (server wins over env fallbacks when specified) */
  featureGates?: Partial<Record<FeatureGateKey, boolean>>;
  /** Partial dynamic config; deep-merged over typed defaults */
  dynamic?: DeepPartialConfig<DynamicConfigRoot>;
  /** Reserved: assignment payload from assignment service */
  experiments?: ExperimentAssignmentV1;
};

export type ExperimentAssignmentV1 = {
  schemaVersion: "1";
  /** Server-derived variant overrides per experiment key (optional) */
  overrides?: Record<string, string>;
};

/** Same as DeepPartial but arrays are replaced wholesale when present */
export type DeepPartialConfig<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartialConfig<T[K]> }
    : T;

/** Affiliate / opportunity API (future) — not wired to agreement row payloads */
export type OpportunitySnapshotV1 = {
  schemaVersion: "1";
  referralId: string;
  network: {
    peopleJoined: number;
    agreementsCreated: number;
    keysUsed: number;
    revenueGeneratedUsd: number;
  };
  earnings: { earnedUsd: number; pendingUsd: number; paidUsd: number };
};

export type LeaderboardSnapshotV1 = {
  schemaVersion: "1";
  rows: Array<{
    rank: number;
    referralId: string;
    displayHandle: string;
    packTier: string;
    agreementsInfluenced: number;
    keysGenerated: number;
    earningsUsd: number | null;
  }>;
  viewerReferralId: string;
};

export type ChallengeConfigV1 = {
  schemaVersion: "1";
  challenges: Array<{
    id: string;
    name: string;
    description: string;
    target: number;
    rewardCopyStub: string;
    metric: string;
    windowLabel: string;
  }>;
};

export type PricingPresentationConfigV1 = {
  schemaVersion: "1";
  trustMicrocopy?: { cardProcessingLine?: string; footnoteLine?: string };
};
