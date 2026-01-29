import { GoogleGenAI, Type } from "@google/genai";
import { CoachingData, ElevationPoint } from "../types";

declare var google: any;

const FALLBACK_TIPS = [
  // Form
  "Elbows soft. Upper body quiet.",
  "Hips stable. Let legs work.",
  "Relax your grip. No white knuckles.",
  "Core tight. Stop bouncing.",
  "Smooth circles, not stomps.",

  // Breathing
  "Deep breath. Long exhale.",
  "Breathe low. Stay calm.",
  "Control breath before speed.",
  "Steady lungs, steady legs.",

  // Power & Cadence
  "Light feet. Faster spin.",
  "Ease power. Find rhythm.",
  "Hold cadence. Ignore speed.",
  "Even pressure through the stroke.",
  "Save watts. Ride efficient.",

  // Terrain-aware feel
  "Stay tall. Let the hill come.",
  "Float the pedals here.",
  "Settle in. This section lasts.",
  "Let gravity work for you.",

  // Mental / Focus
  "Eyes up. Line stays clean.",
  "Calm mind. Strong legs.",
  "No rush. Ride smart.",
  "Focus now. Free speed ahead."
];

export const getAdvancedCoaching = async (
  currentElevation: number,
  upcomingPoints: ElevationPoint[],
  currentSpeed: number,
  previousGear?: string
): Promise<CoachingData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY });
  
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
  // Determine Context/Focus Area based on Slope
  let focusArea = "Form (Aero) & Rhythm";
  let direction = "Maintain aero posture, circular pedaling, efficiency.";

  if (slope >= 3) {
    focusArea = "Power & Breathing";
    direction = "Control heart rate, maintain cadence, relax upper body.";
  } else if (slope <= -3) {
    focusArea = "Form & Vision";
    direction = "Shift weight back, look far ahead, engage core.";
  }

  const prompt = `
    Role: You are a National Team Cycling Coach. Your tone is authoritative, sensory, and immediate.
    
    Context: 
    - Slope: ${slope.toFixed(1)}% (${slope >= 3 ? 'Climbing' : slope <= -3 ? 'Descending' : 'Flat'})
    - Speed: ${currentSpeed}km/h
    - Gear: ${gearText}
    - Priority Focus: ${focusArea}
    
    Task: Provide a SHORT, PUNCHY coaching command (max 10 words).
    - Style: Imperative ("Do this", "Don't do that"), Sensory ("Feel the...", "Quiet upper body").
    - Direction: ${direction}
    - Prohibition: No abstract praise like "Good job". No gear suggestions in the tip (handled separately).
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
            tip: { type: Type.STRING, description: "Short, sensory, imperative coaching command." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    
    const originalTip = data.tip || FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    
    // Conditionally append gear shift message
    let tipWithGear = originalTip;
    if (gearText !== previousGear) {
        tipWithGear = `${originalTip} (Shift to ${gearText} gear)`;
    }

    return {
      tip: tipWithGear,
      gear: gearText, 
      intensity: (data.intensity as any) || "MODERATE",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    // Pick a random fallback message to ensure variety even when API fails
    const randomTip = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    let tipWithGear = randomTip;
    if (gearText !== previousGear) {
        tipWithGear = `${randomTip} (Shift to ${gearText} gear)`;
    }

    return {
      tip: tipWithGear,
      gear: gearText,
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};