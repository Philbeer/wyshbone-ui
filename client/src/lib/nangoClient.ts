import Nango from "@nangohq/frontend";

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

  const res = await fetch("/api/nango/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, userEmail, userDisplayName, allowedIntegrations })
  });
  const data = await res.json();
  if (!res.ok || !data?.token) throw new Error(data?.error || "Failed to obtain Nango session token");

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
