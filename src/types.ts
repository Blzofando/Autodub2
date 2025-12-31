export interface ApiKeys {
  geminiKey: string;
  openaiKey: string;
}

export enum SegmentStatus {
  Idle = 'idle',
  Generating = 'generating',
  Ready = 'ready',
  Error = 'error',
}

export interface Segment {
  id: number;
  start: number; // Seconds
  end: number;   // Seconds
  originalText: string;
  translatedText: string;
  targetCharCount?: number; // Calculated ideal length
  speaker?: string;
  status: SegmentStatus;
  audioUrl?: string; // Blob URL of the generated TTS
  audioDuration?: number; // Actual duration of the generated TTS file
}

export type VoiceOption = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'coral' | 'ash' | 'sage';

export interface ProjectState {
  file: File | null;
  audioUrl: string | null; // The original audio extracted
  segments: Segment[];
  isTranscribing: boolean;
  isProcessingAudio: boolean;
  selectedVoice: VoiceOption;
  finalOutputUrl: string | null;
}

export const OPENAI_VOICES: VoiceOption[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'ash', 'sage'];
