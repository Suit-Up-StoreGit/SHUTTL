import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";
import { applyAppearance } from "./components/Preferences.tsx";
try {
  applyAppearance();
} catch {}
createRoot(document.getElementById("root")!).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
