"use client";

import { useEffect, useState } from "react";
import { ArrowBendDownRight, Check } from "@phosphor-icons/react";

type DemandSet = Readonly<{ instanceId: string; name: string; setNumber: string; quantity: number }>;

export function StockAssignment({ partId, colorId, sets, available, onAssigned }: { partId: string; colorId: string; sets: readonly DemandSet[]; available: number; onAssigned: () => Promise<void> }) {
  const [instanceId, setInstanceId] = useState(sets[0]?.instanceId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("");
  useEffect(() => { if (!sets.some((item) => item.instanceId === instanceId)) setInstanceId(sets[0]?.instanceId ?? ""); }, [sets, instanceId]);
  const target = sets.find((item) => item.instanceId === instanceId);
  const maximum = Math.min(available, target?.quantity ?? 0);
  const assign = async () => {
    const response = await fetch("/api/loose-stock/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId, colorId, instanceId, quantity }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setStatus(result.error ?? "Zuweisung fehlgeschlagen."); return; }
    setStatus(`${quantity} Teil${quantity === 1 ? "" : "e"} dem Set zugewiesen.`);
    setQuantity(1);
    await onAssigned();
  };

  if (!sets.length) return <small>Kein Fehlbedarf in deinen Sets.</small>;
  return <div className="stock-assignment"><label>Dem Set zuweisen<select aria-label="Ziel-Set wählen" value={instanceId} onChange={(event) => setInstanceId(event.target.value)}>{sets.map((item) => <option key={item.instanceId} value={item.instanceId}>{item.name} ({item.setNumber}) · {item.quantity} fehlen</option>)}</select></label><label>Menge<input aria-label="Gefundene Menge" type="number" min={1} max={maximum} value={quantity} onChange={(event) => setQuantity(Math.min(maximum || 1, Math.max(1, Number(event.target.value) || 1)))} /></label><button className="button secondary" disabled={!maximum || quantity > maximum} onClick={() => void assign()}><Check size={15} />Gefunden</button><span className="stock-assignment-status" role="status">{status || <><ArrowBendDownRight size={14} />{available} verfügbar · {target?.quantity ?? 0} fehlen</>}</span></div>;
}
