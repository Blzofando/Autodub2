import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { Play, Clock, Edit3, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { OPENAI_VOICES, VoiceOption } from '../types';

export const TimelineEditor: React.FC = () => {
  const { 
    segments, 
    updateSegment, 
    selectedVoice, 
    setSelectedVoice 
  } = useProject();

  if (segments.length === 0) return null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between bg-surface p-4 rounded-xl border border-slate-700">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Edit3 size={20} className="text-accent" />
          Translation & Isochrony Editor
        </h2>
        
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-400">Speaker Voice:</label>
          <select 
            value={selectedVoice}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedVoice(e.target.value as VoiceOption)}
            className="bg-background border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary"
          >
            {OPENAI_VOICES.map(v => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {segments.map((seg) => {
            const duration = (seg.end - seg.start).toFixed(1);
            const charCount = seg.translatedText.length;
            const target = seg.targetCharCount || 0;
            const diff = charCount - target;
            const diffColor = Math.abs(diff) < 5 ? 'text-green-500' : diff > 0 ? 'text-red-400' : 'text-yellow-400';

            return (
              <div key={seg.id} className="bg-surface p-4 rounded-xl border border-slate-700 flex gap-4 items-start relative group">
                <div className="flex-shrink-0 w-24 pt-2">
                  <div className="text-xs font-mono text-slate-400 bg-background px-2 py-1 rounded inline-flex items-center gap-1">
                    <Clock size={10} />
                    {seg.start.toFixed(1)}s
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{duration}s</div>
                  
                  <div className="mt-2">
                     {seg.status === 'ready' && <CheckCircle size={16} className="text-green-500" />}
                     {seg.status === 'generating' && <RefreshCw size={16} className="text-blue-500 animate-spin" />}
                     {seg.status === 'error' && <AlertCircle size={16} className="text-red-500" />}
                  </div>
                </div>

                <div className="flex-grow space-y-3">
                  <div className="text-sm text-slate-400 italic border-l-2 border-slate-600 pl-2">
                    "{seg.originalText}"
                  </div>
                  
                  <textarea
                    value={seg.translatedText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateSegment(seg.id, e.target.value)}
                    className="w-full bg-background/50 border border-slate-700 rounded-lg p-3 text-white focus:ring-1 focus:ring-accent focus:outline-none min-h-[80px]"
                  />
                  
                  <div className="flex justify-between items-center text-xs">
                     <span className={diffColor}>
                       {charCount} / {target} chars 
                       {Math.abs(diff) > 5 && (diff > 0 ? ' (Too Long)' : ' (Too Short)')}
                     </span>
                  </div>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};