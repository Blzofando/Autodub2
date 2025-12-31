import OpenAI from "openai";
import { Segment, VoiceOption, SegmentStatus } from "../types";
import { OPENAI_TTS_MODEL_ID } from "../constants";

export const generateSegmentAudio = async (
  apiKey: string,
  segment: Segment,
  voice: VoiceOption
): Promise<Segment> => {
  // Ensure we have a key, even if dummy, to prevent immediate SDK crash
  const safeKey = apiKey || 'dummy-key'; 
  
  const openai = new OpenAI({
    apiKey: safeKey,
    dangerouslyAllowBrowser: true 
  });

  try {
    if (!apiKey) throw new Error("Missing OpenAI API Key");

    const response = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL_ID,
      voice: voice,
      input: segment.translatedText,
      response_format: 'mp3',
    });

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    
    // We need the duration of the generated audio to calculate time-stretch ratio later
    const duration = await getAudioDuration(blob);

    return {
      ...segment,
      status: SegmentStatus.Ready,
      audioUrl,
      audioDuration: duration
    };
  } catch (error) {
    console.error(`TTS Error for segment ${segment.id}:`, error);
    return {
      ...segment,
      status: SegmentStatus.Error,
    };
  }
};

const getAudioDuration = (blob: Blob): Promise<number> => {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        URL.revokeObjectURL(url); // Cleanup
        resolve(duration);
      };

      audio.onerror = () => {
        console.warn("Failed to load audio for duration calculation");
        URL.revokeObjectURL(url);
        resolve(0); // Fallback
      };
    } catch (e) {
      console.error("Error creating Audio element:", e);
      resolve(0);
    }
  });
};
