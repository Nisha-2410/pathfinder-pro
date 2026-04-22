import { EDGES, NODES, NodeT } from "@/backend/routes/navigation";
import { DoorOpen, ArrowUpDown, Footprints } from "lucide-react";

interface Props {
  floor: number;
  path: string[];
  source?: string;
  destination?: string;
}

const ROOM_STYLES: Record<string, { fill: string; stroke: string }> = {
  room:     { fill: "hsl(var(--room-fill))",     stroke: "hsl(var(--room-stroke))" },
  lift:     { fill: "hsl(var(--lift-fill))",     stroke: "hsl(var(--lift-stroke))" },
  stairs:   { fill: "hsl(var(--stairs-fill))",   stroke: "hsl(var(--stairs-stroke))" },
  corridor: { fill: "hsl(var(--room-fill))",     stroke: "hsl(var(--room-stroke))" },
};

// Per-floor corridor "walkable" zones, drawn as the hallway floor.
const CORRIDORS: Record<number, { x: number; y: number; w: number; h: number }[]> = {
  1: [
    { x: 220, y: 230, w:  40, h: 220 }, // vertical left
    { x: 500, y: 230, w:  40, h: 220 }, // vertical right
    { x: 220, y: 410, w: 320, h:  40 }, // horizontal middle
    { x: 220, y: 230, w: 320, h:  20 }, // horizontal upper join
    { x: 540, y: 360, w: 160, h:  40 }, // to lifts/stairs
  ],
  2: [
    { x: 220, y: 220, w:  40, h: 230 },
    { x: 500, y: 220, w:  40, h: 230 },
    { x: 220, y: 220, w: 320, h:  30 },
    { x: 220, y: 410, w: 320, h:  40 },
    { x: 540, y: 360, w: 160, h:  40 },
  ],
  3: [
    { x: 220, y: 220, w:  40, h: 230 },
    { x: 500, y: 220, w:  40, h: 230 },
    { x: 220, y: 220, w: 320, h:  30 },
    { x: 220, y: 410, w: 320, h:  40 },
    { x: 540, y: 360, w: 160, h:  40 },
  ],
};

function RoomLabel({ n }: { n: NodeT }) {
  if (!n.rect) return null;
  const cx = n.rect.x + n.rect.w / 2;
  const cy = n.rect.y + n.rect.h / 2;
  return (
    <text
      x={cx} y={cy}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-foreground pointer-events-none select-none"
      fontSize="12"
      fontWeight="600"
    >
      {n.name}
    </text>
  );
}

function RoomIcon({ n }: { n: NodeT }) {
  if (!n.rect) return null;
  const cx = n.rect.x + n.rect.w / 2;
  const cy = n.rect.y + 18;
  if (n.type === "lift") {
    return <ArrowUpDown x={cx - 8} y={cy - 8} width={16} height={16} className="text-[hsl(var(--lift-stroke))]" />;
  }
  if (n.type === "stairs") {
    return <Footprints x={cx - 8} y={cy - 8} width={16} height={16} className="text-[hsl(var(--stairs-stroke))]" />;
  }
  return null;
}

export default function HospitalMap({ floor, path, source, destination }: Props) {
  const floorNodes = NODES.filter((n) => n.floor === floor);

  // Filter the path to only the segments that are on this floor (consecutive same-floor nodes).
  const pathPoints: { x: number; y: number; node: NodeT }[] = [];
  for (const id of path) {
    const n = NODES.find((x) => x.id === id)!;
    if (n.floor === floor) pathPoints.push({ x: n.x, y: n.y, node: n });
  }

  // Build polyline string
  const polyline = pathPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <svg viewBox="0 0 740 580" className="w-full h-auto bg-[hsl(var(--map-bg))]">
        <defs>
          <pattern id="floor-tiles" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="hsl(var(--map-bg))" />
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--map-grid))" strokeWidth="0.5" />
          </pattern>
          <pattern id="corridor-tiles" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="hsl(var(--corridor-fill))" />
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="hsl(var(--corridor-grid))" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Building shell */}
        <rect x="20" y="40" width="700" height="530" rx="8"
              fill="url(#floor-tiles)" stroke="hsl(var(--wall))" strokeWidth="4" />

        {/* Corridor floor */}
        {CORRIDORS[floor]?.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h}
                fill="url(#corridor-tiles)" stroke="hsl(var(--wall))" strokeWidth="1" />
        ))}

        {/* Rooms */}
        {floorNodes.filter(n => n.rect).map((n) => {
          const style = ROOM_STYLES[n.type];
          const onPath = path.includes(n.id);
          const isSrc = n.id === source;
          const isDst = n.id === destination;
          const accent = isSrc ? "hsl(var(--source))"
                       : isDst ? "hsl(var(--destination))"
                       : onPath ? "hsl(var(--path))"
                       : style.stroke;
          return (
            <g key={n.id}>
              <rect
                x={n.rect!.x} y={n.rect!.y}
                width={n.rect!.w} height={n.rect!.h}
                fill={style.fill}
                stroke={accent}
                strokeWidth={onPath || isSrc || isDst ? 3 : 2}
                rx={4}
              />
              <RoomIcon n={n} />
              <RoomLabel n={n} />
            </g>
          );
        })}

        {/* Doors — short gaps shown as small marks on edges between rooms and corridors */}
        {EDGES
          .filter((e) => {
            const a = NODES.find((x) => x.id === e.from)!;
            const b = NODES.find((x) => x.id === e.to)!;
            return a.floor === floor && b.floor === floor && e.type === "corridor";
          })
          .map((e, i) => {
            const a = NODES.find((x) => x.id === e.from)!;
            const b = NODES.find((x) => x.id === e.to)!;
            // Place a door marker at the room-side endpoint of the segment
            const target = a.rect ? a : b.rect ? b : null;
            if (!target) return null;
            return (
              <circle key={i}
                cx={target.x} cy={target.y}
                r={4}
                fill="hsl(var(--door))"
                stroke="hsl(var(--wall))"
                strokeWidth="1"
              />
            );
          })}

        {/* Computed path */}
        {pathPoints.length >= 2 && (
          <>
            <polyline
              points={polyline}
              fill="none"
              stroke="hsl(var(--path))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0"
              opacity="0.95"
            />
            <polyline
              points={polyline}
              fill="none"
              stroke="hsl(var(--path-glow))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 8"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1s" repeatCount="indefinite" />
            </polyline>
          </>
        )}

        {/* Source / Destination pins */}
        {floorNodes.map((n) => {
          const isSrc = n.id === source;
          const isDst = n.id === destination;
          if (!isSrc && !isDst) return null;
          const color = isSrc ? "hsl(var(--source))" : "hsl(var(--destination))";
          return (
            <g key={`pin-${n.id}`}>
              <circle cx={n.x} cy={n.y} r={14} fill={color} opacity="0.25">
                <animate attributeName="r" values="14;22;14" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <circle cx={n.x} cy={n.y} r={9} fill={color} stroke="white" strokeWidth="2" />
              <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">
                {isSrc ? "A" : "B"}
              </text>
            </g>
          );
        })}

        {/* Floor label */}
        <g>
          <rect x="20" y="10" width="120" height="26" rx="4" fill="hsl(var(--primary))" />
          <text x="80" y="28" textAnchor="middle" fontSize="13" fontWeight="700" fill="hsl(var(--primary-foreground))">
            FLOOR {floor}
          </text>
        </g>
      </svg>
    </div>
  );
}
