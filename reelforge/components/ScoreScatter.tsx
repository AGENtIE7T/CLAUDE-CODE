"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

export interface Point {
  x: number;
  y: number;
  title: string;
}

export default function ScoreScatter({ points, yLabel }: { points: Point[]; yLabel: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis type="number" dataKey="x" name="Critic score" domain={[0, 100]} tick={{ fontSize: 11, fill: "currentColor" }} label={{ value: "Critic score", position: "insideBottom", offset: -10, fontSize: 11, fill: "currentColor" }} />
          <YAxis type="number" dataKey="y" name={yLabel} width={48} tick={{ fontSize: 11, fill: "currentColor" }} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as Point | undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="font-semibold">{p.title}</p>
                  <p>Score {p.x} · {yLabel} {p.y.toLocaleString("en-IN")}</p>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="#ff3d6e" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
