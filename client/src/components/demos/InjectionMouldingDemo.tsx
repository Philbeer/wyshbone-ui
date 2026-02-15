import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Factory, Play, Loader2, ChevronDown, Gauge } from "lucide-react";

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

export interface SensorReading {
  step: number;
  scrap: number | "";
}

export interface DemoSensorScript {
  primary: SensorReading[];
  alternate: SensorReading[];
}

export interface FactoryPayload {
  scenario: string;
  constraints: { max_scrap_percent: number };
  conditions: FactoryConditions;
  machines: {
    primary: MachineProfile;
    alternate: MachineProfile;
  };
  demo_sensor_script?: {
    primary: Array<{ step: number; scrap: number }>;
    alternate: Array<{ step: number; scrap: number }>;
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

const DEFAULT_SENSOR_SCRIPT: DemoSensorScript = {
  primary: [
    { step: 1, scrap: "" },
    { step: 2, scrap: "" },
  ],
  alternate: [
    { step: 3, scrap: "" },
  ],
};

interface StepPreset {
  step: number;
  machine: "primary" | "alternate";
  scrap_percent: number;
  defect_signals: string[];
  probable_cause: string;
  trend: "rising" | "stable" | "falling";
  achievable_scrap_floor_percent: number;
  energy_kwh_per_good_part: number;
}

const SIMULATOR_STEP_PRESETS: StepPreset[] = [
  {
    step: 1,
    machine: "primary",
    scrap_percent: 4.2,
    defect_signals: ["short_shot"],
    probable_cause: "Moisture absorption in recycled resin causing incomplete fills",
    trend: "rising",
    achievable_scrap_floor_percent: 2.0,
    energy_kwh_per_good_part: 1.35,
  },
  {
    step: 2,
    machine: "primary",
    scrap_percent: 8.1,
    defect_signals: ["short_shot", "flash"],
    probable_cause: "High ambient temp + moisture compound effect on melt viscosity",
    trend: "rising",
    achievable_scrap_floor_percent: 2.0,
    energy_kwh_per_good_part: 1.52,
  },
  {
    step: 3,
    machine: "alternate",
    scrap_percent: 1.8,
    defect_signals: [],
    probable_cause: "Virgin resin on clean tool — nominal conditions",
    trend: "stable",
    achievable_scrap_floor_percent: 1.5,
    energy_kwh_per_good_part: 1.10,
  },
];

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

function SensorStepRow({
  reading,
  onChange,
}: {
  reading: SensorReading;
  onChange: (updated: SensorReading) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted-foreground w-14 shrink-0">Step {reading.step}</span>
      <div className="flex-1 space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Scrap %</Label>
        <Input
          type="number"
          min={0}
          max={100}
          step={0.1}
          placeholder="auto"
          value={reading.scrap}
          onChange={e => {
            const val = e.target.value;
            onChange({ ...reading, scrap: val === "" ? "" : parseFloat(val) });
          }}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

function SensorMachineGroup({
  label,
  readings,
  onChange,
  onAddStep,
}: {
  label: string;
  readings: SensorReading[];
  onChange: (idx: number, updated: SensorReading) => void;
  onAddStep: () => void;
}) {
  return (
    <div className="border border-border/40 rounded-md p-2.5 space-y-2 bg-muted/10">
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      {readings.map((r, i) => (
        <SensorStepRow
          key={`${label}-${i}`}
          reading={r}
          onChange={updated => onChange(i, updated)}
        />
      ))}
      <button
        type="button"
        onClick={onAddStep}
        className="text-[10px] text-blue-500 hover:text-blue-600 font-medium"
      >
        + Add step
      </button>
    </div>
  );
}

function SimulatorStatePreview({
  sensorScript,
  primaryProfile,
  alternateProfile,
}: {
  sensorScript: DemoSensorScript;
  primaryProfile: MachineProfile;
  alternateProfile: MachineProfile;
}) {
  const resolvedSteps = SIMULATOR_STEP_PRESETS.map(preset => {
    const machineReadings = preset.machine === "primary" ? sensorScript.primary : sensorScript.alternate;
    const override = machineReadings.find(r => r.step === preset.step);
    const scrapOverridden = override && override.scrap !== "";
    const scrap = scrapOverridden ? Number(override!.scrap) : preset.scrap_percent;
    const machineProfile = preset.machine === "primary" ? primaryProfile : alternateProfile;
    const machineLabel = preset.machine === "primary"
      ? `${machineProfile.machine_id} (Primary)`
      : `${machineProfile.machine_id} (Alternate)`;

    return { ...preset, scrap_percent: scrap, scrapOverridden, machineLabel };
  });

  const trendColor = (t: string) => {
    if (t === "rising") return "text-red-600 dark:text-red-400";
    if (t === "falling") return "text-green-600 dark:text-green-400";
    return "text-muted-foreground";
  };

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Simulator state used for this run (demo mode)</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
          These values are fixed for this demo run. The agent reacts to them step-by-step.
        </p>
      </div>

      {resolvedSteps.map(step => (
        <div key={step.step} className="border border-border/40 rounded-md bg-background/80 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground">Step {step.step}</span>
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
              Machine: {step.machineLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scrap %</span>
              <span className={`font-mono font-medium ${step.scrapOverridden ? "text-blue-600 dark:text-blue-400" : ""}`}>
                {step.scrap_percent}%{step.scrapOverridden ? " (set)" : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend</span>
              <span className={`font-medium ${trendColor(step.trend)}`}>{step.trend}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scrap floor</span>
              <span className="font-mono">{step.achievable_scrap_floor_percent}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Energy / part</span>
              <span className="font-mono">{step.energy_kwh_per_good_part} kWh</span>
            </div>
            <div className="col-span-2 flex justify-between">
              <span className="text-muted-foreground">Defect signals</span>
              <span className="font-medium">
                {step.defect_signals.length > 0
                  ? step.defect_signals.join(", ")
                  : "none"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Probable cause: </span>
              <span className="text-foreground/80">{step.probable_cause}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InjectionMouldingDemo({ onRun }: { onRun: (scenario: MouldingScenario, factory: FactoryPayload) => void }) {
  const [primary, setPrimary] = useState<MachineProfile>({ ...DEFAULT_PRIMARY });
  const [alternate, setAlternate] = useState<MachineProfile>({ ...DEFAULT_ALTERNATE });
  const [conditions, setConditions] = useState<FactoryConditions>({ ...DEFAULT_CONDITIONS });
  const [maxScrap, setMaxScrap] = useState(7);
  const [running, setRunning] = useState(false);
  const [sensorScript, setSensorScript] = useState<DemoSensorScript>(JSON.parse(JSON.stringify(DEFAULT_SENSOR_SCRIPT)));
  const [sensorOpen, setSensorOpen] = useState(false);

  const updateCondition = <K extends keyof FactoryConditions>(key: K, value: FactoryConditions[K]) =>
    setConditions(prev => ({ ...prev, [key]: value }));

  const updateSensorReading = (machine: "primary" | "alternate", idx: number, updated: SensorReading) => {
    setSensorScript(prev => ({
      ...prev,
      [machine]: prev[machine].map((r, i) => (i === idx ? updated : r)),
    }));
  };

  const addSensorStep = (machine: "primary" | "alternate") => {
    setSensorScript(prev => {
      const existing = prev[machine];
      const maxStep = existing.length > 0 ? Math.max(...existing.map(r => r.step)) : 0;
      return {
        ...prev,
        [machine]: [...existing, { step: maxStep + 1, scrap: "" as const }],
      };
    });
  };

  const buildSensorPayload = (): FactoryPayload["demo_sensor_script"] | undefined => {
    const primaryFilled = sensorScript.primary.filter(r => r.scrap !== "");
    const alternateFilled = sensorScript.alternate.filter(r => r.scrap !== "");
    if (primaryFilled.length === 0 && alternateFilled.length === 0) return undefined;
    return {
      primary: primaryFilled.map(r => ({ step: r.step, scrap: Number(r.scrap) })),
      alternate: alternateFilled.map(r => ({ step: r.step, scrap: Number(r.scrap) })),
    };
  };

  const handleRun = () => {
    setRunning(true);

    const factory: FactoryPayload = {
      scenario: "moisture_high",
      constraints: { max_scrap_percent: maxScrap },
      conditions,
      machines: { primary, alternate },
    };

    const sensorPayload = buildSensorPayload();
    if (sensorPayload) {
      factory.demo_sensor_script = sensorPayload;
    }

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

      <Collapsible open={sensorOpen} onOpenChange={setSensorOpen}>
        <div className="border-t border-border/50 pt-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <div className="flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-foreground">Demo sensor controls (simulated factory readings)</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${sensorOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <p className="text-[10px] text-muted-foreground mt-1 ml-5.5 leading-relaxed">
            These values simulate what factory sensors report during the run. The agent does not know future readings and must react step-by-step.
          </p>
        </div>
        <CollapsibleContent className="mt-3 space-y-2.5">
          <SensorMachineGroup
            label={`Machine 1 — ${primary.machine_id} (Primary)`}
            readings={sensorScript.primary}
            onChange={(idx, updated) => updateSensorReading("primary", idx, updated)}
            onAddStep={() => addSensorStep("primary")}
          />
          <SensorMachineGroup
            label={`Machine 2 — ${alternate.machine_id} (Alternate)`}
            readings={sensorScript.alternate}
            onChange={(idx, updated) => updateSensorReading("alternate", idx, updated)}
            onAddStep={() => addSensorStep("alternate")}
          />
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            Leave fields blank to use default presets. Filled values override what the simulated sensors report at each step.
          </p>
        </CollapsibleContent>
      </Collapsible>

      <Button
        size="sm"
        className="w-full"
        onClick={handleRun}
        disabled={running}
      >
        {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
        {running ? "Sending…" : "Run demo"}
      </Button>

      <SimulatorStatePreview
        sensorScript={sensorScript}
        primaryProfile={primary}
        alternateProfile={alternate}
      />
    </div>
  );
}
