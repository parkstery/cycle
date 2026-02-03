import React from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';

export interface ElevationChartViewProps {
  data: { elevation: number; location?: unknown }[];
  currentIndex: number;
  pathLength: number;
}

export default function ElevationChartView({ data, currentIndex, pathLength }: ElevationChartViewProps) {
  const refLineX = data.length > 0 && pathLength > 0
    ? Math.floor((currentIndex / pathLength) * (data.length - 1))
    : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey="elevation" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} isAnimationActive={false} />
        <ReferenceLine x={refLineX} stroke="#ffffff" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
