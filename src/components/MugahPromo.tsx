import { useEffect } from 'react';

const MUGAH_URL =
  'https://mugah.co/?utm_source=llm_ocr_web&utm_medium=header_ad&utm_campaign=cross_promo';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+Hebrew:wght@400;600;700&display=swap';

function ensureFontLoaded() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-mugah-promo-font]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.dataset.mugahPromoFont = 'true';
  document.head.appendChild(link);
}

export function MugahPromo() {
  useEffect(() => {
    ensureFontLoaded();
  }, []);

  return (
    <a
      href={MUGAH_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Try Mugah — Torah proofreading add-in for Word"
      className="group inline-flex items-center gap-3 whitespace-nowrap rounded-lg border border-[rgba(59,130,246,0.4)] bg-[#09090b] px-4 py-2.5 text-[0.9rem] font-medium text-[#fafafa] no-underline transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-[#3b82f6] hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
    >
      <span
        className="bg-gradient-to-br from-[#fafafa] to-[#3b82f6] bg-clip-text font-semibold tracking-tight text-transparent"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Mugah
      </span>
      <span className="text-[rgba(59,130,246,0.5)]" aria-hidden="true">
        ·
      </span>
      <span style={{ fontFamily: "'Inter', sans-serif" }}>
        Proofreading for Word
      </span>
      <span
        className="transition-transform duration-300 group-hover:translate-x-1"
        aria-hidden="true"
      >
        →
      </span>
    </a>
  );
}
