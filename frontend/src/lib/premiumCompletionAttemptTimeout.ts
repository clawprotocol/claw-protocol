/**
 * `ensurePremiumCompletion` runs the HTTP premium-full-draft call **plus** post-accept
 * work (agreement review, finalize audit, review route). A short wall clock on the
 * whole chain caused `withTimeout` to lose the resolved result while the async work
 * was still in flight — the UI only saw a failure while logs showed `[CLAW] premium accepted`.
 */
export const PREMIUM_COMPLETION_ATTEMPT_MAX_MS = 10 * 60 * 1000;
