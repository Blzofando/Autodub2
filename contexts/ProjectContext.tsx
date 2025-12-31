import React, { createContext, useContext, useState } from 'react';
import { ProjectState, Segment, VoiceOption, OPENAI_VOICES } from '../types';

interface ProjectContextType extends ProjectState {
  setFile: (file: File) => void;
  setAudioUrl: (url: string) => void;
  setSegments: (segments: Segment[]) => void;
  updateSegment: (id: number, text: string) => void;
  updateSegmentStatus: (segment: Segment) => void;
  setProcessing: (transcribing: boolean, processingAudio: boolean) => void;
  setSelectedVoice: (voice: VoiceOption) => void;
  setFinalOutput: (url: string | null) => void;
  resetProject: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProjectState>({
    file: null,
    audioUrl: null,
    segments: [],
    isTranscribing: false,
    isProcessingAudio: false,
    selectedVoice: 'alloy',
    finalOutputUrl: null,
  });

  const setFile = (file: File) => setState(prev => ({ ...prev, file }));
  const setAudioUrl = (audioUrl: string) => setState(prev => ({ ...prev, audioUrl }));
  const setSegments = (segments: Segment[]) => setState(prev => ({ ...prev, segments }));
  
  const updateSegment = (id: number, text: string) => {
    setState(prev => ({
      ...prev,
      segments: prev.segments.map(s => s.id === id ? { ...s, translatedText: text } : s)
    }));
  };

  const updateSegmentStatus = (updatedSeg: Segment) => {
     setState(prev => ({
      ...prev,
      segments: prev.segments.map(s => s.id === updatedSeg.id ? updatedSeg : s)
    }));
  }

  const setProcessing = (transcribing: boolean, processingAudio: boolean) => {
    setState(prev => ({ ...prev, isTranscribing: transcribing, isProcessingAudio: processingAudio }));
  };

  const setSelectedVoice = (voice: VoiceOption) => setState(prev => ({ ...prev, selectedVoice: voice }));
  const setFinalOutput = (url: string | null) => setState(prev => ({ ...prev, finalOutputUrl: url }));
  
  const resetProject = () => setState({
    file: null,
    audioUrl: null,
    segments: [],
    isTranscribing: false,
    isProcessingAudio: false,
    selectedVoice: 'alloy',
    finalOutputUrl: null,
  });

  return (
    <ProjectContext.Provider value={{ 
      ...state, 
      setFile, 
      setAudioUrl, 
      setSegments, 
      updateSegment, 
      updateSegmentStatus,
      setProcessing, 
      setSelectedVoice,
      setFinalOutput,
      resetProject 
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
};