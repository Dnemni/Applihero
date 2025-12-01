"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, FileText, Settings, Lightbulb, Save, Check, Download } from "lucide-react";
import { ProfileService } from "@/lib/supabase/services";

type CoverLetterSettings = {
  tone: "professional" | "enthusiastic" | "confident";
  formality: number; // 0-100
  length: "concise" | "standard" | "detailed";
  focus: string[];
  templateStyle: "complete" | "outline";
};

type Template = {
  id: string;
  title: string;
  preview: string;
  fullContent: string;
  matchScore: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  company: string;
  jobDescription?: string;
  userId: string;
};

export function CoverLetterModal({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  company,
  jobDescription,
  userId,
}: Props) {
  const [content, setContent] = useState("");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [settings, setSettings] = useState<CoverLetterSettings>({
    tone: "professional",
    formality: 70,
    length: "standard",
    focus: ["skills", "experience"],
    templateStyle: "outline",
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeSection, setActiveSection] = useState<"templates" | "customize" | "feedback">("templates");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [feedbackScore, setFeedbackScore] = useState<number | null>(null);
  const [feedbackScores, setFeedbackScores] = useState<{ relevance: number; professionalism: number; clarity: number; impact: number } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      loadExistingLetter();
      setFeedback([]);
      setFeedbackScore(null);
      setFeedbackScores(null);
      setActiveSection("templates");
      // Load user last name for PDF naming
      ProfileService.getCurrentProfile()
        .then((p) => {
          if (p?.last_name) setLastName(p.last_name);
        })
        .catch(() => {});
      // Don't auto-generate templates - user clicks to generate
    }
  }, [isOpen, jobId]);

  // Load feedback when switching to feedback tab
  useEffect(() => {
    if (activeSection === "feedback" && content.trim() && !feedbackLoading && feedback.length === 0) {
      getFeedback(content);
    }
  }, [activeSection]);

  const loadExistingLetter = async () => {
    try {
      const response = await fetch(`/api/cover-letters/${jobId}?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.content) {
          setContent(data.content);
          setSettings(data.style_settings || settings);
          setSelectedTemplate(data.selected_template ? { id: data.selected_template, title: "Previous Template", preview: "", fullContent: data.content, matchScore: 0 } : null);
          // Load persisted templates if available
          if (Array.isArray(data.templates)) {
            setTemplates(data.templates as Template[]);
          }
          // Load persisted feedback suggestions and scores
          if (data.ai_suggestions) {
            if (Array.isArray(data.ai_suggestions)) {
              setFeedback(data.ai_suggestions as string[]);
            } else if (typeof data.ai_suggestions === 'object') {
              const obj = data.ai_suggestions as any;
              if (Array.isArray(obj.suggestions)) setFeedback(obj.suggestions);
              if (typeof obj.overall === 'number') setFeedbackScore(obj.overall);
              if (obj.scores && typeof obj.scores === 'object') setFeedbackScores(obj.scores);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error loading cover letter:", error);
    }
  };

  const generateTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cover-letters/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          jobId, 
          jobDescription, 
          userId, 
          templateStyle: settings.templateStyle,
          settings: {
            tone: settings.tone,
            formality: settings.formality,
            length: settings.length,
            focus: settings.focus
          }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
        // Persist templates immediately so they aren't lost on close
        await saveTemplatesToDB(data.templates);
      }
    } catch (error) {
      console.error("Error generating templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const useTemplate = (template: Template) => {
    setContent(template.fullContent);
    setSelectedTemplate(template);
    // Don't get feedback immediately, only when user switches to feedback tab
  };

  const getFeedback = async (text: string) => {
    if (!text.trim()) {
      setFeedback([]);
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await fetch(`/api/cover-letters/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, jobDescription, settings, jobId, userId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setFeedback(data.suggestions || []);
        setFeedbackScore(data.score ?? null);
        setFeedbackScores(data.scores || null);
        // Persist feedback immediately so it isn't lost on close
        await saveFeedbackToDB({
          suggestions: data.suggestions || [],
          overall: data.score ?? null,
          scores: data.scores || null,
        });
      }
    } catch (error) {
      console.error("Error getting feedback:", error);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const saveTemplatesToDB = async (tpls: Template[]) => {
    try {
      await fetch(`/api/cover-letters/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          selectedTemplate: selectedTemplate?.id,
          styleSettings: settings,
          status: "draft",
          userId,
          templates: tpls,
        }),
      });
    } catch (e) {
      console.error("Error saving templates:", e);
    }
  };

  const saveFeedbackToDB = async (aiObj: any) => {
    try {
      await fetch(`/api/cover-letters/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          selectedTemplate: selectedTemplate?.id,
          styleSettings: settings,
          status: "draft",
          userId,
          aiSuggestions: aiObj,
        }),
      });
    } catch (e) {
      console.error("Error saving feedback:", e);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/cover-letters/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          selectedTemplate: selectedTemplate?.id,
          styleSettings: settings,
          status: "draft",
          userId,
          templates,
          aiSuggestions: feedback.length || feedbackScore || feedbackScores
            ? { suggestions: feedback, overall: feedbackScore, scores: feedbackScores }
            : undefined,
        }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error("Error saving cover letter:", error);
    } finally {
      setSaving(false);
    }
  };

  const exportToPDF = async () => {
    if (!content.trim()) return;
    // Build filename Cover-Letter-JOBTITLE-COMPANY-LASTNAME
    const clean = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const fname = `Cover-Letter-${clean(jobTitle)}-${clean(company)}-${clean(lastName || "User")}`;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 54; // 0.75in
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;

    // Header
    doc.setFont("Times", "Normal");
    doc.setFontSize(18);
    doc.text("Cover Letter", margin, y);
    y += 26;

    // Subheader: Job and Company
    doc.setFontSize(12);
    doc.setTextColor(90);
    doc.text(`${jobTitle} at ${company}`.trim(), margin, y);
    doc.setTextColor(0);
    y += 18;

    // Body
    doc.setFontSize(12);
    const lineHeight = 16;
    const maxWidth = pageWidth - margin * 2;
    const paragraphs = content.split(/\n\n+/);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para.replace(/\n/g, " "), maxWidth);
      for (const line of lines) {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += lineHeight / 2; // paragraph spacing
    }

    doc.save(`${fname}.pdf`);
  };

  // Helpers: feedback formatting and editor highlighting
  const getQuotedPhrases = (text: string): string[] => {
    const matches = text.match(/"([^"]+)"|'([^']+)'/g) || [];
    return matches
      .map((m) => m.slice(1, -1))
      .filter((s) => s && s.trim().length > 0);
  };

  const renderSuggestionWithBoldQuotes = (text: string) => {
    // Split on quoted segments and wrap them in <strong>
    const parts = text.split(/("[^"]+"|'[^']+')/g);
    return parts.map((part, i) => {
      if (/^"[^"]+"$|^'[^']+'$/.test(part)) {
        return (
          <strong key={i} className="font-semibold text-gray-900">
            {part}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const highlightInEditor = (phrase?: string) => {
    if (!phrase || !editorRef.current) return;
    const textarea = editorRef.current;
    const contentLower = content.toLowerCase();
    const phraseLower = phrase.toLowerCase();
    const idx = contentLower.indexOf(phraseLower);
    if (idx >= 0) {
      textarea.focus();
      try {
        textarea.setSelectionRange(idx, idx + phrase.length);
      } catch {}
    }
  };

  const clearEditorSelection = () => {
    if (!editorRef.current) return;
    const textarea = editorRef.current;
    try {
      const pos = textarea.selectionStart;
      textarea.setSelectionRange(pos, pos);
    } catch {}
  };

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cover Letter</h2>
            <p className="text-sm text-gray-600 mt-1">
              {jobTitle} at {company}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane - Editor */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto border-r">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600">
                {wordCount} words
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveDraft}
                  disabled={saving || !content.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {saving ? "Saving..." : "Save Draft"}
                    </>
                  )}
                </button>
                <button
                  onClick={exportToPDF}
                  disabled={!content.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Download className="w-4 h-4" />
                  Export to PDF
                </button>
              </div>
            </div>

            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                // Clear feedback when content changes, will reload when switching to feedback tab
                setFeedback([]);
                setFeedbackScore(null);
                setFeedbackScores(null);
              }}
              ref={editorRef}
              placeholder="Start writing your cover letter or select a template..."
              className="flex-1 p-4 border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 font-serif text-gray-800 leading-relaxed"
            />
          </div>

          {/* Right Pane - Controls */}
          <div className="w-[400px] overflow-y-auto bg-gray-50 p-6 space-y-4">
            {/* Section Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveSection("templates")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === "templates"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Templates
              </button>
              <button
                onClick={() => setActiveSection("customize")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === "customize"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Settings className="w-4 h-4" />
                Customize
              </button>
              <button
                onClick={() => setActiveSection("feedback")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === "feedback"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Lightbulb className="w-4 h-4" />
                Feedback
              </button>
            </div>

            {/* Templates Section */}
            {activeSection === "templates" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">AI-Generated Templates</h3>
                  </div>
                  <button
                    onClick={generateTemplates}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
                
                {loading ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Generating personalized templates...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No templates available yet.</p>
                    <button
                      onClick={generateTemplates}
                      className="mt-4 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Generate Templates
                    </button>
                  </div>
                ) : (
                  templates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-white rounded-lg p-4 border border-gray-200 hover:border-indigo-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{template.title}</h4>
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                          {template.matchScore}% Match
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                        {template.preview}
                      </p>
                      <button
                        onClick={() => useTemplate(template)}
                        className="w-full px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        Use Template
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Customize Section */}
            {activeSection === "customize" && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Template Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSettings({ ...settings, templateStyle: "outline" })}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        settings.templateStyle === "outline"
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Outline
                    </button>
                    <button
                      onClick={() => setSettings({ ...settings, templateStyle: "complete" })}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        settings.templateStyle === "complete"
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Complete
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {settings.templateStyle === "outline" 
                      ? "Templates with [placeholders] for you to fill in"
                      : "Fully written templates based on your experience"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Tone
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["professional", "enthusiastic", "confident"] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSettings({ ...settings, tone })}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          settings.tone === tone
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {tone.charAt(0).toUpperCase() + tone.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Formality: {settings.formality}%
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">Casual</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.formality}
                      onChange={(e) =>
                        setSettings({ ...settings, formality: parseInt(e.target.value) })
                      }
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-500">Formal</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Length
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["concise", "standard", "detailed"] as const).map((length) => (
                      <button
                        key={length}
                        onClick={() => setSettings({ ...settings, length })}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          settings.length === length
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {length.charAt(0).toUpperCase() + length.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Focus Areas
                  </label>
                  <div className="space-y-2">
                    {["skills", "experience", "culture-fit", "achievements"].map((focus) => (
                      <label key={focus} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={settings.focus.includes(focus)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSettings({ ...settings, focus: [...settings.focus, focus] });
                            } else {
                              setSettings({
                                ...settings,
                                focus: settings.focus.filter((f) => f !== focus),
                              });
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">
                          {focus.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    generateTemplates();
                    setActiveSection("templates");
                  }}
                  className="w-full px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all"
                >
                  Regenerate with Settings
                </button>
              </div>
            )}

            {/* Feedback Section */}
            {activeSection === "feedback" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-600" />
                    <h3 className="font-semibold text-gray-900">AI Feedback</h3>
                  </div>
                  {content.trim() && (
                    <button
                      onClick={() => getFeedback(content)}
                      disabled={feedbackLoading}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      {feedbackLoading ? 'Analyzing...' : 'Regenerate'}
                    </button>
                  )}
                </div>

                {!content.trim() ? (
                  <div className="text-center py-8 text-gray-500">
                    Start writing to get AI feedback
                  </div>
                ) : feedbackLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="animate-spin w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Analyzing your letter...
                  </div>
                ) : feedback.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No feedback available yet
                  </div>
                ) : (
                  <>
                    {/* Overall Score */}
                    {feedbackScore !== null && (
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Overall Score</span>
                          <span className={`text-2xl font-bold ${
                            feedbackScore >= 80 ? "text-green-600" : 
                            feedbackScore >= 60 ? "text-yellow-600" : 
                            "text-red-600"
                          }`}>
                            {feedbackScore}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              feedbackScore >= 80 ? "bg-green-500" : 
                              feedbackScore >= 60 ? "bg-yellow-500" : 
                              "bg-red-500"
                            }`}
                            style={{ width: `${feedbackScore}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Suggestions as Bullets */}
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Suggestions for Improvement</h4>
                      <ul className="space-y-2">
                        {feedback.map((item, idx) => {
                          const quotes = getQuotedPhrases(item);
                          const primary = quotes[0];
                          return (
                            <li
                              key={idx}
                              className="flex gap-2 text-sm text-gray-700 group"
                              onMouseEnter={() => primary && highlightInEditor(primary)}
                              onMouseLeave={() => clearEditorSelection()}
                            >
                              <span className="text-yellow-600 flex-shrink-0">•</span>
                              <span>{renderSuggestionWithBoldQuotes(item)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                )}

{feedbackScores && (
                <div className="bg-white rounded-lg p-4 border">
                  <h4 className="font-medium text-gray-900 mb-2">Strength Indicators</h4>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Relevance</span>
                        <span>{feedbackScores.relevance}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${feedbackScores.relevance >= 80 ? "bg-green-500" : feedbackScores.relevance >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${feedbackScores.relevance}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Professionalism</span>
                        <span>{feedbackScores.professionalism}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${feedbackScores.professionalism >= 80 ? "bg-green-500" : feedbackScores.professionalism >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${feedbackScores.professionalism}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Clarity</span>
                        <span>{feedbackScores.clarity}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${feedbackScores.clarity >= 80 ? "bg-green-500" : feedbackScores.clarity >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${feedbackScores.clarity}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Impact</span>
                        <span>{feedbackScores.impact}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${feedbackScores.impact >= 80 ? "bg-green-500" : feedbackScores.impact >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${feedbackScores.impact}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
