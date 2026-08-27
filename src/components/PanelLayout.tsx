import { formatInches, type CutListRow } from "@/lib/plan-model";

interface Props {
  rows: CutListRow[];
  /** Usable stock sheet width in inches. */
  sheetWidthIn?: number;
  width?: number;
}

interface Placed {
  row: CutListRow;
  x: number;
  y: number;
  w: number;
  h: number;
  copy: number;
}

/** Simple shelf-packing nest of every part onto a stock sheet. */
export function nestParts(rows: CutListRow[], sheetWidthIn: number) {
  const gap = 0.15;
  const placed: Placed[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;

  const items = rows
    .flatMap((row) =>
      Array.from({ length: row.quantity }, (_, i) => ({ row, copy: i + 1 })),
    )
    .sort((a, b) => b.row.widthIn - a.row.widthIn);

  for (const item of items) {
    const w = Math.min(item.row.lengthIn, sheetWidthIn);
    const h = item.row.widthIn;
    if (cursorX + w > sheetWidthIn) {
      cursorX = 0;
      cursorY += shelfHeight + gap;
      shelfHeight = 0;
    }
    placed.push({ row: item.row, copy: item.copy, x: cursorX, y: cursorY, w, h });
    cursorX += w + gap;
    shelfHeight = Math.max(shelfHeight, h);
  }

  return { placed, totalHeightIn: cursorY + shelfHeight };
}

export function PanelLayout({ rows, sheetWidthIn = 24, width = 720 }: Props) {
  const { placed, totalHeightIn } = nestParts(rows, sheetWidthIn);
  const pad = 24;
  const px = (width - pad * 2) / sheetWidthIn;
  const height = totalHeightIn * px + pad * 2;

  return (
    <svg viewBox={`0 0 ${width} ${Math.max(height, 80)}`} className="w-full" role="img" aria-label="Panel cutting layout">
      <rect
        x={pad}
        y={pad}
        width={sheetWidthIn * px}
        height={totalHeightIn * px}
        fill="var(--kraft)"
        stroke="var(--foreground)"
        strokeWidth="1.4"
        opacity="0.45"
      />
      {placed.map((p, i) => (
        <g key={i}>
          <rect
            x={pad + p.x * px}
            y={pad + p.y * px}
            width={p.w * px}
            height={p.h * px}
            fill="var(--card)"
            stroke="var(--blueprint)"
            strokeWidth="1.1"
          />
          {p.w * px > 62 && p.h * px > 20 && (
            <>
              <text
                x={pad + p.x * px + 5}
                y={pad + p.y * px + 14}
                fill="var(--foreground)"
                style={{ font: "600 10px var(--font-mono)" }}
              >
                {p.row.name.slice(0, 22)}
              </text>
              <text
                x={pad + p.x * px + 5}
                y={pad + p.y * px + 26}
                fill="var(--muted-foreground)"
                style={{ font: "400 9px var(--font-mono)" }}
              >
                {formatInches(p.w)} × {formatInches(p.h)}
              </text>
            </>
          )}
        </g>
      ))}
      <text
        x={pad}
        y={16}
        fill="var(--muted-foreground)"
        style={{ font: "400 10px var(--font-mono)" }}
      >
        STOCK SHEET {sheetWidthIn}" WIDE · {formatInches(totalHeightIn)} OF LENGTH USED
      </text>
    </svg>
  );
}
