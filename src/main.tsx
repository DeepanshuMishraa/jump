import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import "./styles.css";

function NewTabPage() {
  const [mode, setMode] = useState<"search" | "switcher">("search");

  useEffect(() => {
    const handleMessage = (message: BrowserMessage) => {
      if (message.type === "open-palette") {
        setMode(message.mode || "search");
      }
    };
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, []);

  return (
    <App
      key={mode}
      initialMode={mode}
      onClose={() => {
        // If in switcher mode on new tab page, pressing esc can switch back to search mode
        if (mode === "switcher") {
          setMode("search");
        }
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NewTabPage />
  </StrictMode>,
);


