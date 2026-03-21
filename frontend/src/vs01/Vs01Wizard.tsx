import { useCallback, useState } from "react";
import "./vs01.css";
import { StepDone } from "./StepDone";
import { StepFinalize } from "./StepFinalize";
import { StepSign } from "./StepSign";
import type { Vs01LoadingState, Vs01Step } from "./types";

const STEPS: { id: Vs01Step; label: string }[] = [
  { id: 0, label: "Finalize" },
  { id: 1, label: "Sign" },
  { id: 2, label: "Done" },
];

export type Vs01WizardProps = {
  /** Reserved for future controlled mode; shell ignores if unset. */
  initialStep?: Vs01Step;
};

/**
 * Single-page 3-step wizard: owns step index + loading axis (idle until API wiring).
 * Presentational steps; no fetch here.
 * Future: global error from API — render `.vs01-error-banner` above the stepper.
 */
export function Vs01Wizard({ initialStep = 0 }: Vs01WizardProps) {
  const [step, setStep] = useState<Vs01Step>(initialStep);
  const [loading] = useState<Vs01LoadingState>("idle");

  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
  }, []);

  return (
    <>
      <nav className="vs01-stepper" aria-label="VS01 steps">
        {STEPS.map(({ id, label }) => {
          const active = id === step;
          const future = id > step;
          return (
            <button
              key={id}
              type="button"
              className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
              disabled={future}
              aria-current={active ? "step" : undefined}
              onClick={() => {
                if (!future) goToStep(id);
              }}
            >
              <span className="vs01-stepper-num">{id + 1}</span>
              <span className="vs01-stepper-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="vs01-card" data-vs01-active-step={step}>
        {step === 0 ? (
          <StepFinalize loading={loading} onContinue={() => goToStep(1)} />
        ) : null}
        {step === 1 ? (
          <StepSign
            loading={loading}
            onBack={() => goToStep(0)}
            onContinue={() => goToStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <StepDone loading={loading} onStartOver={() => goToStep(0)} />
        ) : null}
      </div>
    </>
  );
}
