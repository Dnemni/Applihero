"use client";

import { useEffect, useState, useRef } from "react";

export type OnboardingStep = {
  title: string;
  description: string;
  targetId?: string; // Element ID to highlight
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: {
    label: string;
    onClick: () => void;
  };
  skipText?: string;
};

type OnboardingOverlayProps = {
  steps: OnboardingStep[];
  currentStep: number;
  onNext: () => void;
  onPrevious?: () => void;
  onSkip: () => void;
  onComplete: () => void;
  showProgress?: boolean;
};

export function OnboardingOverlay({
  steps,
  currentStep,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  showProgress = true,
}: OnboardingOverlayProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    if (step?.targetId) {
      const target = document.getElementById(step.targetId);
      if (target) {
        // Scroll element into view
        target.scrollIntoView({ behavior: "smooth", block: "center" });

        // Get element position after scroll completes
        setTimeout(() => {
          const rect = target.getBoundingClientRect();
          setTargetRect(rect);
          calculateTooltipPosition(rect, step.position || "right");
        }, 500);
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
      // Center tooltip if no target
      setTooltipPosition({
        top: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 200,
      });
    }
  }, [step, currentStep]);

  const calculateTooltipPosition = (rect: DOMRect, position: string) => {
    const padding = 20;
    const tooltipWidth = 400;
    const tooltipHeight = 200;
    const spotlightPadding = 8; // The padding around highlighted element

    let top = 0;
    let left = 0;

    switch (position) {
      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding;
        break;
      case "top":
        top = rect.top - tooltipHeight - padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "bottom":
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "center":
        top = window.innerHeight / 2 - tooltipHeight / 2;
        left = window.innerWidth / 2 - tooltipWidth / 2;
        break;
    }

    // Ensure tooltip stays within viewport
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

    // Calculate available space on all sides
    const spaceRight = window.innerWidth - rect.right - padding;
    const spaceLeft = rect.left - padding;
    const spaceTop = rect.top - padding;
    const spaceBottom = window.innerHeight - rect.bottom - padding;

    // Check if the element is large (if center positioning would cause overlap)
    const isLargeElement = rect.width > 400 || rect.height > 300;
    
    // Always use intelligent positioning for all positions except center (unless element is large)
    if (position !== "center" || isLargeElement) {
      // Strict priority order: left, right, top (up), bottom (down)
      // Only move to next option if current one would be off-screen
      let positioned = false;
      
      // Try LEFT first
      if (spaceLeft >= tooltipWidth + padding + 20) {
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding - 20;
        positioned = true;
      }
      // Try RIGHT second
      else if (spaceRight >= tooltipWidth + padding + 20) {
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding + 20;
        positioned = true;
      }
      // Try TOP (up) third - add extra padding to avoid overlap
      else if (spaceTop >= tooltipHeight + padding + 50) {
        top = rect.top - tooltipHeight - padding - 50;
        left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        positioned = true;
      }
      // Try BOTTOM (down) last
      else if (spaceBottom >= tooltipHeight + padding + 30) {
        top = rect.bottom + padding + 30;
        left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        positioned = true;
      }

      // If no side fits perfectly, follow priority order and clamp to viewport
      if (!positioned) {
        // For elements at the bottom of the page, prioritize going above them
        const isBottomElement = rect.bottom > window.innerHeight - 300;
        
        if (isBottomElement) {
          // Force top position for bottom elements - place well above to avoid any overlap
          // Position tooltip significantly above the element with large margin
          const idealTop = rect.top - tooltipHeight - 100;
          // Absolute maximum position to ensure full visibility with large safety margin
          const maxTop = window.innerHeight - tooltipHeight - 60;
          top = Math.max(padding, Math.min(idealTop, maxTop));
          left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        }
        // Try left first (even if doesn't fully fit)
        else if (spaceLeft > spaceRight && spaceLeft > 100) {
          top = Math.max(padding, Math.min(rect.top + rect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding));
          left = Math.max(padding, rect.left - tooltipWidth - padding - 20);
        }
        // Try right second
        else if (spaceRight > 100) {
          top = Math.max(padding, Math.min(rect.top + rect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding));
          left = Math.min(rect.right + padding + 20, window.innerWidth - tooltipWidth - padding);
        }
        // Try top (up) third - with extra padding to avoid overlap
        else if (spaceTop > spaceBottom || spaceTop >= 100) {
          const idealTop = rect.top - tooltipHeight - 80;
          const maxTop = window.innerHeight - tooltipHeight - 60;
          top = Math.max(padding, Math.min(idealTop, maxTop));
          left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        }
        // Try bottom (down) last
        else {
          top = Math.min(rect.bottom + padding + 30, window.innerHeight - tooltipHeight - padding);
          left = Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        }
      }
    }

    // Final strict viewport clamping to ensure tooltip is ABSOLUTELY fully visible with safety margin
    const finalMaxTop = window.innerHeight - tooltipHeight - 60;
    top = Math.max(padding, Math.min(top, finalMaxTop));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

    // After positioning, check if tooltip overlaps with the highlighted element
    const tooltipRect = {
      top,
      left,
      right: left + tooltipWidth,
      bottom: top + tooltipHeight
    };
    
    const highlightRect = {
      top: rect.top - spotlightPadding,
      left: rect.left - spotlightPadding,
      right: rect.right + spotlightPadding,
      bottom: rect.bottom + spotlightPadding
    };

    const overlaps = !(
      tooltipRect.right < highlightRect.left ||
      tooltipRect.left > highlightRect.right ||
      tooltipRect.bottom < highlightRect.top ||
      tooltipRect.top > highlightRect.bottom
    );

    // If still overlapping, move it away from the highlighted area
    if (overlaps && position !== "center") {
      if (position === "right" || position === "left") {
        // Already tried left/right, now force top or bottom
        const topPos = rect.top - tooltipHeight - padding - 30;
        const bottomPos = rect.bottom + padding + 30;
        
        // Choose the side with more space
        if (topPos > padding && (topPos > window.innerHeight - bottomPos - tooltipHeight)) {
          top = topPos;
        } else if (bottomPos + tooltipHeight < window.innerHeight - padding) {
          top = bottomPos;
        } else {
          // If neither works well, put it at top of viewport
          top = padding;
        }
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
      } else if (position === "top") {
        top = rect.bottom + padding + 30;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
      } else if (position === "bottom") {
        top = rect.top - tooltipHeight - padding - 30;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
      }
      
      // Final clamp
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    }

    setTooltipPosition({ top, left });
  };

  const handleAction = () => {
    if (step.action) {
      step.action.onClick();
    }
    if (!isLastStep) {
      onNext();
    } else {
      onComplete();
    }
  };

  // Prevent scrolling during onboarding
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dark overlay with spotlight cutout - visual only */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 8}
                y={targetRect.top - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Four blocking divs that surround the spotlight area */}
      {targetRect ? (
        <>
          {/* Top blocking area */}
          <div 
            className="absolute left-0 right-0 pointer-events-auto"
            style={{ 
              top: 0,
              height: targetRect.top - 8,
              cursor: 'not-allowed'
            }}
          />
          {/* Bottom blocking area */}
          <div 
            className="absolute left-0 right-0 pointer-events-auto"
            style={{ 
              top: targetRect.top + targetRect.height + 8,
              bottom: 0,
              cursor: 'not-allowed'
            }}
          />
          {/* Left blocking area */}
          <div 
            className="absolute pointer-events-auto"
            style={{ 
              left: 0,
              width: targetRect.left - 8,
              top: targetRect.top - 8,
              height: targetRect.height + 16,
              cursor: 'not-allowed'
            }}
          />
          {/* Right blocking area */}
          <div 
            className="absolute pointer-events-auto"
            style={{ 
              left: targetRect.left + targetRect.width + 8,
              right: 0,
              top: targetRect.top - 8,
              height: targetRect.height + 16,
              cursor: 'not-allowed'
            }}
          />
        </>
      ) : (
        /* Full screen blocking when no target */
        <div className="absolute inset-0 pointer-events-auto" style={{ cursor: 'not-allowed' }} />
      )}

      {/* Highlighted element border with pulse animation */}
      {targetRect && (
        <div
          className="absolute border-4 border-indigo-500 rounded-xl shadow-2xl animate-pulse pointer-events-none"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            transition: "all 0.3s ease-in-out",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-2xl shadow-2xl p-6 w-[400px] pointer-events-auto transform transition-all duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Progress indicator */}
        {showProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {!isFirstStep && onPrevious && (
              <button
                onClick={onPrevious}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {step.skipText || "Skip tutorial"}
            </button>
            <button
              onClick={handleAction}
              className="px-6 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 shadow-md transition-all"
            >
              {step.action?.label || (isLastStep ? "Finish" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
