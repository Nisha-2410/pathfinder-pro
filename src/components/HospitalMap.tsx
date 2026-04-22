import { EDGES, NODES, NodeT } from "@/backend/routes/navigation";

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
// Layout: an H-shape connecting all rooms.
const CORRIDORS: Record<number, { x: number; y: number; w: number; h: number }[]> = {
  1: [
    { x: 200, y: 210, w: 360, h: 40 }, // top horizontal (between top rooms and middle rooms)
    { x: 200, y: 400, w: 360, h: 40 }, // bottom horizontal (between middle rooms and bottom rooms)
    { x: 200, y: 210, w:  40, h: 230 }, // left vertical
    { x: 520, y: 210, w:  40, h: 230 }, // right vertical
    { x: 560, y: 360, w: 160, h: 40 },  // spur to lift/stairs
  ],
  2: [
    { x: 200, y: 210, w: 360, h: 40 },
    { x: 200, y: 400, w: 360, h: 40 },
    { x: 200, y: 210, w:  40, h: 230 },
    { x: 520, y: 210, w:  40, h: 230 },
    { x: 560, y: 360, w: 160, h: 40 },
  ],
  3: [
    { x: 200, y: 210, w: 360, h: 40 },
    { x: 200, y: 400, w: 360, h: 40 },
    { x: 200, y: 210, w:  40, h: 230 },
    { x: 520, y: 210, w:  40, h: 230 },
    { x: 560, y: 360, w: 160, h: 40 },
  ],
};

// Compute the "door" point on a room — where its boundary meets the nearest corridor.
function doorPoint(n: NodeT): { x: number; y: number } {
  if (!n.rect) return { x: n.x, y: n.y };
  const r = n.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  const corridors = CORRIDORS[n.floor] || [];
  // Pick the corridor closest to the room
  let best: { dist: number; door: { x: number; y: number } } | null = null;

  for (const c of corridors) {
    const ccx = c.x + c.w / 2;
    const ccy = c.y + c.h / 2;
    // Determine which side of the room faces this corridor
    let door = { x: cx, y: cy };
    if (ccy < r.y) door = { x: cx, y: r.y };          // corridor above
    else if (ccy > r.y + r.h) door = { x: cx, y: r.y + r.h }; // corridor below
    else if (ccx < r.x) door = { x: r.x, y: cy };     // corridor left
    else if (ccx > r.x + r.w) door = { x: r.x + r.w, y: cy }; // corridor right
    const d = Math.hypot(ccx - cx, ccy - cy);
    if (!best || d < best.dist) best = { dist: d, door };
  }
  return best?.door ?? { x: cx, y: cy };
}

// Route a path between two door points through the corridor (orthogonal: room→corridor→room).
function routeBetween(a: NodeT, b: NodeT): { x: number; y: number }[] {
  const da = doorPoint(a);
  const db = doorPoint(b);
  // Walk vertically/horizontally along corridor centerlines
  // Use corridor center y for horizontal routing
  const corridorY = 420; // bottom horizontal center
  const corridorYTop = 230; // top horizontal center
  const useTop = (da.y < 300 && db.y < 300);
  const cy = useTop ? corridorYTop : corridorY;
  return [
    da,
    { x: da.x, y: cy },
    { x: db.x, y: cy },
    db,
  ];
}

export default function HospitalMap({ floor, path, source, destination }: Props) {
  const floorNodes = NODES.filter((n) => n.floor === floor);

  // Build path polyline restricted to this floor, routed through corridors.
  const segments: { x: number; y: number }[][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = NODES.find((x) => x.id === path[i])!;
    const b = NODES.find((x) => x.id === path[i + 1])!;
    if (a.floor !== floor || b.floor !== floor) continue;
    segments.push(routeBetween(a, b));
  }
  // Flatten consecutive segments into one polyline
  const polyPoints: { x: number; y: number }[] = [];
  segments.forEach((seg, i) => {
    if (i === 0) polyPoints.push(...seg);
    else polyPoints.push(...seg.slice(1));
  });
  const polyline = polyPoints.map((p) => `${p.x},${p.y}`).join(" ");

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
                fill="url(#corridor-tiles)" stroke="hsl(var(--wall))" strokeWidth="1.5" />
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
          const r = n.rect!;
          const door = doorPoint(n);
          // Door "gap" — a small opening on the wall facing the corridor
          const isHorizontalDoor = door.y === r.y || door.y === r.y + r.h;
          return (
            <g key={n.id}>
              <rect
                x={r.x} y={r.y}
                width={r.w} height={r.h}
                fill={style.fill}
                stroke={accent}
                strokeWidth={onPath || isSrc || isDst ? 3 : 2}
                rx={4}
              />
              {/* Door opening — erase a small slice of the wall */}
              {isHorizontalDoor ? (
                <rect x={door.x - 8} y={door.y - 2} width={16} height={4} fill={style.fill} />
              ) : (
                <rect x={door.x - 2} y={door.y - 8} width={4} height={16} fill={style.fill} />
              )}
              {/* Door marker */}
              <circle cx={door.x} cy={door.y} r={3} fill="hsl(var(--door))" />
              {/* Room label — anchored near the top so the path doesn't overlap */}
              <text
                x={r.x + r.w / 2}
                y={r.y + 18}
                textAnchor="middle"
                className="fill-foreground pointer-events-none select-none"
                fontSize={n.type === "lift" || n.type === "stairs" ? 10 : 12}
                fontWeight="600"
              >
                {n.name}
              </text>
              {n.type === "lift" && (
                <text x={r.x + r.w / 2} y={r.y + r.h - 10} textAnchor="middle"
                      fontSize="14" fill="hsl(var(--lift-stroke))" fontWeight="700">↕</text>
              )}
              {n.type === "stairs" && (
                <text x={r.x + r.w / 2} y={r.y + r.h - 10} textAnchor="middle"
                      fontSize="14" fill="hsl(var(--stairs-stroke))" fontWeight="700">▣</text>
              )}
            </g>
          );
        })}

        {/* Computed path */}
        {polyPoints.length >= 2 && (
          <>
            <polyline
              points={polyline}
              fill="none"
              stroke="hsl(var(--path))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
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

        {/* Source / Destination pins — placed at the door, not inside the room */}
        {floorNodes.map((n) => {
          const isSrc = n.id === source;
          const isDst = n.id === destination;
          if (!isSrc && !isDst) return null;
          const color = isSrc ? "hsl(var(--source))" : "hsl(var(--destination))";
          const door = doorPoint(n);
          return (
            <g key={`pin-${n.id}`}>
              <circle cx={door.x} cy={door.y} r={12} fill={color} opacity="0.25">
                <animate attributeName="r" values="12;20;12" dur="1.6s" repeatCount="indefinite" />
              </circle>
              <circle cx={door.x} cy={door.y} r={9} fill={color} stroke="white" strokeWidth="2" />
              <text x={door.x} y={door.y + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">
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
