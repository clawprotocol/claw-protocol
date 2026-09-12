import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";

export type CorePaidJourneyRuntime = {
  owner_id: string;
  org_id: string;
  access_token: string;
  email: string;
};

export function loadCorePaidJourneyRuntime(): CorePaidJourneyRuntime {
  const path = process.env.CORE_PAID_JOURNEY_RUNTIME_JSON;
  if (!path) throw new Error("CORE_PAID_JOURNEY_RUNTIME_JSON is required");
  return JSON.parse(readFileSync(path, "utf8")) as CorePaidJourneyRuntime;
}

export async function seedCorePaidJourneyOwner(page: Page, runtime = loadCorePaidJourneyRuntime()): Promise<void> {
  await seedE2eAuthSession(page, {
    access_token: runtime.access_token,
    refresh_token: "core-paid-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: runtime.owner_id,
      email: runtime.email,
      app_metadata: { provider: "email" },
      user_metadata: { full_name: "Core Paid Owner" },
      identities: [{ provider: "email", id: `${runtime.owner_id}-id` }],
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
    },
  } as never);
  await page.addInitScript(
    ({ org, name }) => {
      try {
        localStorage.setItem("claw_org_id", org);
        localStorage.setItem("claw_user_display_name", name);
        sessionStorage.setItem("claw_authenticated_workspace_session", "1");
      } catch {
        /* ignore */
      }
    },
    { org: runtime.org_id, name: "Core Paid Owner" },
  );
}

export function captureRecipientMints(page: Page): Array<Record<string, unknown>> {
  const minted: Array<Record<string, unknown>> = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/recipient-access-token") || res.request().method() !== "POST") return;
    if (!res.ok()) return;
    try {
      minted.push((await res.json()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  return minted;
}
