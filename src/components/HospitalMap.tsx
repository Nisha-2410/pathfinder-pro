import { EDGES, NODES, NodeT, edgeKey } from "@/backend/routes/navigation";

interface Point {
  x: number;
  y: number;
}

interface Props {
  floor: number;
  path: string[];
  source?: string;
  destination?: string;
  crowdLevels?: Record<string, number>;
  activeNodeId?: string;
}

function corridorColor(crowd: number): string {
  if (crowd >= 7) return "#dc2626";
  if (crowd >= 5) return "#f59e0b";
  return "#22c55e";
}

function orthogonalPoints(a: Point, b: Point): Point[] {
  if (Math.abs(a.x - b.x) < 2 || Math.abs(a.y - b.y) < 2) return [a, b];
  if (Math.abs(a.x - b.x) >= Math.abs(a.y - b.y)) return [a, { x: b.x, y: a.y }, b];
  return [a, { x: a.x, y: b.y }, b];
}

function toPolyline(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function toPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function uniquePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  return out;
}

function getNodeCenter(node: NodeT): Point {
  if (!node.rect) return { x: node.x, y: node.y };
  return {
    x: node.rect.x + node.rect.w / 2,
    y: node.rect.y + node.rect.h / 2,
  };
}

function getEdgeAnchor(node: NodeT, other: NodeT): Point {
  if (!node.rect) return { x: node.x, y: node.y };

  const center = getNodeCenter(node);
  const otherCenter = getNodeCenter(other);
  const dx = otherCenter.x - center.x;
  const dy = otherCenter.y - center.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: dx >= 0 ? node.rect.x + node.rect.w : node.rect.x,
      y: center.y,
    };
  }

  return {
    x: center.x,
    y: dy >= 0 ? node.rect.y + node.rect.h : node.rect.y,
  };
}

function getSegmentPoints(a: NodeT, b: NodeT): Point[] {
  return orthogonalPoints(getEdgeAnchor(a, b), getEdgeAnchor(b, a));
}

function getMarkerPoint(node: NodeT, pathNodes: NodeT[]): Point {
  const index = pathNodes.findIndex((item) => item.id === node.id);
  if (index !== -1) {
    const next = pathNodes[index + 1];
    if (next && next.floor === node.floor) return getEdgeAnchor(node, next);

    const prev = pathNodes[index - 1];
    if (prev && prev.floor === node.floor) return getEdgeAnchor(node, prev);
  }

  if (!node.rect) return { x: node.x, y: node.y };
  return getNodeCenter(node);
}

export default function HospitalMap({ floor, path, source, destination, crowdLevels = {}, activeNodeId }: Props) {
  const floorNodes = NODES.filter((n) => n.floor === floor);
  const floorNodeMap = new Map(floorNodes.map((n) => [n.id, n]));
  const floorEdges = EDGES.filter((e) => {
    if (e.type !== "corridor") return false;
    const from = floorNodeMap.get(e.from);
    const to = floorNodeMap.get(e.to);
    return Boolean(from && to);
  });

  const pathNodes = path
    .map((id) => NODES.find((n) => n.id === id))
    .filter((n) => n && n.floor === floor) as NodeT[];

  const floorPathPoints: Point[] = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    floorPathPoints.push(...getSegmentPoints(pathNodes[i], pathNodes[i + 1]));
  }
  const polyline = toPolyline(uniquePoints(floorPathPoints));

  const corridorDots = uniquePoints(
    floorEdges.flatMap((edge) => {
      const from = floorNodeMap.get(edge.from);
      const to = floorNodeMap.get(edge.to);
      if (!from || !to) return [];
      return [getEdgeAnchor(from, to), getEdgeAnchor(to, from)];
    })
  );

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/70 overflow-hidden shadow-[0_24px_56px_-34px_rgba(45,94,78,0.35)] backdrop-blur-sm">
      <svg viewBox="0 0 740 580" className="w-full h-auto bg-[#f5fbf8]">
        <g opacity="0.9">
          {floorEdges.map((edge) => {
            const from = floorNodeMap.get(edge.from);
            const to = floorNodeMap.get(edge.to);
            if (!from || !to) return null;
            const d = toPath(getSegmentPoints(from, to));
            const liveCrowd = crowdLevels[edgeKey(edge.from, edge.to)] ?? edge.crowd;
            const points = getSegmentPoints(from, to);
            const midpoint = points[Math.floor(points.length / 2)];

            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={d}
                  fill="none"
                  stroke="#d7dee8"
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={d}
                  fill="none"
                  stroke={corridorColor(liveCrowd)}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.55}
                />
                <circle cx={midpoint.x} cy={midpoint.y} r={8} fill="white" stroke="#cbd5e1" strokeWidth={1.5} />
                <text
                  x={midpoint.x}
                  y={midpoint.y + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="#334155"
                >
                  {liveCrowd}
                </text>
              </g>
            );
          })}
        </g>

        {floorNodes
          .filter((n) => n.rect)
          .map((n) => {
            const rect = n.rect!;
            const isSource = n.id === source;
            const isDestination = n.id === destination;
            const isPathTransition = path.includes(n.id) && (n.type === "lift" || n.type === "stairs");
            const isActiveNode = n.id === activeNodeId;
            const stroke = isSource
              ? "#16a34a"
              : isDestination
                ? "#ef4444"
                : isPathTransition
                  ? n.type === "lift"
                    ? "#f59e0b"
                    : "#7c3aed"
                  : "#d6deea";
            const fill = isPathTransition ? (n.type === "lift" ? "#fff7ed" : "#f5f3ff") : "#f8fafc";

            return (
              <g key={n.id}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.w}
                  height={rect.h}
                  rx={8}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSource || isDestination || isPathTransition ? 2.5 : 1.5}
                />
                {isActiveNode && (
                  <rect
                    x={rect.x - 4}
                    y={rect.y - 4}
                    width={rect.w + 8}
                    height={rect.h + 8}
                    rx={12}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                )}
                <text
                  x={rect.x + rect.w / 2}
                  y={rect.y + rect.h / 2 + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#4b5563"
                >
                  {n.name}
                </text>
              </g>
            );
          })}

        {corridorDots.map((point, index) => (
          <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={3.5} fill="#111827" />
        ))}

        {pathNodes.length >= 2 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#0f172a"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        )}

        {floorNodes.map((n) => {
          if (n.id !== source && n.id !== destination) return null;
          const p = getMarkerPoint(n, pathNodes);
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={6}
              fill={n.id === source ? "#16a34a" : "#ef4444"}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
      </svg>
    </div>
  );
}
