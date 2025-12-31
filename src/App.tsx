import React, { useState } from 'react';
import { ApiKeyProvider, useApiKeys } from './contexts/ApiKeyContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { Steps } from './components/Steps';
import { Mic, Settings, Save, CheckCircle2, AlertCircle, X } from 'lucide-react';

const KeyManager: React.FC = () => {
  const { keys, saveKeys, hasKeys } = useApiKeys();
  const [isOpen, setIsOpen] = useState(!hasKeys);
  const [tempKeys, setTempKeys] = useState(keys);

  const handleSave = () => {
    saveKeys(tempKeys);
    setIsOpen(false);
  };

  return (
    <div className="relative z-50">
      <div className="flex justify-end mb-4">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${hasKeys ? 'bg-slate-800 text-slate-300' : 'bg-amber-500/20 text-amber-500 border border-amber-500/50'}`}
        >
          <Settings size={18} />
          {hasKeys ? 'API Settings' : 'Setup Required'}
          {hasKeys ? <CheckCircle2 size={16} className="text-green-500" /> : <AlertCircle size={16} />}
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
          <div className="bg-surface border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-slide-down">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="text-primary" /> API Configuration
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Gemini API Key</label>
                <input 
                  type="password"
                  value={tempKeys.geminiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempKeys(prev => ({ ...prev, geminiKey: e.target.value }))}
                  placeholder="Paste AIzaSy... key"
                  className="w-full bg-background border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">OpenAI API Key</label>
                <input 
                  type="password"
                  value={tempKeys.openaiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempKeys(prev => ({ ...prev, openaiKey: e.target.value }))}
                  placeholder="Paste sk-proj-... key"
                  className="w-full bg-background border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleSave}
                  className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <Save size={20} /> Save Configuration
                </button>
                <p className="text-[10px] text-slate-500 mt-3 text-center uppercase tracking-widest">
                  Keys are stored locally in your browser
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-slate-100 font-sans selection:bg-primary/30">
      <main className="max-w-5xl mx-auto px-4 py-12">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
            <Mic size={32} className="text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            AutoDub Pro
          </h1>
          <p className="text-slate-400 max-w-xl text-sm">
            Professional AI Dubbing Studio
          </p>
        </header>

        <KeyManager />

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-20"></div>
          <Steps />
        </div>
        
        <footer className="mt-12 text-center text-slate-600 text-[10px] uppercase tracking-widest flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> FFmpeg Audio Engine (pitch-preserving)</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Secure Loading via Blob URLs</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Local Client-Side Processing</span>
          </div>
          <p>© 2025 AutoDub Pro • Senior AI Audio Pipeline</p>
        </footer>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <ApiKeyProvider>
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  </ApiKeyProvider>
);

export default App;
