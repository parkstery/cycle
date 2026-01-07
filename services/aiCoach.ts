
import { GoogleGenAI } from "@google/genai";
import { ElevationPoint } from "../types";

export const getCyclingStrategy = async (elevationData: ElevationPoint[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const samples = elevationData.filter((_, i) => i % 15 === 0).map(p => p.elevation.toFixed(0));
  const prompt = `
    Context: Cycling route elevation profile is [${samples.join(',')}]. 
    Task: Give a pro cycling tip in EXACTLY one sentence, maximum 10 words. 
    Focus on gear choice or physical effort.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    // Truncate if model exceeds limit just in case
    let text = response.text || "Keep a steady cadence.";
    return text.split(' ').slice(0, 10).join(' ');
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Maintain steady effort.";
  }
};
