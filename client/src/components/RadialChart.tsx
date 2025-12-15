import { useMemo } from "react";

interface TimeDivision {
  label: string;
  minutes: number;
  percentage: number;
  color: string;
}

interface RadialChartProps {
  divisions: TimeDivision[];
}

export function RadialChart({ divisions }: RadialChartProps) {
  const chartData = useMemo(() => {
    const size = 120;
    const center = size / 2;
    const innerRadius = 30;
    const outerRadius = 57;
    const segmentWidth = (outerRadius - innerRadius) / divisions.length;

    let cumulativePercent = 0;
    const segments = divisions.map((division, idx) => {
      const startPercent = cumulativePercent;
      const endPercent = cumulativePercent + division.percentage;
      cumulativePercent = endPercent;

      const radius = innerRadius + segmentWidth * (idx + 1);
      const prevRadius = innerRadius + segmentWidth * idx;

      // Convert percentage to radians (starting from top, going clockwise)
      const startAngle = (startPercent / 100) * 2 * Math.PI - Math.PI / 2;
      const endAngle = (endPercent / 100) * 2 * Math.PI - Math.PI / 2;

      // Calculate arc path
      const startX = center + prevRadius * Math.cos(startAngle);
      const startY = center + prevRadius * Math.sin(startAngle);

      const endX = center + prevRadius * Math.cos(endAngle);
      const endY = center + prevRadius * Math.sin(endAngle);

      const outerStartX = center + radius * Math.cos(startAngle);
      const outerStartY = center + radius * Math.sin(startAngle);

      const outerEndX = center + radius * Math.cos(endAngle);
      const outerEndY = center + radius * Math.sin(endAngle);

      const largeArc = endPercent - startPercent > 50 ? 1 : 0;

      // Create SVG path for arc
      const path = `
        M ${startX} ${startY}
        A ${prevRadius} ${prevRadius} 0 ${largeArc} 1 ${endX} ${endY}
        L ${outerEndX} ${outerEndY}
        A ${radius} ${radius} 0 ${largeArc} 0 ${outerStartX} ${outerStartY}
        Z
      `;

      // Calculate label position
      const labelAngle = (startAngle + endAngle) / 2;
      const labelRadius = (prevRadius + radius) / 2;
      const labelX = center + labelRadius * Math.cos(labelAngle);
      const labelY = center + labelRadius * Math.sin(labelAngle);

      return {
        path,
        color: division.color,
        labelX,
        labelY,
        percentage: division.percentage.toFixed(1),
      };
    });

    return { size, center, segments };
  }, [divisions]);

  return (
    <svg
      width={chartData.size}
      height={chartData.size}
      className="flex-shrink-0"
    >
      {/* Background circle */}
      <circle
        cx={chartData.center}
        cy={chartData.center}
        r={60}
        fill="rgba(0, 0, 0, 0.1)"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth="1"
      />

      {/* Segments */}
      {chartData.segments.map((segment, idx) => (
        <g key={idx}>
          <path
            d={segment.path}
            fill={segment.color}
            opacity="0.85"
            stroke="rgba(13, 13, 13, 0.5)"
            strokeWidth="1"
          />
          {/* Percentage label */}
          <text
            x={segment.labelX}
            y={segment.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-mono font-bold text-[9px] fill-black drop-shadow"
          >
            {segment.percentage}%
          </text>
        </g>
      ))}

      {/* Center circle */}
      <circle
        cx={chartData.center}
        cy={chartData.center}
        r={27}
        fill="#0d0d0d"
        stroke="rgba(0, 255, 0, 0.3)"
        strokeWidth="1"
      />

      {/* Center text */}
      <text
        x={chartData.center}
        y={chartData.center}
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-mono font-bold text-[9px] fill-primary"
      >
        24H
      </text>
    </svg>
  );
}

export function ChartLegend({ divisions }: RadialChartProps) {
  const hours = divisions.map((d) => Math.floor(d.minutes / 60));
  const mins = divisions.map((d) => d.minutes % 60);

  return (
    <div className="space-y-1.5">
      {divisions.map((division, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 text-[10px]"
          data-testid={`legend-${division.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <div
            className="w-2 h-2 flex-shrink-0 rounded"
            style={{ backgroundColor: division.color }}
          />
          <span className="font-mono uppercase tracking-tight text-foreground flex-1">
            {division.label.replace(/_/g, " ")}
          </span>
          <span className="font-mono font-bold text-primary">
            {hours[idx]}H {mins[idx]}M
          </span>
        </div>
      ))}
    </div>
  );
}
