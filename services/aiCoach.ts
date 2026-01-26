
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
    Also recommend a specific gear number for an 8-speed bike (1=easiest/climbing, 8=hardest/fast).
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
            numericGear: { type: Type.INTEGER, description: "Specific gear number (1-8) based on slope and speed." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "gear", "numericGear", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    
    // Map number to ordinal string (1-8)
    const ordinals: {[key: number]: string} = {
      1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 
      5: "5th", 6: "6th", 7: "7th", 8: "8th"
    };
    
    const numGear = data.numericGear || 4;
    const gearText = ordinals[numGear] || `${numGear}th`;
    const originalTip = data.tip || "Maintain a steady cadence.";
    const tipWithGear = `${originalTip} (Shift to ${gearText} gear.)`;

    return {
      tip: tipWithGear,
      gear: data.gear || "MID",
      intensity: (data.intensity as any) || "LOW",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    console.error("Coaching Error:", error);
    return {
      tip: "Maintain a steady pace. (Shift to 4th gear.)",
      gear: "MID",
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};
