import { GoogleGenAI, Type } from "@google/genai";
import { CoachingData, ElevationPoint } from "../types";

declare var google: any;

const FALLBACK_TIPS = [
  "Keep your cadence smooth.",
  "Relax your shoulders.",
  "Focus on your breathing rhythm.",
  "Maintain steady power.",
  "Look ahead, stay sharp.",
  "Consistency is key here.",
  "Pedal in circles, not squares.",
  "Save energy for the climbs.",
  "Stay loose on the bars."
];

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
  let recommendedGear = 4; // Default to Flat (Gear 4)
  
  // Reversed logic: Higher slope -> Higher gear number (centered on Flat=4)
  if (slope >= 10) recommendedGear = 8;      // 10% or more
  else if (slope >= 7) recommendedGear = 8;  // 7% ~ 10%
  else if (slope >= 5) recommendedGear = 7;  // 5% ~ 7%
  else if (slope >= 3) recommendedGear = 6;  // 3% ~ 5%
  else if (slope >= 1) recommendedGear = 5;  // 1% ~ 3%
  else if (slope >= -1) recommendedGear = 4; // -1% ~ +1% (Flat)
  else if (slope >= -3) recommendedGear = 3; // -1% ~ -3%
  else recommendedGear = 2;                  // -3% or less

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
    - Slope: ${slope.toFixed(1)}%
    - Speed: ${currentSpeed}km/h
    - Gear: ${gearText}
    
    Task: Provide a SHORT, PUNCHY, and VARIED cycling coaching tip (max 10 words).
    Avoid repetitive phrases like "Maintain a steady pace". Mix up the advice (focus on breathing, form, vision, or encouragement).
    Do NOT suggest a different gear in the tip text itself.
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
            tip: { type: Type.STRING, description: "Short, varied professional cycling tip." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    
    const originalTip = data.tip || FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    // Enforce the calculated gear in the parenthesis
    const tipWithGear = `${originalTip} (Shift to ${gearText} gear)`;

    return {
      tip: tipWithGear,
      gear: gearText, 
      intensity: (data.intensity as any) || "MODERATE",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    // Pick a random fallback message to ensure variety even when API fails
    const randomTip = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    return {
      tip: `${randomTip} (Shift to ${gearText} gear)`,
      gear: gearText,
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};