#!/usr/bin/env node
const { PDFExtract } = require('pdf.js-extract');
const fs = require('fs');

async function main() {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('No file path provided');
    process.exit(1);
  }

  try {
    // Validate file exists
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    console.error('File not found or not readable:', filePath);
    process.exit(1);
  }

  const pdfExtract = new PDFExtract();

  try {
    // Force no-worker mode to avoid pdf.worker.js resolution in serverless
    const data = await pdfExtract.extract(filePath, { disableWorker: true });
    
    // Process pages to preserve line breaks
    const processedPages = (data.pages || []).map(page => {
      const content = page.content || [];
      
      // Group items by Y position to preserve lines
      const lines = {};
      const lineThreshold = 3; // Items within 3 points are on same line
      
      content.forEach(item => {
        const y = Math.round(item.y / lineThreshold) * lineThreshold;
        if (!lines[y]) {
          lines[y] = [];
        }
        lines[y].push(item);
      });
      
      // Sort by Y position (top to bottom) and extract text
      const sortedLines = Object.keys(lines)
        .map(Number)
        .sort((a, b) => a - b)
        .map(y => {
          // Sort items by X position (left to right)
          return lines[y]
            .sort((a, b) => a.x - b.x)
            .map(item => item.str)
            .join(' ');
        });
      
      return sortedLines.join('\n');
    });
    
    const extractedText = processedPages.join('\n\n');
    
    // Return as JSON for compatibility with existing code
    process.stdout.write(JSON.stringify({
      pages: data.pages,
      text: extractedText
    }));
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();

