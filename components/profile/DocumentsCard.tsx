import React from "react";

interface DocumentsCardProps {
  resumeUploaded: boolean;
  transcriptUploaded: boolean;
  resumeTextLength: number;
  transcriptTextLength: number;
  onResumeUpload: (file: File) => void;
  onTranscriptUpload: (file: File) => void;
  onViewResume: () => void;
  onViewTranscript: () => void;
  uploadingResume: boolean;
  uploadingTranscript: boolean;
}

export function DocumentsCard({
  resumeUploaded,
  transcriptUploaded,
  resumeTextLength,
  transcriptTextLength,
  onResumeUpload,
  onTranscriptUpload,
  onViewResume,
  onViewTranscript,
  uploadingResume,
  uploadingTranscript,
}: DocumentsCardProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Resume</label>
          <input
            type="file"
            accept=".pdf"
            onChange={e => e.target.files && onResumeUpload(e.target.files[0])}
            disabled={uploadingResume}
            className="mb-2"
          />
          {resumeUploaded && (
            <button onClick={onViewResume} className="text-indigo-600 hover:underline text-sm">View current resume</button>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {resumeTextLength > 0 ? `${resumeTextLength.toLocaleString()} characters extracted` : 'No text extracted'}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transcript</label>
          <input
            type="file"
            accept=".pdf"
            onChange={e => e.target.files && onTranscriptUpload(e.target.files[0])}
            disabled={uploadingTranscript}
            className="mb-2"
          />
          {transcriptUploaded && (
            <button onClick={onViewTranscript} className="text-indigo-600 hover:underline text-sm">View current transcript</button>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {transcriptTextLength > 0 ? `${transcriptTextLength.toLocaleString()} characters extracted` : 'No text extracted'}
          </div>
        </div>
      </div>
    </section>
  );
}
