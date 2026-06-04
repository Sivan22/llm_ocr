import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from './cli';
import { openDoc, renderPage } from './render';
import { decodePng, encodePng, cropImage, drawRegions } from './image';
import { detectRegions } from './segment';
import { makeModel, runA, runB, toDataUrl, type BCrop } from './ocr';
import { buildReport } from './report';
import type { PageReport } from './types';

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });

  const pdfBytes = new Uint8Array(fs.readFileSync(opts.pdf));
  const doc = openDoc(pdfBytes);
  const model = makeModel();
  console.log(`PDF ${opts.pdf} (${doc.count} pages); pages=${opts.pages.join(',')} aDpi=${opts.aDpi} cropDpi=${opts.cropDpi}`);

  const reports: PageReport[] = [];

  for (const pageNum of opts.pages) {
    const idx = pageNum - 1; // 1-indexed -> 0-indexed
    if (idx < 0 || idx >= doc.count) { console.warn(`skip page ${pageNum} (out of range)`); continue; }
    console.log(`page ${pageNum}: rendering...`);

    const aPng = renderPage(doc, idx, opts.aDpi);
    const bPng = renderPage(doc, idx, opts.cropDpi);
    const img = decodePng(bPng);
    const det = detectRegions(img, {
      gutterFrac: opts.gutterFrac,
      footnoteFrac: opts.footnoteFrac,
      noFootnotes: opts.noFootnotes,
    });
    console.log(`page ${pageNum}: regions=${det.regions.map((r) => r.role).join(',')} flags=${det.flags.join(',') || 'none'}`);

    // crops + overlay
    const crops: BCrop[] = det.regions.map((r) => {
      const cpng = encodePng(cropImage(img, r.bbox));
      fs.writeFileSync(path.join(opts.out, `p${pageNum}-${r.role}.png`), cpng);
      return { role: r.role, png: cpng, cropDataUrl: toDataUrl(cpng) };
    });
    const overlayPng = encodePng(drawRegions(img, det.regions));
    fs.writeFileSync(path.join(opts.out, `p${pageNum}-overlay.png`), overlayPng);

    console.log(`page ${pageNum}: OCR A (full page)...`);
    const a = await runA(model, aPng);
    console.log(`page ${pageNum}: OCR B (${crops.length} regions)...`);
    const b = await runB(model, crops);

    reports.push({ pageNum, flags: det.flags, overlayDataUrl: toDataUrl(overlayPng), a, b });
  }

  const html = buildReport(reports);
  const outFile = path.join(opts.out, 'report.html');
  fs.writeFileSync(outFile, html);
  console.log(`\nDone. Report: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
