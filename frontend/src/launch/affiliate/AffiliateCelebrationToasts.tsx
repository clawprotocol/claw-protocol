import { useEffect, useState } from "react";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import type { AffiliateCelebrations } from "./affiliateGamificationApi";

type Toast = { id: string; title: string; subtitle: string; hue: "violet" | "amber" | "emerald" };

function seenKey(id: string): string {
  return `claw_aff_toast_${id}`;
}

/** Refined, short-lived toasts for badge / tier / streak moments — not a confetti cannon. */
export function AffiliateCelebrationToasts(props: {
  affiliateId: string;
  celebrations: AffiliateCelebrations | null | undefined;
}) {
  const { affiliateId, celebrations } = props;
  const [queue, setQueue] = useState<Toast[]>([]);

  useEffect(() => {
    if (!celebrations || !affiliateId) return;
    const next: Toast[] = [];
    if (celebrations.tier_upgrade) {
      const tu = celebrations.tier_upgrade;
      const id = `${affiliateId}_tier_${tu.new_tier}`;
      if (!sessionStorage.getItem(seenKey(id))) {
        sessionStorage.setItem(seenKey(id), "1");
        logProductEvent("affiliate_gamification_celebration_toast", {
          kind: "tier_upgrade",
          previous_tier: tu.previous_tier,
          new_tier: tu.new_tier,
        });
        next.push({
          id,
          title: "Pack rank up",
          subtitle: `${tu.previous_tier} → ${tu.new_tier}`,
          hue: "amber",
        });
      }
    }
    for (const b of celebrations.badges ?? []) {
      const id = `${affiliateId}_badge_${b.badge_id}_${b.unlocked_at}`;
      if (!sessionStorage.getItem(seenKey(id))) {
        sessionStorage.setItem(seenKey(id), "1");
        logProductEvent("affiliate_gamification_celebration_toast", {
          kind: "badge_unlocked",
          badge_id: b.badge_id,
        });
        next.push({
          id,
          title: "Earned mark",
          subtitle: `${b.visual} ${b.title}`,
          hue: "violet",
        });
      }
    }
    if (!next.length) return;
    setQueue((q) => [...q, ...next].slice(-4));
  }, [affiliateId, celebrations]);

  useEffect(() => {
    if (!queue.length) return;
    const t = window.setTimeout(() => {
      setQueue((q) => q.slice(1));
    }, 4200);
    return () => window.clearTimeout(t);
  }, [queue]);

  if (!queue.length) return null;

  const ring =
    queue[0].hue === "amber"
      ? "border-amber-500/35 shadow-amber-900/20"
      : queue[0].hue === "emerald"
        ? "border-emerald-500/35 shadow-emerald-900/20"
        : "border-violet-500/35 shadow-violet-900/25";

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-5 z-[60] flex w-[min(20rem,calc(100vw-2.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {queue.slice(0, 2).map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border bg-slate-950/90 px-4 py-3 shadow-xl backdrop-blur-md ${ring}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{toast.title}</p>
          <p className="mt-1 text-sm font-medium leading-snug text-slate-100">{toast.subtitle}</p>
        </div>
      ))}
    </div>
  );
}
