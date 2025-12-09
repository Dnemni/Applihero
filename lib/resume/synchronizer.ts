/**
 * Utility for synchronizing PDF rendering and text editing
 * Tracks text positions to enable highlight-on-click functionality
 */

export interface TextPosition {
  line: number;
  startIndex: number;
  endIndex: number;
  text: string;
  pageNumber?: number;
}

/**
 * Parse resume text into lines with position tracking
 */
export function parseResumeText(text: string): TextPosition[] {
  const lines = text.split('\n');
  const positions: TextPosition[] = [];
  let currentIndex = 0;

  lines.forEach((line, lineIndex) => {
    if (line.trim()) {
      positions.push({
        line: lineIndex,
        startIndex: currentIndex,
        endIndex: currentIndex + line.length,
        text: line,
      });
    }
    currentIndex += line.length + 1; // +1 for newline
  });

  return positions;
}

/**
 * Extract text selection from textarea and return position info
 */
export function getSelectedTextPosition(textarea: HTMLTextAreaElement): TextPosition | null {
  const { selectionStart, selectionEnd, value } = textarea;

  if (selectionStart === selectionEnd) return null;

  const beforeText = value.substring(0, selectionStart);
  const selectedText = value.substring(selectionStart, selectionEnd);
  const lineNumber = beforeText.split('\n').length - 1;

  return {
    line: lineNumber,
    startIndex: selectionStart,
    endIndex: selectionEnd,
    text: selectedText,
  };
}

/**
 * Format resume text to match PDF layout
 * Preserves structure and spacing
 */
export function formatResumeText(text: string): string {
  // Preserve formatting while ensuring consistent spacing
  return text
    .split('\n')
    .map(line => {
      // Preserve indentation
      const trimmed = line.trimStart();
      const indent = line.substring(0, line.length - trimmed.length);
      
      // Handle section headers (all caps or bold indicators)
      if (trimmed.match(/^[A-Z][A-Z\s]+$/) || trimmed.match(/^\*\*.*\*\*$/)) {
        return line;
      }
      
      return line;
    })
    .join('\n');
}

/**
 * Highlight text in PDF (used by PDF viewer)
 * Returns page number and coordinates for scrolling
 */
export function findTextInPDF(text: string, searchTerm: string): {
  page: number;
  coordinates: { x: number; y: number };
} | null {
  // This would integrate with PDF.js to find text position
  // For now, return null - implementation depends on PDF viewer
  return null;
}

/**
 * Sync textarea scroll to match PDF highlight position
 */
export function syncTextareaScroll(
  textarea: HTMLTextAreaElement,
  position: TextPosition
) {
  textarea.setSelectionRange(position.startIndex, position.endIndex);
  
  // Scroll textarea to show selection
  const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight);
  const scrollTop = position.line * lineHeight;
  textarea.scrollTop = Math.max(0, scrollTop - textarea.clientHeight / 3);
}

/**
 * Generate CSS class for highlighting
 */
export function getHighlightStyle(isSelected: boolean): string {
  return isSelected
    ? 'bg-yellow-200 text-gray-900'
    : 'hover:bg-gray-100';
}
