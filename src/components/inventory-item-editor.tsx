"use client";

import { useState } from "react";

type ItemState = "PRESENT" | "DAMAGED" | "WRONG_COLOR" | "OTHER";
type Item = { id: string; sectionName?: string | null; status?: string; reviewNote?: string | null };

export function InventoryItemEditor({ instanceId, item, groupBy, onGroupBy, onSaved }: { instanceId: string; item: Item; groupBy: string; onGroupBy: (value: string) => void; onSaved: () => void }) {
  const [section, setSection] = useState(item.sectionName ?? "");
  const [status, setStatus] = useState<ItemState>(item.status === "DAMAGED" || item.status === "WRONG_COLOR" || item.status === "OTHER" ? item.status : "PRESENT");
  const [note, setNote] = useState(item.reviewNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/instances/${instanceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: item.id, sectionName: section.trim() || null, reviewStatus: status, reviewNote: note.trim() || null, reviewed: true, mutationId: crypto.randomUUID(), reason: "Inventurzustand und Lagerabschnitt bearbeitet" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Teileigenschaften konnten nicht gespeichert werden.");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Teileigenschaften konnten nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  return <div className="inventory-item-editor"><label>Abschnitt<input maxLength={80} value={section} onChange={(event) => setSection(event.target.value)} placeholder="z. B. Tüten 1–3" /></label><label>Zustand<select value={status} onChange={(event) => setStatus(event.target.value as ItemState)}><option value="PRESENT">Vorhanden</option><option value="DAMAGED">Beschädigt</option><option value="WRONG_COLOR">Falsche Farbe</option><option value="OTHER">Sonstiges</option></select></label><label>Notiz<input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label><label>Inventur gruppieren<select value={groupBy} onChange={(event) => onGroupBy(event.target.value)}><option value="number">Nach Teilenummer</option><option value="color">Nach Farbe</option><option value="category">Nach Kategorie</option><option value="section">Nach Abschnitt</option></select></label><button className="button secondary" disabled={busy} onClick={() => void save()}>{busy ? "Speichert …" : "Status speichern"}</button>{error && <small className="inline-error">{error}</small>}</div>;
}
