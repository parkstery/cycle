
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
  previousResistance?: string
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

  // 2. Determine Resistance based on Slope (Correct Physics Logic)
  // Mapping:
  // Slope >= 10% (Extreme Uphill) -> Resistance 8 (Max Load) -> Action: Stand/Grind
  // 7% <= Slope < 10% (Strong Uphill) -> Resistance 7 (Very Heavy) -> Action: Heavy Pedal
  // 3% <= Slope < 7% (Moderate Uphill) -> Resistance 5-6 (Heavy) -> Action: Steady Rhythm
  // -1% <= Slope < 3% (Flat) -> Resistance 3-4 (Moderate) -> Action: Cruise
  // -3% <= Slope < -1% (Slight Downhill) -> Resistance 2 (Light) -> Action: High Cadence/Rest
  // Slope < -3% (Steep Downhill) -> Resistance 1 (Min Load) -> Action: Coast/Tuck

  let targetRes = 3;
  let contextDesc = "Flat - Cruising";

  if (slope >= 10) { targetRes = 8; contextDesc = "Extreme Uphill (MAX LOAD). 'Wall climbing' feel. Needs Standing."; }
  else if (slope >= 7) { targetRes = 7; contextDesc = "Steep Uphill (Very Heavy). Needs strong core & heavy torque."; }
  else if (slope >= 5) { targetRes = 6; contextDesc = "Moderate Uphill (Heavy). Maintaining steady climbing rhythm."; }
  else if (slope >= 3) { targetRes = 5; contextDesc = "Uphill Start. Breathing control required."; }
  else if (slope >= 1) { targetRes = 4; contextDesc = "False Flat. Maintenance pace."; }
  else if (slope >= -1) { targetRes = 3; contextDesc = "Flat. Cruising. Relax shoulders."; }
  else if (slope >= -3) { targetRes = 2; contextDesc = "Slight Downhill. Speed picks up. Spin fast or rest."; }
  else { targetRes = 1; contextDesc = "Steep Downhill (MIN LOAD). Gravity acceleration. Aero Tuck or Coasting."; }

  const resistanceText = `Resistance ${targetRes}`;

  // 3. AI Generation for Tip & Intensity
  const prompt = `
    Role: You are a Professional Indoor Cycling Coach.
    
    Current Status: 
    - Slope: ${slope.toFixed(1)}%
    - Target Dial: ${targetRes} / 8 (${contextDesc})
    - Speed: ${currentSpeed} km/h
    - Previous Dial: ${previousResistance || 'None'}
    
    Task: Provide a SHORT, PUNCHY coaching command (max 10 words).
    
    Strategy Combinations:
    - If Uphill (Res 5-8): Command to increase resistance. Mention posture (e.g., "Stand up", "Hips back"). Mental push ("Crush it", "Don't give up").
    - If Flat (Res 3-4): Command to maintain rhythm. Posture (e.g., "Shoulders down", "Smooth circles").
    - If Downhill (Res 1-2): Command to drop resistance. Action (e.g., "Aero tuck", "Recover legs", "Enjoy the speed").

    Output constraints:
    - Tone: Authoritative, motivating, sensory.
    - JSON format only.
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
    
    // Conditionally append resistance change message if it changed
    let tipWithRes = originalTip;
    if (resistanceText !== previousResistance) {
        // Shorten the message for UI
        tipWithRes = `${originalTip} (Set to ${targetRes})`;
    }

    return {
      tip: tipWithRes,
      resistance: resistanceText, 
      intensity: (data.intensity as any) || "MODERATE",
      action: (data.action as any) || "PEDAL"
    };
  } catch (error) {
    const randomTip = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
    let tipWithRes = randomTip;
    if (resistanceText !== previousResistance) {
        tipWithRes = `${randomTip} (Set to ${targetRes})`;
    }

    return {
      tip: tipWithRes,
      resistance: resistanceText,
      intensity: "MODERATE",
      action: "PEDAL"
    };
  }
};
