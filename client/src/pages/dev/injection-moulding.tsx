import InjectionMouldingDemo from "@/components/demos/InjectionMouldingDemo";
import type { MouldingScenario } from "@/components/demos/InjectionMouldingDemo";

export default function InjectionMouldingPage() {
  const handleRun = (scenario: MouldingScenario) => {
    window.dispatchEvent(new CustomEvent("wyshbone-prefill-chat", {
      detail: {
        message: "run the injection moulding demo",
        metadata: { demo: "injection_moulding", scenario },
        autoSend: true,
      },
    }));
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Injection Moulding Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure scenario parameters and run the injection moulding simulation.
          Clicking "Run demo" will send the scenario to the chat and trigger a supervisor task.
        </p>
      </div>
      <InjectionMouldingDemo onRun={handleRun} />
    </div>
  );
}
