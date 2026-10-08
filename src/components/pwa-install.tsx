"use client";

import { useEffect, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!prompt) return null;
  return <button className="pwa-install" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}><DownloadSimple size={15} />App installieren</button>;
}
