'use client';

import React from 'react';
import { Building2 } from 'lucide-react';

interface CompanyBreakdown {
  company: string;
  total: number;
  statuses: {
    draft: number;
    inProgress: number;
    submitted: number;
    archived: number;
  };
}

interface CompanyBreakdownProps {
  data: CompanyBreakdown[];
}

export function CompanyBreakdown({ data }: CompanyBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Breakdown</h3>
        <div className="flex items-center justify-center h-32 text-gray-500">
          <p>No companies yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Breakdown</h3>
      <div
        className="space-y-3"
        style={{ maxHeight: '702px', overflowY: 'auto' }}
      >
        {data.slice(0, 10).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.company}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.statuses.submitted > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {item.statuses.submitted} Submitted
                    </span>
                  )}
                  {item.statuses.inProgress > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {item.statuses.inProgress} In Progress
                    </span>
                  )}
                  {item.statuses.draft > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {item.statuses.draft} Draft
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 ml-4">
              <span className="text-lg font-bold text-gray-900">{item.total}</span>
              <span className="text-xs text-gray-500 ml-1">
                {item.total === 1 ? 'application' : 'applications'}
              </span>
            </div>
          </div>
        ))}
        {data.length > 10 && (
          <p className="text-xs text-gray-500 text-center pt-2">
            Showing top 10 of {data.length} companies
          </p>
        )}
      </div>
    </div>
  );
}

