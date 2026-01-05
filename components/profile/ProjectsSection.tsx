/**
 * ProjectsSection
 * 
 * Displays user's projects with technologies and achievements
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ProfileDataService } from '@/lib/supabase/services';
import { DataSourceBadge } from './DataSourceBadge';
import type { ProfileProject } from '@/lib/supabase/types';
import { Code, Calendar, ExternalLink, Plus, X } from 'lucide-react';
import { ProfileModal } from './ProfileModal';
import { Edit2 } from 'lucide-react';

function AddProjectForm({ userId, onCancel, onSuccess }: { userId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    technologies: '',
    start_date: '',
    end_date: '',
    url: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    
    // Convert YYYY-MM to YYYY-MM-01 for database
    const startDate = formData.start_date && /^\d{4}-\d{2}$/.test(formData.start_date) 
      ? `${formData.start_date}-01` 
      : formData.start_date;
    const endDate = formData.end_date && /^\d{4}-\d{2}$/.test(formData.end_date) 
      ? `${formData.end_date}-01` 
      : formData.end_date;
    
    const result = await ProfileDataService.addProject({
      user_id: userId,
      project_name: formData.name,
      description: formData.description,
      start_date: startDate,
      end_date: endDate,
      technologies_used: formData.technologies ? formData.technologies.split(',').map(t => t.trim()) : undefined,
      project_url: formData.url || undefined,
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="AI-Powered Study Companion"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the project, your role, and key achievements..."
          rows={4}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Technologies</label>
        <input
          type="text"
          value={formData.technologies}
          onChange={(e) => setFormData({ ...formData, technologies: e.target.value })}
          placeholder="React, Node.js, MongoDB, AWS"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
        />
        <p className="text-xs text-gray-500 mt-1">Separate multiple technologies with commas</p>
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
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project URL</label>
        <input
          type="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://github.com/username/project"
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
          {submitting ? 'Adding...' : 'Add Project'}
        </button>
      </div>
    </form>
  );
}

function EditProjectForm({ userId, projectId, onCancel, onSuccess }: { userId: string; projectId: string; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    technologies: '',
    start_date: '',
    end_date: '',
    url: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadProject() {
      const projects = await ProfileDataService.getProjects(userId);
      const proj = projects?.find((p: any) => p.id === projectId);
      if (proj) {
        // Build description from achievements and description  
        let description = proj.description || '';
        if (!description && proj.achievements?.length) {
          description = proj.achievements.join('\n• ');
          if (description) description = '• ' + description;
        }
        
        // Format dates to YYYY-MM for month input
        const formatDateForInput = (date: string | null) => {
          if (!date) return '';
          const d = new Date(date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        
        setFormData({
          name: proj.project_name || '',
          description,
          technologies: proj.technologies_used ? proj.technologies_used.join(', ') : '',
          start_date: formatDateForInput(proj.start_date),
          end_date: formatDateForInput(proj.end_date),
          url: proj.project_url || '',
        });
      }
      setLoading(false);
    }
    loadProject();
  }, [userId, projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    const result = await ProfileDataService.updateProject(projectId, {
      project_name: formData.name,
      description: formData.description,
      start_date: formData.start_date,
      end_date: formData.end_date,
      technologies_used: formData.technologies ? formData.technologies.split(',').map(t => t.trim()) : undefined,
      project_url: formData.url || undefined,
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="AI-Powered Study Companion"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the project, your role, and key achievements..."
          rows={4}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Technologies</label>
        <input
          type="text"
          value={formData.technologies}
          onChange={(e) => setFormData({ ...formData, technologies: e.target.value })}
          placeholder="React, Node.js, MongoDB, AWS"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={submitting}
        />
        <p className="text-xs text-gray-500 mt-1">Separate multiple technologies with commas</p>
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
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project URL</label>
        <input
          type="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://github.com/username/project"
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

interface ProjectsSectionProps {
  userId: string;
  editable?: boolean;
}

export const ProjectsSection = React.forwardRef<{ refresh: () => Promise<void> }, ProjectsSectionProps>(
  ({ userId, editable = true }, ref) => {
  const [projects, setProjects] = useState<ProfileProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [userId]);

  async function loadProjects() {
    setLoading(true);
    const data = await ProfileDataService.getProjects(userId);
    setProjects(data);
    setLoading(false);
  }

  React.useImperativeHandle(ref, () => ({
    refresh: loadProjects
  }));

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this project?')) return;
    const success = await ProfileDataService.deleteProject(id);
    if (success) await loadProjects();
  }

  function handleEdit(id: string) {
    setEditingId(id);
  }

  function formatDate(date: string | null, isOngoing: boolean): string {
    if (!date && !isOngoing) return '';
    if (isOngoing) return 'Ongoing';
    if (!date) return '';
    
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Projects</h3>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Projects</h3>
        {editable && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        )}
      </div>

      {projects.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No projects added yet</p>
          <p className="text-sm">Upload a resume to automatically extract your projects</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow group relative">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Code className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 break-words">{project.project_name}</h4>
                    {project.role && (
                      <p className="text-xs text-gray-600 break-words">{project.role}</p>
                    )}
                  </div>
                </div>
                <DataSourceBadge source={project.source} confidence={project.source_confidence} />
              </div>
              {project.description && (
                <p className="text-sm text-gray-700 mb-2 break-words">{project.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-600 mb-2 flex-wrap">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span className="break-words">{formatDate(project.start_date, false)} - {formatDate(project.end_date, project.is_ongoing)}</span>
              </div>
              {project.technologies_used.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {project.technologies_used.slice(0, 5).map((tech, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded break-words">
                      {tech}
                    </span>
                  ))}
                  {project.technologies_used.length > 5 && (
                    <span className="px-2 py-0.5 text-gray-500 text-xs">
                      +{project.technologies_used.length - 5} more
                    </span>
                  )}
                </div>
              )}
              {project.achievements.length > 0 && (
                <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5 mb-2">
                  {project.achievements.slice(0, 2).map((achievement, idx) => (
                    <li key={idx} className="break-words">{achievement}</li>
                  ))}
                  {project.achievements.length > 2 && (
                    <li className="text-gray-500">+{project.achievements.length - 2} more achievements</li>
                  )}
                </ul>
              )}
              {project.project_url && (
                <a
                  href={project.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 break-all"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">View Project</span>
                </a>
              )}
              {editable && (
                <button
                  onClick={() => handleEdit(project.id)}
                  className="ml-2 p-1 text-gray-400 hover:text-indigo-600 transition-all"
                  title="Edit project"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                )}
                {editable && (
                <button
                  onClick={() => handleDelete(project.id)}
                  className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete project"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <ProfileModal open={isAdding} title="Add Project" onClose={() => setIsAdding(false)}>
            <AddProjectForm
              userId={userId}
              onCancel={() => setIsAdding(false)}
              onSuccess={() => {
                setIsAdding(false);
                loadProjects();
              }}
            />
          </ProfileModal>
          <ProfileModal open={!!editingId} title="Edit Project" onClose={() => setEditingId(null)}>
            {typeof editingId === 'string' && (
              <EditProjectForm
                userId={userId}
                projectId={editingId}
                onCancel={() => setEditingId(null)}
                onSuccess={() => {
                  setEditingId(null);
                  loadProjects();
                }}
              />
            )}
          </ProfileModal>
        </div>
      )}
    </div>
  );
});

ProjectsSection.displayName = 'ProjectsSection';
