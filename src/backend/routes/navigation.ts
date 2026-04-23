import nodes from "../data/nodes.json";
import edges from "../data/edges.json";

export type Mode = "fastest" | "shortest" | "least_crowded" | "wheelchair" | "emergency";

export interface NodeT {
  id: string;
  name: string;
  x: number;
  y: number;
  floor: number;
  type: "room" | "corridor" | "lift" | "stairs";
  rect?: { x: number; y: number; w: number; h: number };
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
  crowdOverrides?: Record<string, number>;
}

export interface RouteStep {
  text: string;
  floor: number;
  kind: "start" | "move" | "transition" | "arrival";
  nodeId?: string;
}

export interface RouteResponse {
  path: string[];
  steps: RouteStep[];
  instructions: string[];
  time: number;
  distance: number;
}

export const NODES = nodes as NodeT[];
export const EDGES = edges as EdgeT[];

export const getNode = (id: string) => NODES.find((n) => n.id === id)!;
export const edgeKey = (a: string, b: string) => [a, b].sort().join(":");

function getCrowdLevel(e: EdgeT, crowdOverrides?: Record<string, number>): number {
  return crowdOverrides?.[edgeKey(e.from, e.to)] ?? e.crowd;
}

function edgeWeight(e: EdgeT, mode: Mode, crowdOverrides?: Record<string, number>): number | null {
  if (mode === "wheelchair" && !e.accessibility) return null;
  const crowd = getCrowdLevel(e, crowdOverrides);
  switch (mode) {
    case "shortest":
      return e.distance;
    case "fastest":
      return e.time + crowd * 0.4;
    case "least_crowded":
      return crowd * 3 + e.time + e.distance * 0.02;
    case "wheelchair":
      return e.time + (e.type === "lift" ? 0 : 1) + crowd * 0.3;
    case "emergency":
      // fastest + strongly avoid crowded routes
      return e.time + crowd * 1.5;
  }
}

function buildAdj(mode: Mode, crowdOverrides?: Record<string, number>) {
  const adj = new Map<string, { to: string; w: number; edge: EdgeT }[]>();
  NODES.forEach((n) => adj.set(n.id, []));
  for (const e of EDGES) {
    const w = edgeWeight(e, mode, crowdOverrides);
    if (w === null) continue;
    adj.get(e.from)!.push({ to: e.to, w, edge: e });
    adj.get(e.to)!.push({ to: e.from, w, edge: e });
  }
  return adj;
}

function minCostPerMeter(mode: Mode, crowdOverrides?: Record<string, number>): number {
  let minRatio = Infinity;
  for (const e of EDGES) {
    const w = edgeWeight(e, mode, crowdOverrides);
    if (w === null) continue;
    if (e.distance > 0) {
      minRatio = Math.min(minRatio, w / e.distance);
    } else {
      minRatio = Math.min(minRatio, w);
    }
  }
  return minRatio === Infinity ? 0 : minRatio;
}

function heuristic(nodeId: string, destId: string, mode: Mode, ratio: number): number {
  if (nodeId === destId) return 0;
  const a = getNode(nodeId);
  const b = getNode(destId);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy) * ratio;
}

function aStar(source: string, dest: string, mode: Mode, crowdOverrides?: Record<string, number>): string[] {
  const adj = buildAdj(mode, crowdOverrides);
  const heuristicRatio = minCostPerMeter(mode, crowdOverrides);

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();

  NODES.forEach((n) => {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
    cameFrom.set(n.id, null);
  });

  gScore.set(source, 0);
  fScore.set(source, heuristic(source, dest, mode, heuristicRatio));

  const openSet = new Set<string>([source]);

  while (openSet.size > 0) {
    let current: string | null = null;
    let bestF = Infinity;
    for (const nodeId of openSet) {
      const score = fScore.get(nodeId) ?? Infinity;
      if (score < bestF) {
        bestF = score;
        current = nodeId;
      }
    }
    if (current === null) break;
    if (current === dest) break;

    openSet.delete(current);

    const currentG = gScore.get(current) ?? Infinity;
    for (const { to, w } of adj.get(current) || []) {
      const tentativeG = currentG + w;
      if (tentativeG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentativeG);
        fScore.set(to, tentativeG + heuristic(to, dest, mode, heuristicRatio));
        openSet.add(to);
      }
    }
  }

  const path: string[] = [];
  let cur: string | null = dest;
  if ((gScore.get(dest) ?? Infinity) === Infinity) return [];
  while (cur) {
    path.unshift(cur);
    cur = cameFrom.get(cur) || null;
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

function generateSteps(path: string[]): RouteStep[] {
  if (path.length < 2) {
    const node = getNode(path[0]);
    return [{ text: "You are already at the destination.", floor: node.floor, kind: "arrival", nodeId: node.id }];
  }

  const out: RouteStep[] = [];
  const first = getNode(path[0]);
  out.push({ text: `Start at ${first.name}`, floor: first.floor, kind: "start", nodeId: first.id });

  for (let i = 0; i < path.length - 1; i++) {
    const a = getNode(path[i]);
    const b = getNode(path[i + 1]);
    const edge = findEdge(a.id, b.id)!;

    if (edge.type === "lift") {
      out.push({ text: `Take lift to floor ${b.floor}`, floor: b.floor, kind: "transition", nodeId: b.id });
      out.push({ text: `Now on Floor ${b.floor}`, floor: b.floor, kind: "transition", nodeId: b.id });
      continue;
    }
    if (edge.type === "stairs") {
      out.push({ text: `Take stairs to floor ${b.floor}`, floor: b.floor, kind: "transition", nodeId: b.id });
      out.push({ text: `Now on Floor ${b.floor}`, floor: b.floor, kind: "transition", nodeId: b.id });
      continue;
    }

    if (i === 0) {
      out.push({ text: `Head toward ${b.name} (${edge.distance} m)`, floor: b.floor, kind: "move", nodeId: b.id });
    } else {
      const prev = getNode(path[i - 1]);
      const prevEdge = findEdge(prev.id, a.id)!;
      if (prevEdge.type === "lift" || prevEdge.type === "stairs") {
        out.push({ text: `Head toward ${b.name} (${edge.distance} m)`, floor: b.floor, kind: "move", nodeId: b.id });
      } else {
        out.push({
          text: `${turnDirection(prev, a, b)} toward ${b.name} (${edge.distance} m)`,
          floor: b.floor,
          kind: "move",
          nodeId: b.id,
        });
      }
    }
  }
  const last = getNode(path[path.length - 1]);
  out.push({ text: `Arrive at ${last.name}`, floor: last.floor, kind: "arrival", nodeId: last.id });
  return out;
}

/** POST /get-route equivalent — fully local */
export function getRoute(req: RouteRequest): RouteResponse {
  const path = aStar(req.source, req.destination, req.mode, req.crowdOverrides);
  if (path.length === 0) {
    return { path: [], steps: [], instructions: ["No route available for this mode."], time: 0, distance: 0 };
  }
  let time = 0;
  let distance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const e = findEdge(path[i], path[i + 1])!;
    time += e.time;
    distance += e.distance;
  }
  const steps = generateSteps(path);
  return { path, steps, instructions: steps.map((step) => step.text), time, distance };
}
