import React, { useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useApiKeys } from '../contexts/ApiKeyContext';
import { extractAudioFromVideo, processAndMergeAudio } from '../services/ffmpegService';
import { transcribeAndTranslate, refineIsochronicText } from '../services/geminiService';
import { generateSegmentAudio } from '../services/openaiService';
import { FileUpload } from './FileUpload';
import { TimelineEditor } from './TimelineEditor';
import { Loader2, Wand2, Mic2, Layers, Download, AlertCircle } from 'lucide-react';

export const Steps: React.FC = () => {
  const { 
    file, 
    segments, 
    setSegments, 
    isTranscribing, 
    isProcessingAudio,
    setProcessing,
    setFinalOutput,
    finalOutputUrl,
    selectedVoice,
    updateSegmentStatus
  } = useProject();
  
  const { keys, hasKeys } = useApiKeys();
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState('');

  const handleTranscribe = async () => {
    if (!file || !hasKeys) return;
    setProcessing(true, false);
    setProgress('Downloading audio engine...'); // Initial FFmpeg loading message
    
    try {
      // Step 1: Initialize FFmpeg and Extract Audio
      const audioBlob = await extractAudioFromVideo(file);
      
      // Step 2: Transcribe via Gemini
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = (reader.result as string).split(',')[1];
          setProgress('AI Analysis & Translation...');
          const rawSegments = await transcribeAndTranslate(keys.geminiKey, base64data, 'audio/mp3'); // Mime type for Gemini
          setSegments(rawSegments);
          setProcessing(false, false);
          setCurrentStep(2);
        } catch (innerError: any) {
          console.error(innerError);
          alert("Transcription Error: " + innerError.message);
          setProcessing(false, false);
        }
      };
      
      reader.onerror = () => {
        alert("File reading failed.");
        setProcessing(false, false);
      };

      reader.readAsDataURL(audioBlob);

    } catch (e: any) {
      console.error("Audio Engine Error:", e);
      setProcessing(false, false);
      alert(e.message || 'Failed to process audio. Check console for details.');
    }
  };

  const handleAutoRefine = async () => {
    setProcessing(true, false);
    setProgress('Synchronizing lengths...');
    try {
      const refined = await refineIsochronicText(keys.geminiKey, segments);
      setSegments(refined);
    } finally {
      setProcessing(false, false);
    }
  };

  const handleGenerateTTS = async () => {
    setProcessing(false, true);
    let newSegments = [...segments];
    
    for (let i = 0; i < newSegments.length; i++) {
       const seg = newSegments[i];
       updateSegmentStatus({ ...seg, status: 'generating' as any });
       const result = await generateSegmentAudio(keys.openaiKey, seg, selectedVoice);
       updateSegmentStatus(result);
       newSegments[i] = result; 
    }
    
    setSegments(newSegments);
    setProcessing(false, false);
    setCurrentStep(3);
  };

  const handleMerge = async () => {
    setProcessing(false, true);
    setProgress('Rendering final mix...');
    try {
      const lastSeg = segments[segments.length - 1];
      const totalDur = lastSeg ? lastSeg.end + 1 : 10; // Ensure total duration is reasonable
      
      const url = await processAndMergeAudio(segments, totalDur);
      
      setFinalOutput(url);
    } catch (e: any) {
      console.error(e);
      alert('Mixing failed: ' + e.message);
    } finally {
      setProcessing(false, false);
    }
  };

  const btnClass = "bg-primary hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-primary/20";

  return (
    <div className="space-y-8">
      {/* Stepper UI */}
      <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex items-center gap-2 ${currentStep >= s ? 'text-white' : 'text-slate-600'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep >= s ? 'bg-primary' : 'bg-slate-800'}`}>
              {s}
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-[300px]">
        {!hasKeys && (
          <div className="bg-amber-900/10 border border-amber-900/40 text-amber-200 p-6 rounded-2xl flex items-start gap-4 mb-8 animate-pulse">
            <AlertCircle className="flex-shrink-0 mt-1" />
            <div>
              <p className="font-bold">API Keys Required</p>
              <p className="text-sm opacity-80">Please set up your API keys in the settings menu before proceeding.</p>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <FileUpload />
            <div className="flex justify-end">
              <button onClick={handleTranscribe} disabled={!file || isTranscribing || !hasKeys} className={btnClass}>
                {isTranscribing ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {isTranscribing ? progress : 'Start Dubbing'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
             <div className="flex justify-between items-center bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                <p className="text-slate-400 text-xs italic">Review the Brazilian Portuguese translation.</p>
                <button onClick={handleAutoRefine} disabled={isTranscribing || isProcessingAudio} className="text-xs text-accent hover:text-white flex items-center gap-1 font-bold">
                   <Wand2 size={14}/> Auto-Refine
                </button>
             </div>
             <TimelineEditor />
             <div className="flex justify-end gap-4 mt-8 sticky bottom-4 bg-background/90 p-4 rounded-2xl border border-slate-700 backdrop-blur shadow-2xl">
                <button onClick={() => setCurrentStep(1)} className="text-slate-400 hover:text-white text-sm px-4">Restart</button>
                <button onClick={handleGenerateTTS} disabled={isProcessingAudio || !hasKeys} className={btnClass}>
                  {isProcessingAudio ? <Loader2 className="animate-spin" /> : <Mic2 />}
                  Generate Voices
                </button>
             </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-8 py-8">
            {!finalOutputUrl ? (
              <div className="text-center space-y-6">
                <div className="bg-surface/30 p-10 rounded-[2.5rem] border border-slate-800 inline-block">
                  <Mic2 size={48} className="text-primary mx-auto mb-4 opacity-50" />
                  <h3 className="text-xl font-bold">Sync Complete</h3>
                  <p className="text-slate-400 max-w-xs mx-auto mt-2">All AI voice segments are generated and ready for mixing.</p>
                </div>
                <div className="flex justify-center">
                  <button onClick={handleMerge} disabled={isProcessingAudio} className={btnClass}>
                    {isProcessingAudio ? <Loader2 className="animate-spin" /> : <Layers />}
                    {isProcessingAudio ? progress : 'Export Final Master'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-green-500/5 border border-green-500/20 p-10 rounded-[2.5rem] flex flex-col items-center animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-500/20">
                   <Download className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Success!</h3>
                <p className="text-slate-400 mb-8 text-center">Audio rendered with pitch-preserving time-stretching.</p>
                <audio controls src={finalOutputUrl} className="w-full max-w-md mb-8 custom-audio" />
                <div className="flex flex-col gap-4 w-full max-w-xs">
                  <a href={finalOutputUrl} download="dub_master.mp3" className="bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-8 rounded-2xl flex items-center justify-center gap-2">
                    <Download size={20} /> Download MP3
                  </a>
                  <button onClick={() => window.location.reload()} className="text-slate-500 hover:text-slate-300 text-sm">New Project</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};