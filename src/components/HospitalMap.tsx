import { EDGES, NODES, NodeT } from "@/backend/routes/navigation";

interface Props {
  floor: number;
  path: string[];
  source?: string;
  destination?: string;
}

const typeStyles: Record<NodeT["type"], string> = {
  room: "fill-[hsl(var(--node-room))]",
  corridor: "fill-[hsl(var(--node-corridor))]",
  lift: "fill-[hsl(var(--node-lift))]",
  stairs: "fill-[hsl(var(--node-stairs))]",
};

export default function HospitalMap({ floor, path, source, destination }: Props) {
  const floorNodes = NODES.filter((n) => n.floor === floor);
  const floorEdges = EDGES.filter((e) => {
    const a = NODES.find((n) => n.id === e.from)!;
    const b = NODES.find((n) => n.id === e.to)!;
    return a.floor === floor && b.floor === floor;
  });

  const pathSet = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    pathSet.add(`${path[i]}-${path[i + 1]}`);
    pathSet.add(`${path[i + 1]}-${path[i]}`);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <svg viewBox="0 0 640 520" className="w-full h-auto bg-[hsl(var(--map-bg))]">
        {/* grid */}
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="hsl(var(--map-grid))" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="640" height="520" fill="url(#grid)" />

        {/* building outline */}
        <rect x="20" y="20" width="600" height="480" rx="14"
              fill="hsl(var(--map-building))" stroke="hsl(var(--border))" strokeWidth="2" />

        {/* edges */}
        {floorEdges.map((e, i) => {
          const a = NODES.find((n) => n.id === e.from)!;
          const b = NODES.find((n) => n.id === e.to)!;
          const onPath = pathSet.has(`${e.from}-${e.to}`);
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={onPath ? "hsl(var(--path))" : "hsl(var(--edge))"}
              strokeWidth={onPath ? 6 : 3}
              strokeLinecap="round"
              className="transition-all"
            />
          );
        })}

        {/* nodes */}
        {floorNodes.map((n) => {
          const isSrc = n.id === source;
          const isDst = n.id === destination;
          const onPath = path.includes(n.id);
          return (
            <g key={n.id}>
              {(isSrc || isDst) && (
                <circle cx={n.x} cy={n.y} r={20}
                        fill="none"
                        stroke={isSrc ? "hsl(var(--source))" : "hsl(var(--destination))"}
                        strokeWidth="2"
                        className="animate-pulse" />
              )}
              <circle
                cx={n.x} cy={n.y}
                r={onPath ? 12 : 10}
                className={typeStyles[n.type]}
                stroke={onPath ? "hsl(var(--path))" : "hsl(var(--border))"}
                strokeWidth={onPath ? 3 : 2}
              />
              <text x={n.x} y={n.y - 18}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize="11"
                    fontWeight="600">
                {n.name}
              </text>
              <text x={n.x} y={n.y + 4}
                    textAnchor="middle"
                    fontSize="9"
                    fill="hsl(var(--primary-foreground))"
                    fontWeight="700">
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
