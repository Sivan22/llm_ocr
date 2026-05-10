import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ErrorBoundary } from './components/ErrorBoundary';
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

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ProjectProvider>
          <div className="max-w-7xl mx-auto p-6 space-y-4">
            <header className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">LLM OCR — Jewish Texts</h1>
              <CostSummary />
            </header>
            <Tabs defaultValue="ocr">
              <TabsList>
                <TabsTrigger value="setup">Setup</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="export">Export</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="setup"><SettingsPanel /></TabsContent>
              <TabsContent value="ocr">
                <div className="space-y-4">
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
        </ProjectProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
