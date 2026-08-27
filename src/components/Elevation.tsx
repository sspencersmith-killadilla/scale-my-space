import {
  ensureMasses,
  expandOpenings,
  formatInches,
  massBounds,
  modelOverall,
  resolveDenominator,
  type FaceKey,
  type PlanMass,
  type PlanModel,
  type PlanOpening,
  type ScaleSettings,
} from "@/lib/plan-model";

interface Props {
  model: PlanModel;
  scale: ScaleSettings;
  face: FaceKey;
  width?: number;
}

/** Outline of an opening in SVG path form, honouring arched shapes. */
function openingPath(o: PlanOpening, x: number, yTop: number, w: number, h: number) {
  const shape = o.shape ?? "rectangle";
  const rise = Math.min(Math.max(o.archRiseIn ?? 0, 0) * (h / Math.max(o.heightIn, 0.001)), h * 0.9);
  const bottom = yTop + h;
  const cx = x + w / 2;

  if (shape === "circle") {
    const r = Math.min(w, h) / 2;
    return `M ${cx - r} ${yTop + h / 2} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
  }
  if (shape === "rectangle" || rise <= 0.01) {
    return `M ${x} ${bottom} L ${x} ${yTop} L ${x + w} ${yTop} L ${x + w} ${bottom} Z`;
  }
  const springing = yTop + rise;
  if (shape === "pointed-arch") {
    return `M ${x} ${bottom} L ${x} ${springing} Q ${x + w * 0.25} ${springing - rise * 0.75} ${cx} ${yTop} Q ${x + w * 0.75} ${springing - rise * 0.75} ${x + w} ${springing} L ${x + w} ${bottom} Z`;
  }
  if (shape === "horseshoe-arch") {
    const bulge = w * 0.1;
    return `M ${x} ${bottom} L ${x} ${springing} C ${x - bulge} ${springing - rise * 0.55} ${x + w * 0.2} ${yTop} ${cx} ${yTop} C ${x + w * 0.8} ${yTop} ${x + w + bulge} ${springing - rise * 0.55} ${x + w} ${springing} L ${x + w} ${bottom} Z`;
  }
  return `M ${x} ${bottom} L ${x} ${springing} A ${w / 2} ${rise} 0 0 1 ${x + w} ${springing} L ${x + w} ${bottom} Z`;
}

/**
 * Scaled 2D elevation drawn straight from the plan model's masses, so it always
 * agrees with the cut list. Dimensions shown are model (finished) inches.
 */
export function Elevation({ model, scale, face, width = 420 }: Props) {
  const d = resolveDenominator(model, scale);
  const masses = ensureMasses(model);
  const bounds = massBounds(masses);
  const horizontal = face === "front" || face === "back";
  const flip = face === "back" || face === "right";

  // Real-world width of this elevation and the total height it must contain.
  const elevWidthIn = horizontal ? bounds.widthIn : bounds.depthIn;
  const elevHeightIn = bounds.maxY;
  const w = elevWidthIn / d;
  const h = elevHeightIn / d;
  const label = `${face[0]!.toUpperCase()}${face.slice(1)} elevation`;

  const pad = 46;
  const inner = width - pad * 2;
  const px = inner / Math.max(w, 0.01);
  const drawH = h * px;
  const height = drawH + pad * 2;
  const x0 = pad;
  const y0 = pad;

  /** Real-world inches along this elevation -> svg x. */
  const sx = (inches: number) => {
    const from = horizontal ? bounds.minX : bounds.minZ;
    const local = inches - from;
    const posIn = flip ? elevWidthIn - local : local;
    return x0 + (posIn / d) * px;
  };
  /** Real-world height above ground -> svg y. */
  const sy = (inches: number) => y0 + drawH - (inches / d) * px;

  const massCenter = (m: PlanMass) => (horizontal ? m.xIn : m.zIn);
  const massSpan = (m: PlanMass) =>
    m.kind === "cylinder" ? m.diameterIn : horizontal ? m.widthIn : m.depthIn;

  const mainMass = masses.reduce(
    (a, b) => (b.widthIn * b.heightIn > a.widthIn * a.heightIn ? b : a),
    masses[0]!,
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${label} drawing`}>
      <defs>
        <pattern id={`hatch-${face}`} width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--blueprint)" strokeWidth="0.7" opacity="0.35" />
        </pattern>
      </defs>

      {/* one silhouette per mass, drawn back-to-front by height */}
      {[...masses]
        .sort((a, b) => b.heightIn + b.top.riseIn - (a.heightIn + a.top.riseIn))
        .map((m) => {
          const span = massSpan(m);
          const left = massCenter(m) - span / 2;
          const right = massCenter(m) + span / 2;
          const xa = Math.min(sx(left), sx(right));
          const xb = Math.max(sx(left), sx(right));
          const wallTop = sy(m.baseYIn + m.heightIn);
          const bottom = sy(m.baseYIn);
          const rise = m.top.riseIn / d;
          const risePx = rise * px;
          const top = m.top.type;

          return (
            <g key={m.id}>
              <rect
                x={xa}
                y={wallTop}
                width={xb - xa}
                height={bottom - wallTop}
                fill={`url(#hatch-${face})`}
                stroke="var(--foreground)"
                strokeWidth="1.5"
              />
              {top === "gable" && risePx > 1 && (
                <polygon
                  points={`${xa},${wallTop} ${(xa + xb) / 2},${wallTop - risePx} ${xb},${wallTop}`}
                  fill={`url(#hatch-${face})`}
                  stroke="var(--foreground)"
                  strokeWidth="1.5"
                />
              )}
              {(top === "hip" || top === "cone") && risePx > 1 && (
                <polygon
                  points={`${xa},${wallTop} ${(xa + xb) / 2},${wallTop - risePx} ${xb},${wallTop}`}
                  fill={`url(#hatch-${face})`}
                  stroke="var(--foreground)"
                  strokeWidth="1.5"
                />
              )}
              {top === "shed" && risePx > 1 && (
                <polygon
                  points={`${xa},${wallTop} ${xa},${wallTop - risePx} ${xb},${wallTop}`}
                  fill={`url(#hatch-${face})`}
                  stroke="var(--foreground)"
                  strokeWidth="1.5"
                />
              )}
              {top === "dome" && (
                <path
                  d={`M ${xa} ${wallTop} A ${(xb - xa) / 2} ${Math.max(risePx, (xb - xa) / 2)} 0 0 1 ${xb} ${wallTop}`}
                  fill={`url(#hatch-${face})`}
                  stroke="var(--foreground)"
                  strokeWidth="1.5"
                />
              )}
              {(top === "crenellated" || top === "parapet") &&
                (() => {
                  const th = Math.max(
                    ((m.top.merlonHeightIn || m.top.riseIn || 10) / d) * px,
                    4,
                  );
                  if (top === "parapet") {
                    return (
                      <rect
                        x={xa}
                        y={wallTop - th}
                        width={xb - xa}
                        height={th}
                        fill={`url(#hatch-${face})`}
                        stroke="var(--foreground)"
                        strokeWidth="1.4"
                      />
                    );
                  }
                  const tooth = Math.max(((m.top.merlonWidthIn || 8) / d) * px, 3);
                  const gap = Math.max(((m.top.merlonGapIn || 6) / d) * px, 2);
                  const pitch = tooth + gap;
                  const count = Math.max(2, Math.floor((xb - xa) / pitch));
                  const start = xa + ((xb - xa) - (count * pitch - gap)) / 2;
                  return (
                    <g>
                      {Array.from({ length: count }, (_, i) => (
                        <rect
                          key={i}
                          x={start + i * pitch}
                          y={wallTop - th}
                          width={tooth}
                          height={th}
                          fill={`url(#hatch-${face})`}
                          stroke="var(--foreground)"
                          strokeWidth="1.2"
                        />
                      ))}
                    </g>
                  );
                })()}
            </g>
          );
        })}

      {/* openings, placed from the left edge of their own mass */}
      {expandOpenings(model.openings.filter((o) => o.face === face)).map((o, i) => {
        const mass = masses.find((m) => m.id === o.massId) ?? mainMass;
        const span = massSpan(mass);
        const massLeft = massCenter(mass) - span / 2;
        const leftIn = massLeft + o.xIn;
        const ow = (o.widthIn / d) * px;
        const oxRaw = sx(leftIn);
        const ox = flip ? oxRaw - ow : oxRaw;
        const oh = (o.heightIn / d) * px;
        const oyTop = sy(mass.baseYIn + o.yIn + o.heightIn);
        const cols = Math.max(1, o.paneCols ?? 1);
        const rows = Math.max(1, o.paneRows ?? 1);
        const plain = (o.shape ?? "rectangle") === "rectangle";

        return (
          <g key={i}>
            <path
              d={openingPath(o, ox, oyTop, ow, oh)}
              fill="var(--card)"
              stroke="var(--foreground)"
              strokeWidth="1.1"
            />
            {o.kind === "window" &&
              plain &&
              Array.from({ length: cols - 1 }, (_, c) => (
                <line
                  key={`c${c}`}
                  x1={ox + (ow * (c + 1)) / cols}
                  y1={oyTop}
                  x2={ox + (ow * (c + 1)) / cols}
                  y2={oyTop + oh}
                  stroke="var(--blueprint)"
                  strokeWidth="0.8"
                />
              ))}
            {o.kind === "window" &&
              plain &&
              Array.from({ length: rows - 1 }, (_, rw) => (
                <line
                  key={`r${rw}`}
                  x1={ox}
                  y1={oyTop + (oh * (rw + 1)) / rows}
                  x2={ox + ow}
                  y2={oyTop + (oh * (rw + 1)) / rows}
                  stroke="var(--blueprint)"
                  strokeWidth="0.8"
                />
              ))}
            {o.kind === "door" && (
              <circle cx={ox + ow * 0.82} cy={oyTop + oh * 0.5} r="1.8" fill="var(--accent)" />
            )}
            {ow > 26 && (
              <text
                x={ox + ow / 2}
                y={oyTop - 3}
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
