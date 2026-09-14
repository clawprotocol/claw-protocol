/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLawdogUserSessionState } from "../../auth/userSessionState";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { setOrgId } from "../../launch/orgContext";
import {
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
} from "./proAgreementCompleteness";
import {
  applyPaymentClarificationAnswer,
  bindPaymentClarificationDraftToAgreement,
  capturePaymentApplyTarget,
  clearPaymentClarificationForTests,
  ensurePaymentClarificationDraftSession,
  markPaymentClarificationApplied,
  markPaymentClarificationApplying,
  markPaymentClarificationFailed,
  paymentApplyTargetMatches,
  paymentClarificationQuestions,
  persistPaymentClarification,
  queuePaymentClarificationPending,
  readPaymentClarification,
  readPaymentClarificationIntake,
  readRecoveredPaymentClarificationAnswers,
  registerPaymentClarificationApply,
  resolvePaymentClarificationScope,
  samePaymentApplyOwner,
} from "./paymentClarificationSession";
import { beginPaidProRevisionOperation, setPaidProLiveRevisionView } from "./paidProRevisionOperation";

const BODY = [
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000.",
  "4. Term",
  "Twelve months starting October 1, 2026.",
].join("\n");

const AUTHORIZED_COMPLETE = [
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee once on October 1, 2026. Payment is due net 60.",
  "4. Term",
  "Twelve months starting October 1, 2026.",
].join("\n");

const AUTHORIZED_MONTHLY = [
  "3. Fees and Payment",
  "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee monthly.",
  "4. Term",
  "Twelve months.",
].join("\n");

const OWNER_A = {
  userId: "owner-a",
  organizationId: "org-a",
  agreementId: "agr-a",
  revisionId: "rev-a1",
};

const OWNER_B = {
  userId: "owner-a",
  organizationId: "org-a",
  agreementId: "agr-b",
  revisionId: "rev-b1",
};

const OTHER_ORG = {
  userId: "owner-a",
  organizationId: "org-b",
  agreementId: "agr-a",
  revisionId: "rev-a1",
};

afterEach(() => {
  clearPaymentClarificationForTests();
  vi.restoreAllMocks();
});

describe("payment clarification exact identity", () => {
  it("reading agreement B with empty answers never returns A’s record", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice once on October 1, 2026. Payment due net 60.",
    });
    persistPaymentClarification({
      ...OWNER_B,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "",
    });

    const a = readPaymentClarification(OWNER_A);
    const b = readPaymentClarification(OWNER_B);
    expect(a?.agreementId).toBe("agr-a");
    expect(a?.appliedAnswers).toMatch(/October 1, 2026/);
    expect(b?.agreementId).toBe("agr-b");
    expect(b?.appliedAnswers).toBe("");
    expect(b?.appliedAnswers).not.toBe(a?.appliedAnswers);
    expect(readPaymentClarification({ ...OWNER_B, agreementId: "agr-missing" })).toBeNull();
    expect(readPaymentClarification({ agreementId: "agr-b" } as never)).toBeNull();
    expect(readPaymentClarification(undefined)).toBeNull();
  });

  it("does not borrow pending answers from another draft or the latest row", () => {
    persistPaymentClarification({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      agreementId: "",
      draftSessionId: "draft-a",
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      pendingAnswer: "Invoice weekly",
    });
    persistPaymentClarification({
      ...OWNER_B,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      pendingAnswer: "",
      appliedAnswers: "",
    });

    expect(readPaymentClarification(OWNER_B)?.pendingAnswer).toBe("");
    expect(
      readPaymentClarification({
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        agreementId: "pending",
      }),
    ).toBeNull();
  });

  it("binds only the matching pre-ID draft when its durable id is established", () => {
    ensurePaymentClarificationDraftSession({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      draftSessionId: "draft-a",
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    queuePaymentClarificationPending(
      {
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        draftSessionId: "draft-a",
      },
      "Invoice monthly",
      CORE_PAID_JOURNEY_FILLED_INTAKE,
    );
    ensurePaymentClarificationDraftSession({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      draftSessionId: "draft-other",
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    queuePaymentClarificationPending(
      {
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        draftSessionId: "draft-other",
      },
      "Invoice weekly",
      CORE_PAID_JOURNEY_FILLED_INTAKE,
    );

    bindPaymentClarificationDraftToAgreement({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      draftSessionId: "draft-a",
      agreementId: "agr-a",
      revisionId: OWNER_A.revisionId,
    });

    expect(readPaymentClarification(OWNER_A)?.pendingAnswer).toBe("Invoice monthly");
    expect(readPaymentClarification(OWNER_A)?.draftSessionId).toBe("draft-a");
    expect(
      readPaymentClarification({
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        agreementId: "agr-other-from-pending",
      }),
    ).toBeNull();
    expect(
      readPaymentClarification({
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        draftSessionId: "draft-other",
      })?.pendingAnswer,
    ).toBe("Invoice weekly");
  });
});

describe("payment clarification logout and org switch", () => {
  it("clears the client cache on logout so the next user cannot read the prior record", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      pendingAnswer: "Invoice monthly",
      appliedAnswers: "Invoice monthly",
    });
    expect(readPaymentClarification(OWNER_A)?.pendingAnswer).toBe("Invoice monthly");

    clearLawdogUserSessionState();

    expect(readPaymentClarification(OWNER_A)).toBeNull();
    expect(sessionStorage.getItem("claw_payment_clarification_v1")).toBeNull();
  });

  it("clears the client cache on org switch and does not leak across orgs", () => {
    setOrgId("org-a");
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      pendingAnswer: "Invoice monthly",
    });
    persistPaymentClarification({
      ...OTHER_ORG,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      pendingAnswer: "Invoice weekly",
    });
    expect(readPaymentClarification(OWNER_A)?.pendingAnswer).toBe("Invoice monthly");

    setOrgId("org-b");

    expect(readPaymentClarification(OWNER_A)).toBeNull();
    expect(readPaymentClarification(OTHER_ORG)).toBeNull();
    expect(readPaymentClarification({ ...OWNER_A, organizationId: "org-b" })).toBeNull();
  });
});

describe("pending versus confirmed payment answers", () => {
  it("keeps Harbor intake free of payment terms and does not treat typing as applied", () => {
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).not.toMatch(/net\s*[- ]?30|installment/i);
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    const first = paymentClarificationQuestions({
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "",
      pendingAnswer: "Invoice monthly",
      body: BODY,
    });
    expect(first).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);

    queuePaymentClarificationPending(OWNER_A, "Invoice monthly", CORE_PAID_JOURNEY_FILLED_INTAKE);
    const stored = readPaymentClarification(OWNER_A);
    expect(stored?.pendingAnswer).toBe("Invoice monthly");
    expect(stored?.appliedAnswers).toBe("");
    expect(stored?.applyStatus).not.toBe("applied");
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: stored?.appliedAnswers,
        pendingAnswer: stored?.pendingAnswer,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
  });

  it("marks applied only after the matching server revision persists", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    queuePaymentClarificationPending(OWNER_A, "Invoice monthly", CORE_PAID_JOURNEY_FILLED_INTAKE);
    markPaymentClarificationApplying(OWNER_A, "req-monthly");
    expect(readPaymentClarification(OWNER_A)?.applyStatus).toBe("applying");
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: readPaymentClarification(OWNER_A)?.appliedAnswers,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);

    markPaymentClarificationApplied(OWNER_A, "Invoice monthly", "rev-a2", "req-monthly");
    expect(readPaymentClarification(OWNER_A)).toBeNull();
    const applied = readPaymentClarification({ ...OWNER_A, revisionId: "rev-a2" });
    expect(applied?.applyStatus).toBe("applied");
    expect(applied?.appliedAnswers).toBe("Invoice monthly");
    expect(applied?.pendingAnswer).toBe("");
    expect(applied?.revisionId).toBe("rev-a2");
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: applied?.appliedAnswers,
        body: BODY,
      }),
    ).toEqual([UNCONFIRMED_PAYMENT_DUE_QUESTION]);
  });

  it("keeps pending recoverable after generation or persist failure without hiding the question", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    queuePaymentClarificationPending(
      OWNER_A,
      "Invoice once on October 1, 2026. Payment due net 60.",
      CORE_PAID_JOURNEY_FILLED_INTAKE,
    );
    markPaymentClarificationApplying(OWNER_A, "req-fail");
    markPaymentClarificationFailed(OWNER_A, "generation_failed", "req-fail");

    const failed = readPaymentClarification(OWNER_A);
    expect(failed?.applyStatus).toBe("failed");
    expect(failed?.pendingAnswer).toMatch(/October 1, 2026/);
    expect(failed?.appliedAnswers).toBe("");
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: failed?.appliedAnswers,
        pendingAnswer: failed?.pendingAnswer,
        authorizedBody: BODY,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
  });

  it("reconciles response loss from authorized server paper, not sessionStorage", () => {
    const lost = paymentClarificationQuestions({
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "",
      pendingAnswer: "",
      authorizedBody: AUTHORIZED_COMPLETE,
      body: AUTHORIZED_COMPLETE,
    });
    expect(lost).toEqual([]);
    expect(readPaymentClarification(OWNER_A)).toBeNull();
  });
});

describe("revision-aware records and handlers", () => {
  it("reading agreement A revision V2 does not return V1’s record or handler", async () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice monthly",
      applyStatus: "applied",
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    expect(readPaymentClarification(v2)).toBeNull();
    expect(readPaymentClarification(OWNER_A)?.appliedAnswers).toBe("Invoice monthly");

    const handled: string[] = [];
    registerPaymentClarificationApply(OWNER_A, async (answer) => {
      handled.push(`v1:${answer}`);
    });
    await expect(applyPaymentClarificationAnswer("Invoice weekly", v2)).rejects.toThrow(
      /payment_clarification_apply_unavailable/,
    );
    expect(handled).toEqual([]);
    expect(readPaymentClarification(v2)).toBeNull();
  });

  it("rebinds Apply to the live paper after a resume revision identity appears", async () => {
    const handled: string[] = [];
    registerPaymentClarificationApply(OWNER_A, async (answer) => {
      handled.push(answer);
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    setPaidProLiveRevisionView({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      agreementId: OWNER_A.agreementId,
      revisionId: "rev-a2",
    });
    await applyPaymentClarificationAnswer("Payment due net 60", v2);
    expect(handled).toEqual(["Payment due net 60"]);
  });

  it("rejects a stale revision request even when the agreement-level handler is reused", async () => {
    const handled: string[] = [];
    registerPaymentClarificationApply(OWNER_A, async (answer) => {
      handled.push(answer);
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    setPaidProLiveRevisionView({
      userId: OWNER_A.userId,
      organizationId: OWNER_A.organizationId,
      agreementId: OWNER_A.agreementId,
      revisionId: "rev-a2",
    });
    await applyPaymentClarificationAnswer("Payment due net 60", v2);
    await expect(applyPaymentClarificationAnswer("Invoice weekly", OWNER_A)).rejects.toThrow(
      /payment_clarification_stale_request/,
    );
    expect(handled).toEqual(["Payment due net 60"]);
  });

  it("does not rebind Apply onto a different agreement’s live paper", async () => {
    const handled: string[] = [];
    registerPaymentClarificationApply(OWNER_A, async (answer) => {
      handled.push(answer);
    });
    setPaidProLiveRevisionView({
      userId: OWNER_B.userId,
      organizationId: OWNER_B.organizationId,
      agreementId: OWNER_B.agreementId,
      revisionId: OWNER_B.revisionId,
    });
    await expect(applyPaymentClarificationAnswer("Payment due net 60", OWNER_B)).rejects.toThrow(
      /payment_clarification_apply_unavailable/,
    );
    expect(handled).toEqual([]);
  });

  it("does not silently carry confirmed status onto a newer revision", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice once on October 1, 2026. Payment due net 60.",
      applyStatus: "applied",
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: readPaymentClarification(v2)?.appliedAnswers,
        authorizedBody: BODY,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
    expect(readPaymentClarificationIntake(v2)).toBe(CORE_PAID_JOURNEY_FILLED_INTAKE);
    expect(readPaymentClarificationIntake(v2)).not.toMatch(/Invoice once on October 1/);
  });

  it("recovers prior answers after resume only when authorized paper already confirms them", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice monthly",
      applyStatus: "applied",
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    expect(readRecoveredPaymentClarificationAnswers(v2, AUTHORIZED_MONTHLY)).toBe("Invoice monthly");
    expect(readRecoveredPaymentClarificationAnswers(v2, BODY)).toBe("");
    expect(readRecoveredPaymentClarificationAnswers(v2, "")).toBe("");
  });

  it("does not recover prior weekly/net-30 answers onto current monthly/net-60 paper", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice weekly. Payment due net 30.",
      applyStatus: "applied",
    });
    const v2 = { ...OWNER_A, revisionId: "rev-a2" };
    const authorizedMonthlyNet60 = [
      "3. Fees and Payment",
      "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee monthly. Payment is due net 60.",
      "4. Term",
      "Twelve months.",
    ].join("\n");
    expect(readRecoveredPaymentClarificationAnswers(v2, authorizedMonthlyNet60)).toBe("");
  });
});

describe("stale payment-apply responses", () => {
  it("does not apply agreement A’s delayed result to B, another org, or a newer revision", () => {
    const captured = capturePaymentApplyTarget({
      ...OWNER_A,
      requestId: "req-a",
    });
    beginPaidProRevisionOperation(captured);
    expect(
      paymentApplyTargetMatches(captured, {
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        agreementId: OWNER_A.agreementId,
        revisionId: OWNER_A.revisionId,
      }),
    ).toBe(true);
    expect(paymentApplyTargetMatches(captured, { ...OWNER_B, requestId: "req-a" })).toBe(false);
    expect(paymentApplyTargetMatches(captured, { ...OTHER_ORG, requestId: "req-a" })).toBe(false);
    expect(
      paymentApplyTargetMatches(captured, {
        ...OWNER_A,
        revisionId: "rev-a2",
        requestId: "req-a",
      }),
    ).toBe(false);
    beginPaidProRevisionOperation({ ...OWNER_A, requestId: "req-a2" });
    expect(
      paymentApplyTargetMatches(captured, {
        userId: OWNER_A.userId,
        organizationId: OWNER_A.organizationId,
        agreementId: OWNER_A.agreementId,
        revisionId: OWNER_A.revisionId,
      }),
    ).toBe(false);
    expect(samePaymentApplyOwner(captured, OWNER_B)).toBe(false);
    expect(samePaymentApplyOwner(captured, OWNER_A)).toBe(true);
  });

  it("scopes apply handlers and ignores a stale A result after the user switches to B", async () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });
    persistPaymentClarification({
      ...OWNER_B,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
    });

    const wrote: string[] = [];
    let finishA: ((value: void) => void) | undefined;
    const aInFlight = new Promise<void>((resolve) => {
      finishA = resolve;
    });
    registerPaymentClarificationApply(OWNER_A, async (answer) => {
      queuePaymentClarificationPending(OWNER_A, answer, CORE_PAID_JOURNEY_FILLED_INTAKE);
      markPaymentClarificationApplying(OWNER_A, "req-a");
      await aInFlight;
      const captured = capturePaymentApplyTarget({ ...OWNER_A, requestId: "req-a" });
      if (!paymentApplyTargetMatches(captured, { ...OWNER_B, requestId: "req-a" })) {
        markPaymentClarificationFailed(OWNER_A, "stale_request", "req-a");
        return;
      }
      wrote.push(OWNER_A.agreementId);
      markPaymentClarificationApplied(OWNER_A, answer, "rev-stolen", "req-a");
    });
    registerPaymentClarificationApply(OWNER_B, async () => {
      wrote.push(OWNER_B.agreementId);
    });

    const applying = applyPaymentClarificationAnswer("Invoice monthly", OWNER_A);
    await applyPaymentClarificationAnswer("Invoice weekly", OWNER_B);
    finishA?.();
    await applying;

    expect(wrote).toEqual(["agr-b"]);
    expect(readPaymentClarification(OWNER_A)?.applyStatus).toBe("failed");
    expect(readPaymentClarification(OWNER_A)?.pendingAnswer).toBe("Invoice monthly");
    expect(readPaymentClarification(OWNER_A)?.appliedAnswers).toBe("");
    expect(readPaymentClarification(OWNER_B)?.appliedAnswers).toBe("");
    expect(readPaymentClarification(OWNER_B)?.pendingAnswer).toBe("");
  });
});

describe("fresh-context authorized reopen", () => {
  it("restores confirmed questions from authorized server paper without sessionStorage", () => {
    persistPaymentClarification({
      ...OWNER_A,
      intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      appliedAnswers: "Invoice once on October 1, 2026. Payment due net 60.",
    });
    expect(readPaymentClarification(OWNER_A)?.appliedAnswers).toMatch(/net 60/);

    clearPaymentClarificationForTests();
    expect(readPaymentClarification(OWNER_A)).toBeNull();
    expect(sessionStorage.getItem("claw_payment_clarification_v1")).toBeNull();

    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: "",
        authorizedBody: AUTHORIZED_COMPLETE,
        body: AUTHORIZED_COMPLETE,
      }),
    ).toEqual([]);
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: "",
        authorizedBody: AUTHORIZED_MONTHLY,
        body: AUTHORIZED_MONTHLY,
      }),
    ).toEqual([UNCONFIRMED_PAYMENT_DUE_QUESTION]);
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: "",
        authorizedBody: BODY,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
  });

  it("does not treat a wrapped invoice year as a new section heading", () => {
    const wrapped = [
      "3. Fees and Payment",
      "Client will pay Consultant a fixed fee of $48,000. Consultant will invoice the fixed fee once on October 1,",
      "",
      "2026. Payment is due net 60.",
      "4. Term",
      "Twelve months starting October 1, 2026.",
    ].join("\n");
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: "",
        authorizedBody: wrapped,
        body: wrapped,
      }),
    ).toEqual([]);
  });

  it("authorized monthly paper still asks the remaining due question without session intake", () => {
    expect(
      paymentClarificationQuestions({
        intake: AUTHORIZED_MONTHLY,
        appliedAnswers: "",
        authorizedBody: AUTHORIZED_MONTHLY,
        body: AUTHORIZED_MONTHLY,
      }),
    ).toEqual([UNCONFIRMED_PAYMENT_DUE_QUESTION]);
  });

  it("does not treat Term dates as payment-section confirmation", () => {
    expect(
      paymentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        appliedAnswers: "",
        authorizedBody: BODY,
        body: BODY,
      }),
    ).toContain(UNCONFIRMED_PAYMENT_TIMING_QUESTION);
  });
});

describe("resolvePaymentClarificationScope", () => {
  it("fails closed without authenticated user, org, and agreement or draft identity", () => {
    expect(resolvePaymentClarificationScope({ agreementId: "agr-a" })).toBeNull();
    setOrgId("org-a");
    expect(resolvePaymentClarificationScope({ agreementId: "agr-a" })).toBeNull();
  });
});
