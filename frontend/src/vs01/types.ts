/** VS01 wizard step index (client-only; no router). */
export type Vs01Step = 0 | 1 | 2;

/** Loading axis reserved for future API wiring (shell uses "idle" only for now). */
export type Vs01LoadingState =
  | "idle"
  | "finalize"
  | "session"
  | "complete"
  | "receipt"
  | "bundle";
