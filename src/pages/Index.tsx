import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HospitalMap from "@/components/HospitalMap";
import { EDGES, edgeKey, getRoute, Mode, NODES } from "@/backend/routes/navigation";
import { Activity, ArrowRight, ChevronLeft, ChevronRight, Clock, MapPin, Navigation, Route as RouteIcon, Users } from "lucide-react";

type RecommendationKey = "fastest" | "least_crowded" | "wheelchair" | "emergency";

interface RecommendationConfig {
  key: RecommendationKey;
  mode: Mode;
  label: string;
  description: string;
}

interface RouteInsight {
  averageCrowd: string;
  peakCrowd: number;
  floorChanges: number;
  usesLift: boolean;
  usesStairs: boolean;
  sameAsFastest: boolean;
}

const RECOMMENDATIONS: RecommendationConfig[] = [
  { key: "fastest", mode: "fastest", label: "Fastest route", description: "Balances time and live corridor load." },
  { key: "least_crowded", mode: "least_crowded", label: "Least crowded", description: "Prefers quieter corridors even if the walk is longer." },
  { key: "wheelchair", mode: "wheelchair", label: "Wheelchair-safe", description: "Avoids inaccessible stairs and favors lift-friendly travel." },
  { key: "emergency", mode: "emergency", label: "Emergency priority", description: "Strongly avoids congestion for urgent movement." },
];

function clampCrowd(value: number) {
  return Math.max(1, Math.min(9, Math.round(value)));
}

function buildLiveCrowdSnapshot(tick: number) {
  const corridorEdges = EDGES.filter((edge) => edge.type === "corridor");

  return Object.fromEntries(
    corridorEdges.map((edge, index) => {
      const wave = Math.sin(tick / 2 + index * 1.37) * 1.6;
      const drift = Math.cos(tick / 3 + index * 0.91) * 0.8;
      return [edgeKey(edge.from, edge.to), clampCrowd(edge.crowd + wave + drift)];
    })
  );
}

function buildRouteInsight(path: string[], crowdOverrides: Record<string, number>, fastestPath: string[]): RouteInsight {
  const edges = path.slice(0, -1).map((nodeId, index) =>
    EDGES.find(
      (edge) =>
        (edge.from === nodeId && edge.to === path[index + 1]) ||
        (edge.to === nodeId && edge.from === path[index + 1])
    )
  ).filter(Boolean);

  if (edges.length === 0) {
    return {
      averageCrowd: "0.0",
      peakCrowd: 0,
      floorChanges: 0,
      usesLift: false,
      usesStairs: false,
      sameAsFastest: path.join("→") === fastestPath.join("→"),
    };
  }

  const crowdLevels = edges
    .filter((edge) => edge!.type === "corridor")
    .map((edge) => crowdOverrides[edgeKey(edge!.from, edge!.to)] ?? edge!.crowd);

  return {
    averageCrowd: crowdLevels.length
      ? (crowdLevels.reduce((sum, value) => sum + value, 0) / crowdLevels.length).toFixed(1)
      : "0.0",
    peakCrowd: crowdLevels.length ? Math.max(...crowdLevels) : 0,
    floorChanges: edges.filter((edge) => edge!.type === "lift" || edge!.type === "stairs").length,
    usesLift: edges.some((edge) => edge!.type === "lift"),
    usesStairs: edges.some((edge) => edge!.type === "stairs"),
    sameAsFastest: path.join("→") === fastestPath.join("→"),
  };
}

export default function Index() {
  const [source, setSource] = useState("N1");
  const [destination, setDestination] = useState("N9");
  const [floor, setFloor] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<RecommendationKey>("fastest");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [liveCrowdTick, setLiveCrowdTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const floors = useMemo(() => Array.from(new Set(NODES.map((n) => n.floor))).sort(), []);
  const liveCrowd = useMemo(() => buildLiveCrowdSnapshot(liveCrowdTick), [liveCrowdTick]);
  const crowdValues = Object.values(liveCrowd);
  const averageCrowd = crowdValues.length
    ? (crowdValues.reduce((sum, value) => sum + value, 0) / crowdValues.length).toFixed(1)
    : "0.0";

  const recommendationResults = useMemo(
    () => {
      const baseResults = RECOMMENDATIONS.map((config) => ({
        ...config,
        route: getRoute({
          source,
          destination,
          mode: config.mode,
          crowdOverrides: liveCrowd,
        }),
      }));
      const fastestPath = baseResults.find((item) => item.key === "fastest")?.route.path ?? [];

      return baseResults.map((item) => ({
        ...item,
        insight: buildRouteInsight(item.route.path, liveCrowd, fastestPath),
      }));
    },
    [destination, liveCrowd, source]
  );

  const activeRecommendation =
    recommendationResults.find((item) => item.key === selectedRecommendation) ?? recommendationResults[0];
  const activeRoute = hasSearched ? activeRecommendation.route : null;
  const steps = activeRoute?.steps ?? [];
  const path = activeRoute?.path ?? [];
  const activeStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveCrowdTick((tick) => tick + 1);
      setLastUpdated(new Date());
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasSearched) return;
    setActiveStepIndex((current) => Math.min(current, Math.max(steps.length - 1, 0)));
  }, [hasSearched, steps]);

  useEffect(() => {
    if (!hasSearched || !activeStep) return;
    setFloor(activeStep.floor);
  }, [activeStep, hasSearched]);

  const handleFind = () => {
    setHasSearched(true);
    setSelectedRecommendation("fastest");
    setActiveStepIndex(0);
    const srcNode = NODES.find((node) => node.id === source);
    if (srcNode) setFloor(srcNode.floor);
  };

  const sourceNode = NODES.find((node) => node.id === source);
  const destinationNode = NODES.find((node) => node.id === destination);
  const transitionCount = steps.filter((step) => step.kind === "transition" && step.text.startsWith("Now on Floor")).length;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top,rgba(172,236,214,0.55),transparent_60%)]" />
      <header className="border-b border-white/60 bg-white/55 backdrop-blur-xl">
        <div className="container py-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-[0_18px_38px_-18px_rgba(35,128,100,0.6)]">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">WayCare</h1>
              <p className="text-xs text-muted-foreground">Mint-toned hospital indoor navigation</p>
            </div>
          </div>
          <Badge className="hidden md:inline-flex bg-white/80 text-foreground border border-white/70 shadow-sm hover:bg-white/80">
            Calm routing, live awareness
          </Badge>
        </div>
      </header>

      <main className="container py-10 grid lg:grid-cols-[390px_1fr] gap-7 relative">
        <div className="space-y-4">
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" /> Plan your route
            </h2>

            <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Live crowd</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" />
                    Average corridor load {averageCrowd}/9
                  </div>
                </div>
                <Badge variant="secondary">
                  Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODES.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} · F{node.floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Destination</label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODES.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} · F{node.floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={handleFind} disabled={source === destination}>
              <RouteIcon className="h-4 w-4 mr-2" /> Show route options
            </Button>
          </Card>

          {hasSearched && (
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Route-aware recommendations</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Compare the best route for time, crowd, accessibility, and emergencies.
                </p>
              </div>

              <div className="grid gap-3">
                {recommendationResults.map((item) => {
                  const isSelected = item.key === selectedRecommendation;
                  const isAvailable = item.route.path.length > 0;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        setSelectedRecommendation(item.key);
                        setActiveStepIndex(0);
                      }}
                      className={`rounded-[1.35rem] border p-4 text-left transition-all duration-200 ${
                        isSelected ? "border-primary/40 bg-primary/10 shadow-[0_22px_45px_-30px_rgba(35,128,100,0.55)]" : "border-white/70 bg-white/65 hover:border-primary/30 hover:bg-white/80"
                      } ${!isAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{item.label}</div>
                          <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
                        </div>
                        {isSelected && <Badge>Active</Badge>}
                      </div>

                      {isAvailable ? (
                        <div className="mt-3 space-y-2">
                          <div className="flex gap-3 text-sm">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> {item.route.time} min
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" /> {item.route.distance} m
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">Avg crowd {item.insight.averageCrowd}/9</Badge>
                            <Badge variant="outline">Peak {item.insight.peakCrowd}/9</Badge>
                            <Badge variant="outline">
                              {item.insight.floorChanges > 0
                                ? `${item.insight.floorChanges} floor change${item.insight.floorChanges > 1 ? "s" : ""}`
                                : "Single floor"}
                            </Badge>
                            <Badge variant="outline">{item.insight.usesLift ? "Uses lift" : "No lift"}</Badge>
                            <Badge variant="outline">{item.insight.usesStairs ? "Uses stairs" : "No stairs"}</Badge>
                          </div>

                          {item.key !== "fastest" && item.insight.sameAsFastest && (
                            <div className="text-xs text-muted-foreground">
                              Same corridor chain as the fastest route right now because this building graph has no better alternative for this pair.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-muted-foreground">No route available for this option.</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {activeRoute && (
            <Card className="p-6 space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 rounded-2xl border border-white/70 bg-white/65 p-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </div>
                  <div className="text-2xl font-bold">
                    {activeRoute.time}
                    <span className="text-sm font-normal text-muted-foreground"> min</span>
                  </div>
                </div>
                <div className="flex-1 rounded-2xl border border-white/70 bg-white/65 p-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Distance
                  </div>
                  <div className="text-2xl font-bold">
                    {activeRoute.distance}
                    <span className="text-sm font-normal text-muted-foreground"> m</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Follow mode</div>
                    <div className="text-sm font-semibold mt-1">
                      {sourceNode?.name} <ArrowRight className="inline h-3.5 w-3.5 mx-1" /> {destinationNode?.name}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {transitionCount > 0 ? `${transitionCount} floor transition${transitionCount > 1 ? "s" : ""}` : "Single-floor route"}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveStepIndex((index) => Math.max(index - 1, 0))}
                    disabled={activeStepIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Badge variant="secondary">
                    Step {steps.length === 0 ? 0 : activeStepIndex + 1} of {steps.length}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveStepIndex((index) => Math.min(index + 1, Math.max(steps.length - 1, 0)))}
                    disabled={activeStepIndex >= steps.length - 1}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Step-by-step</h3>
                <div className="space-y-2">
                  {steps.map((step, index) => {
                    const isActive = index === activeStepIndex;
                    const isTransition = step.kind === "transition";

                    return (
                      <button
                        key={`${step.text}-${index}`}
                        type="button"
                        onClick={() => setActiveStepIndex(index)}
                        className={`w-full rounded-[1.2rem] border px-3 py-3 text-left transition-all ${
                          isActive ? "border-primary/40 bg-primary/10 shadow-[0_20px_42px_-30px_rgba(35,128,100,0.55)]" : "border-white/70 bg-white/55 hover:border-primary/30 hover:bg-white/75"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 h-6 w-6 shrink-0 rounded-full text-xs grid place-items-center font-semibold ${
                              isTransition ? "bg-amber-100 text-amber-700" : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{step.text}</span>
                              <Badge variant="outline">Floor {step.floor}</Badge>
                              {isTransition && <Badge className="bg-amber-500 hover:bg-amber-500">Transition</Badge>}
                            </div>
                            {isTransition && step.text.startsWith("Now on Floor") && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                The map auto-switched to this floor so the next segment stays visible.
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {path.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                  {path.map((id, index) => (
                    <span key={id + index} className="inline-flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {id}
                      </Badge>
                      {index < path.length - 1 && <span className="text-muted-foreground">→</span>}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Floor {floor} — 2D Map</h2>
              {activeStep && <p className="text-xs text-muted-foreground mt-1">Showing the floor for the active guidance step.</p>}
            </div>
            <div className="flex gap-2">
              {floors.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={floor === value ? "default" : "outline"}
                  onClick={() => setFloor(value)}
                >
                  Floor {value}
                </Button>
              ))}
            </div>
          </div>

          <HospitalMap
            floor={floor}
            path={path}
            source={source}
            destination={destination}
            crowdLevels={liveCrowd}
            activeNodeId={activeStep?.nodeId}
          />

          <Card className="p-4 bg-white/70">
            <div className="flex flex-wrap gap-4 text-xs">
              <Legend color="hsl(var(--node-room))" label="Room" />
              <Legend color="hsl(var(--node-corridor))" label="Base corridor" />
              <Legend color="#22c55e" label="Low crowd" />
              <Legend color="#f59e0b" label="Medium crowd" />
              <Legend color="#dc2626" label="High crowd" />
              <Legend color="#f59e0b" label="Lift on route" ring />
              <Legend color="#7c3aed" label="Stairs on route" ring />
              <Legend color="hsl(var(--path))" label="Computed path" />
              <Legend color="hsl(var(--source))" label="Source" ring />
              <Legend color="hsl(var(--destination))" label="Destination" ring />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

const Legend = ({ color, label, ring }: { color: string; label: string; ring?: boolean }) => (
  <div className="flex items-center gap-2">
    <span className="h-3 w-3 rounded-full" style={ring ? { border: `2px solid ${color}` } : { background: color }} />
    <span className="text-muted-foreground">{label}</span>
  </div>
);
