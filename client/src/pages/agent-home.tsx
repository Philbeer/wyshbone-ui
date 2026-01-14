/**
 * AgentHome - The new default home page showing agent workspace
 * 
 * This replaces the chat page as the default view in the new Agent-First UI.
 * Shows what the agent has been doing and provides quick access to CRM tools.
 */

import { AgentWorkspace } from "@/components/agent/AgentWorkspace";

export default function AgentHomePage() {
  return <AgentWorkspace />;
}


