/**
 * Onboarding state management
 * Tracks progress across multiple pages during the tutorial flow
 * Now uses Supabase database instead of localStorage for persistence
 */

import { discoveryFetch } from "./discovery/client";

export type OnboardingPhase = "profile" | "dashboard" | "discover" | "discover-detail" | "job-creation" | "job-detail" | "resume-optimizer" | "completed";

export type OnboardingState = {
  phase: OnboardingPhase;
  step: number;
  completedPhases: OnboardingPhase[];
  jobId?: string; // Track the tutorial job ID
};

export async function getOnboardingState(): Promise<OnboardingState | null> {
  if (typeof window === "undefined") return null;
  
  try {
    const response = await discoveryFetch("/api/onboarding");
    if (!response.ok) return null;
    const payload = await response.json();
    const state = payload.state as OnboardingState;
    
    return state;
  } catch (error) {
    console.error("Error fetching onboarding state:", error);
    return null;
  }
}

export async function setOnboardingState(state: OnboardingState): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const response = await discoveryFetch("/api/onboarding", { method: "PATCH", body: JSON.stringify(state) });
    if (!response.ok) throw new Error((await response.json()).error || "Unable to save onboarding state");
  } catch (error) {
    console.error("Error setting onboarding state:", error);
  }
}

export async function clearOnboardingState(): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    await discoveryFetch("/api/onboarding", { method: "PATCH", body: JSON.stringify({
      phase: "completed",
      step: 0,
      completedPhases: ["profile", "dashboard", "discover", "discover-detail", "job-creation", "job-detail", "resume-optimizer", "completed"],
    }) });
    
  } catch (error) {
    console.error("Error clearing onboarding state:", error);
  }
}

export function onboardingDestination(phase: OnboardingPhase) {
  switch (phase) {
    case "profile": return "/profile";
    case "dashboard": return "/dashboard";
    case "discover": return "/discover";
    case "discover-detail": return "/discover";
    case "job-creation": return "/dashboard/new";
    case "job-detail": return "/dashboard";
    case "resume-optimizer": return "/resume-optimizer";
    default: return "/dashboard";
  }
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

export async function advanceOnboarding(
  currentPhase: OnboardingPhase,
  nextPhase?: OnboardingPhase
): Promise<OnboardingState> {
  const current = await getOnboardingState();
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
  
  await setOnboardingState(state);
  return state;
}

export async function isOnboardingActive(): Promise<boolean> {
  const state = await getOnboardingState();
  return state !== null && state.phase !== "completed";
}

export async function shouldShowOnboarding(phase: OnboardingPhase): Promise<boolean> {
  const state = await getOnboardingState();
  return state !== null && state.phase === phase;
}
