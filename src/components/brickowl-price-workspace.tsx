"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ChartLineUp, Cube, MagnifyingGlass, PencilSimple } from "@phosphor-icons/react";
import { manualPriceCurrencies, type ManualPriceCurrency } from "@/lib/manual-price";

type SetCard = Readonly<{ id: string; nickname: string | null; missing: number; complete: number; definition: Readonly<{ setNumber: string; name: string; year: number | null; imageUrl: string | null }> }>;
type PriceInventoryItem = Readonly<{ id: string; quantity: number; isManual: boolean; missing: number; part: Readonly<{ id: string; number: string; name: string; imageUrl: string | null }>; color: Readonly<{ id: string; name: string }> }>;
type PriceableSet = SetCard & Readonly<{ inventory: readonly PriceInventoryItem[] }>;
type PartGroup = Readonly<{ part: Readonly<{ id: string; number: string; name: string; imageUrl: string | null }>; color: Readonly<{ id: string; name: string }>; quantity: number; sets: readonly Readonly<{ inventoryItemId: string }>[] }>;
type CatalogPartGroup = PartGroup & Readonly<{ missingQuantity: number }>;
type Quote = Readonly<{ currencyCode: string; avgPrice: number | null; minPrice: number | null; maxPrice: number | null; fetchedAt: string }>;
type CachedQuote = Readonly<{ quote: Quote; label: string; source: "api" | "manual" }>;
type SavedQuote = Quote & Readonly<{ key: string; source: "manual" | "api"; itemType: "SET" | "PART"; itemNumber: string }>;
type Status = Readonly<{ configured: boolean; approvalRequired: boolean; prices?: readonly SavedQuote[] }>;
type InventoryResponse = readonly Readonly<{ instanceId: string; inventory: readonly PriceInventoryItem[] }>[];
type Notice = Readonly<{ tone: "error" | "ok"; text: string }>;

const setKey = (id: string) => `set:${id}`;
const partKey = (part: PartGroup) => `part:${part.part.id}:${part.color.id}`;
const money = (value: number | null, currency: string) => value === null ? "Keine Preisdaten" : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? fallback);
  }
  return response.json() as Promise<T>;
}

function parsePrice(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 1_000_000 ? amount : null;
}

function sumMoney(rows: readonly { amount: number; currency: string }[]): string {
  const groups = new Map<string, number>();
  for (const row of rows) groups.set(row.currency, (groups.get(row.currency) ?? 0) + row.amount);
  if (groups.size === 0) return "–";
  return [...groups].map(([currency, value]) => money(value, currency)).join(" · ");
}

function formatTotals(totals: ReadonlyMap<string, number>): string {
  return totals.size ? [...totals].map(([currency, amount]) => money(amount, currency)).join(" · ") : "Noch keine Teilepreise";
}

function ManualPriceForm({ label, draft, currency, busy, onDraft, onCurrency, onSubmit, onCancel }: {
  label: string; draft: string; currency: ManualPriceCurrency; busy: boolean;
  onDraft: (value: string) => void; onCurrency: (value: ManualPriceCurrency) => void; onSubmit: () => void; onCancel: () => void;
}) {
  return <form className="manual-price-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <label>{label}<input inputMode="decimal" autoComplete="off" aria-label={label} placeholder="0,00" value={draft} onChange={(event) => onDraft(event.target.value)} /></label>
    <label>Währung<select aria-label="Währung" value={currency} onChange={(event) => onCurrency(event.target.value as ManualPriceCurrency)}>{manualPriceCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
    <button className="button primary" type="submit" disabled={busy}>{busy ? "Speichert …" : "Speichern"}</button>
    <button className="button quiet" type="button" onClick={onCancel}>Abbrechen</button>
  </form>;
}

export function PriceWorkspace({ instances, missingGroups }: { instances: readonly SetCard[]; missingGroups: readonly PartGroup[] }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [inventoryByInstance, setInventoryByInstance] = useState<Record<string, readonly PriceInventoryItem[]>>({});
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, CachedQuote>>({});
  const [loading, setLoading] = useState("");
  const [filter, setFilter] = useState("");
  const [partsPage, setPartsPage] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editor, setEditor] = useState("");
  const [draft, setDraft] = useState("");
  const [currency, setCurrency] = useState<ManualPriceCurrency>("EUR");

  useEffect(() => {
    void Promise.all([
      fetch("/api/brickowl/prices").then((response) => readJson<Status>(response, "Gespeicherte Marktwerte konnten nicht geladen werden.")),
      fetch("/api/brickowl/prices/inventory").then((response) => readJson<InventoryResponse>(response, "Setinventare für die Marktwerte konnten nicht geladen werden.")),
    ]).then(([data, inventory]) => {
      setStatus(data);
      setInventoryByInstance(Object.fromEntries(inventory.map((instance) => [instance.instanceId, instance.inventory])));
      const stored = data.prices ?? [];
      if (stored.length === 0) return;
      setQuotes((current) => {
        const next = { ...current };
        for (const row of stored) {
          const quote = { quote: row, label: row.source === "manual" ? "Manuell eingetragen" : "BrickOwl-Preis", source: row.source } as const;
          if (row.itemType === "PART") next[row.key] = quote;
          else if (row.source === "manual") next[row.key] = quote;
          else for (const instance of instances) if (instance.definition.setNumber === row.itemNumber) next[setKey(instance.id)] = quote;
        }
        return next;
      });
    }).catch((error: unknown) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Marktwerte konnten nicht geladen werden." })).finally(() => setInventoryLoading(false));
  }, [instances]);

  const openEditor = (key: string, existing?: CachedQuote) => {
    setEditor(key);
    setDraft(existing?.quote.avgPrice != null ? existing.quote.avgPrice.toFixed(2).replace(".", ",") : "");
    const storedCurrency = existing?.quote.currencyCode;
    setCurrency(existing?.source === "manual" && storedCurrency && (manualPriceCurrencies as readonly string[]).includes(storedCurrency) ? storedCurrency as ManualPriceCurrency : "EUR");
    setNotice(null);
  };

  const request = async (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }, label: string, refresh = false) => {
    setLoading(`load:${key}`); setNotice(null);
    try {
      const response = await fetch("/api/brickowl/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, refresh }) });
      const body = await readJson<{ price?: Quote & { source?: string }; manual?: boolean; error?: string }>(response, "BrickOwl-Preis konnte nicht geladen werden.");
      if (!body.price) throw new Error(body.error ?? "BrickOwl-Preis konnte nicht geladen werden.");
      const source = body.manual || body.price.source === "manual" ? "manual" : "api";
      setQuotes((current) => ({ ...current, [key]: { quote: body.price!, label: source === "manual" ? "Manuell eingetragen" : label, source } }));
      if (source === "manual") setNotice({ tone: "ok", text: "Der manuelle Preis bleibt gespeichert und wird nicht durch BrickOwl ersetzt." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "BrickOwl-Preis konnte nicht geladen werden." }); }
    finally { setLoading(""); }
  };

  const saveManual = async (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }) => {
    const avgPrice = parsePrice(draft);
    if (avgPrice === null) { setNotice({ tone: "error", text: "Bitte einen Preis ab 0 mit höchstens zwei Nachkommastellen eintragen." }); return; }
    setLoading(`save:${key}`); setNotice(null);
    try {
      const response = await fetch("/api/brickowl/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, manualPrice: { avgPrice, currencyCode: currency } }) });
      const body = await readJson<{ price?: Quote; error?: string }>(response, "Preis konnte nicht gespeichert werden.");
      if (!body.price) throw new Error(body.error ?? "Preis konnte nicht gespeichert werden.");
      setQuotes((current) => ({ ...current, [key]: { quote: body.price!, label: "Manuell eingetragen", source: "manual" } }));
      setEditor("");
      setNotice({ tone: "ok", text: "Preis gespeichert. Er wird nicht nach 24 Stunden automatisch aktualisiert." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Preis konnte nicht gespeichert werden." }); }
    finally { setLoading(""); }
  };

  const clearManual = async (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }) => {
    setLoading(`clear:${key}`); setNotice(null);
    try {
      const response = await fetch("/api/brickowl/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, clearManual: true }) });
      const body = await readJson<{ cleared?: boolean; error?: string }>(response, "Manueller Preis konnte nicht entfernt werden.");
      if (!body.cleared) throw new Error(body.error ?? "Manueller Preis konnte nicht entfernt werden.");
      setQuotes((current) => { const next = { ...current }; delete next[key]; return next; });
      if (editor === key) setEditor("");
      setNotice({ tone: "ok", text: "Manueller Preis entfernt. Ein BrickOwl-Abruf kann ihn danach neu laden." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Manueller Preis konnte nicht entfernt werden." }); }
    finally { setLoading(""); }
  };

  const search = filter.toLowerCase();
  const priceableInstances = useMemo<PriceableSet[]>(() => instances.map((instance) => ({ ...instance, inventory: inventoryByInstance[instance.id] ?? [] })), [instances, inventoryByInstance]);
  const sets = priceableInstances.filter((row) => `${row.nickname ?? ""} ${row.definition.name} ${row.definition.setNumber}`.toLowerCase().includes(search));
  const allParts = useMemo(() => {
    const groups = new Map<string, { part: PartGroup["part"]; color: PartGroup["color"]; quantity: number; missingQuantity: number; sets: Map<string, { inventoryItemId: string }> }>();
    for (const instance of priceableInstances) for (const item of instance.inventory) {
      if (item.isManual) continue;
      const key = `${item.part.id}:${item.color.id}`;
      const group = groups.get(key) ?? { part: item.part, color: item.color, quantity: 0, missingQuantity: 0, sets: new Map() };
      group.quantity += item.quantity;
      group.missingQuantity += item.missing;
      group.sets.set(item.id, { inventoryItemId: item.id });
      groups.set(key, group);
    }
    return [...groups.values()].map((group): CatalogPartGroup => ({ ...group, sets: [...group.sets.values()] })).sort((a, b) => a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de"));
  }, [priceableInstances]);
  const parts = allParts.filter((row) => `${row.part.name} ${row.part.number} ${row.color.name}`.toLowerCase().includes(search));
  const pageCount = Math.ceil(parts.length / 50);
  const visibleParts = parts.slice(partsPage * 50, (partsPage + 1) * 50);
  const priced = (key: string) => { const row = quotes[key]; return row?.quote.avgPrice == null ? null : { amount: row.quote.avgPrice, currency: row.quote.currencyCode }; };
  const setTotal = sumMoney(instances.flatMap((row) => { const price = priced(setKey(row.id)); return price ? [price] : []; }));
  const missingTotal = sumMoney(missingGroups.flatMap((row) => { const price = priced(partKey(row)); return price ? [{ amount: price.amount * row.quantity, currency: price.currency }] : []; }));
  const partsValue = (inventory: PriceableSet["inventory"]) => {
    const totals = new Map<string, number>();
    let pricedPositions = 0;
    let pricedPieces = 0;
    let positions = 0;
    let pieces = 0;
    for (const item of inventory) {
      if (item.isManual) continue;
      positions += 1;
      pieces += item.quantity;
      const price = priced(`part:${item.part.id}:${item.color.id}`);
      if (!price) continue;
      pricedPositions += 1;
      pricedPieces += item.quantity;
      totals.set(price.currency, (totals.get(price.currency) ?? 0) + price.amount * item.quantity);
    }
    return { totals, pricedPositions, pricedPieces, positions, pieces };
  };

  const actions = (key: string, payload: { setInstanceId?: string; inventoryItemId?: string }, label: string, priceLabel: string) => {
    const value = quotes[key];
    const manual = value?.source === "manual";
    const busy = loading.endsWith(`:${key}`);
    return <>
      {value && <>
        <strong>{money(value.quote.avgPrice, value.quote.currencyCode)}</strong>
        <small>{value.label} · {new Date(value.quote.fetchedAt).toLocaleDateString("de-DE")}</small>
        {manual ? <small className="price-manual-note">Bleibt gespeichert und wird nicht nach 24 Stunden ersetzt.</small> : <small>Spanne: {money(value.quote.minPrice, value.quote.currencyCode)} bis {money(value.quote.maxPrice, value.quote.currencyCode)}</small>}
      </>}
      <div className="price-actions">
        {!manual && <button className="button secondary" type="button" disabled={!status?.configured || busy} onClick={() => void request(key, payload, label, Boolean(value))}><ArrowClockwise size={16} />{loading === `load:${key}` ? "Lädt …" : value ? "Aktualisieren" : "Preis ermitteln"}</button>}
        <button className="button secondary" type="button" aria-expanded={editor === key} disabled={busy} onClick={() => editor === key ? setEditor("") : openEditor(key, value)}><PencilSimple size={16} />{manual ? "Preis ändern" : "Preis eintragen"}</button>
        {manual && <button className="button quiet" type="button" disabled={busy} onClick={() => void clearManual(key, payload)}>Entfernen</button>}
      </div>
      {editor === key && <ManualPriceForm label={priceLabel} draft={draft} currency={currency} busy={loading === `save:${key}`} onDraft={setDraft} onCurrency={setCurrency} onSubmit={() => void saveManual(key, payload)} onCancel={() => setEditor("")} />}
    </>;
  };

  return <section className="content price-workspace">
    <div className="page-heading"><div><div className="eyebrow">MARKTWERTE AUS BRICKOWL</div><h1>Preisermittlung</h1><p>Preisverlauf aus BrickOwl oder eigene Preise. Selbst eingetragene Werte bleiben gespeichert.</p></div></div>
    <div className="price-summary-grid">
      <article className="panel price-summary"><ChartLineUp size={20} /><small>Set-Marktwerte</small><b>{setTotal}</b><span>Geladene und selbst eingetragene Setpreise</span></article>
      <article className="panel price-summary"><Cube size={20} /><small>Fehlteile</small><b>{missingTotal}</b><span>Menge mal Preis je Stück</span></article>
      <article className="panel price-provider"><small>DATENQUELLE</small><b>{status?.configured ? "BrickOwl oder manuell" : "Manuelle Preise bereit"}</b><span>{status?.configured ? "BrickOwl-Preise liegen 24 Stunden im Cache. Selbst eingetragene Preise werden nicht ersetzt, auch wenn die Freigabe später kommt." : "Die Preis-API braucht noch Catalog Approval. Preise kannst du hier von Hand eintragen. Sie bleiben gespeichert."}</span></article>
    </div>
    {notice && <div className={notice.tone === "error" ? "inline-error" : "inline-notice"} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}
    <div className="searchbox price-filter"><MagnifyingGlass size={17} /><input aria-label="Marktwerte filtern" placeholder="Set, Teilenummer oder Farbe suchen" value={filter} onChange={(event) => { setFilter(event.target.value); setPartsPage(0); }} /></div>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNG</div><h2>Sets</h2><p>Vergleiche deinen Setpreis mit dem Wert der Einzelteile. Teilepreise werden je Farbe gepflegt.</p></div></div>
      <div className="price-set-grid">{sets.map((row) => {
        const value = partsValue(row.inventory);
        const setPrice = priced(setKey(row.id));
        const onlyPartsCurrency = value.totals.size === 1 ? [...value.totals.entries()][0] : undefined;
        const comparison = value.pricedPositions === value.positions && setPrice !== null && onlyPartsCurrency !== undefined && onlyPartsCurrency[0] === setPrice.currency ? { difference: onlyPartsCurrency[1] - setPrice.amount, currency: setPrice.currency } : null;
        return <article className="panel price-set-card" key={row.id}><div className="price-set-image">{row.definition.imageUrl ? <img src={row.definition.imageUrl} alt={row.definition.name} loading="lazy" /> : <Cube size={25} />}</div><div className="price-set-content"><small>LEGO {row.definition.setNumber} · {row.definition.year ?? "Jahr unbekannt"}</small><b>{row.nickname || row.definition.name}</b><span>{row.missing ? `${row.missing} Teile fehlen` : "Vollständig"} · {row.complete.toLocaleString("de-DE")} %</span>{actions(setKey(row.id), { setInstanceId: row.id }, "BrickOwl Preisverlauf", "Marktpreis")}<div className="set-parts-value"><small>Geschätzter Einzelteilewert · {inventoryLoading ? "Inventar wird geladen …" : `${value.pricedPositions}/${value.positions} Positionen bepreist`}</small><strong>{formatTotals(value.totals)}</strong><span>{value.pricedPieces}/{value.pieces} Teilemenge mit Preis abgedeckt</span>{comparison ? <span>{comparison.difference === 0 ? "Set- und Einzelteilepreis sind gleich." : `Einzelteile sind ${money(Math.abs(comparison.difference), comparison.currency)} ${comparison.difference > 0 ? "mehr" : "weniger"} wert als dein Setpreis.`}</span> : <span>Für den direkten Vergleich müssen alle Teilepreise und der Setpreis dieselbe Währung haben.</span>}</div></div></article>;
      })}{!sets.length && <p className="muted">Keine passenden Sets.</p>}</div>
    </section>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SETINVENTAR</div><h2>Einzelteile und Preise</h2><p>Hier kannst du Preise für alle vorhandenen und fehlenden Teile je Teil-Farb-Kombination eintragen oder abrufen.</p></div></div>
      <div className="price-part-pagination"><span>{parts.length ? `${partsPage * 50 + 1}–${Math.min((partsPage + 1) * 50, parts.length)} von ${parts.length} Positionen` : "0 Positionen"}</span><div><button className="button secondary" disabled={partsPage === 0} onClick={() => setPartsPage((page) => Math.max(0, page - 1))}>Zurück</button><button className="button secondary" disabled={partsPage + 1 >= pageCount} onClick={() => setPartsPage((page) => Math.min(pageCount - 1, page + 1))}>Weiter</button></div></div>
      <div className="global-list panel">{visibleParts.map((row) => { const first = row.sets[0]; const value = quotes[partKey(row)]; return <article className="global-row price-part-row" key={partKey(row)}><div className="global-image price-part-image">{row.part.imageUrl ? <img src={row.part.imageUrl} alt="" loading="lazy" /> : <Cube size={22} />}</div><div className="global-part"><b>{row.part.name}</b><span>{row.part.number} · {row.color.name}</span><small>{row.quantity}× im Setinventar · {row.missingQuantity}× fehlen</small></div><b className="global-total">{row.quantity}×</b><div className="price-part-value">{first && actions(partKey(row), { inventoryItemId: first.inventoryItemId }, `${row.part.number} · ${row.color.name}`, "Preis je Stück")}{value?.quote.avgPrice != null && <small>{row.quantity} Teile in deiner Sammlung: {money(row.quantity * value.quote.avgPrice, value.quote.currencyCode)}</small>}</div></article>; })}{!parts.length && <div className="empty-state"><Cube size={28} /><b>{inventoryLoading ? "Setinventare werden geladen …" : "Keine Teile im Setinventar"}</b></div>}</div>
    </section>
    <p className="price-disclaimer">Preisdaten und Kataloginformationen von BrickOwl bleiben als Quelle gekennzeichnet. Zusammengefasste Preisverläufe kommen in GBP. Selbst eingetragene Preise stammen von dir, bleiben dauerhaft gespeichert und werden nicht nach 24 Stunden ersetzt. Preisendpunkte erfordern BrickOwl Catalog Approval. <a href="https://www.brickowl.com" target="_blank" rel="noreferrer">BrickOwl</a></p>
  </section>;
}
