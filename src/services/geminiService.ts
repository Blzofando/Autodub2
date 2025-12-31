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
    4. Ensure the translation is concise.
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
      // 16 chars/s é uma boa média para PT-BR
      const targetCharCount = Math.floor(duration * 16);
      
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
  
  // Prepara os dados com limites explícitos para a IA
  const segmentsToRefine = segments.map(s => {
    const duration = s.end - s.start;
    const ideal = Math.floor(duration * 16); // 16 chars por segundo
    return { 
      id: s.id, 
      currentText: s.translatedText, 
      duration: duration.toFixed(1) + "s",
      minChars: Math.max(5, ideal - 6), // Tolerância de -6
      maxChars: ideal + 6               // Tolerância de +6 (Total 12 variação)
    };
  });

  const prompt = `
    You are a Dubbing Script Adapter. Your GOAL is to rewrite the Portuguese text to fit exactly into the time slot.
    
    STRICT RULES:
    1. The 'refinedText' character count MUST be between 'minChars' and 'maxChars'.
    2. Maintain the original meaning but change words/phrasing to meet the length constraints.
    3. If the text is too long, summarize or remove filler words.
    4. If the text is too short, add natural filler words or be more descriptive.
    
    Input Data:
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
    console.warn("Refinement failed, returning original.", e);
    return segments;
  }
};

