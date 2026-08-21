export function nextBotWizardStep(currentStep: number) {
  return Math.min(currentStep + 1, 3);
}
