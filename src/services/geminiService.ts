import { GoogleGenAI, Type } from "@google/genai";
import { Segment, SegmentStatus } from "../types";
import { GEMINI_MODEL_ID } from "../constants";

// REDUZIDO DE 16 PARA 12 PARA EVITAR VOZ ACELERADA
const SAFE_CHARS_PER_SEC = 12; 

export const transcribeAndTranslate = async (
  apiKey: string,
  audioBase64: string,
  mimeType: string
): Promise<Segment[]> => {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this audio file. 
    1. Identify distinct speech segments.
    2. Transcribe the spoken text.
    3. Translate to Brazilian Portuguese (pt-br).
    4. CRITICAL: The translation MUST be extremely concise to fit fast-paced dialogue.
    5. Return a JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
      contents: {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.NUMBER },
              end: { type: Type.NUMBER },
              originalText: { type: Type.STRING },
              translatedText: { type: Type.STRING },
            },
            required: ["start", "end", "originalText", "translatedText"],
          },
        },
      },
    });

    const jsonText = response.text || "[]";
    const rawSegments = JSON.parse(jsonText);

    return rawSegments.map((s: any, index: number) => {
      const duration = s.end - s.start;
      const targetCharCount = Math.floor(duration * SAFE_CHARS_PER_SEC);
      
      return {
        id: index,
        start: s.start,
        end: s.end,
        originalText: s.originalText,
        translatedText: s.translatedText,
        targetCharCount, // Meta mais rigorosa
        status: SegmentStatus.Idle,
      };
    });

  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

export const refineIsochronicText = async (
  apiKey: string,
  segments: Segment[]
): Promise<Segment[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const segmentsToRefine = segments.map(s => {
    const duration = s.end - s.start;
    // Força a IA a ser breve
    const ideal = Math.floor(duration * SAFE_CHARS_PER_SEC); 
    return { 
      id: s.id, 
      currentText: s.translatedText, 
      duration: duration.toFixed(2) + "s",
      maxChars: ideal // Limite máximo estrito
    };
  });

  const prompt = `
    You are a Dubbing Adapter. Resize the Portuguese text to fit the duration.
    
    STRICT CONSTRAINT: 
    The 'refinedText' length MUST be equal or less than 'maxChars'.
    It is better to have a shorter sentence than a long one that requires speeding up the audio.
    Remove adjectives, adverbs, and filler words if necessary. Keep only the core meaning.
    
    Input:
    ${JSON.stringify(segmentsToRefine)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              refinedText: { type: Type.STRING }
            }
          }
        }
      }
    });

    const updates = JSON.parse(response.text || "[]");
    
    return segments.map(seg => {
      const update = updates.find((u: any) => u.id === seg.id);
      return update ? { ...seg, translatedText: update.refinedText } : seg;
    });

  } catch (e) {
    return segments;
  }
};
