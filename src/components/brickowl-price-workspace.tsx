"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, ChartLineUp, Cube, MagnifyingGlass } from "@phosphor-icons/react";

type SetCard = Readonly<{ id: string; nickname: string | null; missing: number; complete: number; definition: Readonly<{ setNumber: string; name: string; year: number | null; imageUrl: string | null }> }>;
type PartGroup = Readonly<{ part: Readonly<{ id: string; number: string; name: string; imageUrl: string | null }>; color: Readonly<{ id: string; name: string }>; quantity: number; sets: readonly Readonly<{ inventoryItemId: string }>[] }>;
type Quote = Readonly<{ currencyCode: string; avgPrice: number | null; minPrice: number | null; maxPrice: number | null; fetchedAt: string }>;
type Status = Readonly<{ configured: boolean; approvalRequired: boolean }>;
type CachedQuote = Readonly<{ quote: Quote; label: string }>;
const setKey = (id: string) => `set:${id}`;
const partKey = (part: PartGroup) => `part:${part.part.id}:${part.color.id}`;
const money = (value: number | null, currency: string) => value === null ? "Keine Preisdaten" : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);

export function PriceWorkspace({ instances, missingGroups }: { instances: readonly SetCard[]; missingGroups: readonly PartGroup[] }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [quotes, setQuotes] = useState<Record<string, CachedQuote>>({});
  const [loading, setLoading] = useState("");
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { void fetch("/api/brickowl/prices").then((response) => response.json()).then((data: Status) => setStatus(data)); }, []);
  const request = async (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }, label: string, refresh = false) => {
    setLoading(key); setNotice("");
    try {
      const response = await fetch("/api/brickowl/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, refresh }) });
      const body = await response.json() as { price?: Quote; error?: string };
      if (!response.ok || !body.price) throw new Error(body.error ?? "BrickOwl-Preis konnte nicht geladen werden.");
      setQuotes((current) => ({ ...current, [key]: { quote: body.price!, label } }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "BrickOwl-Preis konnte nicht geladen werden."); }
    finally { setLoading(""); }
  };
  const search = filter.toLowerCase();
  const sets = instances.filter((row) => `${row.nickname ?? ""} ${row.definition.name} ${row.definition.setNumber}`.toLowerCase().includes(search));
  const parts = missingGroups.filter((row) => `${row.part.name} ${row.part.number} ${row.color.name}`.toLowerCase().includes(search));
  const totalValue = [...Object.values(quotes)].reduce((sum, row) => sum + (row.quote.avgPrice ?? 0), 0);
  const currency = Object.values(quotes)[0]?.quote.currencyCode ?? "GBP";
  return <section className="content price-workspace"><div className="page-heading"><div><div className="eyebrow">MARKTWERTE AUS BRICKOWL</div><h1>Preisermittlung</h1><p>Preisverlauf und Marktwerte aus dem BrickOwl-Katalog.</p></div></div>
    <div className="price-summary-grid"><article className="panel price-summary"><ChartLineUp size={20} /><small>Geladene Marktwerte</small><b>{money(totalValue, currency)}</b><span>Summe der geladenen Durchschnittswerte</span></article><article className="panel price-provider"><small>DATENQUELLE</small><b>{status?.configured ? "BrickOwl API-Schlüssel eingerichtet" : "BrickOwl API-Schlüssel fehlt"}</b><span>{status?.configured ? "Preise werden 24 Stunden zwischengespeichert. BrickOwl-Preisverläufe sind in GBP." : "BRICKOWL_API_KEY in .env eintragen und den App-Container neu starten. Preisverläufe erfordern BrickOwl Catalog Approval."}</span></article><article className="panel price-provider"><small>BRICKOWL</small><b>Kein Händler-Shop nötig</b><span>Ein BrickOwl-Konto und API-Schlüssel sind erforderlich. Preisendpunkte benötigen eine Katalogfreigabe.</span></article></div>
    {notice && <div className="inline-error" role="alert">{notice}</div>}<div className="searchbox price-filter"><MagnifyingGlass size={17} /><input aria-label="Marktwerte filtern" placeholder="Set, Teilenummer oder Farbe suchen" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNG</div><h2>Sets</h2></div></div><div className="price-set-grid">{sets.map((row) => { const key = setKey(row.id); const value = quotes[key]; return <article className="panel price-set-card" key={row.id}><div className="price-set-image">{row.definition.imageUrl ? <img src={row.definition.imageUrl} alt={row.definition.name} loading="lazy" /> : <Cube size={25} />}</div><div className="price-set-content"><small>LEGO {row.definition.setNumber} · {row.definition.year ?? "Jahr unbekannt"}</small><b>{row.nickname || row.definition.name}</b><span>{row.missing ? `${row.missing} Teile fehlen` : "Vollständig"} · {row.complete.toLocaleString("de-DE")} %</span>{value && <><strong>{money(value.quote.avgPrice, value.quote.currencyCode)}</strong><small>{value.label} · {new Date(value.quote.fetchedAt).toLocaleDateString("de-DE")}</small><small>Spanne: {money(value.quote.minPrice, value.quote.currencyCode)} bis {money(value.quote.maxPrice, value.quote.currencyCode)}</small></>}<button className="button secondary" disabled={!status?.configured || loading === key} onClick={() => void request(key, { setInstanceId: row.id }, "BrickOwl Preisverlauf", Boolean(value))}><ArrowClockwise size={16} />{loading === key ? "Lädt …" : value ? "Aktualisieren" : "Preis ermitteln"}</button></div></article>; })}</div></section>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">FEHLTEILE</div><h2>Teile</h2><p>Teilepreise werden anhand der LEGO Element-ID zugeordnet, wenn diese vorhanden ist.</p></div></div><div className="global-list panel">{parts.map((row) => { const key = partKey(row); const value = quotes[key]; const first = row.sets[0]; return <article className="global-row price-part-row" key={key}><div className="global-image price-part-image">{row.part.imageUrl ? <img src={row.part.imageUrl} alt="" loading="lazy" /> : <Cube size={22} />}</div><div className="global-part"><b>{row.part.name}</b><span>{row.part.number} · {row.color.name}</span></div><b className="global-total">{row.quantity}×</b><div className="price-part-value">{value && <><strong>{money(value.quote.avgPrice, value.quote.currencyCode)}</strong><small>BrickOwl Preisverlauf · {new Date(value.quote.fetchedAt).toLocaleDateString("de-DE")}</small></>}<button className="button secondary" disabled={!status?.configured || loading === key || !first} onClick={() => first && void request(key, { inventoryItemId: first.inventoryItemId }, `${row.part.number} · ${row.color.name}`, Boolean(value))}><ArrowClockwise size={16} />{loading === key ? "Lädt …" : value ? "Aktualisieren" : "Preis ermitteln"}</button></div></article>; })}{!parts.length && <div className="empty-state"><Cube size={28} /><b>Keine Fehlteile</b></div>}</div></section>
    <p className="price-disclaimer">Preisdaten und Kataloginformationen: <a href="https://www.brickowl.com" target="_blank" rel="noreferrer">BrickOwl</a>. Zusammengefasste Preisverläufe werden in GBP angezeigt. Bei seltenen oder neuen Teilen können Daten fehlen. Preisendpunkte erfordern BrickOwl Catalog Approval.</p>
  </section>;
}
