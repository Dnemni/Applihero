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
    process.stdout.write(JSON.stringify(data));
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();
