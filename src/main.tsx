import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import { useMountEffect } from "./hooks/useMountEffect";
import "./styles.css";

function NewTabPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "switcher">("search");
  const [activeTabId, setActiveTabId] = useState<number | undefined>();
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useMountEffect(() => {
    const handleMessage = (message: BrowserMessage) => {
      if (message.type === "open-palette") {
        setMode(message.mode || "search");
        setActiveTabId(message.activeTabId);
        setIsOpen(true);
      }
    };
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  });

  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpenRef.current) {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
          e.preventDefault();
          setMode("search");
          setIsOpen(true);
        } else if (e.altKey && e.key.toLowerCase() === "q") {
          e.preventDefault();
          setMode("switcher");
          setIsOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  });

  if (!isOpen) {
    return <div className="newtab-canvas" />;
  }

  return (
    <App
      key={mode}
      initialMode={mode}
      initialActiveTabId={activeTabId}
      onClose={() => setIsOpen(false)}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NewTabPage />
  </StrictMode>,
);



