import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { SettingsProvider } from './store/SettingsContext';
import { ProjectProvider } from './store/ProjectContext';
import { SettingsPanel } from './components/SettingsPanel';
import { FileDrop } from './components/FileDrop';
import { PageList } from './components/PageList';
import { BatchRunner } from './components/BatchRunner';
import { EditorView } from './components/EditorView';
import { ExportPanel } from './components/ExportPanel';
import { CostSummary } from './components/CostSummary';
import { RunHistory } from './components/RunHistory';
import { LanguageToggle } from './components/LanguageToggle';

function AppShell() {
  const { t } = useI18n();
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('app.title')}</h1>
        <div className="flex items-center gap-2">
          <CostSummary />
          <LanguageToggle />
        </div>
      </header>
      <Tabs defaultValue="ocr">
        <TabsList>
          <TabsTrigger value="ocr">{t('tabs.ocr')}</TabsTrigger>
          <TabsTrigger value="editor">{t('tabs.editor')}</TabsTrigger>
          <TabsTrigger value="export">{t('tabs.export')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="ocr">
          <div className="space-y-6">
            <SettingsPanel />
            <hr className="border-gray-200" />
            <FileDrop />
            <BatchRunner />
            <PageList />
          </div>
        </TabsContent>
        <TabsContent value="editor"><EditorView /></TabsContent>
        <TabsContent value="export"><ExportPanel /></TabsContent>
        <TabsContent value="history"><RunHistory /></TabsContent>
      </Tabs>
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
