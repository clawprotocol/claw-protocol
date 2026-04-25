/**
 * Client-side proof activity persistence (see `leaderboard/proofActivityStore.ts` for implementation).
 * Same storage key: lawdog_proof_activity_v1.
 */
export {
  getProofHeatmapCells,
  readProofActivity,
  recordProofActivityDay,
  type LawdogProofActivityV1,
  type ProofHeatmapCell,
} from "../leaderboard/proofActivityStore";
