import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Factory, Play, Loader2 } from "lucide-react";

export interface MachineProfile {
  machine_id: string;
  tool_id: string;
  resin_type: string;
}

export interface FactoryConditions {
  ambient_temp_c: number;
  resin_moisture: "low" | "med" | "high";
  energy_price_band: "offpeak" | "normal" | "peak";
}

export interface FactoryPayload {
  scenario: string;
  constraints: { max_scrap_percent: number };
  conditions: FactoryConditions;
  machines: {
    primary: MachineProfile;
    alternate: MachineProfile;
  };
}

export interface MouldingScenario {
  machines: number;
  resin_type: string;
  tool_id: string;
  ambient_temp_c: number;
  resin_moisture: "low" | "med" | "high";
  energy_price_band: "offpeak" | "normal" | "peak";
  max_scrap_percent: number;
}

const DEFAULT_PRIMARY: MachineProfile = {
  machine_id: "M1",
  tool_id: "T17",
  resin_type: "recycled",
};

const DEFAULT_ALTERNATE: MachineProfile = {
  machine_id: "M2",
  tool_id: "T22",
  resin_type: "virgin",
};

const DEFAULT_CONDITIONS: FactoryConditions = {
  ambient_temp_c: 27,
  resin_moisture: "high",
  energy_price_band: "peak",
};

function MachinePanel({
  label,
  profile,
  onChange,
}: {
  label: string;
  profile: MachineProfile;
  onChange: (updated: MachineProfile) => void;
}) {
  const update = <K extends keyof MachineProfile>(key: K, value: MachineProfile[K]) =>
    onChange({ ...profile, [key]: value });

  return (
    <div className="border border-border/60 rounded-md p-3 space-y-2 bg-muted/20">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Machine ID</Label>
          <Input
            value={profile.machine_id}
            onChange={e => update("machine_id", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Tool ID</Label>
          <Input
            value={profile.tool_id}
            onChange={e => update("tool_id", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Resin type</Label>
          <Input
            value={profile.resin_type}
            onChange={e => update("resin_type", e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

export default function InjectionMouldingDemo({ onRun }: { onRun: (scenario: MouldingScenario, factory: FactoryPayload) => void }) {
  const [primary, setPrimary] = useState<MachineProfile>({ ...DEFAULT_PRIMARY });
  const [alternate, setAlternate] = useState<MachineProfile>({ ...DEFAULT_ALTERNATE });
  const [conditions, setConditions] = useState<FactoryConditions>({ ...DEFAULT_CONDITIONS });
  const [maxScrap, setMaxScrap] = useState(7);
  const [running, setRunning] = useState(false);

  const updateCondition = <K extends keyof FactoryConditions>(key: K, value: FactoryConditions[K]) =>
    setConditions(prev => ({ ...prev, [key]: value }));

  const handleRun = () => {
    setRunning(true);

    const factory: FactoryPayload = {
      scenario: "moisture_high",
      constraints: { max_scrap_percent: maxScrap },
      conditions,
      machines: { primary, alternate },
    };

    const legacyScenario: MouldingScenario = {
      machines: 5,
      resin_type: primary.resin_type,
      tool_id: primary.tool_id,
      ambient_temp_c: conditions.ambient_temp_c,
      resin_moisture: conditions.resin_moisture,
      energy_price_band: conditions.energy_price_band,
      max_scrap_percent: maxScrap,
    };

    onRun(legacyScenario, factory);
    setTimeout(() => setRunning(false), 2000);
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card">
      <div>
        <div className="flex items-center gap-2">
          <Factory className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-foreground">Simulation Setup (Starting Factory Conditions)</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 ml-6">
          Define the factory conditions the agent will start with before production begins.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Machine profiles</p>
        <p className="text-[11px] text-muted-foreground">
          Configure the two machines available to the agent during this run.
        </p>
      </div>

      <MachinePanel label="Machine 1 (Primary)" profile={primary} onChange={setPrimary} />
      <MachinePanel label="Machine 2 (Alternate)" profile={alternate} onChange={setAlternate} />

      <div className="border-t border-border/50 pt-3 space-y-1.5">
        <p className="text-xs font-medium text-foreground">Shared factory conditions</p>
        <p className="text-[11px] text-muted-foreground">
          These apply to all machines and remain fixed during the run.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Ambient temp (°C)</Label>
          <Input
            type="number"
            min={0}
            max={60}
            value={conditions.ambient_temp_c}
            onChange={e => updateCondition("ambient_temp_c", parseInt(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Resin moisture</Label>
          <Select value={conditions.resin_moisture} onValueChange={v => updateCondition("resin_moisture", v as "low" | "med" | "high")}>
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
          <Label className="text-[11px]">Energy band</Label>
          <Select value={conditions.energy_price_band} onValueChange={v => updateCondition("energy_price_band", v as "offpeak" | "normal" | "peak")}>
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
      </div>

      <div className="border-t border-border/50 pt-3 space-y-1.5">
        <p className="text-xs font-medium text-foreground">Operational constraint</p>
        <p className="text-[11px] text-muted-foreground">
          This defines what success looks like for the agent.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Max scrap % (1–100)</Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={maxScrap}
          onChange={e => setMaxScrap(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
          className="h-7 text-xs"
        />
      </div>

      <p className="text-[10px] text-muted-foreground/70">
        The agent will monitor factory output and adapt or stop if this constraint is violated.
      </p>

      <Button
        size="sm"
        className="w-full"
        onClick={handleRun}
        disabled={running}
      >
        {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
        {running ? "Sending…" : "Run demo"}
      </Button>

      <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed">
        During the simulation, the system generates factory sensor readings (scrap rate, defects, energy use).
        The agent observes these and decides whether to continue, adapt the plan, or stop.
      </p>
    </div>
  );
}
