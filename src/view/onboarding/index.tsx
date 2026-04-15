import { useState, useEffect } from 'react';
import { IntroStep } from './IntroStep';
import { PermissionsStep } from './PermissionsStep';
import { ApiSetupStep } from './steps/ApiSetupStep';

export type OnboardingStage = 'permissions' | 'api-setup' | 'intro';

interface Props {
  stage: OnboardingStage;
  onComplete: () => void;
}

/**
 * Onboarding module orchestrator.
 *
 * Renders the correct step based on the persisted onboarding stage emitted
 * by the backend at startup. The stage advances on the backend:
 *
 *   permissions -> (quit+reopen) -> api-setup -> complete (normal app)
 *
 * When stage is "complete" the backend never emits the onboarding event,
 * so this component is never rendered.
 */
export function OnboardingView({ stage, onComplete }: Props) {
  const [currentStage, setCurrentStage] = useState(stage);

  useEffect(() => {
    setCurrentStage(stage);
  }, [stage]);

  if (currentStage === 'intro') {
    return <IntroStep onComplete={onComplete} />;
  }

  if (currentStage === 'api-setup') {
    return <ApiSetupStep onBack={() => setCurrentStage('permissions')} />;
  }

  return <PermissionsStep onNext={() => setCurrentStage('api-setup')} />;
}
