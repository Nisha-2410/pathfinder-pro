import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import HospitalMap from "@/components/HospitalMap";
import { getRoute, Mode, NODES } from "@/backend/routes/navigation";
import { Activity, Clock, MapPin, Navigation, Route as RouteIcon } from "lucide-react";

const MODES: { value: Mode; label: string }[] = [
  { value: "fastest", label: "Fastest" },
  { value: "shortest", label: "Shortest" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "emergency", label: "Emergency" },
];

const Index = () => {
  const [source, setSource] = useState("N1");
  const [destination, setDestination] = useState("N9");
  const [mode, setMode] = useState<Mode>("fastest");
  const [floor, setFloor] = useState(1);
  const [result, setResult] = useState<ReturnType<typeof getRoute> | null>(null);

  const floors = useMemo(() => Array.from(new Set(NODES.map((n) => n.floor))).sort(), []);

  const handleFind = () => {
    const r = getRoute({ source, destination, mode });
    setResult(r);
    const srcNode = NODES.find((n) => n.id === source);
    if (srcNode) setFloor(srcNode.floor);
  };

  const path = result?.path ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container py-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">MediNav</h1>
            <p className="text-xs text-muted-foreground">Hospital Indoor Navigation System</p>
          </div>
        </div>
      </header>

      <main className="container py-8 grid lg:grid-cols-[360px_1fr] gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" /> Plan your route
            </h2>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NODES.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} <span className="text-muted-foreground">· F{n.floor}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Destination</label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NODES.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} <span className="text-muted-foreground">· F{n.floor}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <Button
                    key={m.value}
                    type="button"
                    variant={mode === m.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode(m.value)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={handleFind} disabled={source === destination}>
              <RouteIcon className="h-4 w-4 mr-2" /> Find Route
            </Button>
          </Card>

          {result && (
            <Card className="p-5 space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </div>
                  <div className="text-2xl font-bold">{result.time}<span className="text-sm font-normal text-muted-foreground"> min</span></div>
                </div>
                <div className="flex-1 rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Distance
                  </div>
                  <div className="text-2xl font-bold">{result.distance}<span className="text-sm font-normal text-muted-foreground"> m</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Step-by-step</h3>
                <ol className="space-y-2">
                  {result.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center font-semibold">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {path.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                  {path.map((id, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px]">{id}</Badge>
                      {i < path.length - 1 && <span className="text-muted-foreground">→</span>}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Map */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Floor {floor} — 2D Map</h2>
            <div className="flex gap-2">
              {floors.map((f) => (
                <Button key={f} size="sm"
                        variant={floor === f ? "default" : "outline"}
                        onClick={() => setFloor(f)}>
                  Floor {f}
                </Button>
              ))}
            </div>
          </div>

          <HospitalMap floor={floor} path={path} source={source} destination={destination} />

          <Card className="p-4">
            <div className="flex flex-wrap gap-4 text-xs">
              <Legend color="hsl(var(--node-room))" label="Room" />
              <Legend color="hsl(var(--node-corridor))" label="Corridor" />
              <Legend color="hsl(var(--node-lift))" label="Lift" />
              <Legend color="hsl(var(--node-stairs))" label="Stairs" />
              <Legend color="hsl(var(--path))" label="Computed path" />
              <Legend color="hsl(var(--source))" label="Source" ring />
              <Legend color="hsl(var(--destination))" label="Destination" ring />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

const Legend = ({ color, label, ring }: { color: string; label: string; ring?: boolean }) => (
  <div className="flex items-center gap-2">
    <span
      className="h-3 w-3 rounded-full"
      style={ring ? { border: `2px solid ${color}` } : { background: color }}
    />
    <span className="text-muted-foreground">{label}</span>
  </div>
);

export default Index;
