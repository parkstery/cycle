
import { GoogleGenAI } from "@google/genai";
import { ElevationPoint } from "../types";

export const getCyclingStrategy = async (elevationData: ElevationPoint[]): Promise<string> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    return "일정한 속도를 유지하고 전방을 주시하며 안전하게 라이딩하세요.";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // 고도 데이터 샘플링 (100개 중 10개만 추출하여 토큰 절약)
  const samples = elevationData
    .filter((_, i) => i % 10 === 0)
    .map(p => p.elevation.toFixed(1));

  const prompt = `
    당신은 프로 사이클링 코치입니다. 다음 고도 변화 데이터를 분석하여 라이더에게 필요한 짧은 조언을 한 문장(20자 이내)으로 하세요.
    고도 데이터: [${samples.join(', ')}]
    조건: 한국어로 답변하고, 매우 전문적이면서도 격려하는 말투를 사용하세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || "오늘도 안전하고 즐거운 라이딩 되세요!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "고도 변화에 맞춰 기어비를 조절하며 페이스를 유지하세요.";
  }
};
