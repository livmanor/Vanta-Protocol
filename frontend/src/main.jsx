import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { LanguageProvider } from './i18n.jsx'
import './index.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error in Vanta Protocol:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4 text-2xl font-bold">!</div>
          <h1 className="text-xl font-bold text-slate-100">Control Room Encountered an Issue</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-md">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-[#09090B] hover:bg-[#27272A] text-white rounded-[6px] text-sm font-medium transition"
          >
            Reload Control Room
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider><App /></LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
