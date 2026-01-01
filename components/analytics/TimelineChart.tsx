'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface TimelineData {
  period: string;
  created: number;
  submitted: number;
  inProgress: number;
  draft: number;
}

interface TimelineChartProps {
  data: TimelineData[];
}

export function TimelineChart({ data }: TimelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Timeline</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <p>No data available</p>
        </div>
      </div>
    );
  }

  // Format period for display (e.g., "2024-01" -> "Jan 2024")
  const chartData = data.map((item) => {
    const [year, month] = item.period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return {
      period: format(date, 'MMM yyyy'),
      Created: item.created,
      'In Progress': item.inProgress,
      Submitted: item.submitted,
      Draft: item.draft,
    };
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Timeline</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="period"
            stroke="#6B7280"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Bar dataKey="Created" fill="#6366F1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Draft" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
          <Bar dataKey="In Progress" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Submitted" fill="#10B981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

