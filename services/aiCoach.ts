
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

/**
 * Advanced AI Coach using Predictive Analysis (Option 2)
 * Analyzes a large segment ahead and provides a single strategic tip for that segment.
 */
export const getAdvancedCoaching = async (
  currentIndex: number,
  allElevationPoints: ElevationPoint[],
  pathLength: number,
  currentSpeed: number,
  previousResistance?: string
): Promise<CoachingData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Predict for the next ~500m (approx 250 densified points if segment is 2m)
  const LOOK_AHEAD_INDEX_GAP = 250; 
  const targetEndIndex = Math.min(currentIndex + LOOK_AHEAD_INDEX_GAP, pathLength - 1);
  
  // Extract elevation segment for analysis
  // Mapping simulation path index to elevation points array index
  const elevStartIdx = Math.floor((currentIndex / pathLength) * allElevationPoints.length);
  const elevEndIdx = Math.floor((targetEndIndex / pathLength) * allElevationPoints.length);
  const segment = allElevationPoints.slice(elevStartIdx, elevEndIdx + 1);

  let avgSlope = 0;
  if (segment.length > 1) {
    const start = segment[0];
    const end = segment[segment.length - 1];
    if (typeof google !== 'undefined' && google.maps && google.maps.geometry) {
      const distance = google.maps.geometry.spherical.computeDistanceBetween(start.location, end.location);
      const rise = end.elevation - start.elevation;
      if (distance > 0) {
        avgSlope = (rise / distance) * 100;
      }
    }
  }

  // Determine resistance and context for the segment
  let targetRes = 3;
  let context = "flat terrain";
  if (avgSlope >= 7) { targetRes = 7; context = "steep climb"; }
  else if (avgSlope >= 3) { targetRes = 5; context = "moderate climb"; }
  else if (avgSlope >= -1) { targetRes = 3; context = "mostly flat"; }
  else if (avgSlope >= -5) { targetRes = 2; context = "downhill stretch"; }
  else { targetRes = 1; context = "steep descent"; }

  const prompt = `
    Role: Professional Cycling Coach.
    Analysis Segment: The next 500 meters are ${context} (Average Slope: ${avgSlope.toFixed(1)}%).
    Current Rider Speed: ${currentSpeed} km/h.
    
    Task: Provide ONE coaching tip that covers this ENTIRE segment strategy.
    
    Output constraints:
    - Tip should be sensory and tactical.
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
            tip: { type: Type.STRING, description: "A punchy coaching tip for the segment." },
            intensity: { type: Type.STRING, enum: ['LOW', 'MODERATE', 'HIGH', 'MAX'] },
            action: { type: Type.STRING, enum: ['SIT', 'STAND', 'TUCK', 'PEDAL'] }
          },
          required: ["tip", "intensity", "action"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    const tip = data.tip || FALLBACK_TIPS[0];
    const finalTip = `${tip} (Set Resistance to ${targetRes})`;

    return {
      tip: finalTip,
      resistance: `Resistance ${targetRes}`,
      intensity: (data.intensity as any) || "MODERATE",
      action: (data.action as any) || "PEDAL",
      validUntilIndex: targetEndIndex
    };
  } catch (error) {
    return {
      tip: `${FALLBACK_TIPS[0]} (Set Resistance to ${targetRes})`,
      resistance: `Resistance ${targetRes}`,
      intensity: "MODERATE",
      action: "PEDAL",
      validUntilIndex: targetEndIndex
    };
  }
};
