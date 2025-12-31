import { GoogleGenAI, Type } from "@google/genai";
import { Segment, SegmentStatus } from "../types";
import { GEMINI_MODEL_ID, DEFAULT_TARGET_CHARS_PER_SEC } from "../constants";

export const transcribeAndTranslate = async (
  apiKey: string,
  audioBase64: string,
  mimeType: string
): Promise<Segment[]> => {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this audio file. 
    1. Identify distinct speech segments.
    2. Transcribe the spoken text (detect language automatically).
    3. Translate the text into Brazilian Portuguese (pt-br).
    4. Ensure the translation is concise and fits the time window.
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
              start: { type: Type.NUMBER, description: "Start time in seconds" },
              end: { type: Type.NUMBER, description: "End time in seconds" },
              originalText: { type: Type.STRING, description: "Original transcription" },
              translatedText: { type: Type.STRING, description: "Portuguese translation" },
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
      const targetCharCount = Math.floor(duration * DEFAULT_TARGET_CHARS_PER_SEC);
      
      return {
        id: index,
        start: s.start,
        end: s.end,
        originalText: s.originalText,
        translatedText: s.translatedText,
        targetCharCount,
        status: SegmentStatus.Idle,
      };
    });

  } catch (error) {
    console.error("Gemini Transcription Error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

export const refineIsochronicText = async (
  apiKey: string,
  segments: Segment[]
): Promise<Segment[]> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const segmentsToRefine = segments.map(s => ({ 
    id: s.id, 
    translatedText: s.translatedText, 
    duration: s.end - s.start,
    targetCharCount: s.targetCharCount 
  }));

  const prompt = `
    You are a highly skilled professional Dubbing Script Adapter.
    Your task is to precisely rewrite the 'translatedText' for each segment to achieve "isochronic" dubbing.
    This means the rewritten text MUST fit the 'duration' of the segment when spoken, without rushing or dragging.
    The 'targetCharCount' provides an ideal length (approximately 16 characters per second).
    Adjust the text to be slightly longer or shorter as needed to meet the target duration.
    DO NOT change the core meaning or introduce new information. Focus on conciseness and flow.
    
    Return a JSON array with 'id' and 'refinedText' for each segment.

    Input JSON Segments:
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
    
    // Merge updates
    return segments.map(seg => {
      const update = updates.find((u: any) => u.id === seg.id);
      return update ? { ...seg, translatedText: update.refinedText } : seg;
    });

  } catch (e) {
    console.warn("Isochronic refinement failed, returning original segments.", e);
    return segments;
  }
};
