/**
 * EducationSection
 * 
 * Displays user's educational background
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ProfileDataService } from '@/lib/supabase/services';
import { DataSourceBadge } from './DataSourceBadge';
import type { ProfileEducation } from '@/lib/supabase/types';
import { GraduationCap, Calendar, Award, Plus, X } from 'lucide-react';
import { ProfileModal } from './ProfileModal';
import { Edit2 } from 'lucide-react';

function AddEducationForm({ userId, onCancel, onSuccess }: { userId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    institution: '',
    degree: '',
    field_of_study: '',
    start_date: '',
    end_date: '',
    gpa: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.institution.trim() || !formData.degree.trim()) return;

    setSubmitting(true);
    
    // Convert YYYY-MM to YYYY-MM-01 for database
    const startDate = formData.start_date && /^\d{4}-\d{2}$/.test(formData.start_date) 
      ? `${formData.start_date}-01` 
      : formData.start_date;
    const endDate = formData.end_date && /^\d{4}-\d{2}$/.test(formData.end_date) 
      ? `${formData.end_date}-01` 
      : formData.end_date;
    
    const result = await ProfileDataService.addEducation({
      user_id: userId,
      institution_name: formData.institution,
      degree: formData.degree,
      field_of_study: formData.field_of_study,
      start_date: startDate,
      end_date: endDate,
      gpa: formData.gpa ? parseFloat(formData.gpa) : undefined,
      description: formData.description,
      source: 'manual',
    });

    setSubmitting(false);
    if (result) {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Institution *</label>
        <input
          type="text"
          value={formData.institution}
          onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
          placeholder="Stanford University"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Degree *</label>
        <input
          type="text"
          value={formData.degree}
          onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
          placeholder="Bachelor of Science"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Field of Study</label>
        <input
          type="text"
          value={formData.field_of_study}
          onChange={(e) => setFormData({ ...formData, field_of_study: e.target.value })}
          placeholder="Computer Science"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
        />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="month"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="month"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPA</label>
          <input
            type="text"
            value={formData.gpa}
            onChange={(e) => setFormData({ ...formData, gpa: e.target.value })}
            placeholder="3.8"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Achievements, activities, relevant coursework..."
          rows={4}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
        />
      </div>
      
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding...' : 'Add Education'}
        </button>
      </div>
    </form>
  );
}

function EditEducationForm({ userId, educationId, onCancel, onSuccess }: { userId: string; educationId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    institution: '',
    degree: '',
    field_of_study: '',
    start_date: '',
    end_date: '',
    gpa: '',
    description: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadEducation() {
      const educations = await ProfileDataService.getEducation(userId);
      const edu = educations?.find((e: any) => e.id === educationId);
      if (edu) {
        // Build description from existing data if not present
        let description = edu.description || '';
        if (!description && (edu.honors?.length || edu.relevant_coursework?.length)) {
          const parts = [];
          if (edu.honors?.length) {
            parts.push(`Honors & Awards:\n${edu.honors.join(', ')}`);
          }
          if (edu.relevant_coursework?.length) {
            parts.push(`Relevant Coursework:\n${edu.relevant_coursework.join(', ')}`);
          }
          description = parts.join('\n\n');
        }
        
        // Format dates to YYYY-MM for month input
        const formatDateForInput = (date: string | null) => {
          if (!date) return '';
          const d = new Date(date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        
        setFormData({
          institution: edu.institution_name || '',
          degree: edu.degree || '',
          field_of_study: edu.field_of_study || '',
          start_date: formatDateForInput(edu.start_date),
          end_date: formatDateForInput(edu.end_date),
          gpa: edu.gpa ? edu.gpa.toString() : '',
          description,
        });
      }
      setLoading(false);
    }
    loadEducation();
  }, [userId, educationId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.institution.trim() || !formData.degree.trim()) return;

    setSubmitting(true);
    const result = await ProfileDataService.updateEducation(educationId, {
      institution_name: formData.institution,
      degree: formData.degree,
      field_of_study: formData.field_of_study,
      start_date: formData.start_date,
      end_date: formData.end_date,
      gpa: formData.gpa ? parseFloat(formData.gpa) : undefined,
      description: formData.description,
    });
    setSubmitting(false);
    if (result) {
      onSuccess();
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Institution *</label>
        <input
          type="text"
          value={formData.institution}
          onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
          placeholder="Stanford University"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Degree *</label>
        <input
          type="text"
          value={formData.degree}
          onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
          placeholder="Bachelor of Science"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Field of Study</label>
        <input
          type="text"
          value={formData.field_of_study}
          onChange={(e) => setFormData({ ...formData, field_of_study: e.target.value })}
          placeholder="Computer Science"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
        />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="month"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="month"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPA</label>
          <input
            type="text"
            value={formData.gpa}
            onChange={(e) => setFormData({ ...formData, gpa: e.target.value })}
            placeholder="3.8"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Achievements, activities, relevant coursework..."
          rows={4}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
        />
      </div>
      
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

interface EducationSectionProps {
  userId: string;
  editable?: boolean;
}

export const EducationSection = React.forwardRef<{ refresh: () => Promise<void> }, EducationSectionProps>(
  ({ userId, editable = true }, ref) => {
  const [education, setEducation] = useState<ProfileEducation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadEducation();
  }, [userId]);

  async function loadEducation() {
    setLoading(true);
    const data = await ProfileDataService.getEducation(userId);
    setEducation(data);
    setLoading(false);
  }

  React.useImperativeHandle(ref, () => ({
    refresh: loadEducation
  }));

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this education entry?')) return;
    const success = await ProfileDataService.deleteEducation(id);
    if (success) await loadEducation();
  }

  function handleEdit(id: string) {
    setEditingId(id);
  }

  function formatDate(date: string | null, isCurrent: boolean): string {
    if (!date && !isCurrent) return '';
    if (isCurrent) return 'Present';
    if (!date) return '';
    
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Education</h3>
        <div className="animate-pulse space-y-4">
          {[1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Education</h3>
        {editable && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Education
          </button>
        )}
      </div>

      {education.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No education added yet</p>
          <p className="text-sm">Upload a resume or transcript to automatically extract your education</p>
        </div>
      ) : (
        <div className="space-y-6">
          {education.map((edu) => (
            <div key={edu.id} className="border-l-2 border-purple-200 pl-4 relative group">
              <div className="absolute -left-2 top-1 w-3 h-3 rounded-full bg-purple-500"></div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{edu.institution_name}</h4>
                  {edu.degree && (
                    <p className="text-sm font-medium text-gray-700">
                      {edu.degree}{edu.field_of_study && ` in ${edu.field_of_study}`}
                    </p>
                  )}
                </div>
                <DataSourceBadge source={edu.source} confidence={edu.source_confidence} />
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(edu.start_date, false)} - {formatDate(edu.end_date, edu.is_current)}
                </span>
                {edu.gpa && (
                  <span className="inline-flex items-center gap-1">
                    <Award className="w-4 h-4" />
                    GPA: {edu.gpa.toFixed(2)}/{edu.gpa_scale.toFixed(1)}
                  </span>
                )}
              </div>
              {edu.honors.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Honors & Awards:</p>
                  <div className="flex flex-wrap gap-1">
                    {edu.honors.map((honor, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded">
                        {honor}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {edu.relevant_coursework.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Relevant Coursework:</p>
                  <p className="text-sm text-gray-700">{edu.relevant_coursework.join(', ')}</p>
                </div>
              )}
              {edu.description && (
                <p className="text-sm text-gray-700 mb-2">{edu.description}</p>
              )}
              {editable && (
                <button
                  onClick={() => handleEdit(edu.id)}
                  className="ml-2 p-1 text-gray-400 hover:text-purple-600 transition-all"
                  title="Edit education"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                )}
                {editable && (
                <button
                  onClick={() => handleDelete(edu.id)}
                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-1 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete education"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <ProfileModal open={isAdding} title="Add Education" onClose={() => setIsAdding(false)}>
            <AddEducationForm
              userId={userId}
              onCancel={() => setIsAdding(false)}
              onSuccess={() => {
                setIsAdding(false);
                loadEducation();
              }}
            />
          </ProfileModal>
          <ProfileModal open={!!editingId} title="Edit Education" onClose={() => setEditingId(null)}>
            {typeof editingId === 'string' && (
              <EditEducationForm
                userId={userId}
                educationId={editingId}
                onCancel={() => setEditingId(null)}
                onSuccess={() => {
                  setEditingId(null);
                  loadEducation();
                }}
              />
            )}
          </ProfileModal>
        </div>
      )}
    </div>
  );
});

EducationSection.displayName = 'EducationSection';
