"use client";

import { useEffect, useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";

type Change = { id: string; part: string; name: string; color: string; beforeMissing: number; afterMissing: number; reason: string | null; changedAt: string; undone: boolean };

export function SetHistory({ instanceId }: { instanceId: string }) {
  const [changes, setChanges] = useState<Change[]>([]);
  useEffect(() => { void fetch(`/api/instances/${instanceId}/changes`, { cache: "no-store" }).then((response) => response.json()).then(setChanges).catch(() => setChanges([])); }, [instanceId]);
  return <section className="set-history panel"><span className="eyebrow">ÄNDERUNGEN</span><h3><ClockCounterClockwise size={18} /> Inventurverlauf</h3>{changes.length ? changes.slice(0, 8).map((change) => <article key={change.id}><time>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(change.changedAt))}</time><span><b>{change.part}</b> · {change.color} · fehlend {change.beforeMissing} → {change.afterMissing}</span><small>{change.undone ? "Rückgängig gemacht" : change.reason || "Inventuränderung"}</small></article>) : <small>Noch keine protokollierten Inventuränderungen.</small>}</section>;
}
