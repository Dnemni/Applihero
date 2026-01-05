/**
 * SkillsSection
 * 
 * Displays user's skills categorized and with proficiency indicators
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ProfileDataService } from '@/lib/supabase/services';
import { DataSourceBadge } from './DataSourceBadge';
import type { ProfileSkill, SkillCategory, ProficiencyLevel } from '@/lib/supabase/types';
import { Plus, X, Edit2, Check } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

interface SkillsSectionProps {
  userId: string;
  editable?: boolean;
}

const categoryLabels: Record<SkillCategory | 'other', string> = {
  technical: 'Technical Skills',
  soft: 'Soft Skills',
  language: 'Languages',
  tool: 'Tools & Software',
  framework: 'Frameworks & Libraries',
  domain_knowledge: 'Domain Knowledge',
  other: 'Other Skills',
};

const proficiencyColors = {
  beginner: 'bg-yellow-100 text-yellow-800',
  intermediate: 'bg-blue-100 text-blue-800',
  advanced: 'bg-purple-100 text-purple-800',
  expert: 'bg-green-100 text-green-800',
};

export const SkillsSection = React.forwardRef<{ refresh: () => Promise<void> }, SkillsSectionProps>(
  ({ userId, editable = true }, ref) => {
  const [skillsByCategory, setSkillsByCategory] = useState<Record<string, ProfileSkill[]>>({});
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, [userId]);

  async function loadSkills() {
    setLoading(true);
    const grouped = await ProfileDataService.getSkillsByCategory(userId);
    setSkillsByCategory(grouped);
    setLoading(false);
  }

  React.useImperativeHandle(ref, () => ({
    refresh: loadSkills
  }));

  async function handleDeleteSkill(skillId: string) {
    // Delete skill immediately, no confirmation
    const success = await ProfileDataService.deleteSkill(skillId);
    if (success) {
      await loadSkills();
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Skills</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="h-8 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const hasSkills = Object.keys(skillsByCategory).length > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
        {editable && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </button>
        )}
      </div>

      {!hasSkills && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No skills added yet</p>
          <p className="text-sm">Upload a resume to automatically extract your skills</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(skillsByCategory).map(([category, skills]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                {categoryLabels[category as SkillCategory] || 'Other Skills'}
              </h4>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {skill.skill_name}
                    </span>
                    
                    {skill.proficiency_level && (
                      <span className={`text-xs px-2 py-0.5 rounded ${proficiencyColors[skill.proficiency_level]}`}>
                        {skill.proficiency_level}
                      </span>
                    )}
                    
                    {skill.years_of_experience && (
                      <span className="text-xs text-gray-500">
                        ({skill.years_of_experience}y)
                      </span>
                    )}
                    
                    <DataSourceBadge source={skill.source} confidence={skill.source_confidence} />
                    
                    {editable && (
                      <button
                        onClick={() => handleDeleteSkill(skill.id)}
                        className="opacity-0 group-hover:opacity-100 ml-1 p-1 text-gray-400 hover:text-red-600 transition-all"
                        title="Delete skill"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          <ProfileModal open={isAdding} title="Add Skill" onClose={() => setIsAdding(false)}>
            <AddSkillForm
              userId={userId}
              onCancel={() => setIsAdding(false)}
              onSuccess={() => {
                setIsAdding(false);
                loadSkills();
              }}
            />
          </ProfileModal>
          <ProfileModal open={!!editingId} title="Edit Skill" onClose={() => setEditingId(null)}>
            {typeof editingId === 'string' && (
              <EditSkillForm
                userId={userId}
                skillId={editingId}
                onCancel={() => setEditingId(null)}
                onSuccess={() => {
                  setEditingId(null);
                  loadSkills();
                }}
              />
            )}
          </ProfileModal>
        </div>
      )}
    </div>
  );
});

SkillsSection.displayName = 'SkillsSection';

// Stub EditSkillForm for modal integration
export function EditSkillForm({ userId, skillId, onCancel, onSuccess }: { userId: string; skillId: string; onCancel: () => void; onSuccess: () => void }) {
  return null;
}

interface AddSkillFormProps {
  userId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function AddSkillForm({ userId, onCancel, onSuccess }: AddSkillFormProps) {
  const [skillName, setSkillName] = useState('');
  const [category, setCategory] = useState<SkillCategory>('technical');
  const [proficiency, setProficiency] = useState<ProficiencyLevel | ''>('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!skillName.trim()) return;

    setSubmitting(true);
    const result = await ProfileDataService.addSkill({
      user_id: userId,
      skill_name: skillName.trim(),
      category,
      proficiency_level: proficiency || undefined,
      source: 'manual',
    });

    setSubmitting(false);
    if (result) {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t pt-4 mt-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          placeholder="Skill name"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />
        
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SkillCategory)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="technical">Technical</option>
          <option value="soft">Soft Skill</option>
          <option value="language">Language</option>
          <option value="tool">Tool</option>
          <option value="framework">Framework</option>
          <option value="domain_knowledge">Domain Knowledge</option>
          <option value="other">Other</option>
        </select>
        
        <select
          value={proficiency}
          onChange={(e) => setProficiency(e.target.value as ProficiencyLevel | '')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">Proficiency (optional)</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </div>
      
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Adding...' : 'Add Skill'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
