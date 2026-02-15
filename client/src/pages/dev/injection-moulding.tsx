import { useLocation } from "wouter";
import InjectionMouldingDemo from "@/components/demos/InjectionMouldingDemo";
import type { MouldingScenario } from "@/components/demos/InjectionMouldingDemo";

export default function InjectionMouldingPage() {
  const [, setLocation] = useLocation();

  const handleRun = (scenario: MouldingScenario) => {
    const detail = {
      message: "run the injection moulding demo",
      metadata: {
        demo: "injection_moulding",
        scenario,
        constraints: {
          max_scrap_percent: Number(scenario.max_scrap_percent),
        },
      },
      autoSend: true,
    };

    setLocation("/");

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", { detail }));
    }, 500);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Injection Moulding Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure scenario parameters and run the injection moulding simulation.
          Clicking "Run demo" will navigate to chat and send the scenario as a supervisor task.
        </p>
      </div>
      <InjectionMouldingDemo onRun={handleRun} />
    </div>
  );
}
