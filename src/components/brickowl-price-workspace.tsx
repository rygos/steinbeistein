"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, ChartLineUp, Cube, MagnifyingGlass, PencilSimple } from "@phosphor-icons/react";
import { manualPriceCurrencies, type ManualPriceCurrency } from "@/lib/manual-price";

type SetCard = Readonly<{ id: string; nickname: string | null; missing: number; complete: number; definition: Readonly<{ setNumber: string; name: string; year: number | null; imageUrl: string | null }> }>;
type PartGroup = Readonly<{ part: Readonly<{ id: string; number: string; name: string; imageUrl: string | null }>; color: Readonly<{ id: string; name: string }>; quantity: number; sets: readonly Readonly<{ inventoryItemId: string }>[] }>;
type Quote = Readonly<{ currencyCode: string; avgPrice: number | null; minPrice: number | null; maxPrice: number | null; fetchedAt: string }>;
type CachedQuote = Readonly<{ quote: Quote; label: string; source: "api" | "manual" }>;
type Status = Readonly<{ configured: boolean; approvalRequired: boolean; manualPrices?: readonly (Quote & { key: string; source: "manual" })[] }>;
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
  const [quotes, setQuotes] = useState<Record<string, CachedQuote>>({});
  const [loading, setLoading] = useState("");
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editor, setEditor] = useState("");
  const [draft, setDraft] = useState("");
  const [currency, setCurrency] = useState<ManualPriceCurrency>("EUR");

  useEffect(() => {
    void fetch("/api/brickowl/prices").then((response) => readJson<Status>(response, "Gespeicherte Marktwerte konnten nicht geladen werden.")).then((data) => {
      setStatus(data);
      const stored = data.manualPrices ?? [];
      if (stored.length === 0) return;
      setQuotes((current) => {
        const next = { ...current };
        for (const row of stored) next[row.key] = { quote: row, label: "Manuell eingetragen", source: "manual" };
        return next;
      });
    }).catch(() => setNotice({ tone: "error", text: "Gespeicherte Marktwerte konnten nicht geladen werden." }));
  }, []);

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
  const sets = instances.filter((row) => `${row.nickname ?? ""} ${row.definition.name} ${row.definition.setNumber}`.toLowerCase().includes(search));
  const parts = missingGroups.filter((row) => `${row.part.name} ${row.part.number} ${row.color.name}`.toLowerCase().includes(search));
  const priced = (key: string) => { const row = quotes[key]; return row?.quote.avgPrice == null ? null : { amount: row.quote.avgPrice, currency: row.quote.currencyCode }; };
  const setTotal = sumMoney(instances.flatMap((row) => { const price = priced(setKey(row.id)); return price ? [price] : []; }));
  const missingTotal = sumMoney(missingGroups.flatMap((row) => { const price = priced(partKey(row)); return price ? [{ amount: price.amount * row.quantity, currency: price.currency }] : []; }));

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
    <div className="searchbox price-filter"><MagnifyingGlass size={17} /><input aria-label="Marktwerte filtern" placeholder="Set, Teilenummer oder Farbe suchen" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNG</div><h2>Sets</h2><p>Der Preis gilt für dieses Exemplar und bleibt unabhängig vom 24-Stunden-Cache.</p></div></div>
      <div className="price-set-grid">{sets.map((row) => <article className="panel price-set-card" key={row.id}><div className="price-set-image">{row.definition.imageUrl ? <img src={row.definition.imageUrl} alt={row.definition.name} loading="lazy" /> : <Cube size={25} />}</div><div className="price-set-content"><small>LEGO {row.definition.setNumber} · {row.definition.year ?? "Jahr unbekannt"}</small><b>{row.nickname || row.definition.name}</b><span>{row.missing ? `${row.missing} Teile fehlen` : "Vollständig"} · {row.complete.toLocaleString("de-DE")} %</span>{actions(setKey(row.id), { setInstanceId: row.id }, "BrickOwl Preisverlauf", "Marktpreis")}</div></article>)}{!sets.length && <p className="muted">Keine passenden Sets.</p>}</div>
    </section>
    <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">FEHLTEILE</div><h2>Teile</h2><p>Der eingetragene Preis gilt je Stück für diese Teil- und Farbkombination.</p></div></div>
      <div className="global-list panel">{parts.map((row) => { const first = row.sets[0]; const value = quotes[partKey(row)]; return <article className="global-row price-part-row" key={partKey(row)}><div className="global-image price-part-image">{row.part.imageUrl ? <img src={row.part.imageUrl} alt="" loading="lazy" /> : <Cube size={22} />}</div><div className="global-part"><b>{row.part.name}</b><span>{row.part.number} · {row.color.name}</span></div><b className="global-total">{row.quantity}×</b><div className="price-part-value">{first && actions(partKey(row), { inventoryItemId: first.inventoryItemId }, `${row.part.number} · ${row.color.name}`, "Preis je Stück")}{value?.quote.avgPrice != null && <small>{row.quantity} Fehlteile zusammen: {money(row.quantity * value.quote.avgPrice, value.quote.currencyCode)}</small>}</div></article>; })}{!parts.length && <div className="empty-state"><Cube size={28} /><b>Keine Fehlteile</b></div>}</div>
    </section>
    <p className="price-disclaimer">Preisdaten und Kataloginformationen von BrickOwl bleiben als Quelle gekennzeichnet. Zusammengefasste Preisverläufe kommen in GBP. Selbst eingetragene Preise stammen von dir, bleiben dauerhaft gespeichert und werden nicht nach 24 Stunden ersetzt. Preisendpunkte erfordern BrickOwl Catalog Approval. <a href="https://www.brickowl.com" target="_blank" rel="noreferrer">BrickOwl</a></p>
  </section>;
}
