import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { SettingsProvider } from './store/SettingsContext';
import { ProjectProvider, useProject } from './store/ProjectContext';
import { EditorView } from './components/EditorView';
import { ExportPanel } from './components/ExportPanel';
import { JobsList } from './components/JobsList';
import { LanguageToggle } from './components/LanguageToggle';
import { MugahPromo } from './components/MugahPromo';
import { CostSummary } from './components/CostSummary';
import { DropStrip } from './components/DropStrip';
import { CollapsibleSettings } from './components/CollapsibleSettings';
import { RunToolbar } from './components/RunToolbar';
import { RunLog } from './components/RunLog';
import { PageThumbs, readSavedThumbMode } from './components/PageThumbs';
import { BatchRunnerProvider } from './hooks/useBatchRunner';
import type { ThumbMode } from './components/PageThumb';

function AppShell() {
  const { t, lang } = useI18n();
  const { setCurrentPageNum } = useProject();
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const [tab, setTab] = useState('ocr');
  const [thumbMode, setThumbMode] = useState<ThumbMode>(() => readSavedThumbMode());
  return (
    <div dir={dir} className="max-w-7xl mx-auto p-6 flex flex-col gap-4 min-h-screen">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('app.title')}</h1>
        <div className="flex items-center gap-2">
          <CostSummary />
          <LanguageToggle />
          <MugahPromo />
        </div>
      </header>
      <Tabs value={tab} onValueChange={setTab} dir={dir} className="flex-1">
        <TabsList>
          <TabsTrigger value="ocr">{t('tabs.ocr')}</TabsTrigger>
          <TabsTrigger value="editor">{t('tabs.editor')}</TabsTrigger>
          <TabsTrigger value="export">{t('tabs.export')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('tabs.jobs')}</TabsTrigger>
        </TabsList>
        <TabsContent value="ocr">
          <BatchRunnerProvider>
            <div className="space-y-4">
              <DropStrip />
              <CollapsibleSettings />
              <RunToolbar mode={thumbMode} onModeChange={setThumbMode} />
              <PageThumbs mode={thumbMode} onOpenPage={(n) => { setCurrentPageNum(n); setTab('editor'); }} />
              <RunLog />
            </div>
          </BatchRunnerProvider>
        </TabsContent>
        <TabsContent value="editor"><EditorView /></TabsContent>
        <TabsContent value="export"><ExportPanel /></TabsContent>
        <TabsContent value="jobs"><JobsList onOpened={() => setTab('ocr')} /></TabsContent>
      </Tabs>

      <footer className="mt-10 flex flex-col items-center justify-center gap-2 border-t pt-6 text-sm text-gray-500">
        <a
          href="https://github.com/Sivan22/llm_ocr"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('footer.github')}
          className="inline-flex items-center gap-2 hover:text-gray-800"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="currentColor"
          >
            <path d="M12 .5C5.73.5.67 5.56.67 11.83c0 5.01 3.24 9.26 7.74 10.76.57.1.78-.25.78-.55 0-.27-.01-.99-.02-1.94-3.15.68-3.81-1.52-3.81-1.52-.51-1.31-1.26-1.66-1.26-1.66-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.66 1.24 3.31.95.1-.74.4-1.24.72-1.53-2.51-.29-5.16-1.26-5.16-5.59 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .94-.3 3.09 1.16.9-.25 1.86-.38 2.82-.39.96.01 1.92.14 2.82.39 2.15-1.46 3.09-1.16 3.09-1.16.61 1.57.23 2.73.11 3.02.72.79 1.16 1.8 1.16 3.04 0 4.34-2.66 5.3-5.19 5.58.41.36.77 1.06.77 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.66.79.55 4.49-1.5 7.73-5.75 7.73-10.76C23.33 5.56 18.27.5 12 .5z" />
          </svg>
        </a>
        <div className="inline-flex items-center gap-1">
          <span>{t('footer.madeWith')}</span>
          <span className="text-red-500" aria-hidden="true">♥</span>
          <span>{t('footer.author')}</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <SettingsProvider>
          <ProjectProvider>
            <AppShell />
          </ProjectProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
