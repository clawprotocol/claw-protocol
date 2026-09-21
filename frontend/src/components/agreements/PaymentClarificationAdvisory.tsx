import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  applyPaymentClarificationAnswer,
  paymentClarificationQuestions,
  readPaymentClarification,
  resolvePaymentClarificationScope,
  subscribePaymentClarification,
} from "./paymentClarificationSession";
import {
  authorizedPaidProRevisionId,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { selectVerifiedPaidReviewPaper } from "./paidProVerifiedReviewPaper";

export function PaymentClarificationAdvisory(args: {
  agreementId?: string | null;
  revisionId?: string | null;
  intakeText?: string | null;
  body: string;
  accepted?: boolean;
}): ReactElement | null {
  const [, setTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => subscribePaymentClarification(() => setTick((n) => n + 1)), []);

  const verifiedPlain = args.agreementId
    ? selectVerifiedPaidReviewPaper({ agreementId: args.agreementId })?.plain || ""
    : "";
  const revisionId = (
    args.revisionId ||
    getPaidProSourceOfTruth()?.hash ||
    authorizedPaidProRevisionId(verifiedPlain)
  ).trim();
  const scope = resolvePaymentClarificationScope({
    agreementId: args.agreementId,
    revisionId: revisionId || undefined,
  });
  const stored = readPaymentClarification(scope);
  const intake = (stored?.intake || args.intakeText || "").trim();
  const appliedAnswers =
    stored?.revisionId && stored.revisionId === revisionId ? (stored.appliedAnswers || "").trim() : "";
  const pendingAnswer = (stored?.pendingAnswer || "").trim();
  const applyStatus = stored?.applyStatus || "idle";
  const questions = useMemo(
    () =>
      paymentClarificationQuestions({
        intake: intake || args.body || "",
        appliedAnswers,
        pendingAnswer,
        authorizedBody: args.body,
        body: args.body,
      }),
    [intake, appliedAnswers, pendingAnswer, args.body],
  );

  useEffect(() => {
    if (applyStatus === "failed" && pendingAnswer && !draft.trim()) {
      setDraft(pendingAnswer);
    }
  }, [applyStatus, pendingAnswer, draft]);

  if (args.accepted) return null;
  if (questions.length === 0) return null;

  return (
    <section
      className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-stone-900 shadow-sm"
      data-testid="payment-clarification-panel"
      data-apply-status={applyStatus}
      aria-label="Payment clarification"
    >
      <p className="text-sm font-semibold tracking-tight">Recommended payment details</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-700">
        Optional — you can review or sign without answering. Confirmed facts update the Fees and Payment
        clause.
      </p>
      <p className="sr-only" data-testid="payment-clarification-status">
        {applyStatus}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {questions.map((question) => (
          <li key={question} data-testid="payment-clarification-question">
            {question}
          </li>
        ))}
      </ul>
      {applyStatus === "failed" && pendingAnswer ? (
        <p className="mt-2 text-xs text-stone-700" data-testid="payment-clarification-pending">
          Saved answer ready to retry: {pendingAnswer}
        </p>
      ) : null}
      <label className="mt-3 block text-xs font-medium text-stone-600">
        Your answer
        <textarea
          data-testid="payment-clarification-answer"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500"
          placeholder="Example: Invoice once on October 1, 2026. Payment due net 60."
          disabled={busy}
        />
      </label>
      <button
        type="button"
        data-testid="payment-clarification-apply"
        className="mt-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy || !draft.trim()}
        onClick={() => {
          const answer = draft.trim();
          if (!answer) return;
          const liveRevision = (
            getPaidProSourceOfTruth()?.hash ||
            authorizedPaidProRevisionId(getPaidProSourceOfTruthText()) ||
            authorizedPaidProRevisionId(verifiedPlain) ||
            revisionId
          ).trim();
          const liveScope = resolvePaymentClarificationScope({
            agreementId: args.agreementId,
            revisionId: liveRevision || undefined,
          });
          if (!liveScope || !liveRevision) {
            setError("Could not apply that payment answer until this agreement is restored.");
            return;
          }
          setBusy(true);
          setError(null);
          void applyPaymentClarificationAnswer(answer, liveScope)
            .then(() => setDraft(""))
            .catch((err) => {
              setError(err instanceof Error ? err.message : "Could not apply that payment answer.");
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Updating…" : applyStatus === "failed" ? "Retry payment answer" : "Apply payment answer"}
      </button>
      {error || stored?.applyError ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error || stored?.applyError}
        </p>
      ) : null}
    </section>
  );
}
