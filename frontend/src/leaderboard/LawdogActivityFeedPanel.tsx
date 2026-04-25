import { readLawdogActivityFeed } from "./lawdogActivityFeed";

export function LawdogActivityFeedPanel(props: { tick?: number }) {
  const rows = readLawdogActivityFeed().slice(0, 8);
  void props.tick; // bump from parent after prefs change to re-render feed
  return (
    <section
      className="rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-4 text-left"
      aria-labelledby="lawdog-act-feed-title"
    >
      <h2 id="lawdog-act-feed-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Activity (device-private)
      </h2>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
        Generic milestones only — no agreement text or parties. If you opt in publicly, similar events could sync later
        (still sanitized).
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No milestones yet — complete a send or signing to start the log.</p>
      ) : (
        <ul className="mt-3 list-none space-y-2 p-0">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs">
              <span className="text-slate-300">{r.headline}</span>
              <span className="mt-1 block text-[10px] text-slate-600">
                {new Date(r.at_ms).toLocaleString()}
                {r.eligible_for_public_snapshot ? (
                  <span className="ml-2 text-emerald-600/90">· eligible for future public feed</span>
                ) : (
                  <span className="ml-2 text-slate-600">· private snapshot</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
