import { Component, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

function ErrorFallback({ error, onReload }: { error: Error; onReload: () => void }) {
  const { t } = useI18n();
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-2">{t('error.title')}</h1>
      <pre className="bg-gray-100 p-3 text-xs overflow-auto rounded">
        {error.message}
      </pre>
      <button
        onClick={onReload}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >{t('error.reload')}</button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: unknown) {
    console.error('App crashed:', error, info);
  }

  reload = () => { this.setState({ error: null }); window.location.reload(); };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReload={this.reload} />;
    }
    return this.props.children;
  }
}
