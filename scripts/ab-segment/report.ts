import type { PageReport } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pageSection(p: PageReport): string {
  const ratioIn = p.a.tokensIn ? (p.b.totalTokensIn / p.a.tokensIn).toFixed(2) : '–';
  const ratioOut = p.a.tokensOut ? (p.b.totalTokensOut / p.a.tokensOut).toFixed(2) : '–';
  const flags = p.flags.length ? p.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(' ') : '<span class="ok">clean</span>';

  const crops = p.b.regions.map((r) => `
    <div class="crop">
      <div class="crop-h">${esc(r.role)} · in ${r.tokensIn ?? '?'} / out ${r.tokensOut ?? '?'}</div>
      <img src="${r.cropDataUrl}" />
      <pre dir="rtl">${r.error ? '⚠ ' + esc(r.error) : esc(r.text)}</pre>
    </div>`).join('');

  return `
  <section class="page">
    <h2>Page ${p.pageNum} ${flags}</h2>
    <div class="tokens">A: in ${p.a.tokensIn ?? '?'} / out ${p.a.tokensOut ?? '?'} ·
      B: in ${p.b.totalTokensIn} / out ${p.b.totalTokensOut} ·
      B/A ratio: in ${ratioIn}× / out ${ratioOut}×</div>
    <div class="overlay"><img src="${p.overlayDataUrl}" /></div>
    <div class="cols">
      <div class="col">
        <h3>A — full page</h3>
        <pre dir="rtl">${p.a.error ? '⚠ ' + esc(p.a.error) : esc(p.a.text)}</pre>
      </div>
      <div class="col">
        <h3>B — per region (stitched)</h3>
        <pre dir="rtl">${p.b.error ? '⚠ ' + esc(p.b.error) : esc(p.b.stitched)}</pre>
        <div class="crops">${crops}</div>
      </div>
    </div>
  </section>`;
}

export function buildReport(pages: PageReport[]): string {
  const body = pages.map(pageSection).join('\n');
  return `<!doctype html>
<html lang="he">
<head>
<meta charset="utf-8" />
<title>A/B Segmentation Report</title>
<style>
  body { font-family: "David", "Times New Roman", serif; margin: 24px; background: #f7f7f7; color: #111; }
  h1 { font-size: 20px; }
  section.page { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 0 0 28px; }
  .tokens { color: #555; font-size: 13px; margin: 4px 0 12px; }
  .flag { background: #fde68a; color: #7c2d12; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  .ok { background: #bbf7d0; color: #065f46; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  .overlay img { max-width: 520px; border: 1px solid #ccc; }
  .cols { display: flex; gap: 16px; align-items: flex-start; margin-top: 12px; }
  .col { flex: 1; min-width: 0; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #fafafa; border: 1px solid #eee; padding: 8px; font-size: 15px; line-height: 1.6; }
  .crop { margin-top: 10px; border-top: 1px dashed #ddd; padding-top: 8px; }
  .crop-h { font-size: 12px; color: #555; margin-bottom: 4px; }
  .crop img { max-width: 360px; border: 1px solid #ccc; }
</style>
</head>
<body dir="rtl">
<h1>A/B Segmentation Report — ${pages.length} page(s)</h1>
${body}
</body>
</html>`;
}
