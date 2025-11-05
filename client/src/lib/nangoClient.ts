import Nango from "@nangohq/frontend";
import { addDevAuthParams } from "./queryClient";

export async function startNangoConnect(opts: {
  provider: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  allowedIntegrations?: string[];
  onConnect?: (connectionId: string) => void;
  onClose?: () => void;
}) {
  const { provider, userId, userEmail = "demo@wyshbone.com", userDisplayName = "Wyshbone Demo", allowedIntegrations, onConnect, onClose } = opts;

  // Only include allowedIntegrations if explicitly provided
  const requestBody: any = { userId, userEmail, userDisplayName };
  if (allowedIntegrations && allowedIntegrations.length > 0) {
    requestBody.allowedIntegrations = allowedIntegrations;
  }

  const url = addDevAuthParams("/api/nango/create-session");
  console.log("📤 Requesting Nango session from:", url);
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  
  console.log("📥 Nango session response status:", res.status);
  const data = await res.json();
  console.log("📥 Nango session data:", data);
  
  if (!res.ok || !data?.token) {
    console.error("❌ Failed to get Nango session:", data);
    throw new Error(data?.error || "Failed to obtain Nango session token");
  }
  
  console.log("✅ Got Nango session token:", data.token.substring(0, 20) + "...");

  const nango = new Nango({ connectSessionToken: data.token });

  const connectUI = nango.openConnectUI({
    onEvent: (event) => {
      if (event.type === "connect") onConnect?.(event?.payload?.connectionId);
      if (event.type === "close") onClose?.();
    }
  });
  await connectUI.setSessionToken(data.token);
  
  return true;
}
