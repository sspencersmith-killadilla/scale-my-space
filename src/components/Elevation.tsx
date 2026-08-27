import {
  faceDimensions,
  formatInches,
  modelOverall,
  resolveDenominator,
  type FaceKey,
  type PlanModel,
  type ScaleSettings,
} from "@/lib/plan-model";

interface Props {
  model: PlanModel;
  scale: ScaleSettings;
  face: FaceKey;
  width?: number;
}

/**
 * Scaled 2D elevation drawn straight from the plan model, so it always agrees
 * with the cut list. Dimensions shown are model (finished) inches.
 */
export function Elevation({ model, scale, face, width = 420 }: Props) {
  const d = resolveDenominator(model, scale);
  const faces = faceDimensions(model);
  const f = faces[face];
  const w = f.widthIn / d;
  const h = f.heightIn / d;
  const wallH = Math.min(model.overall.wallHeightIn / d, h);
  const gable = h - wallH > 0.02;

  const pad = 46;
  const inner = width - pad * 2;
  const px = inner / Math.max(w, 0.01);
  const drawH = h * px;
  const height = drawH + pad * 2;

  const x0 = pad;
  const y0 = pad;
  const openings = model.openings.filter((o) => o.face === face);
  const flip = face === "back" || face === "right";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`${f.label} drawing`}
    >
      <defs>
        <pattern id={`hatch-${face}`} width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--blueprint)" strokeWidth="0.7" opacity="0.35" />
        </pattern>
      </defs>

      {/* silhouette */}
      {gable ? (
        <polygon
          points={`${x0},${y0 + drawH} ${x0},${y0 + (h - wallH) * px} ${x0 + w * px / 2},${y0} ${x0 + w * px},${y0 + (h - wallH) * px} ${x0 + w * px},${y0 + drawH}`}
          fill={`url(#hatch-${face})`}
          stroke="var(--foreground)"
          strokeWidth="1.6"
        />
      ) : (
        <rect
          x={x0}
          y={y0}
          width={w * px}
          height={drawH}
          fill={`url(#hatch-${face})`}
          stroke="var(--foreground)"
          strokeWidth="1.6"
        />
      )}

      {/* wall / roof split line */}
      {gable && (
        <line
          x1={x0}
          y1={y0 + (h - wallH) * px}
          x2={x0 + w * px}
          y2={y0 + (h - wallH) * px}
          stroke="var(--blueprint)"
          strokeWidth="1"
          strokeDasharray="5 4"
        />
      )}

      {/* openings */}
      {openings.map((o, i) => {
        const ow = (o.widthIn / d) * px;
        const oh = (o.heightIn / d) * px;
        const rawX = (o.xIn / d) * px;
        const ox = flip ? x0 + w * px - rawX - ow : x0 + rawX;
        const oy = y0 + drawH - (o.yIn / d) * px - oh;
        const cols = Math.max(1, o.paneCols ?? 1);
        const linesRows = Math.max(1, o.paneRows ?? 1);
        return (
          <g key={i}>
            <rect
              x={ox}
              y={oy}
              width={ow}
              height={oh}
              fill="var(--card)"
              stroke="var(--foreground)"
              strokeWidth="1.1"
            />
            {o.kind === "window" &&
              Array.from({ length: cols - 1 }, (_, c) => (
                <line
                  key={`c${c}`}
                  x1={ox + (ow * (c + 1)) / cols}
                  y1={oy}
                  x2={ox + (ow * (c + 1)) / cols}
                  y2={oy + oh}
                  stroke="var(--blueprint)"
                  strokeWidth="0.8"
                />
              ))}
            {o.kind === "window" &&
              Array.from({ length: linesRows - 1 }, (_, rw) => (
                <line
                  key={`r${rw}`}
                  x1={ox}
                  y1={oy + (oh * (rw + 1)) / linesRows}
                  x2={ox + ow}
                  y2={oy + (oh * (rw + 1)) / linesRows}
                  stroke="var(--blueprint)"
                  strokeWidth="0.8"
                />
              ))}
            {o.kind === "door" && (
              <circle cx={ox + ow * 0.82} cy={oy + oh * 0.5} r="1.8" fill="var(--accent)" />
            )}
            {ow > 26 && (
              <text
                x={ox + ow / 2}
                y={oy - 3}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                style={{ font: "400 7.5px var(--font-mono)" }}
              >
                {formatInches(o.widthIn / d)}×{formatInches(o.heightIn / d)}
              </text>
            )}
          </g>
        );
      })}


      {/* width dimension */}
      <g stroke="var(--accent)" strokeWidth="1">
        <line x1={x0} y1={y0 + drawH + 20} x2={x0 + w * px} y2={y0 + drawH + 20} />
        <line x1={x0} y1={y0 + drawH + 15} x2={x0} y2={y0 + drawH + 25} />
        <line x1={x0 + w * px} y1={y0 + drawH + 15} x2={x0 + w * px} y2={y0 + drawH + 25} />
      </g>
      <text
        x={x0 + (w * px) / 2}
        y={y0 + drawH + 36}
        textAnchor="middle"
        fill="var(--foreground)"
        style={{ font: "500 11px var(--font-mono)" }}
      >
        {formatInches(w)}
      </text>

      {/* height dimension */}
      <g stroke="var(--accent)" strokeWidth="1">
        <line x1={x0 - 20} y1={y0} x2={x0 - 20} y2={y0 + drawH} />
        <line x1={x0 - 25} y1={y0} x2={x0 - 15} y2={y0} />
        <line x1={x0 - 25} y1={y0 + drawH} x2={x0 - 15} y2={y0 + drawH} />
      </g>
      <text
        x={x0 - 26}
        y={y0 + drawH / 2}
        textAnchor="middle"
        fill="var(--foreground)"
        transform={`rotate(-90 ${x0 - 26} ${y0 + drawH / 2})`}
        style={{ font: "500 11px var(--font-mono)" }}
      >
        {formatInches(h)}
      </text>
    </svg>
  );
}

export function PlanScaleBadge({ model, scale }: { model: PlanModel; scale: ScaleSettings }) {
  const o = modelOverall(model, scale);
  return (
    <span className="tech-label text-muted-foreground">
      1:{o.denominator.toFixed(o.denominator % 1 === 0 ? 0 : 1)} · finished {formatInches(o.widthIn)} ×{" "}
      {formatInches(o.depthIn)} × {formatInches(o.heightIn)}
    </span>
  );
}
