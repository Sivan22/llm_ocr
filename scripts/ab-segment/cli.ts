export interface Options {
  pages: number[];
  pdf: string;
  out: string;
  aDpi: number;
  cropDpi: number;
  gutterFrac?: number;
  footnoteFrac?: number;
  noFootnotes: boolean;
}

export function parsePages(spec: string): number[] {
  const out: number[] = [];
  for (const partRaw of spec.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      out.push(Number(part));
    }
  }
  return out;
}

export function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const pagesSpec = get('--pages') ?? '4,5,6';
  const gutter = get('--gutter');
  const footnote = get('--footnote');

  return {
    pages: parsePages(pagesSpec),
    pdf: get('--pdf') ?? 'Hebrewbooks_org_740.pdf',
    out: get('--out') ?? 'scripts/ab-segment/out',
    aDpi: Number(get('--a-dpi') ?? '200'),
    cropDpi: Number(get('--crop-dpi') ?? '400'),
    gutterFrac: gutter !== undefined ? Number(gutter) : undefined,
    footnoteFrac: footnote !== undefined ? Number(footnote) : undefined,
    noFootnotes: has('--no-footnotes'),
  };
}
