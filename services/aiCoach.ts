
import { GoogleGenAI, Type } from "@google/genai";
import { CoachingData, ElevationPoint } from "../types";

declare var google: any;

const FALLBACK_TIPS = [
  "Maintain steady breathing. Keep core engaged.",
  "Relax shoulders. Focus on smooth pedal strokes.",
  "Eyes forward. Energy management is key here.",
  "Stable hips. Let the large muscle groups work.",
  "Efficiency over speed. Find your rhythm."
];

export const getAdvancedCoaching = async (
  currentIndex: number,
  allElevationPoints: ElevationPoint[],
  pathLength: number,
  currentSpeed: number,
  previousResistance?: string
): Promise<CoachingData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Predict for the next ~500m to 1km (approx 250 densified points if segment is 2m)
  const LOOK_AHEAD = 250; 
  const targetEndIndex = Math.min(currentIndex + LOOK_AHEAD, allElevationPoints.length - 1);
  const segment = allElevationPoints.slice(
    Math.floor((currentIndex / pathLength) * allElevationPoints.length),
    Math.floor((targetEndIndex / pathLength) * allElevationPoints.length)
  );

  let avgSlope = 0;
  if (segment.length > 1) {
    const start = segment[0];
    const end = segment[segment.length - 1];
    const distance = google.maps.geometry.spherical.computeDistanceBetween(start.location, end.location);
    const rise = end.elevation - start.elevation;
    if (distance > 0) avgSlope = (rise / distance) * 100;
  }

  // Physics-based resistance logic
  let targetRes = 3;
  let context = "flat";
  if (avgSlope >= 7) { targetRes = 7; context = "steep climb"; }
  else if (avgSlope >= 3) { targetRes = 5; context = "moderate climb"; }
  else if (avgSlope >= -1) { targetRes = 3; context = "rolling/flat"; }
  else if (avgSlope >= -5) { targetRes = 2; context = "downhill"; }
  else { targetRes = 1; context = "steep descent"; }

  const prompt = `
    Role: Professional Cycling Coach.
    Analysis Segment: Next 500 meters (${context}, average slope ${avgSlope.toFixed(1)}%).
    Speed: ${currentSpeed} km/h.
    
    Task: Provide ONE coaching tip that covers this ENTIRE segment.
    Output JSON: { "tip": "string", "intensity": "LOW|MODERATE|HIGH|MAX", "action": "SIT|STAND|TUCK|PEDAL" }
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
            tip: { type: Type.STRING },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      tip: `${data.tip || FALLBACK_TIPS[0]} (Target Res: ${targetRes})`,
      resistance: `Resistance ${targetRes}`,
      intensity: data.intensity || "MODERATE",
      action: data.action || "PEDAL",
      validUntilIndex: targetEndIndex
    };
  } catch (error) {
    return {
      tip: `${FALLBACK_TIPS[0]} (Target Res: ${targetRes})`,
      resistance: `Resistance ${targetRes}`,
      intensity: "MODERATE",
      action: "PEDAL",
      validUntilIndex: targetEndIndex
    };
  }
};
