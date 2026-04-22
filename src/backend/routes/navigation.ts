import nodes from "../data/nodes.json";
import edges from "../data/edges.json";

export type Mode = "fastest" | "shortest" | "wheelchair" | "emergency";

export interface NodeT {
  id: string;
  name: string;
  x: number;
  y: number;
  floor: number;
  type: "room" | "corridor" | "lift" | "stairs";
}

export interface EdgeT {
  from: string;
  to: string;
  distance: number;
  time: number;
  type: "corridor" | "lift" | "stairs";
  accessibility: boolean;
  crowd: number;
}

export interface RouteRequest {
  source: string;
  destination: string;
  mode: Mode;
}

export interface RouteResponse {
  path: string[];
  instructions: string[];
  time: number;
  distance: number;
}

export const NODES = nodes as NodeT[];
export const EDGES = edges as EdgeT[];

export const getNode = (id: string) => NODES.find((n) => n.id === id)!;

function edgeWeight(e: EdgeT, mode: Mode): number | null {
  if (mode === "wheelchair" && !e.accessibility) return null;
  switch (mode) {
    case "shortest":
      return e.distance;
    case "fastest":
      return e.time + e.crowd * 0.4;
    case "wheelchair":
      return e.time + (e.type === "lift" ? 0 : 1);
    case "emergency":
      // ignore crowd, prefer stairs (faster in emergencies), penalize lifts
      return e.time + (e.type === "lift" ? 3 : 0);
  }
}

function buildAdj(mode: Mode) {
  const adj = new Map<string, { to: string; w: number; edge: EdgeT }[]>();
  NODES.forEach((n) => adj.set(n.id, []));
  for (const e of EDGES) {
    const w = edgeWeight(e, mode);
    if (w === null) continue;
    adj.get(e.from)!.push({ to: e.to, w, edge: e });
    adj.get(e.to)!.push({ to: e.from, w, edge: e });
  }
  return adj;
}

function dijkstra(source: string, dest: string, mode: Mode): string[] {
  const adj = buildAdj(mode);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  NODES.forEach((n) => {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
  });
  dist.set(source, 0);

  const visited = new Set<string>();
  // simple O(V^2) priority loop — fine for small graphs
  while (visited.size < NODES.length) {
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    if (u === dest) break;
    visited.add(u);

    for (const { to, w } of adj.get(u) || []) {
      if (visited.has(to)) continue;
      const nd = best + w;
      if (nd < dist.get(to)!) {
        dist.set(to, nd);
        prev.set(to, u);
      }
    }
  }

  const path: string[] = [];
  let cur: string | null = dest;
  if (dist.get(dest) === Infinity) return [];
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur) || null;
  }
  return path[0] === source ? path : [];
}

function findEdge(a: string, b: string): EdgeT | undefined {
  return EDGES.find(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)
  );
}

function turnDirection(prev: NodeT, cur: NodeT, next: NodeT): string {
  const v1x = cur.x - prev.x;
  const v1y = cur.y - prev.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  const angle = (Math.atan2(cross, dot) * 180) / Math.PI;
  if (Math.abs(angle) < 25) return "Go straight";
  if (angle > 0) return "Turn right";
  return "Turn left";
}

function generateInstructions(path: string[]): string[] {
  if (path.length < 2) return ["You are already at the destination."];
  const out: string[] = [];
  const first = getNode(path[0]);
  out.push(`Start at ${first.name}`);

  for (let i = 0; i < path.length - 1; i++) {
    const a = getNode(path[i]);
    const b = getNode(path[i + 1]);
    const edge = findEdge(a.id, b.id)!;

    if (edge.type === "lift") {
      out.push(`Take lift to floor ${b.floor}`);
      continue;
    }
    if (edge.type === "stairs") {
      out.push(`Take stairs to floor ${b.floor}`);
      continue;
    }

    if (i === 0) {
      out.push(`Head toward ${b.name} (${edge.distance} m)`);
    } else {
      const prev = getNode(path[i - 1]);
      const prevEdge = findEdge(prev.id, a.id)!;
      if (prevEdge.type === "lift" || prevEdge.type === "stairs") {
        out.push(`Head toward ${b.name} (${edge.distance} m)`);
      } else {
        out.push(`${turnDirection(prev, a, b)} toward ${b.name} (${edge.distance} m)`);
      }
    }
  }
  const last = getNode(path[path.length - 1]);
  out.push(`Arrive at ${last.name}`);
  return out;
}

/** POST /get-route equivalent — fully local */
export function getRoute(req: RouteRequest): RouteResponse {
  const path = dijkstra(req.source, req.destination, req.mode);
  if (path.length === 0) {
    return { path: [], instructions: ["No route available for this mode."], time: 0, distance: 0 };
  }
  let time = 0;
  let distance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const e = findEdge(path[i], path[i + 1])!;
    time += e.time;
    distance += e.distance;
  }
  return { path, instructions: generateInstructions(path), time, distance };
}
