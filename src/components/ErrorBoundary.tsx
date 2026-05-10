import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: unknown) {
    console.error('App crashed:', error, info);
  }

  reload = () => { this.setState({ error: null }); window.location.reload(); };

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <pre className="bg-gray-100 p-3 text-xs overflow-auto rounded">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.reload}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
