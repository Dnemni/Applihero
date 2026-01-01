'use client';

import React from 'react';
import { format, subDays, startOfDay } from 'date-fns';

interface ActivityHeatmap {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: ActivityHeatmap[];
}

function getIntensityColor(count: number, maxCount: number): string {
  if (count === 0) return 'bg-gray-100';
  if (maxCount === 0) return 'bg-gray-100';
  
  const intensity = count / maxCount;
  if (intensity < 0.25) return 'bg-indigo-200';
  if (intensity < 0.5) return 'bg-indigo-400';
  if (intensity < 0.75) return 'bg-indigo-600';
  return 'bg-indigo-800';
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Heatmap</h3>
        <div className="flex items-center justify-center h-32 text-gray-500">
          <p>No activity data available</p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Group by week for better visualization
  const weeks: { [key: string]: ActivityHeatmap[] } = {};
  data.forEach((item) => {
    const date = new Date(item.date);
    const weekStart = format(startOfDay(date), 'yyyy-MM-dd');
    if (!weeks[weekStart]) {
      weeks[weekStart] = [];
    }
    weeks[weekStart].push(item);
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Heatmap (Last 30 Days)</h3>
      <div className="flex flex-wrap gap-2">
        {data.map((item, index) => {
          const date = new Date(item.date);
          const isToday = format(new Date(), 'yyyy-MM-dd') === item.date;
          const dayOfWeek = format(date, 'EEE').toUpperCase();
          const dayOfMonth = format(date, 'd');
          
          return (
            <div
              key={index}
              className={`w-12 h-12 rounded-lg ${getIntensityColor(item.count, maxCount)} ${
                isToday ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
              } cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all group relative flex flex-col items-center justify-center`}
              title={`${format(date, 'MMM d, yyyy')}: ${item.count} activity${item.count !== 1 ? 'ies' : 'y'}`}
            >
              <span className="text-[10px] font-medium text-gray-600 mb-0.5">{dayOfWeek}</span>
              <span className="text-xs font-bold text-gray-900">{dayOfMonth}</span>
              {item.count > 0 && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                  {format(date, 'MMM d')}: {item.count}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded bg-gray-100"></div>
          <div className="w-3 h-3 rounded bg-indigo-200"></div>
          <div className="w-3 h-3 rounded bg-indigo-400"></div>
          <div className="w-3 h-3 rounded bg-indigo-600"></div>
          <div className="w-3 h-3 rounded bg-indigo-800"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

