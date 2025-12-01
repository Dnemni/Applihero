/**
 * Onboarding state management
 * Tracks progress across multiple pages during the tutorial flow
 */

export type OnboardingPhase = "profile" | "dashboard" | "job-creation" | "job-detail" | "completed";

export type OnboardingState = {
  phase: OnboardingPhase;
  step: number;
  completedPhases: OnboardingPhase[];
  jobId?: string; // Track the tutorial job ID
};

const STORAGE_KEY = "applihero_onboarding_state";

export function getOnboardingState(): OnboardingState | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setOnboardingState(state: OnboardingState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearOnboardingState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function initializeOnboarding(): OnboardingState {
  const state: OnboardingState = {
    phase: "profile",
    step: 0,
    completedPhases: [],
  };
  setOnboardingState(state);
  return state;
}

export function advanceOnboarding(
  currentPhase: OnboardingPhase,
  nextPhase?: OnboardingPhase
): OnboardingState {
  const current = getOnboardingState();
  if (!current) return initializeOnboarding();

  const completedPhases = [...current.completedPhases];
  if (!completedPhases.includes(currentPhase)) {
    completedPhases.push(currentPhase);
  }

  const state: OnboardingState = {
    ...current,
    phase: nextPhase || currentPhase,
    step: nextPhase ? 0 : current.step + 1,
    completedPhases,
  };
  
  setOnboardingState(state);
  return state;
}

export function isOnboardingActive(): boolean {
  const state = getOnboardingState();
  return state !== null && state.phase !== "completed";
}

export function shouldShowOnboarding(phase: OnboardingPhase): boolean {
  const state = getOnboardingState();
  return state !== null && state.phase === phase;
}
