import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { Header as DirectionalHoverHeader } from "#/components/directional-hover-header/header.tsx";
import { Frame } from "#/components/ui/frame.tsx";
import backgroundImage from "./assets/Landing Page Hero Background.png";

import {
  defaultAnswers,
  runIntakeStepTransition,
  type IntakeAnswers,
  type WizardStep,
} from "./-intake-contracts.ts";
import { BuildPathLandingSections, CapitalFeatureSection } from "./-intake-landing-capital.tsx";
import { BuildPathTestimonials } from "./-intake-landing-proof.tsx";
import {
  BuildPathHeroStart,
  BuildPathPropertyStep,
  BuildPathSuccessStep,
  BuildPathWizardStep,
} from "./-intake-wizard-steps.tsx";
import { buildProjectSummary } from "./-intake-wizard-fields.tsx";
import "./-buildpath.css";

export const Route = createFileRoute("/intake/")({
  component: IntakeLandingPage,
});

function IntakeLandingPage(): ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [answers, setAnswers] = useState<IntakeAnswers>(defaultAnswers);
  const isFormStep = step > 1;
  const isSuccessStep = step === 8;

  useEffect(() => {
    window.localStorage.setItem(
      "build-financing-intake",
      JSON.stringify(answers)
    );
  }, [answers]);

  useEffect(() => {
    if (step) {
      window.scrollTo({ behavior: "auto", top: 0 });
    }
  }, [step]);

  const summaryItems = useMemo(() => buildProjectSummary(answers), [answers]);

  const updateAnswer = <Key extends keyof IntakeAnswers>(
    key: Key,
    value: IntakeAnswers[Key]
  ): void => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const goBack = (): void => {
    runIntakeStepTransition(() => {
      setStep((current) => {
        if (current <= 2) {
          return 1;
        }
        return (current - 1) as WizardStep;
      });
    });
  };

  const goForward = (): void => {
    runIntakeStepTransition(() => {
      setStep((current) => Math.min(current + 1, 8) as WizardStep);
    });
  };

  return (
    <>
      <DirectionalHoverHeader />
      <main className="bp-page bp-page--with-public-header">
        <Frame className="bp-shell">
          <section
            aria-labelledby={isFormStep ? "bp-form-title" : "bp-hero-title"}
            className={
              isFormStep
                ? isSuccessStep
                  ? `bp-canvas bp-canvas-form bp-canvas-success bp-intake-step-${step}`
                  : `bp-canvas bp-canvas-form bp-intake-step-${step}`
                : "bp-canvas"
            }
          >
            <img
              alt=""
              aria-hidden="true"
              className="bp-background"
              decoding="async"
              draggable={false}
              fetchPriority="high"
              height={936}
              loading="eager"
              src={backgroundImage}
              width={1681}
            />

            {isSuccessStep ? (
              <BuildPathSuccessStep
                answers={answers}
                onAddAnother={() => {
                  runIntakeStepTransition(() => {
                    setAnswers(defaultAnswers);
                    setStep(1);
                  });
                }}
                onBack={() => {
                  runIntakeStepTransition(() => setStep(7));
                }}
                summaryItems={summaryItems}
              />
            ) : isFormStep ? (
              step === 2 ? (
                <BuildPathPropertyStep
                  answers={answers}
                  onBack={goBack}
                  onContinue={() => {
                    if (answers.buildPermitFileName) {
                      runIntakeStepTransition(() => setStep(7));
                      return;
                    }
                    goForward();
                  }}
                  updateAnswer={updateAnswer}
                />
              ) : (
                <BuildPathWizardStep
                  answers={answers}
                  onBack={goBack}
                  onContinue={
                    step === 7
                      ? () => {
                          runIntakeStepTransition(() => setStep(8));
                        }
                      : goForward
                  }
                  step={step}
                  summaryItems={summaryItems}
                  updateAnswer={updateAnswer}
                />
              )
            ) : (
              <BuildPathHeroStart
                onStart={() => {
                  runIntakeStepTransition(() => setStep(2));
                }}
              />
            )}
          </section>
          {!isFormStep && (
            <>
              <BuildPathTestimonials />
              <CapitalFeatureSection />
              <BuildPathLandingSections
                onStart={() => {
                  runIntakeStepTransition(() => setStep(2));
                }}
              />
            </>
          )}
        </Frame>
      </main>
    </>
  );
}
