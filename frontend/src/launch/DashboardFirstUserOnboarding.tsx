type Props = {
  onCreateAgreement: () => void;
  agreementCount?: number;
};

const STEPS = [
  { title: "Describe the deal", detail: "Capture parties, terms, and jurisdiction in guided intake." },
  { title: "Review together", detail: "Send for review so each party can approve or request changes." },
  { title: "Sign when everyone agrees", detail: "Prepare signature links and collect e-signatures." },
];

export function DashboardFirstUserOnboarding(props: Props) {
  const { onCreateAgreement, agreementCount = 0 } = props;
  const isFirstTime = agreementCount === 0;

  return (
    <div
      className="rounded-2xl border border-slate-800/70 bg-slate-950/30 px-6 py-8 sm:px-8"
      data-testid={isFirstTime ? "dashboard-first-user-onboarding" : "dashboard-light-onboarding"}
    >
      <h2 className="text-xl font-semibold text-white">
        {isFirstTime ? "Create your first agreement" : "Keep your next deal moving"}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
        {isFirstTime
          ? "LawDog guides you from draft to review to signature — one agreement at a time."
          : "Your dashboard highlights what needs attention and what to do next."}
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-4 py-3"
            data-testid={`dashboard-onboarding-step-${index + 1}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Step {index + 1}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.detail}</p>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary mt-6"
        data-testid={isFirstTime ? "dashboard-create-first-agreement" : "dashboard-create-new-agreement-onboarding"}
        onClick={onCreateAgreement}
      >
        {isFirstTime ? "Create first agreement" : "Create new agreement"}
      </button>
    </div>
  );
}
