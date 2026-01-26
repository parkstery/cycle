
import { GoogleGenAI, Type } from "@google/genai";
import { CoachingData, ElevationPoint } from "../types";

export const getAdvancedCoaching = async (
  currentElevation: number,
  upcomingPoints: ElevationPoint[],
  currentSpeed: number
): Promise<CoachingData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const elevationSamples = upcomingPoints.map(p => p.elevation.toFixed(1));
  const avgSlope = upcomingPoints.length > 1 
    ? ((upcomingPoints[upcomingPoints.length-1].elevation - currentElevation) / upcomingPoints.length) * 100
    : 0;

  const prompt = `
    Context: 
    - Current Elevation: ${currentElevation}m
    - Upcoming Elevation (next 500m): [${elevationSamples.join(', ')}]
    - Average Slope: ${avgSlope.toFixed(1)}%
    - Current Speed: ${currentSpeed}km/h
    
    Task: Act as a pro cycling coach. Analyze the terrain and provide structured coaching.
    The 'tip' must be in English, motivating, and professional.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tip: { type: Type.STRING, description: "Professional cycling tip in English, max 15 words." },
            gear: { type: Type.STRING, description: "Recommended gear setting: 'LOW', 'MID', or 'HIGH'." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "gear", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      tip: data.tip || "It's flat. Maintain a steady cadence.",
      gear: data.gear || "MID",
      intensity: (data.intensity as any) || "LOW",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    console.error("Coaching Error:", error);
    return {
      tip: "Maintain a steady pace.",
      gear: "MID",
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};
