/**
 * Onboarding state management
 * Tracks progress across multiple pages during the tutorial flow
 * Now uses Supabase database instead of localStorage for persistence
 */

import { supabase } from "./supabase/client";

export type OnboardingPhase = "profile" | "dashboard" | "job-creation" | "job-detail" | "completed";

export type OnboardingState = {
  phase: OnboardingPhase;
  step: number;
  completedPhases: OnboardingPhase[];
  jobId?: string; // Track the tutorial job ID
};

// In-memory cache to avoid excessive database calls
let cachedState: OnboardingState | null = null;

export async function getOnboardingState(): Promise<OnboardingState | null> {
  if (typeof window === "undefined") return null;
  
  // Return cached state if available
  if (cachedState !== null) return cachedState;
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    // Fetch profile with onboarding fields
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("onboarding_phase, onboarding_step, onboarding_completed_phases, onboarding_job_id")
      .eq("id", user.id)
      .single();
    
    if (error || !profile) return null;
    
    const state: OnboardingState = {
      phase: profile.onboarding_phase as OnboardingPhase,
      step: profile.onboarding_step || 0,
      completedPhases: profile.onboarding_completed_phases || [],
      jobId: profile.onboarding_job_id || undefined,
    };
    
    cachedState = state;
    return state;
  } catch (error) {
    console.error("Error fetching onboarding state:", error);
    return null;
  }
}

export async function setOnboardingState(state: OnboardingState): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Update profile with onboarding state
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_phase: state.phase,
        onboarding_step: state.step,
        onboarding_completed_phases: state.completedPhases,
        onboarding_job_id: state.jobId || null,
      })
      .eq("id", user.id);
    
    if (error) {
      console.error("Error saving onboarding state:", error);
    } else {
      // Update cache
      cachedState = state;
    }
  } catch (error) {
    console.error("Error setting onboarding state:", error);
  }
}

export async function clearOnboardingState(): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Reset onboarding fields
    const { error } = await supabase
      .from("profiles")
      .update({
        onboarding_phase: "completed",
        onboarding_step: 0,
        onboarding_completed_phases: ["profile", "dashboard", "job-creation", "job-detail", "completed"],
        onboarding_job_id: null,
      })
      .eq("id", user.id);
    
    if (error) {
      console.error("Error clearing onboarding state:", error);
    }
    
    // Clear cache
    cachedState = null;
  } catch (error) {
    console.error("Error clearing onboarding state:", error);
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
