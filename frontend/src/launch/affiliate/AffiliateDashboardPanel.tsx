import { useEffect, useState } from "react";
import {
  createAffiliateAccessRequest,
  createAffiliateLink,
  fetchAffiliateAccessRequestStatus,
  fetchAffiliateDashboard,
  type AffiliateAccessRequestRow,
  type AffiliateAccessStatusResponse,
  type AffiliateDashboardResponse,
  type AffiliateCelebrations,
} from "./affiliateGamificationApi";
import { AffiliateCelebrationToasts } from "./AffiliateCelebrationToasts";
import { AffiliateRankShareDeck } from "./AffiliateRankShareCard";
import {
  TIMELINE_STEP_LABELS,
  earningPayoutLabel,
  formatUnlockDateDisplay,
  shortenTxHash,
  timelineActiveStepIndex,
  timelinePhaseLabel,
  type EarningTimelineRow,
} from "./affiliatePayoutTimelineUx";
import { lawdogExplorerTxUrl, lawdogUsdcContractDisplay } from "./lawdogPayoutEnv";
import { LawdogProofActivityHeatmap } from "../../proof/LawdogProofActivityHeatmap";
import { AffiliateProgramLegalLinks } from "./AffiliateProgramLegalLinks";
import { acceptAffiliateTerms, readAffiliateTermsAccepted } from "../legal/affiliateTermsAcceptance";

function dashAvatarFrameClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "legend") return "from-amber-200/45 via-amber-500/35 to-amber-950/55 shadow-[0_0_28px_-6px_rgba(245,158,11,0.28)]";
  if (t === "rainmaker") return "from-violet-200/35 via-violet-500/32 to-fuchsia-950/55 shadow-[0_0_24px_-6px_rgba(139,92,246,0.25)]";
  if (t === "closer") return "from-emerald-200/35 via-emerald-500/28 to-emerald-950/55";
  if (t === "climber") return "from-sky-200/30 via-sky-500/25 to-sky-950/55";
  return "from-slate-400/25 via-slate-600/28 to-slate-900/65";
}

function dashAvatar(url: string | null | undefined, name: string, progressionTier: string) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const inner = url ? (
    <img src={url} alt="" className="h-14 w-14 rounded-full object-cover" loading="lazy" />
  ) : (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600/95 to-emerald-800/85 text-lg font-bold text-white">
      {initial}
    </div>
  );
  return (
    <div className={`rounded-full bg-gradient-to-br p-[2.5px] ${dashAvatarFrameClass(progressionTier)}`}>
      <div className="rounded-full bg-slate-950 p-[2px]">{inner}</div>
    </div>
  );
}

function activityEventLabel(typeRaw: string | null | undefined, statusRaw: string | null | undefined): string {
  const t = String(typeRaw || "").toLowerCase();
  const s = String(statusRaw || "").toLowerCase();
  if (t.includes("click")) return "Click recorded";
  if (t.includes("signup") || t.includes("attributed")) return "Signup attributed";
  if (t.includes("commission") || t.includes("earned")) return "Commission earned";
  if (t.includes("payout") && (s.includes("paid") || s.includes("sent") || t.includes("sent"))) return "Payout sent";
  if (t.includes("roll") || t.includes("carry")) return "Rolled forward";
  if (t.includes("revers")) return "Reversed";
  if (t.includes("payment") || t.includes("conversion") || t.includes("cleared")) return "Payment cleared";
  return "Activity updated";
}

function activityAmountLabel(row: { commission_usd: number; gross_usd?: number | null }): string {
  if (Number.isFinite(row.commission_usd) && Math.abs(row.commission_usd) > 0) {
    return `$${row.commission_usd.toFixed(2)}`;
  }
  if (typeof row.gross_usd === "number") return `$${row.gross_usd.toFixed(2)}`;
  return "—";
}

function normalizeHandle(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function validateHandle(raw: string): string | null {
  const v = normalizeHandle(raw);
  if (v.length < 3) return "Use at least 3 characters.";
  if (!/^[a-z0-9_-]+$/.test(v)) return "Use lowercase letters, numbers, hyphens, or underscores only.";
  return null;
}

function validateXHandle(raw: string): string | null {
  const h = String(raw || "").trim().replace(/^@/, "").toLowerCase();
  if (!h) return null;
  if (!/^[a-z0-9_]{1,32}$/.test(h)) return "Use a valid X handle (letters, numbers, underscore).";
  return null;
}

export function AffiliateDashboardPanel(props: {
  orgId: string | null | undefined;
  onLinkStateChange?: (state: "join" | "create" | "ready") => void;
}) {
  const { orgId, onLinkStateChange } = props;
  const [data, setData] = useState<AffiliateDashboardResponse | null>(null);
  const [celebrations, setCelebrations] = useState<AffiliateCelebrations | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(() => readAffiliateTermsAccepted());
  const [joinChecked, setJoinChecked] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<AffiliateAccessStatusResponse | null>(null);
  const [requestType, setRequestType] = useState<
    "doginal_holder" | "trait_dao_partner" | "csn_creator_partner" | "other"
  >("doginal_holder");
  const [doginalPfpNumber, setDoginalPfpNumber] = useState("");
  const [daoName, setDaoName] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [lastRequestAtMs, setLastRequestAtMs] = useState(0);

  useEffect(() => {
    if (!orgId?.trim()) return;
    let cancel = false;
    void (async () => {
      try {
        const d = await fetchAffiliateDashboard(orgId.trim());
        if (cancel) return;
        if (d) {
          setData(d);
          setCelebrations(d.celebrations ?? null);
        } else {
          setData(null);
          setCelebrations(null);
        }
        setErr(null);
      } catch (e) {
        if (!cancel) {
          setData(null);
          setCelebrations(null);
          setErr(e instanceof Error ? e.message : "Dashboard unavailable.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId?.trim()) return;
    let cancel = false;
    void (async () => {
      try {
        const st = await fetchAffiliateAccessRequestStatus();
        if (cancel) return;
        setAccessStatus(st);
      } catch {
        if (!cancel) setAccessStatus(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [orgId]);

  if (!orgId?.trim()) return null;
  const accessReq: AffiliateAccessRequestRow | null = accessStatus?.request ?? null;
  const requestPending = String(accessReq?.status || "").toLowerCase() === "pending";
  const canCreateByEligibility = Boolean(accessStatus?.eligibility?.can_create_link);
  const hasInstantSubscriberAccess = Boolean(accessStatus?.eligibility?.paid_subscriber);
  const showInviteOnlyGate = !canCreateByEligibility && !requestPending;
  if (err || !data) {
    if (requestPending) onLinkStateChange?.("create");
    else onLinkStateChange?.(canCreateByEligibility ? "create" : "join");
    return (
      <>
        <section id="affiliate-your-link" className="scroll-mt-6 rounded-xl border border-slate-800/80 bg-slate-950/45 px-4 py-5 sm:px-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your link</h2>
          {showInviteOnlyGate ? (
            <>
              <p className="mt-2 text-sm font-medium text-slate-100">Affiliate access is invite-only</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                Subscribers unlock affiliate access instantly. Doginal Dog holders and approved partners may request
                early access during private beta.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="vs01-btn vs01-btn--primary vs01-btn--compact" disabled={!hasInstantSubscriberAccess}>
                  Subscribe to unlock
                </button>
              </div>
              <label className="mt-3 block text-xs text-slate-400">
                Request type
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as typeof requestType)}
                >
                  <option value="doginal_holder">Doginal Dog holder</option>
                  <option value="trait_dao_partner">Trait DAO / partner</option>
                  <option value="csn_creator_partner">CSN / creator partner</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {requestType === "doginal_holder" ? (
                <label className="mt-2 block text-xs text-slate-400">
                  Doginal Dog PFP number
                  <input
                    value={doginalPfpNumber}
                    onChange={(e) => setDoginalPfpNumber(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="143"
                    className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              ) : null}
              <label className="mt-2 block text-xs text-slate-400">
                X handle (optional)
                <input
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="mt-2 block text-xs text-slate-400">
                Note (optional)
                <textarea
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value.slice(0, 500))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
                disabled={requestBusy}
                onClick={async () => {
                  const now = Date.now();
                  if (requestBusy || now - lastRequestAtMs < 3500) {
                    setCreateError("Please wait a moment before submitting again.");
                    return;
                  }
                  const xErr = validateXHandle(xHandle);
                  if (xErr) {
                    setCreateError(xErr);
                    return;
                  }
                  if (requestType === "doginal_holder") {
                    const n = Number(doginalPfpNumber);
                    if (!Number.isFinite(n) || n < 1 || n > 10000 || !/^\d+$/.test(doginalPfpNumber.trim())) {
                      setCreateError("Enter a valid Doginal Dog number (1–10000).");
                      return;
                    }
                  }
                  setRequestBusy(true);
                  setCreateError(null);
                  try {
                    const out = await createAffiliateAccessRequest({
                      request_type: requestType,
                      doginal_pfp_number:
                        requestType === "doginal_holder" ? Number(doginalPfpNumber || "0") || undefined : undefined,
                      x_handle: xHandle.trim() || undefined,
                      note: requestNote.trim() || undefined,
                    });
                    setAccessStatus((prev) =>
                      prev
                        ? { ...prev, request: out.request }
                        : {
                            ok: true,
                            request: out.request,
                            eligibility: {
                              paid_subscriber: false,
                              manual_approved: false,
                              can_create_link: false,
                              has_active_affiliate: false,
                            },
                          }
                    );
                    setLastRequestAtMs(now);
                    setRequestNotice("Request received.");
                  } catch (e) {
                    setCreateError(e instanceof Error ? e.message : "Could not submit request.");
                  } finally {
                    setRequestBusy(false);
                  }
                }}
              >
                {requestBusy ? "Submitting..." : "Submit request"}
              </button>
              {createError ? <p className="mt-2 text-sm text-rose-300">{createError}</p> : null}
              {requestNotice ? <p className="mt-2 text-xs text-slate-500">{requestNotice}</p> : null}
            </>
          ) : requestPending ? (
            <>
              <p className="mt-2 text-sm font-medium text-slate-100">Request received</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                We&apos;ll review affiliate requests manually during private beta. Subscribers can still unlock access instantly.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                <li>Type: {String(accessReq?.request_type || "other").replace(/_/g, " ")}</li>
                {accessReq?.doginal_pfp_number ? <li>Doginal Dog #: {accessReq.doginal_pfp_number}</li> : null}
                {accessReq?.dao_name ? <li>DAO / partner: {accessReq.dao_name}</li> : null}
                {accessReq?.x_handle ? <li>X: @{accessReq.x_handle}</li> : null}
                {accessReq?.created_at ? <li>Submitted: {new Date(accessReq.created_at).toLocaleString()}</li> : null}
              </ul>
              <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3" disabled={!hasInstantSubscriberAccess}>
                Subscribe to unlock now
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              You&apos;re eligible to create a referral link once this account is activated.
            </p>
          )}
        </section>
        <section
          id="affiliate-payouts-activity"
          className="scroll-mt-6 rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-5 sm:px-5"
          aria-labelledby="affiliate-payouts-activity-title"
        >
          <h2 id="affiliate-payouts-activity-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/90">
            Payouts &amp; activity
          </h2>
          <p className="mt-1 text-sm text-slate-400">Track clicks, signups, earnings, and payouts.</p>
          <p className="mt-2 text-xs text-slate-500">Monthly payouts after month-end review. Under $25 rolls forward.</p>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {["Clicks", "Signups", "Paid conversions", "Pending earnings", "Eligible next payout", "Lifetime paid"].map((label) => (
              <div key={label} className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-1 tabular-nums text-slate-100">{label.includes("earnings") || label.includes("paid") ? "$0.00" : label.includes("Eligible") ? "No" : "0"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 border-t border-slate-800/70 pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recent activity</h3>
            <p className="mt-2 text-sm text-slate-400">No activity yet. Share your link to start tracking referrals.</p>
          </div>
        </section>
      </>
    );
  }

  const p = data.profile;
  const st = data.streak;
  const funnel = data.funnel;
  const next = data.next_milestone;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ap = data.affiliate_program;
  const links = data.personal_links;
  const ledger = data.earnings_ledger_usd;
  const refSum = data.referral_summary;
  const atHref = links?.at_path ? `${origin}${links.at_path}` : "";
  const dogHref = links?.doginal_path ? `${origin}${links.doginal_path}` : "";
  const canonicalReferralLink = atHref || dogHref || "";
  const autoCreateSupported = true;

  async function copyDash(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  async function shareLink(url: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "My LawDog referral",
          text: "Create and send agreements in minutes",
          url,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const tl = data.trust_ledger_v1;
  const clicks = tl?.clicks ?? 0;
  const signups = tl?.signups ?? 0;
  const paidConversions = tl?.conversions ?? 0;
  const pendingEarnings = tl?.earnings_pending_usd ?? 0;
  const eligibleNextPayout = tl?.eligible_next_payout ? "Yes" : "No";
  const lifetimePaid = tl?.lifetime_paid_usd ?? 0;
  const recentActivity = (tl?.recent_activity ?? []).slice(0, 8);
  const xHandleError = validateXHandle(xHandle);

  async function submitAccessRequest(): Promise<void> {
    const now = Date.now();
    if (requestBusy) return;
    if (now - lastRequestAtMs < 3500) {
      setCreateError("Please wait a moment before submitting again.");
      return;
    }
    if (xHandleError) {
      setCreateError(xHandleError);
      return;
    }
    if (requestType === "doginal_holder") {
      const n = Number(doginalPfpNumber);
      if (!Number.isFinite(n) || n < 1 || n > 10000 || !/^\d+$/.test(doginalPfpNumber.trim())) {
        setCreateError("Enter a valid Doginal Dog number (1–10000).");
        return;
      }
    }
    if (requestType === "trait_dao_partner" && !daoName.trim()) {
      setCreateError("Enter your DAO or partner name.");
      return;
    }
    if (requestType === "csn_creator_partner" && !xHandle.trim()) {
      setCreateError("Add your X handle.");
      return;
    }
    if (requestNote.length > 500) {
      setCreateError("Keep notes under 500 characters.");
      return;
    }
    setRequestBusy(true);
    setCreateError(null);
    try {
      const out = await createAffiliateAccessRequest({
        request_type: requestType,
        doginal_pfp_number: requestType === "doginal_holder" ? Number(doginalPfpNumber || "0") || undefined : undefined,
        dao_name: requestType === "trait_dao_partner" ? daoName.trim() || undefined : undefined,
        x_handle: xHandle.trim() || undefined,
        email: requestEmail.trim() || undefined,
        note: requestNote.trim() || undefined,
      });
      setAccessStatus((prev) =>
        prev
          ? { ...prev, request: out.request, eligibility: prev.eligibility }
          : { ok: true, request: out.request, eligibility: { paid_subscriber: false, manual_approved: false, can_create_link: false, has_active_affiliate: false } }
      );
      setLastRequestAtMs(now);
      setRequestNotice("Request received.");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not submit request.");
    } finally {
      setRequestBusy(false);
    }
  }

  useEffect(() => {
    if (canonicalReferralLink) onLinkStateChange?.("ready");
    else if (showInviteOnlyGate) onLinkStateChange?.("join");
    else onLinkStateChange?.("create");
  }, [canonicalReferralLink, onLinkStateChange, showInviteOnlyGate]);

  return (
    <>
      <AffiliateCelebrationToasts affiliateId={p.affiliate_id} celebrations={celebrations} />
      <section id="affiliate-your-link" className="scroll-mt-6 rounded-xl border border-slate-800/80 bg-slate-950/45 px-4 py-5 sm:px-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your link</h2>
        {showInviteOnlyGate ? (
          <>
            <p className="mt-2 text-sm font-medium text-slate-100">Affiliate access is invite-only</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Subscribers unlock affiliate access instantly. Doginal Dog holders and approved partners may request early
              access during private beta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="vs01-btn vs01-btn--primary vs01-btn--compact" disabled={!hasInstantSubscriberAccess}>
                Subscribe to unlock
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-slate-800/70 bg-slate-900/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Request access</p>
              <label className="mt-2 block text-xs text-slate-400">
                Request type
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as typeof requestType)}
                >
                  <option value="doginal_holder">Doginal Dog holder</option>
                  <option value="trait_dao_partner">Trait DAO / partner</option>
                  <option value="csn_creator_partner">CSN / creator partner</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {requestType === "doginal_holder" ? (
                <label className="mt-2 block text-xs text-slate-400">
                  Doginal Dog PFP number
                  <input
                    value={doginalPfpNumber}
                    onChange={(e) => setDoginalPfpNumber(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="143"
                    className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Enter your Doginal Dog number for priority review. Approval is manual during private beta.
                  </span>
                </label>
              ) : null}
              {requestType === "trait_dao_partner" ? (
                <label className="mt-2 block text-xs text-slate-400">
                  DAO / partner name
                  <input
                    value={daoName}
                    onChange={(e) => setDaoName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              ) : null}
              <label className="mt-2 block text-xs text-slate-400">
                X handle (optional)
                <input
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value)}
                  placeholder="@handle"
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="mt-2 block text-xs text-slate-400">
                Email (optional)
                <input
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="mt-2 block text-xs text-slate-400">
                Note (optional)
                <textarea
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value.slice(0, 500))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              {createError ? <p className="mt-2 text-sm text-rose-300">{createError}</p> : null}
              {requestNotice ? <p className="mt-2 text-sm text-slate-400">{requestNotice}</p> : null}
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
                disabled={requestBusy}
                onClick={() => void submitAccessRequest()}
              >
                {requestBusy ? "Submitting..." : "Submit request"}
              </button>
            </div>
          </>
        ) : requestPending ? (
          <>
            <p className="mt-2 text-sm font-medium text-slate-100">Request received</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              We&apos;ll review affiliate requests manually during private beta. Subscribers can still unlock access instantly.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              <li>Request type: {String(accessReq?.request_type || "other").replace(/_/g, " ")}</li>
              {accessReq?.doginal_pfp_number ? <li>Doginal Dog #: {accessReq.doginal_pfp_number}</li> : null}
              {accessReq?.dao_name ? <li>DAO / partner: {accessReq.dao_name}</li> : null}
              {accessReq?.x_handle ? <li>X handle: @{accessReq.x_handle}</li> : null}
              {accessReq?.created_at ? <li>Submitted: {new Date(accessReq.created_at).toLocaleString()}</li> : null}
            </ul>
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3" disabled={!hasInstantSubscriberAccess}>
              Subscribe to unlock now
            </button>
          </>
        ) : !termsAccepted ? (
          <>
            <p className="mt-2 text-sm font-medium text-slate-100">Join the affiliate program</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Accept the program terms, then create your referral link.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-slate-300">
              <input
                type="checkbox"
                checked={joinChecked}
                onChange={(e) => setJoinChecked(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900"
              />
              <span>
                I agree to the Affiliate Terms, Terms of Service, Privacy Policy, and required disclosure rules.
              </span>
            </label>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact mt-4"
              disabled={!joinChecked}
              onClick={() => {
                acceptAffiliateTerms();
                setTermsAccepted(true);
                setCreateError(null);
                setRequestNotice(null);
              }}
            >
              Continue
            </button>
          </>
        ) : !canonicalReferralLink ? (
          <>
            <p className="mt-2 text-sm font-medium text-slate-100">Create your referral link</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Choose the handle people will see when they open your LawDog link.
            </p>
            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Referral handle</span>
              <input
                type="text"
                value={handleInput}
                onChange={(e) => {
                  setHandleInput(normalizeHandle(e.target.value));
                  setCreateError(null);
                  setRequestNotice(null);
                }}
                placeholder="testdog"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-600/50"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">Your link will look like /@yourhandle.</p>
            {createError ? <p className="mt-2 text-sm text-rose-300">{createError}</p> : null}
            {!autoCreateSupported ? <p className="mt-2 text-sm text-slate-400">Ask the operator to activate your link.</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact"
                disabled={createBusy}
                onClick={async () => {
                  const errMsg = validateHandle(handleInput);
                  if (errMsg) {
                    setCreateError(errMsg);
                    return;
                  }
                  if (!autoCreateSupported) return;
                  setCreateBusy(true);
                  setCreateError(null);
                  try {
                    await createAffiliateLink(normalizeHandle(handleInput));
                    const refreshed = await fetchAffiliateDashboard(orgId.trim());
                    if (refreshed) {
                      setData(refreshed);
                      setCelebrations(refreshed.celebrations ?? null);
                    }
                  } catch (e) {
                    setCreateError(e instanceof Error ? e.message : "Could not create link.");
                  } finally {
                    setCreateBusy(false);
                  }
                }}
              >
                {createBusy ? "Creating..." : "Create link"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Share this link. When someone subscribes through it, activity appears below.
            </p>
            <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-3">
              <p className="break-all font-mono text-sm text-emerald-100/95">{canonicalReferralLink}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact"
                onClick={() => void copyDash(canonicalReferralLink)}
              >
                Copy link
              </button>
              {typeof navigator !== "undefined" &&
              typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share ===
                "function" ? (
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => void shareLink(canonicalReferralLink)}
                >
                  Share
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section
        id="affiliate-payouts-activity"
        className="scroll-mt-6 rounded-xl border border-emerald-900/30 bg-emerald-950/10 px-4 py-5 sm:px-5"
        aria-labelledby="affiliate-payouts-activity-title"
      >
        <h2 id="affiliate-payouts-activity-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/90">
          Payouts &amp; activity
        </h2>
        <p className="mt-1 text-sm text-slate-400">Track clicks, signups, earnings, and payouts.</p>
        <p className="mt-2 text-xs text-slate-500">Monthly payouts after month-end review. Under $25 rolls forward.</p>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Clicks</dt>
            <dd className="mt-1 tabular-nums text-slate-100">{clicks}</dd>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Signups</dt>
            <dd className="mt-1 tabular-nums text-slate-100">{signups}</dd>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Paid conversions</dt>
            <dd className="mt-1 tabular-nums text-slate-100">{paidConversions}</dd>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending earnings</dt>
            <dd className="mt-1 tabular-nums text-slate-100">${pendingEarnings.toFixed(2)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Eligible next payout</dt>
            <dd className="mt-1 font-semibold text-slate-100">{eligibleNextPayout}</dd>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lifetime paid</dt>
            <dd className="mt-1 tabular-nums text-slate-100">${lifetimePaid.toFixed(2)}</dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-slate-800/70 pt-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Recent activity</h3>
          {recentActivity.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No activity yet. Share your link to start tracking referrals.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recentActivity.map((row, i) => (
                <li
                  key={`${row.at ?? ""}-${row.type ?? ""}-${i}`}
                  className="grid gap-1 rounded-lg border border-slate-800/70 bg-slate-950/45 px-3 py-2 text-xs text-slate-300 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3"
                >
                  <span className="font-medium text-slate-200">{activityEventLabel(row.type, row.status)}</span>
                  <span className="tabular-nums text-emerald-200/90">{activityAmountLabel(row)}</span>
                  <span className="text-slate-500">
                    {row.at
                      ? new Date(row.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                    {row.status ? ` · ${String(row.status).replace(/_/g, " ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section
        className="scroll-mt-6 rounded-xl border border-slate-800/75 bg-gradient-to-b from-slate-950/55 to-slate-950/35 px-4 py-5 sm:px-5"
        aria-labelledby="aff-dash-title"
      >
        <h2 id="aff-dash-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Your program
        </h2>
        <p className="mt-1 text-sm text-slate-400">Share your link. Earn when people use LawDog.</p>

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {dashAvatar(p.avatar_url, p.display_name, p.progression_tier)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{p.display_name}</p>
            <p className="mt-0.5 text-xs text-slate-500">Program member</p>
            <details className="mt-3 rounded-lg border border-slate-800/70 bg-slate-900/30 px-3 py-2 text-left">
              <summary className="cursor-pointer text-xs font-medium text-slate-400">Activity details</summary>
              <p className="mt-2 text-[11px] text-slate-500">
                Placement reflects real usage (signups, paid plans, agreements) — not clicks alone.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Standing{" "}
                <span className="font-medium text-slate-300">{p.leaderboard_rank != null ? `#${p.leaderboard_rank}` : "—"}</span>{" "}
                · <span className="text-slate-300">{p.progression_tier}</span>
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-200/95">{p.momentum_score}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Activity score · {p.leaderboard_score_basis === "confirmed_momentum" ? "confirmed" : "blend"}
              </p>
              {typeof p.momentum_pending_score === "number" &&
              (p.momentum_pending_score > p.momentum_score + 0.04 || p.momentum_score === 0) ? (
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                  In pipeline:{" "}
                  <span className="font-medium tabular-nums text-slate-500">{p.momentum_pending_score.toFixed(1)}</span>
                </p>
              ) : null}
            </details>
          </div>
        </div>

        {ap && ledger ? (
          <div className="mt-5 space-y-4 border-t border-slate-800/70 pt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Program status</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={
                    ap.doginal_verified
                      ? "rounded-full border border-amber-800/50 bg-amber-950/30 px-2.5 py-1 text-[10px] font-semibold text-amber-100/90"
                      : "rounded-full border border-slate-700/80 bg-slate-900/55 px-2.5 py-1 text-[10px] font-semibold text-slate-200"
                  }
                >
                  {ap.doginal_verified ? "Verified profile" : "Program member"}
                </span>
              </div>
            </div>

            {links?.doginal_path && dogHref ? (
              <details className="rounded-lg border border-slate-800/70 bg-slate-900/25 px-3 py-2">
                <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  Alternate link
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="font-mono text-[11px] text-amber-200/85">{dogHref}</span>
                  <button
                    type="button"
                    className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:border-slate-600"
                    onClick={() => void copyDash(dogHref)}
                  >
                    Copy
                  </button>
                </div>
              </details>
            ) : null}

            {data.payout_ui ? (
              <div className="rounded-lg border border-slate-800/60 bg-slate-900/25 px-3 py-2.5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>
                    <span className="text-slate-500">Total earned · </span>
                    <span className="font-semibold tabular-nums text-slate-200">
                      ${data.payout_ui.totals.total_earned_usd.toFixed(2)}
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-500">Payable now · </span>
                    <span className="font-semibold tabular-nums text-emerald-200/90">
                      ${(data.payout_ui.payout_status_usd?.payable_usd ?? ledger.payable_usd).toFixed(2)}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Monthly payouts. Balances under $25 roll forward to the next payout cycle.
                </p>
              </div>
            ) : null}

            {data.payout_ui ? (
              <div className="rounded-lg border border-amber-900/35 bg-amber-950/15 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/80">
                  Wallet note
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Amounts are tracked in USD and sent as USDC on Base. If you change your payout wallet, expect a short
                  safety wait
                  {typeof data.payout_ui.policy.payout_wallet_cooling_days === "number"
                    ? ` (${data.payout_ui.policy.payout_wallet_cooling_days} days)`
                    : ""}{" "}
                  before the new address can be used in a batch.
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-800/70 bg-slate-950/25 px-3 py-3">
              <LawdogProofActivityHeatmap />
            </div>

            {data.payout_ui?.network_display ? (
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/30 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Payout method</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-200">
                  {data.payout_ui.payout_wallet_display?.address ?? "—"}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Network ·{" "}
                  <span className="font-medium text-slate-300">
                    {data.payout_ui.network_display.label} (chain {data.payout_ui.network_display.chain_id})
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  Asset · USDC ·{" "}
                  <span className="font-mono text-slate-500">
                    {(data.payout_ui.network_display.usdc_contract || lawdogUsdcContractDisplay()).slice(0, 10)}…
                  </span>
                </p>
                {data.payout_ui.latest_completed_payout?.explorer_tx_url ? (
                  <p className="mt-2">
                    <a
                      href={data.payout_ui.latest_completed_payout.explorer_tx_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-emerald-300/90 underline decoration-emerald-600/40 underline-offset-2"
                    >
                      View on Base
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Balance snapshot</p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                Pending, payable, and paid — each earning below shows where it sits in that path.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-2 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Pending USD</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">${ledger.pending_usd.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-2 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Payable USD</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-200/90">
                  ${ledger.payable_usd.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-2 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Paid USD</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">${ledger.paid_usd.toFixed(2)}</p>
              </div>
            </div>

            {refSum ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-2 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Referred users</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{refSum.total_referred_users}</p>
                </div>
                <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-2 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Paying referred</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{refSum.paying_referred_users}</p>
                </div>
              </div>
            ) : null}

            {data.payout_note ? (
              <p className="text-[11px] leading-relaxed text-slate-500">{data.payout_note}</p>
            ) : null}

            {data.earnings_timeline && data.earnings_timeline.length > 0 ? (
              <div>
                <h3
                  id="aff-earnings-timeline-title"
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Your earnings timeline
                </h3>
                <p className="mt-1 text-[10px] text-slate-600">
                  Each row is one commission. The dots track Earned → Pending → Payable → Paid.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  {TIMELINE_STEP_LABELS.map((label, i) => (
                    <span key={label} className="flex items-center gap-1">
                      {i > 0 ? <span className="text-slate-700">→</span> : null}
                      <span>{label}</span>
                    </span>
                  ))}
                </div>

                <ul className="mt-3 space-y-3" aria-labelledby="aff-earnings-timeline-title">
                  {data.earnings_timeline.map((row) => {
                    const r = row as EarningTimelineRow;
                    const holdDays = data.payout_ui?.policy.hold_days ?? 21;
                    const label = earningPayoutLabel(r, holdDays);
                    const stepIdx = timelineActiveStepIndex(r);
                    return (
                      <li
                        key={r.id}
                        className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold tabular-nums text-white">${r.amount_usd.toFixed(2)}</span>
                          <span className="rounded-full border border-slate-700/80 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                            {timelinePhaseLabel(r)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-1">
                            {[0, 1, 2, 3].map((i) => (
                              <span key={i} className="flex items-center gap-1">
                                <span
                                  className={`block h-2 w-2 shrink-0 rounded-full ${
                                    i <= stepIdx ? "bg-emerald-400/90" : "bg-slate-700"
                                  }`}
                                  aria-hidden
                                />
                                {i < 3 ? (
                                  <span
                                    className={`block h-0.5 w-5 max-w-[1.25rem] ${
                                      i < stepIdx ? "bg-emerald-500/35" : "bg-slate-800"
                                    }`}
                                    aria-hidden
                                  />
                                ) : null}
                              </span>
                            ))}
                          </div>
                          <div className="mt-1.5 grid grid-cols-4 gap-1 text-center text-[8px] font-medium uppercase tracking-wide text-slate-600">
                            {TIMELINE_STEP_LABELS.map((stepLabel, i) => (
                              <span
                                key={stepLabel}
                                className={i <= stepIdx ? "text-emerald-600/90" : ""}
                              >
                                {stepLabel}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="mt-1.5 text-[11px] font-medium text-emerald-100/85">{label.headline}</p>
                        {label.detail ? (
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{label.detail}</p>
                        ) : null}
                        {r.status === "pending" && formatUnlockDateDisplay(r.unlock_at) ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            Unlocks on <span className="font-medium tabular-nums text-slate-400">{formatUnlockDateDisplay(r.unlock_at)}</span> (UTC)
                          </p>
                        ) : null}
                        {r.status === "pending" ? (
                          <details className="mt-2 rounded-md border border-slate-800/60 bg-slate-950/30 px-2 py-1.5">
                            <summary className="cursor-pointer text-[10px] font-medium text-slate-400">
                              Why is this pending?
                            </summary>
                            <ul className="mt-2 list-inside list-disc space-y-1 text-[10px] leading-relaxed text-slate-500">
                              <li>
                                We wait <span className="text-slate-400">{holdDays} days</span> after a qualifying
                                payment so everyday reversals do not hit your balance.
                              </li>
                              <li>If a payment is refunded or reversed, we adjust before anything is marked payable.</li>
                              <li>When the wait ends and everything looks good, this row moves forward on its own.</li>
                            </ul>
                          </details>
                        ) : null}
                        {r.status === "paid" ? (
                          <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                            {r.paid_at ? (
                              <p className="tabular-nums text-slate-500">Sent · {r.paid_at.slice(0, 10)}</p>
                            ) : null}
                            {r.payout_tx_hash ? (
                              <>
                                <p className="font-mono text-[10px] text-slate-400">
                                  Ref · {shortenTxHash(r.payout_tx_hash)}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 hover:border-slate-600"
                                    onClick={() => void copyDash(r.payout_tx_hash || "")}
                                  >
                                    Copy
                                  </button>
                                  <a
                                    href={
                                      data.payout_ui?.network_display?.explorer_tx_url_template
                                        ? data.payout_ui.network_display.explorer_tx_url_template.replace(
                                            "{tx_hash}",
                                            r.payout_tx_hash,
                                          )
                                        : lawdogExplorerTxUrl(r.payout_tx_hash)
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-medium text-emerald-400/90 underline decoration-emerald-700/40 underline-offset-2"
                                  >
                                    View on Base
                                  </a>
                                </div>
                                <p className="text-[10px] text-slate-500">This payout is verifiable on-chain.</p>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Streak</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{st.current_streak_days}d</p>
            <p className="text-[10px] text-slate-600">Best {st.best_streak_days}d</p>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Referrals</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{funnel.qualified_signups}</p>
            <p className="text-[10px] text-slate-600">Qualified</p>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Activated</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{funnel.activated_users}</p>
            <p className="text-[10px] text-slate-600">Using product</p>
          </div>
          <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sends</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{funnel.agreements_influenced}</p>
            <p className="text-[10px] text-slate-600">Agreements influenced</p>
          </div>
        </div>

        {st.streak_at_risk && st.streak_at_risk_copy ? (
          <p className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/25 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
            {st.streak_at_risk_copy}
          </p>
        ) : null}

        {next.next_tier ? (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-400">Next level · {next.next_tier}.</span> About{" "}
            <span className="tabular-nums text-slate-300">{next.momentum_to_go}</span> more activity to get there.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-slate-600">You&apos;re at the top band for now — keep real sends coming.</p>
        )}

        {data.recent_wins.length ? (
          <div className="mt-4 border-t border-slate-800/70 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recent wins</p>
            <ul className="mt-2 space-y-1.5">
              {data.recent_wins.map((w) => (
                <li key={`${w.badge_id}_${w.unlocked_at}`} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="text-sm text-violet-200/90">{w.visual}</span>
                  <span>{w.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.badges_unlocked.length ? (
          <div className="mt-4 border-t border-slate-800/70 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Earned marks</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.badges_unlocked.slice(0, 12).map((b) => (
                <span
                  key={b.badge_id}
                  title={b.description}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/50 px-2 py-1 text-[10px] text-slate-200"
                >
                  <span className="text-violet-200/90">{b.visual}</span>
                  {b.title}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <details className="mt-5 rounded-lg border border-slate-800/60 bg-slate-900/20">
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-slate-400">
            Optional: social share images
          </summary>
          <div className="border-t border-slate-800/60 p-3">
            <AffiliateRankShareDeck
              data={{
                profile: {
                  display_name: p.display_name,
                  avatar_url: p.avatar_url,
                  progression_tier: p.progression_tier,
                  leaderboard_rank: p.leaderboard_rank,
                  momentum_score: p.momentum_score,
                  agreements_influenced: p.agreements_influenced,
                },
                streak: {
                  current_streak_days: st.current_streak_days,
                  best_streak_days: st.best_streak_days,
                },
                celebrations: data.celebrations ?? null,
                recentWin: data.recent_wins[0]
                  ? {
                      title: data.recent_wins[0].title,
                      visual: data.recent_wins[0].visual,
                      badge_id: data.recent_wins[0].badge_id,
                    }
                  : null,
                badgeIdsOrdered: data.badges_unlocked.map((b) => b.badge_id),
              }}
            />
          </div>
        </details>

        <AffiliateProgramLegalLinks origin={origin} className="mt-6 border-t border-slate-800/70 pt-4" />
      </section>
    </>
  );
}
