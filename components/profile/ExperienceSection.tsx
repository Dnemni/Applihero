/**
 * ExperienceSection
 * 
 * Displays user's work experience in timeline format
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ProfileDataService } from '@/lib/supabase/services';
import { DataSourceBadge } from './DataSourceBadge';
import type { ProfileExperience } from '@/lib/supabase/types';
import { Briefcase, MapPin, Calendar, Plus, X } from 'lucide-react';
import { ProfileModal } from './ProfileModal';
import { Edit2 } from 'lucide-react';

function AddExperienceForm({ userId, onCancel, onSuccess }: { userId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    company: '',
    location: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });
  const [achievements, setAchievements] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);

  function handleAddAchievement() {
    setAchievements([...achievements, '']);
  }

  function handleRemoveAchievement(index: number) {
    setAchievements(achievements.filter((_, i) => i !== index));
  }

  function handleAchievementChange(index: number, value: string) {
    const updated = [...achievements];
    updated[index] = value;
    setAchievements(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.company.trim()) return;

    setSubmitting(true);
    
    // Convert YYYY-MM to YYYY-MM-01 for database
    const startDate = formData.start_date && /^\d{4}-\d{2}$/.test(formData.start_date) 
      ? `${formData.start_date}-01` 
      : formData.start_date;
    const endDate = formData.end_date && /^\d{4}-\d{2}$/.test(formData.end_date) 
      ? `${formData.end_date}-01` 
      : formData.end_date;
    
    // Filter out empty achievements
    const filteredAchievements = achievements.filter(a => a.trim().length > 0);
    
    const result = await ProfileDataService.addExperience({
      user_id: userId,
      company_name: formData.company,
      job_title: formData.title,
      location: formData.location,
      start_date: startDate,
      end_date: endDate,
      is_current: formData.is_current,
      achievements: filteredAchievements,
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Software Engineer"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
        <input
          type="text"
          value={formData.company}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          placeholder="Acme Corp"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="San Francisco, CA"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
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
            disabled={formData.is_current}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_current}
          onChange={(e) => setFormData({ ...formData, is_current: e.target.checked, end_date: e.target.checked ? '' : formData.end_date })}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-700">I currently work here</span>
      </label>
      
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Achievements</label>
          <button
            type="button"
            onClick={handleAddAchievement}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <Plus className="w-3 h-3" />
            Add Achievement
          </button>
        </div>
        <div className="space-y-2">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={achievement}
                onChange={(e) => handleAchievementChange(index, e.target.value)}
                placeholder="e.g., Led a team of 5 engineers to deliver..."
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
              />
              {achievements.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveAchievement(index)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Remove achievement"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
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
          {submitting ? 'Adding...' : 'Add Experience'}
        </button>
      </div>
    </form>
  );
}

function EditExperienceForm({ userId, experienceId, onCancel, onSuccess }: { userId: string; experienceId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    company: '',
    location: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });
  const [achievements, setAchievements] = useState<string[]>(['']);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function handleAddAchievement() {
    setAchievements([...achievements, '']);
  }

  function handleRemoveAchievement(index: number) {
    setAchievements(achievements.filter((_, i) => i !== index));
  }

  function handleAchievementChange(index: number, value: string) {
    const updated = [...achievements];
    updated[index] = value;
    setAchievements(updated);
  }

  useEffect(() => {
    async function loadExperience() {
      const experiences = await ProfileDataService.getExperience(userId);
      const exp = experiences?.find((e: any) => e.id === experienceId);
      if (exp) {
        // Format dates to YYYY-MM for month input
        const formatDateForInput = (date: string | null) => {
          if (!date) return '';
          const d = new Date(date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        
        setFormData({
          title: exp.job_title || '',
          company: exp.company_name || '',
          location: exp.location || '',
          start_date: formatDateForInput(exp.start_date),
          end_date: formatDateForInput(exp.end_date),
          is_current: exp.is_current || false,
        });
        
        // Load achievements, ensuring at least one empty field
        setAchievements(exp.achievements?.length > 0 ? exp.achievements : ['']);
      }
      setLoading(false);
    }
    loadExperience();
  }, [userId, experienceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim() || !formData.company.trim()) return;

    setSubmitting(true);
    
    // Filter out empty achievements
    const filteredAchievements = achievements.filter(a => a.trim().length > 0);
    
    const result = await ProfileDataService.updateExperience(experienceId, {
      company_name: formData.company,
      job_title: formData.title,
      location: formData.location,
      start_date: formData.start_date,
      end_date: formData.end_date,
      is_current: formData.is_current,
      achievements: filteredAchievements,
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Software Engineer"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
        <input
          type="text"
          value={formData.company}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          placeholder="Acme Corp"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="San Francisco, CA"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
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
            disabled={formData.is_current || submitting}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_current}
          onChange={(e) => setFormData({ ...formData, is_current: e.target.checked, end_date: e.target.checked ? '' : formData.end_date })}
          disabled={submitting}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
        />
        <span className="text-sm text-gray-700">I currently work here</span>
      </label>
      
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Achievements</label>
          <button
            type="button"
            onClick={handleAddAchievement}
            disabled={submitting}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Add Achievement
          </button>
        </div>
        <div className="space-y-2">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={achievement}
                onChange={(e) => handleAchievementChange(index, e.target.value)}
                placeholder="e.g., Led a team of 5 engineers to deliver..."
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {achievements.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveAchievement(index)}
                  disabled={submitting}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Remove achievement"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
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

interface ExperienceSectionProps {
  userId: string;
  editable?: boolean;
}

export const ExperienceSection = React.forwardRef<{ refresh: () => Promise<void> }, ExperienceSectionProps>(
  ({ userId, editable = true }, ref) => {
  const [experiences, setExperiences] = useState<ProfileExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadExperiences();
  }, [userId]);

  async function loadExperiences() {
    setLoading(true);
    const data = await ProfileDataService.getExperience(userId);
    setExperiences(data);
    setLoading(false);
  }

  React.useImperativeHandle(ref, () => ({
    refresh: loadExperiences
  }));

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this experience?')) return;
    const success = await ProfileDataService.deleteExperience(id);
    if (success) await loadExperiences();
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Experience</h3>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="border-l-2 border-gray-200 pl-4 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Experience</h3>
        {editable && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Experience
          </button>
        )}
      </div>

      {experiences.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No work experience added yet</p>
          <p className="text-sm">Upload a resume to automatically extract your experience</p>
        </div>
      ) : (
        <div className="space-y-6">
          {experiences.map((exp) => (
            <div key={exp.id} className="border-l-2 border-indigo-200 pl-4 relative group">
              <div className="absolute -left-2 top-1 w-3 h-3 rounded-full bg-indigo-500"></div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{exp.job_title}</h4>
                  <p className="text-sm font-medium text-gray-700">{exp.company_name}</p>
                </div>
                <DataSourceBadge source={exp.source} confidence={exp.source_confidence} />
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(exp.start_date, false)} - {formatDate(exp.end_date, exp.is_current)}
                </span>
                {exp.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {exp.location}
                  </span>
                )}
              </div>
              {exp.achievements.length > 0 && (
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-2">
                  {exp.achievements.map((achievement, idx) => (
                    <li key={idx}>{achievement}</li>
                  ))}
                </ul>
              )}
              {exp.technologies_used.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {exp.technologies_used.map((tech, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
              {editable && (
                <button
                  onClick={() => handleEdit(exp.id)}
                  className="ml-2 p-1 text-gray-400 hover:text-indigo-600 transition-all"
                  title="Edit experience"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                )}
                {editable && (
                <button
                  onClick={() => handleDelete(exp.id)}
                  className="opacity-0 group-hover:opacity-100 absolute top-0 right-0 p-1 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete experience"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <ProfileModal open={isAdding} title="Add Experience" onClose={() => setIsAdding(false)}>
            <AddExperienceForm
              userId={userId}
              onCancel={() => setIsAdding(false)}
              onSuccess={() => {
                setIsAdding(false);
                loadExperiences();
              }}
            />
          </ProfileModal>
          <ProfileModal open={!!editingId} title="Edit Experience" onClose={() => setEditingId(null)}>
            {typeof editingId === 'string' && (
              <EditExperienceForm
                userId={userId}
                experienceId={editingId}
                onCancel={() => setEditingId(null)}
                onSuccess={() => {
                  setEditingId(null);
                  loadExperiences();
                }}
              />
            )}
          </ProfileModal>
        </div>
      )}
    </div>
  );
});

ExperienceSection.displayName = 'ExperienceSection';
