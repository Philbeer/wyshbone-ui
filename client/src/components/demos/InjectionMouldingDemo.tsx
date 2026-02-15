import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, Play, Loader2 } from "lucide-react";

export interface MouldingScenario {
  machines: number;
  resin_type: string;
  tool_id: string;
  ambient_temp_c: number;
  resin_moisture: "low" | "med" | "high";
  energy_price_band: "offpeak" | "normal" | "peak";
  max_scrap_percent: number;
}

const DEFAULTS: MouldingScenario = {
  machines: 5,
  resin_type: "recycled",
  tool_id: "T17",
  ambient_temp_c: 27,
  resin_moisture: "high",
  energy_price_band: "peak",
  max_scrap_percent: 7,
};

export default function InjectionMouldingDemo({ onRun }: { onRun: (scenario: MouldingScenario) => void }) {
  const [scenario, setScenario] = useState<MouldingScenario>({ ...DEFAULTS });
  const [running, setRunning] = useState(false);

  const update = <K extends keyof MouldingScenario>(key: K, value: MouldingScenario[K]) =>
    setScenario(prev => ({ ...prev, [key]: value }));

  const handleRun = () => {
    setRunning(true);
    onRun(scenario);
    setTimeout(() => setRunning(false), 2000);
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Factory className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-foreground">Injection moulding demo</h3>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Machines</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={scenario.machines}
            onChange={e => update("machines", parseInt(e.target.value) || 1)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Resin type</Label>
          <Input
            value={scenario.resin_type}
            onChange={e => update("resin_type", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tool ID</Label>
          <Input
            value={scenario.tool_id}
            onChange={e => update("tool_id", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ambient temp (°C)</Label>
          <Input
            type="number"
            min={0}
            max={60}
            value={scenario.ambient_temp_c}
            onChange={e => update("ambient_temp_c", parseInt(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Resin moisture</Label>
          <Select value={scenario.resin_moisture} onValueChange={v => update("resin_moisture", v as "low" | "med" | "high")}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="med">Med</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Energy price band</Label>
          <Select value={scenario.energy_price_band} onValueChange={v => update("energy_price_band", v as "offpeak" | "normal" | "peak")}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offpeak">Off-peak</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="peak">Peak</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Max scrap % (1–100)</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={scenario.max_scrap_percent}
            onChange={e => update("max_scrap_percent", Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="w-full"
        onClick={handleRun}
        disabled={running}
      >
        {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
        {running ? "Sending…" : "Run demo"}
      </Button>
    </div>
  );
}
