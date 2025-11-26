import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { buildApiUrl } from "@/lib/queryClient";

// ----- BOOTSTRAP: Session Reset & Validation -----
// This runs BEFORE React renders to ensure clean session state
const params = new URLSearchParams(window.location.search);

// If Bubble sends reset=1, clear all caches before anything else
if (params.get("reset") === "1") {
  try {
    localStorage.clear();
    sessionStorage.clear();
    console.log("🧹 Cache cleared because reset=1");
  } catch (e) {
    console.warn("Cache clear failed:", e);
  }
}

// Check if we have a session ID from Bubble
const sid = params.get("sid");

// Check for direct URL authentication (email links in development)
const userId = params.get("user_id");
const userEmail = params.get("user_email");

// Function to render the app
function renderApp() {
  createRoot(document.getElementById("root")!).render(<App />);
}

// If we have URL authentication params (email links), store them BEFORE rendering
if (userId && userEmail && !sid) {
  console.log("🔐 Email link authentication detected, storing user before app loads");
  const userName = userEmail.split("@")[0];
  const user = {
    id: userId,
    email: userEmail,
    name: userName.charAt(0).toUpperCase() + userName.slice(1)
  };
  
  try {
    localStorage.setItem("wyshbone_user", JSON.stringify(user));
    console.log("✅ User stored from URL params:", userEmail);
  } catch (e) {
    console.warn("Failed to write user to localStorage:", e);
  }
  
  // Now render the app with the user already in localStorage
  renderApp();
}
// If we have a session ID, validate it BEFORE rendering
else if (sid) {
  console.log("🔐 Validating session ID before app render...");
  
  fetch(buildApiUrl(`/api/validate-session/${sid}`), { credentials: "include" })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Session validation failed: ${res.status}`);
      }
      return res.json();
    })
    .then(({ userId, userEmail, defaultCountry, expiresAt }) => {
      // Create user object
      const userName = userEmail.split("@")[0];
      const user = {
        id: userId,
        email: userEmail,
        name: userName.charAt(0).toUpperCase() + userName.slice(1)
      };

      try {
        // Store session data (overwrite any old cached data)
        localStorage.setItem("wyshbone_sid", sid);
        localStorage.setItem("wyshbone_user", JSON.stringify(user));
        
        // Store default country if provided
        if (defaultCountry) {
          console.log(`🌍 Setting default country from session: ${defaultCountry}`);
          localStorage.setItem("defaultCountry", defaultCountry);
        }
        
        console.log("✅ Session validated, user stored:", user.email);
      } catch (e) {
        console.warn("Failed to write to localStorage:", e);
      }

      // Now render the app with validated session
      renderApp();
    })
    .catch(err => {
      console.error("❌ Session validation failed:", err);
      document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; text-align: center; padding: 20px;">
          <div>
            <h2 style="color: #ef4444; margin-bottom: 10px;">Session Invalid</h2>
            <p style="color: #6b7280;">Your session has expired or is invalid. Please refresh the page.</p>
          </div>
        </div>
      `;
    });
} else {
  // No session ID - render app normally (will use URL params or localStorage)
  console.log("⚠️ No session ID in URL, rendering app with fallback auth");
  renderApp();
}
