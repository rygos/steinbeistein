"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

type SetResult = { id: string; nickname: string | null; definition: { setNumber: string; name: string; imageUrl: string | null } };
type PartResult = { id: string; part: { partNumber: string; name: string; imageUrl: string | null }; color: { name: string }; definition: { setNumber: string; name: string; instances: { id: string; nickname: string | null }[] } };

export function GlobalSearch({ onOpenSet, onOpenPart }: { onOpenSet: (id: string) => void; onOpenPart: (id: string, partNumber: string) => void }) {
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState<SetResult[]>([]);
  const [parts, setParts] = useState<PartResult[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setSets([]); setParts([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { void fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal }).then((response) => response.json()).then((result) => { setSets(result.sets); setParts(result.parts); setOpen(true); }).catch(() => undefined); }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);
  return <div className="global-search"><label className="global-search-input"><MagnifyingGlass size={17} /><input aria-label="Sammlung global durchsuchen" value={query} onFocus={() => setOpen(true)} onChange={(event) => setQuery(event.target.value)} placeholder="Sammlung durchsuchen …" />{query && <button aria-label="Suche leeren" onClick={() => setQuery("")}><X size={15} /></button>}</label>{open && query.trim().length >= 2 && <><button className="search-dismiss" aria-label="Suchergebnisse schließen" onClick={() => setOpen(false)} /><div className="global-search-results">{sets.map((set) => <button key={set.id} onClick={() => { setOpen(false); setQuery(""); onOpenSet(set.id); }}><b>{set.nickname || set.definition.name}</b><small>LEGO {set.definition.setNumber} · Set</small></button>)}{parts.map((part) => <button key={part.id} onClick={() => { const instanceId = part.definition.instances[0]?.id; if (instanceId) onOpenPart(instanceId, part.part.partNumber); setOpen(false); setQuery(""); }}><b>{part.part.name}</b><small>{part.part.partNumber} · {part.color.name} · {part.definition.name} ({part.definition.setNumber})</small></button>)}{!sets.length && !parts.length && <span>Keine passenden Sets oder Teile gefunden.</span>}</div></>}</div>;
}
