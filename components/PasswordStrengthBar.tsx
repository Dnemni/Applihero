import React from "react";

export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  valid: boolean;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (password.length >= minLength) score++;
  else reasons.push("At least 8 characters");
  if (hasUpper) score++;
  else reasons.push("At least one uppercase letter");
  if (hasNumber) score++;
  else reasons.push("At least one number");
  if (hasSpecial) score++;
  else reasons.push("At least one special character");

  let label = "Too weak";
  let color = "bg-red-500";
  let valid = false;
  if (score === 4) {
    label = "Strong password";
    color = "bg-green-500";
    valid = true;
  } else if (score === 3) {
    label = "Almost there";
    color = "bg-yellow-400";
  } else if (score === 2) {
    label = "Weak";
    color = "bg-yellow-400";
  }
  return { score, label, color, valid, reasons };
}

export const PasswordStrengthBar: React.FC<{ password: string }> = ({ password }) => {
  const { score, label, color } = getPasswordStrength(password);
  const percent = (score / 4) * 100;
  return (
    <div className="mt-2">
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs mt-1 font-medium" style={{ color: color.replace('bg-', '') }}>{label}</div>
    </div>
  );
};
