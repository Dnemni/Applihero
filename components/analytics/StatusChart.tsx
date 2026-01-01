'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

interface StatusChartProps {
  data: StatusBreakdown[];
}

const COLORS: Record<string, string> = {
  Draft: '#9CA3AF', // gray
  'In Progress': '#3B82F6', // blue
  Submitted: '#10B981', // green
  Archived: '#D1D5DB', // light gray
};

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  'In Progress': 'In Progress',
  Submitted: 'Submitted',
  Archived: 'Archived',
};

export function StatusChart({ data }: StatusChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <p>No data available</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: STATUS_LABELS[item.status] || item.status,
    value: item.count,
    percentage: item.percentage.toFixed(1),
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percentage }) => `${name}: ${percentage}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => {
              const status = data[index]?.status || '';
              return (
                <Cell key={`cell-${index}`} fill={COLORS[status] || '#9CA3AF'} />
              );
            })}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string, props: any) => [
              `${value} (${props.payload.percentage}%)`,
              name,
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

