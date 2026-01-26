
import { GoogleGenAI, Type } from "@google/genai";
import { CoachingData, ElevationPoint } from "../types";

declare var google: any;

export const getAdvancedCoaching = async (
  currentElevation: number,
  upcomingPoints: ElevationPoint[],
  currentSpeed: number
): Promise<CoachingData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Calculate accurate slope
  let slope = 0;
  if (upcomingPoints.length > 1) {
    // Check if google maps geometry library is loaded
    if (typeof google !== 'undefined' && google.maps && google.maps.geometry) {
      const start = upcomingPoints[0];
      const end = upcomingPoints[upcomingPoints.length - 1];
      const distance = google.maps.geometry.spherical.computeDistanceBetween(start.location, end.location);
      const rise = end.elevation - start.elevation;
      
      if (distance > 0) {
        slope = (rise / distance) * 100;
      }
    }
  }

  // 2. Determine Gear based on Slope (PM's Strict Table)
  let recommendedGear = 6; // Default to Flat (Gear 6)
  
  if (slope >= 10) recommendedGear = 1;      // 10% or more
  else if (slope >= 7) recommendedGear = 2;  // 7% ~ 10%
  else if (slope >= 5) recommendedGear = 3;  // 5% ~ 7%
  else if (slope >= 3) recommendedGear = 4;  // 3% ~ 5%
  else if (slope >= 1) recommendedGear = 5;  // 1% ~ 3%
  else if (slope >= -1) recommendedGear = 6; // -1% ~ +1% (Flat)
  else if (slope >= -3) recommendedGear = 7; // -1% ~ -3%
  else recommendedGear = 8;                  // -3% or less

  // Map to ordinal strings
  const ordinals: {[key: number]: string} = {
    1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 
    5: "5th", 6: "6th", 7: "7th", 8: "8th"
  };
  const gearText = ordinals[recommendedGear];

  // 3. AI Generation for Tip & Intensity
  const elevationSamples = upcomingPoints.map(p => p.elevation.toFixed(1));
  
  const prompt = `
    Context: 
    - Current Elevation: ${currentElevation}m
    - Upcoming Elevation: [${elevationSamples.join(', ')}]
    - Slope: ${slope.toFixed(1)}%
    - Current Speed: ${currentSpeed}km/h
    - Mandatory Gear: ${gearText}
    
    Task: Act as a pro cycling coach. Analyze the terrain and provide structured coaching.
    The 'tip' must be in English, motivating, and professional (max 15 words).
    Do NOT suggest a different gear in the tip.
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
            tip: { type: Type.STRING, description: "Professional cycling tip in English." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    
    const originalTip = data.tip || "Maintain a steady cadence.";
    // Enforce the calculated gear in the parenthesis
    const tipWithGear = `${originalTip} (Shift to ${gearText} gear.)`;

    return {
      tip: tipWithGear,
      gear: gearText, 
      intensity: (data.intensity as any) || "MODERATE",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    console.error("Coaching Error:", error);
    return {
      tip: `Maintain a steady pace. (Shift to ${gearText} gear.)`,
      gear: gearText,
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};
