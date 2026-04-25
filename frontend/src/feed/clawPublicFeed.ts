import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();

export type PublicFeedEvent = {
  event_id?: string;
  agreement_id?: string;
  event_type?: string;
  at?: string;
  summary?: string;
  visibility?: string;
  anchor_network?: string;
  anchor_status?: string;
  anchor_txid?: string | null;
  batch_id?: string | null;
  anchor_attempts?: number;
  anchor_error?: string | null;
  participants?: Array<{ name?: string; role?: string }>;
};

export type PublicFeedResponse = {
  events: PublicFeedEvent[];
  policy?: {
    feed_event_anchor_network_default?: string;
    settlement_anchor_network_hint?: string;
  };
};

export function clawPublicFeedPath(): string {
  return "/feed";
}

export function parseClawPublicFeedPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "");
  return p === "/feed";
}

export async function fetchPublicClawFeed(limit = 50): Promise<PublicFeedResponse | null> {
  const base = API_BASE.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/feed/public?limit=${encodeURIComponent(String(limit))}`);
    if (!res.ok) return null;
    return (await res.json()) as PublicFeedResponse;
  } catch {
    return null;
  }
}
