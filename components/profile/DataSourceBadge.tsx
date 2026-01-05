/**
 * DataSourceBadge
 * 
 * Displays a small badge indicating where data came from (resume, transcript, LinkedIn, manual)
 * with optional confidence score tooltip
 */

import React from 'react';
import type { DataSource } from '@/lib/supabase/types';

interface DataSourceBadgeProps {
  source: DataSource;
  confidence?: number | null;
  showConfidence?: boolean;
}

const sourceConfig: Record<DataSource, { label: string; color: string; emoji: string }> = {
  resume: { label: 'Resume', color: 'bg-blue-100 text-blue-700', emoji: '📄' },
  transcript: { label: 'Transcript', color: 'bg-green-100 text-green-700', emoji: '📜' },
  linkedin: { label: 'LinkedIn', color: 'bg-purple-100 text-purple-700', emoji: '💼' },
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-700', emoji: '✏️' },
};

export function DataSourceBadge({ source, confidence, showConfidence = false }: DataSourceBadgeProps) {
  const config = sourceConfig[source];
  
  const confidenceText = confidence !== null && confidence !== undefined 
    ? `Confidence: ${(confidence * 100).toFixed(0)}%`
    : null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
      title={showConfidence && confidenceText ? confidenceText : config.label}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
      {showConfidence && confidenceText && confidence && confidence < 0.9 && (
        <span className="opacity-70 text-xs">({(confidence * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}
