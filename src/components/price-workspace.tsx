"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, ChartLineUp, CircleNotch, Cube, MagnifyingGlass } from "@phosphor-icons/react";

type SetCard = Readonly<{ id: string; nickname: string | null; missing: number; complete: number; definition: Readonly<{ setNumber: string; name: string; year: number | null; imageUrl: string | null }> }>;
type MissingLine = Readonly<{ inventoryItemId: string; setNumber: string; quantity: number }>;
type PartGroup = Readonly<{ part: Readonly<{ id: string; number: string; name: string; imageUrl: string | null }>; color: Readonly<{ id: string; name: string; rgb: string | null }>; quantity: number; sets: readonly MissingLine[] }>;
type Quote = Readonly<{ currencyCode: string; avgPrice: number | null; qtyAvgPrice: number | null; minPrice: number | null; maxPrice: number | null; unitQuantity: number | null; totalQuantity: number | null; fetchedAt: string | Date }>;
type Result = Readonly<{ configured: boolean; countryCode: string | null }>;

const keyForSet = (id: string) => `set:${id}`;
const keyForPart = (group: PartGroup) => `part:${group.part.id}:${group.color.id}`;

function amount(value: number | null, currency: string): string {
  if (value === null) return "Keine Preisdaten";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

export function PriceWorkspace({ instances, missingGroups }: { instances: readonly SetCard[]; missingGroups: readonly PartGroup[] }) {
  const [status, setStatus] = useState<Result | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Readonly<{ quote: Quote; condition: "N" | "U"; guideType: "sold" | "stock" }>>>({});
  const [loading, setLoading] = useState("");
  const [condition, setCondition] = useState<"N" | "U">("U");
  const [guideType, setGuideType] = useState<"sold" | "stock">("sold");
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { void fetch("/api/bricklink/prices").then((response) => response.json()).then((data: Result) => setStatus(data)); }, []);

  const requestQuote = async (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }, force = false) => {
    setLoading(key); setNotice("");
    try {
      const response = await fetch("/api/bricklink/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, condition, guideType, refresh: force }) });
      const data = await response.json() as { price?: Quote; error?: string };
      if (!response.ok || !data.price) throw new Error(data.error ?? "Preisdaten konnten nicht geladen werden.");
      const price = data.price;
      if (!price) throw new Error("BrickLink hat keinen Preisleitfaden zurückgegeben.");
      setQuotes((current) => ({ ...current, [key]: { quote: price, condition, guideType } }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Preisdaten konnten nicht geladen werden."); }
    finally { setLoading(""); }
  };

  const filteredSets = instances.filter((item) => `${item.nickname ?? ""} ${item.definition.name} ${item.definition.setNumber}`.toLowerCase().includes(filter.toLowerCase()));
  const filteredParts = missingGroups.filter((item) => `${item.part.name} ${item.part.number} ${item.color.name}`.toLowerCase().includes(filter.toLowerCase()));
  const matchingQuote = (key: string) => { const cached = quotes[key]; return cached?.condition === condition && cached.guideType === guideType ? cached.quote : undefined; };
  const estimatedSetValue = instances.reduce((sum, instance) => sum + (matchingQuote(keyForSet(instance.id))?.avgPrice ?? 0), 0);
  const estimatedMissingValue = missingGroups.reduce((sum, group) => sum + group.quantity * (matchingQuote(keyForPart(group))?.avgPrice ?? 0), 0);
  const currency = Object.values(quotes).find((entry) => entry.condition === condition && entry.guideType === guideType)?.quote.currencyCode ?? null;

  return <section className="content price-workspace">
    <div className="page-heading"><div><div className="eyebrow">MARKTWERTE AUS BRICKLINK</div><h1>Preisermittlung</h1><p>Verkaufspreise der letzten sechs Monate oder aktuelle Angebote für Sets und farbgleiche Teile.</p></div><div className="price-options"><label>Zustand<select value={condition} onChange={(event) => setCondition(event.target.value as "N" | "U")}><option value="U">Gebraucht</option><option value="N">Neu</option></select></label><label>Preisbasis<select value={guideType} onChange={(event) => setGuideType(event.target.value as "sold" | "stock")}><option value="sold">Verkauft</option><option value="stock">Angebote</option></select></label></div></div>
    <div className="price-summary-grid"><article className="panel price-summary"><ChartLineUp size={20} /><small>Ermittelte Setwerte</small><b>{currency ? amount(estimatedSetValue, currency) : "–"}</b><span>Summe der geladenen Durchschnittswerte</span></article><article className="panel price-summary"><Cube size={20} /><small>Wiederbeschaffung der Fehlteile</small><b>{currency ? amount(estimatedMissingValue, currency) : "–"}</b><span>Nur Positionen mit geladenem Preisleitfaden</span></article><article className="panel price-provider"><small>DATENQUELLE</small><b>{status?.configured ? "BrickLink verbunden" : "BrickLink noch nicht konfiguriert"}</b><span>{status?.configured ? `Region ${status.countryCode ?? "laut BrickLink-Konto"} · Cache 24 Stunden` : "Für Preisabfragen die vier BrickLink OAuth-Werte in .env eintragen und den Container neu starten."}</span></article></div>
    {notice && <div className="inline-error" role="alert">{notice}</div>}
    <div className="searchbox price-filter"><MagnifyingGlass size={17} /><input aria-label="Preise filtern" placeholder="Set, Teilenummer oder Farbe suchen" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNG</div><h2>Sets</h2><p>BrickLink-Preisleitfaden für neue oder gebrauchte Sets.</p></div></div><div className="price-set-grid">{filteredSets.map((instance) => { const key = keyForSet(instance.id); const quote = matchingQuote(key); return <article className="panel price-set-card" key={instance.id}><div className="price-set-image">{instance.definition.imageUrl ? <img src={instance.definition.imageUrl} alt={instance.definition.name} loading="lazy" /> : <Cube size={25} />}</div><div className="price-set-content"><small>LEGO {instance.definition.setNumber} · {instance.definition.year ?? "Jahr unbekannt"}</small><b>{instance.nickname || instance.definition.name}</b><span>{instance.missing ? `${instance.missing} Teile fehlen` : "Vollständig"} · {instance.complete.toLocaleString("de-DE")} %</span>{quote ? <><strong>{amount(quote.avgPrice, quote.currencyCode)}</strong><span>{guideType === "sold" ? "Durchschnitt verkauft" : "Durchschnitt angeboten"} · {quote.unitQuantity ?? 0} Verkäufe</span><small>Von {amount(quote.minPrice, quote.currencyCode)} bis {amount(quote.maxPrice, quote.currencyCode)} · {new Date(quote.fetchedAt).toLocaleDateString("de-DE")}</small><button className="button quiet" disabled={!status?.configured || loading === key} onClick={() => void requestQuote(key, { setInstanceId: instance.id }, true)}>{loading === key ? "Aktualisiere …" : "Preis aktualisieren"}</button></> : <button className="button secondary" disabled={!status?.configured || loading === key} onClick={() => void requestQuote(key, { setInstanceId: instance.id })}>{loading === key ? <CircleNotch className="spin" size={16} /> : <ArrowClockwise size={16} />}Preis ermitteln</button>}</div></article>; })}{!filteredSets.length && <p className="muted">Keine passenden Sets.</p>}</div></section>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">FEHLTEILE</div><h2>Teile</h2><p>Preise werden je Teil und Farbe ermittelt. Klicke zum Aktualisieren erneut auf die Preisangabe.</p></div></div><div className="global-list panel">{filteredParts.map((group) => { const key = keyForPart(group); const quote = matchingQuote(key); const first = group.sets[0]; return <article className="global-row price-part-row" key={key}><div className="global-image price-part-image">{group.part.imageUrl ? <img src={group.part.imageUrl} alt="" loading="lazy" /> : <Cube size={22} />}</div><div className="global-part"><b>{group.part.name}</b><span>{group.part.number} · {group.color.name}</span></div><b className="global-total">{group.quantity}×</b><div className="price-part-value">{quote ? <><strong>{amount(quote.avgPrice, quote.currencyCode)}</strong><small>je Stück · {quote.unitQuantity ?? 0} Verkäufe</small><small>Fehlteile zusammen: {amount(group.quantity * (quote.avgPrice ?? 0), quote.currencyCode)}</small><button className="button quiet" disabled={!status?.configured || loading === key} onClick={() => first && void requestQuote(key, { inventoryItemId: first.inventoryItemId }, true)}>{loading === key ? "Lädt …" : "Aktualisieren"}</button></> : <button className="button secondary" disabled={!status?.configured || loading === key || !first} onClick={() => first && void requestQuote(key, { inventoryItemId: first.inventoryItemId })}>{loading === key ? <CircleNotch className="spin" size={16} /> : <ArrowClockwise size={16} />}Preis ermitteln</button>}</div></article>; })}{!filteredParts.length && <div className="empty-state"><Cube size={28} /><b>Keine Fehlteile</b></div>}</div></section>
    <p className="price-disclaimer">BrickLink-Preise sind Marktindikatoren, keine verbindlichen Bewertungen. Der Set-Preisleitfaden kann unvollständige Sets enthalten und passt den Wert nicht automatisch an Fehlteile, Zustand, Anleitung oder Originalkarton an. BrickLink stellt Preise in der Währung deines API-Kontos bereit.</p>
  </section>;
}
