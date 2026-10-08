"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowsClockwise, Check, CheckCircle, CaretDown, CaretLeft, CaretRight, ChartDonut, CircleNotch, ClipboardText, Cube, MagnifyingGlass, Minus, Plus, PlusCircle, SlidersHorizontal, SquaresFour, Wrench, X } from "@phosphor-icons/react";
import { PriceWorkspace } from "@/components/brickowl-price-workspace";
import { StockAssignment } from "@/components/stock-assignment";
import { SetPhotos } from "@/components/set-photos";
import { SetOrders } from "@/components/set-orders";
import { QRLabel } from "@/components/qr-label";
import { InventoryItemEditor } from "@/components/inventory-item-editor";
import { GlobalSearch } from "@/components/global-search";
import { PwaInstall } from "@/components/pwa-install";
import { SetHistory } from "@/components/set-history";

type LegoSetSearch = { set_num: string; name: string; year: number; theme_id: number; num_parts: number; set_img_url: string | null; theme?: string };
type LegoPartSearch = { part_num: string; name: string; part_img_url: string | null };
type LegoColorOption = { id: number; name: string; rgb: string | null };
type PartItem = { id: string; quantity: number; isManual: boolean; reviewed: boolean; sectionName?: string | null; status?: string; reviewNote?: string | null; part: { id: string; number: string; name: string; imageUrl: string | null; categoryId: number | null; categoryName: string | null }; color: { id: string; sourceId: number; name: string; rgb: string | null }; missing: number };
type Instance = { id: string; nickname: string | null; createdAt: string; storageLocationId?: string | null; storageLocation?: StorageLocation | null; condition?: string | null; hasInstructions?: boolean; instructionsCondition?: string | null; hasBox?: boolean; boxCondition?: string | null; notes?: string | null; collectionStatus?: string; purchasePrice?: number | null; purchaseCurrency?: string; purchasedAt?: string | null; definition: { id: string; setNumber: string; name: string; year: number | null; theme: string | null; imageUrl: string | null; pieceCount: number | null }; total: number; missing: number; positions: number; inventoryPositions: number; reviewedPositions: number; reviewedQuantity: number; checkedPercent: number; complete: number; inventory: PartItem[] };
type MissingGroup = { part: { id: string; number: string; name: string; imageUrl: string | null }; color: { id: string; name: string; rgb: string | null }; quantity: number; sets: { instanceId: string; inventoryItemId: string; nickname: string | null; setNumber: string; name: string; quantity: number }[] };
type ShoppingGroup = { part: MissingGroup["part"]; color: MissingGroup["color"]; wanted: number; ordered: number; received: number; sets: { instanceId: string; inventoryItemId: string; setNumber: string; setName: string; nickname: string | null; wanted: number; ordered: number; received: number }[] };
type MinifigGroup = { part: MissingGroup["part"]; color: MissingGroup["color"]; quantity: number; missing: number; sets: { instanceId: string; inventoryItemId: string; setNumber: string; name: string; nickname: string | null; quantity: number; missing: number }[] };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isMinifigGroup(value: unknown): value is MinifigGroup {
  if (!isRecord(value) || !isRecord(value.part) || !isRecord(value.color) || !Array.isArray(value.sets)) return false;
  const part = value.part;
  const color = value.color;
  return typeof part.id === "string" && typeof part.number === "string" && typeof part.name === "string" && (typeof part.imageUrl === "string" || part.imageUrl === null)
    && typeof color.id === "string" && typeof color.name === "string" && (typeof color.rgb === "string" || color.rgb === null)
    && typeof value.quantity === "number" && typeof value.missing === "number"
    && value.sets.every((set) => isRecord(set) && typeof set.instanceId === "string" && typeof set.inventoryItemId === "string" && typeof set.setNumber === "string" && typeof set.name === "string" && (typeof set.nickname === "string" || set.nickname === null) && typeof set.quantity === "number" && typeof set.missing === "number");
}
type StorageLocation = { id: string; name: string; description: string | null };
type LooseStockRow = { id: string; part: MissingGroup["part"]; color: MissingGroup["color"] & { sourceId: number }; quantity: number; unitCost: number | null; locations: { id: string; locationId: string | null; name: string; quantity: number; unitCost: number | null }[]; missingQuantity: number; covered: number; surplus: number; toBuy: number; sets: { instanceId: string; name: string; setNumber: string; quantity: number }[] };
type LooseStockData = { stock: LooseStockRow[]; summary: { needed: number; covered: number; toBuy: number } };
type ImagePreview = { src: string; alt: string; caption: string };
type InventoryPreview = { added: { part: string; name?: string; color?: string; quantity: number }[]; removed: { part: string; name: string; color: string; quantity: number; missing: number }[]; changed: { part: string; name: string; color: string; oldQuantity: number; newQuantity: number }[] };
type StatisticsData = {
  overview: { definitions: number; cachedDefinitions: number; instances: number; totalPieces: number; totalMissing: number; confirmedPresent: number; uncheckedPieces: number; totalReviewed: number; checkedPercent: number; completionPercent: number; completeInstances: number; uniqueSetNumbers: number; repeatedInstances: number; differentParts: number; differentColors: number; positions: number; avgPiecesPerSet: number; avgMissingPerSet: number; partRecords: number; colorRecords: number; wantedPieces: number; orderedPieces: number };
  themes: { name: string; count: number; pieces: number; missing: number }[];
  eras: { name: string; count: number }[];
  topMissingSets: { id: string; nickname: string | null; setNumber: string; name: string; year: number | null; imageUrl: string | null; total: number; missing: number; inventoryPositions: number; reviewedPositions: number; reviewedQuantity: number; checkedPercent: number; complete: number }[];
  highestCompletion: StatisticsData["topMissingSets"];
  commonMissing: { part: { number: string; name: string; imageUrl: string | null }; color: { name: string; rgb: string | null }; count: number }[];
  missingColors: { name: string; rgb: string | null; count: number }[];
  categories: { name: string; count: number }[];
  commonColors: { name: string; rgb: string | null; count: number }[];
  repeats: { setNumber: string; count: number }[];
  collectionHistory: { month: string; count: number }[];
  oldestSet: { setNumber: string; name: string; year: number | null } | null;
  newestSet: { setNumber: string; name: string; year: number | null } | null;
  fiveSetMissingShare: number;
};
type Page = "sets" | "statistics" | "missing" | "shopping" | "minifigs" | "looseStock" | "prices" | "diagnostics";
type DetailTab = "overview" | "missing" | "all" | "inventory" | "details";

function CollectionMeta({ instance, onSaved }: { instance: Instance; onSaved: () => void }) {
  const [status, setStatus] = useState(instance.collectionStatus ?? "IN_COLLECTION");
  const [price, setPrice] = useState(instance.purchasePrice === null || instance.purchasePrice === undefined ? "" : String(instance.purchasePrice));
  const [currency, setCurrency] = useState(instance.purchaseCurrency ?? "EUR");
  const [purchasedAt, setPurchasedAt] = useState(instance.purchasedAt?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/instances/${instance.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details: { collectionStatus: status, purchasePrice: price === "" ? null : Number(price), purchaseCurrency: currency.toUpperCase(), purchasedAt: purchasedAt ? new Date(`${purchasedAt}T12:00:00.000Z`).toISOString() : null } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sammlungsdaten konnten nicht gespeichert werden.");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sammlungsdaten konnten nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  return <section className="collection-meta panel"><div><span className="eyebrow">SAMMLUNGSVERWALTUNG</span><h3>Status und Einstand</h3><small>Dein Kaufpreis bleibt getrennt vom aktuellen BrickOwl-Marktwert.</small></div><div className="collection-meta-fields"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{[["IN_COLLECTION", "In Sammlung"], ["UNCHECKED", "Noch ungeprüft"], ["IN_PROGRESS", "In Bearbeitung"], ["DISPLAYED", "Ausgestellt"], ["STORED", "Eingelagert"], ["FOR_SALE", "Zum Verkauf"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Kaufpreis<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Optional" /></label><label>Währung<input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label><label>Kaufdatum<input type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} /></label><button className="button secondary" disabled={busy || currency.length !== 3} onClick={() => void save()}>{busy ? "Speichert …" : "Speichern"}</button><button className="button secondary" onClick={() => window.print()}>Verkaufsblatt drucken</button></div>{error && <span className="inline-error">{error}</span>}</section>;
}

const integerFormatter = new Intl.NumberFormat("de-DE");
const percentFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const number = (value: number) => integerFormatter.format(value);
const percent = (value: number) => `${percentFormatter.format(value)} %`;
const conditionLabel = (value: string) => ({ MINT: "Wie neu", VERY_GOOD: "Sehr gut", GOOD: "Gut", WORN: "Gebraucht", DAMAGED: "Beschädigt" }[value] ?? value);

function Image({ src, alt, className = "", loading = "lazy" }: { src: string | null; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img className={className} src={src} alt={alt} loading={loading} onError={() => setFailed(true)} /> : <div className={`image-fallback ${className}`} aria-label={alt}><Cube size={30} weight="light" /></div>;
}

function ZoomableImage({ src, alt, caption, className, imageClassName, onOpen }: { src: string | null; alt: string; caption: string; className: string; imageClassName: string; onOpen: (preview: ImagePreview) => void }) {
  return <button type="button" className={`image-zoom-trigger ${className}`} disabled={!src} aria-label={`Bild vergrößern: ${alt}`} onClick={() => src && onOpen({ src, alt, caption })}><Image src={src} alt={alt} className={imageClassName} /></button>;
}

function StatBars({ items, label, formatter = number }: { items: { name: string; count: number }[]; label: string; formatter?: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return <div className="stats-bars" aria-label={label}>{items.map((item) => <div className="stats-bar-row" key={item.name}><span title={item.name}>{item.name}</span><div className="stats-bar-track"><i style={{ width: `${item.count / max * 100}%` }} /></div><b>{formatter(item.count)}</b></div>)}</div>;
}

export default function CollectionApp() {
  const [page, setPage] = useState<Page>("sets");
  const [sets, setSets] = useState<Instance[]>([]);
  const [missingGroups, setMissingGroups] = useState<MissingGroup[]>([]);
  const [shoppingGroups, setShoppingGroups] = useState<ShoppingGroup[]>([]);
  const [minifigData, setMinifigData] = useState<MinifigGroup[]>([]);
  const [minifigLoading, setMinifigLoading] = useState(false);
  const [minifigLoadError, setMinifigLoadError] = useState("");
  const [minifigQuery, setMinifigQuery] = useState("");
  const [minifigSort, setMinifigSort] = useState("number");
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [looseStockData, setLooseStockData] = useState<LooseStockData | null>(null);
  const [stockDialog, setStockDialogState] = useState(false);
  const setStockDialog = setStockDialogState;
  const [stockQuery, setStockQuery] = useState("");
  const [stockSort, setStockSort] = useState("number");
  const [editingStockBin, setEditingStockBin] = useState<{ id: string; quantity: number; locationId: string; unitCost: string } | null>(null);
  const [newLocationName, setNewLocationName] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
  const [detailDraft, setDetailDraft] = useState<{ storageLocationId: string; condition: string; hasInstructions: boolean; instructionsCondition: string; hasBox: boolean; boxCondition: string; notes: string; collectionStatus: string; purchasePrice: string; purchaseCurrency: string; purchasedAt: string }>({ storageLocationId: "", condition: "", hasInstructions: false, instructionsCondition: "", hasBox: false, boxCondition: "", notes: "", collectionStatus: "IN_COLLECTION", purchasePrice: "", purchaseCurrency: "EUR", purchasedAt: "" });
  const [undoAvailable, setUndoAvailable] = useState<string | null>(null);
  const [sessionReadyFor, setSessionReadyFor] = useState("");
  const [sessionItemId, setSessionItemId] = useState<string | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [selected, setSelected] = useState<Instance | null>(null);
  const [tab, setTabState] = useState<DetailTab>("overview");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("all");
  const [themeMode, setThemeMode] = useState("light");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(false);
  const [setNumber, setSetNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [searchResults, setSearchResults] = useState<LegoSetSearch[]>([]);
  const [chosenResult, setChosenResult] = useState<LegoSetSearch | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partFilter, setPartFilter] = useState("all");
  const [partColorFilter, setPartColorFilter] = useState("all");
  const [inventoryIndex, setInventoryIndex] = useState(0);
  const [itemsPage, setItemsPage] = useState(0);
  const [inventoryGroup, setInventoryGroup] = useState("number");
  const [missingSort, setMissingSort] = useState("color");
  const [missingListSort, setMissingListSort] = useState("color");
  const [inventoryReviewFilter, setInventoryReviewFilter] = useState("all");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const [diagnostics, setDiagnostics] = useState<{ sets: number; instances: number; parts: number; colors: number; partsWithoutCategory: number; partsWithoutImage: number; colorsWithoutBricklinkId: number; partsWithoutBricklinkId: number; lastImport: string | null } | null>(null);
  const [providerStatus, setProviderStatus] = useState("");
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [inventoryPreview, setInventoryPreview] = useState<InventoryPreview | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualParts, setManualParts] = useState<LegoPartSearch[]>([]);
  const [manualColors, setManualColors] = useState<LegoColorOption[]>([]);
  const [manualPart, setManualPart] = useState<LegoPartSearch | null>(null);
  const [manualColor, setManualColor] = useState(0);
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualUnitCost, setManualUnitCost] = useState("");
  const [manualAllowOutside, setManualAllowOutside] = useState(false);
  const setTab = (next: DetailTab) => {
    if (tab === "details" && next !== "details" && selected) {
      const changed = detailDraft.storageLocationId !== (selected.storageLocationId ?? "") || detailDraft.condition !== (selected.condition ?? "") || detailDraft.hasInstructions !== (selected.hasInstructions ?? false) || detailDraft.instructionsCondition !== (selected.instructionsCondition ?? "") || detailDraft.hasBox !== (selected.hasBox ?? false) || detailDraft.boxCondition !== (selected.boxCondition ?? "") || detailDraft.notes !== (selected.notes ?? "") || detailDraft.collectionStatus !== (selected.collectionStatus ?? "IN_COLLECTION") || detailDraft.purchasePrice !== (selected.purchasePrice === null || selected.purchasePrice === undefined ? "" : String(selected.purchasePrice)) || detailDraft.purchaseCurrency !== (selected.purchaseCurrency ?? "EUR") || detailDraft.purchasedAt !== (selected.purchasedAt?.slice(0, 10) ?? "");
      if (changed && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    }
    setTabState(next);
  };

  const refresh = useCallback(async () => {
    const [setsResponse, missingResponse, shoppingResponse, locationsResponse] = await Promise.all([fetch("/api/sets", { cache: "no-store" }), fetch("/api/missing", { cache: "no-store" }), fetch("/api/shopping", { cache: "no-store" }), fetch("/api/storage-locations", { cache: "no-store" })]);
    if (!setsResponse.ok || !missingResponse.ok || !shoppingResponse.ok || !locationsResponse.ok) throw new Error("Die Sammlung konnte nicht vollständig geladen werden.");
    const [setsData, missingData, shoppingData, locationsData] = await Promise.all([setsResponse.json(), missingResponse.json(), shoppingResponse.json(), locationsResponse.json()]);
    setSets(setsData);
    if (Array.isArray(missingData)) setMissingGroups(missingData);
    if (Array.isArray(shoppingData)) setShoppingGroups(shoppingData);
    if (Array.isArray(locationsData)) setStorageLocations(locationsData);
  }, []);
  const refreshMinifigs = useCallback(async () => {
    setMinifigLoading(true);
    setMinifigLoadError("");
    try {
      const response = await fetch("/api/minifigs", { cache: "no-store" });
      if (!response.ok) throw new Error("Minifiguren-Teile konnten nicht geladen werden.");
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isMinifigGroup)) throw new Error("Die Minifiguren-Antwort ist ungültig.");
      setMinifigData(data);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Minifiguren-Teile konnten nicht geladen werden."; setMinifigLoadError(message); setError(message); }
    finally { setMinifigLoading(false); }
  }, []);
  const openInstance = async (id: string, nextTab: DetailTab = "overview") => {
    setBusy(true);
    try { const response = await fetch(`/api/instances/${id}`, { cache: "no-store" }); const data = await response.json(); if (response.ok) { setSelected(data); setTab(nextTab); } else setError(data.error ?? "Set konnte nicht geladen werden."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Die Sammlung konnte nicht geladen werden.")); }, [refresh]);
  useEffect(() => {
    const saved = localStorage.getItem("lego-set-view");
    if (saved) { try { const view = JSON.parse(saved) as { filter?: string; sort?: string; query?: string }; if (view.filter) setFilter(view.filter); if (view.sort) setSort(view.sort); if (view.query) setQuery(view.query); } catch { localStorage.removeItem("lego-set-view"); } }
    const theme = localStorage.getItem("lego-theme");
    if (theme === "dark" || theme === "light") setThemeMode(theme);
  }, []);
  useEffect(() => { localStorage.setItem("lego-set-view", JSON.stringify({ filter, sort, query })); }, [filter, sort, query]);
  useEffect(() => { document.documentElement.dataset.theme = themeMode; localStorage.setItem("lego-theme", themeMode); }, [themeMode]);
  useEffect(() => { if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  useEffect(() => { const instanceId = new URLSearchParams(window.location.search).get("instance"); if (instanceId) { window.history.replaceState({}, "", window.location.pathname); void openInstance(instanceId); } }, []);
  useEffect(() => { setInventoryIndex(0); setItemsPage(0); }, [selected?.id, search, partFilter, partColorFilter, inventoryGroup, inventoryReviewFilter, tab]);
  useEffect(() => {
    if (!selected) return;
    setDetailDraft({ storageLocationId: selected.storageLocationId ?? "", condition: selected.condition ?? "", hasInstructions: selected.hasInstructions ?? false, instructionsCondition: selected.instructionsCondition ?? "", hasBox: selected.hasBox ?? false, boxCondition: selected.boxCondition ?? "", notes: selected.notes ?? "", collectionStatus: selected.collectionStatus ?? "IN_COLLECTION", purchasePrice: selected.purchasePrice === null || selected.purchasePrice === undefined ? "" : String(selected.purchasePrice), purchaseCurrency: selected.purchaseCurrency ?? "EUR", purchasedAt: selected.purchasedAt?.slice(0, 10) ?? "" });
  }, [selected?.id]);
  useEffect(() => {
    if (!selected || tab !== "inventory") { setSessionReadyFor(""); return; }
    const instanceId = selected.id;
    void fetch(`/api/instances/${instanceId}/session`, { cache: "no-store" }).then((response) => response.json()).then((session) => {
      setInventoryGroup(session.groupBy ?? "number"); setInventoryReviewFilter(session.onlyUnchecked ? "unchecked" : "all"); setSessionItemId(session.currentItemId ?? null); setSessionReadyFor(instanceId);
    }).catch(() => setSessionReadyFor(instanceId));
  }, [selected?.id, tab]);
  useEffect(() => {
    if (!imagePreview) return;
    const dialog = imageDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [imagePreview]);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    const closeTopmost = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (imagePreview) setImagePreview(null);
      else if (stockDialog) setStockDialog(false);
      else if (editingStockBin) setEditingStockBin(null);
      else if (manualOpen) setManualOpen(false);
      else if (dialog) setDialog(false);
      else if (inventoryPreview) setInventoryPreview(null);
      else if (selected && tab === "details") closeInstanceDetails();
    };
    window.addEventListener("keydown", closeTopmost);
    return () => window.removeEventListener("keydown", closeTopmost);
  }, [imagePreview, stockDialog, editingStockBin, manualOpen, dialog, inventoryPreview, selected, tab, detailDraft, page]);

  const updateQuantity = async (instance: Instance, item: PartItem, delta?: number, setMissing?: number) => {
    const mutationId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await fetch(`/api/instances/${instance.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: item.id, delta, setMissing, mutationId, reason: "Fehlmenge über die Setansicht geändert" }) });
    const data = await result.json();
    if (!result.ok) { setError(data.error ?? "Änderung fehlgeschlagen."); return; }
    setSelected(data);
    setUndoAvailable(instance.id);
    await refresh();
  };
  const updateReview = async (instance: Instance, item: PartItem, reviewed: boolean) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/instances/${instance.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryItemId: item.id, reviewed, mutationId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, reason: "Inventurstatus geändert" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Prüfstatus konnte nicht gespeichert werden.");
      setSelected(data);
      setUndoAvailable(instance.id);
      await refresh();
      setMessage(reviewed ? "Teil als geprüft gespeichert." : "Prüfstatus zurückgesetzt.");
    } catch (e) { setError(e instanceof Error ? e.message : "Prüfstatus konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  const undoLastInventoryChange = async () => {
    if (!undoAvailable) return;
    const response = await fetch(`/api/instances/${undoAvailable}/undo`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Änderung konnte nicht rückgängig gemacht werden."); return; }
    if (selected?.id === undoAvailable) setSelected(data);
    setUndoAvailable(null);
    setMessage("Letzte Inventuränderung rückgängig gemacht.");
    await refresh();
  };

  const addInstance = async (set: LegoSetSearch) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setNumber: set.set_num, nickname: nickname.trim() || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Set konnte nicht hinzugefügt werden.");
      setDialog(false); setSearchResults([]); setChosenResult(null); setSetNumber(""); setNickname("");
      setSelected(data); setTab("overview"); await refresh(); setMessage(`${data.definition.name} wurde hinzugefügt.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Set konnte nicht hinzugefügt werden."); }
    finally { setBusy(false); }
  };

  const searchForSet = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setChosenResult(null);
    try {
      const response = await fetch(`/api/sets?q=${encodeURIComponent(setNumber.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Set konnte nicht gesucht werden.");
      if (!data.length) throw new Error("Kein passendes Set gefunden.");
      const exact = data.find((item: LegoSetSearch) => item.set_num.toLowerCase() === setNumber.trim().toLowerCase());
      if (exact) { setChosenResult(exact); } else { setSearchResults(data); }
    } catch (e) { setError(e instanceof Error ? e.message : "Suche fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  const openDiagnostics = async () => {
    setPage("diagnostics"); setSelected(null);
    const response = await fetch("/api/diagnostics");
    if (response.ok) setDiagnostics(await response.json());
  };
  const openStatistics = async () => {
    setPage("statistics"); setSelected(null); setError("");
    try { const response = await fetch("/api/statistics", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Statistiken konnten nicht geladen werden."); setStatistics(data); }
    catch (e) { setError(e instanceof Error ? e.message : "Statistiken konnten nicht geladen werden."); }
  };
  const openLooseStock = async () => {
    setPage("looseStock"); setSelected(null); setError(""); setBusy(true);
    try { const response = await fetch("/api/loose-stock", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Teilebestand konnte nicht geladen werden."); setLooseStockData(data); }
    catch (e) { setError(e instanceof Error ? e.message : "Teilebestand konnte nicht geladen werden."); }
    finally { setBusy(false); }
  };
  const saveStockBin = async () => {
    if (!editingStockBin) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/loose-stock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingStockBin.id, quantity: Number(editingStockBin.quantity), locationId: editingStockBin.locationId || null, unitCost: editingStockBin.unitCost === "" ? null : Number(editingStockBin.unitCost) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bestand konnte nicht geändert werden.");
      setEditingStockBin(null);
      const refreshed = await fetch("/api/loose-stock", { cache: "no-store" });
      if (refreshed.ok) setLooseStockData(await refreshed.json());
      setMessage("Bestand aktualisiert.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bestand konnte nicht geändert werden."); }
    finally { setBusy(false); }
  };
  const addStorageLocation = async () => {
    const response = await fetch("/api/storage-locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newLocationName }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Lagerort konnte nicht gespeichert werden."); return; }
    setStorageLocations((items) => [...items.filter((item) => item.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "de")));
    setStockLocationId(data.id); setNewLocationName(""); setMessage(`Lagerort „${data.name}“ angelegt.`);
  };
  const saveInstanceDetails = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const details = { storageLocationId: detailDraft.storageLocationId || null, condition: detailDraft.condition || null, hasInstructions: detailDraft.hasInstructions, instructionsCondition: detailDraft.hasInstructions ? detailDraft.instructionsCondition || null : null, hasBox: detailDraft.hasBox, boxCondition: detailDraft.hasBox ? detailDraft.boxCondition || null : null, notes: detailDraft.notes.trim() || null, collectionStatus: detailDraft.collectionStatus, purchasePrice: detailDraft.purchasePrice === "" ? null : Number(detailDraft.purchasePrice), purchaseCurrency: detailDraft.purchaseCurrency, purchasedAt: detailDraft.purchasedAt ? new Date(`${detailDraft.purchasedAt}T12:00:00.000Z`).toISOString() : null };
      const response = await fetch(`/api/instances/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Setdetails konnten nicht gespeichert werden.");
      setSelected(data); await refresh(); setMessage("Setdetails gespeichert.");
    } catch (e) { setError(e instanceof Error ? e.message : "Setdetails konnten nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  const closeInstanceDetails = () => {
    if (!selected) return;
    const changed = detailDraft.storageLocationId !== (selected.storageLocationId ?? "") || detailDraft.condition !== (selected.condition ?? "") || detailDraft.hasInstructions !== (selected.hasInstructions ?? false) || detailDraft.instructionsCondition !== (selected.instructionsCondition ?? "") || detailDraft.hasBox !== (selected.hasBox ?? false) || detailDraft.boxCondition !== (selected.boxCondition ?? "") || detailDraft.notes !== (selected.notes ?? "") || detailDraft.collectionStatus !== (selected.collectionStatus ?? "IN_COLLECTION") || detailDraft.purchasePrice !== (selected.purchasePrice === null || selected.purchasePrice === undefined ? "" : String(selected.purchasePrice)) || detailDraft.purchaseCurrency !== (selected.purchaseCurrency ?? "EUR") || detailDraft.purchasedAt !== (selected.purchasedAt?.slice(0, 10) ?? "");
    if (changed && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setTabState("overview");
  };
  const addLooseStock = async () => {
    if (!manualPart) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/loose-stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partNumber: manualPart.part_num, colorId: manualColor, quantity: Number(manualQuantity), locationId: stockLocationId || null, unitCost: manualUnitCost === "" ? null : Number(manualUnitCost) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Bestand konnte nicht gespeichert werden.");
      setStockDialog(false); setManualPart(null); setManualParts([]); const refreshed = await fetch("/api/loose-stock", { cache: "no-store" }); if (refreshed.ok) setLooseStockData(await refreshed.json()); await refresh(); setMessage("Loser Teilebestand gespeichert."); await openLooseStock();
    } catch (e) { setError(e instanceof Error ? e.message : "Bestand konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  const testConnection = async () => {
    setProviderStatus("Verbindung wird getestet …");
    const response = await fetch("/api/diagnostics/connection", { method: "POST" }); const data = await response.json();
    setProviderStatus(data.message ?? "Verbindungstest fehlgeschlagen.");
  };
  const exportBackup = async () => { const response = await fetch("/api/backup"); if (!response.ok) { setBackupStatus("Backup konnte nicht erstellt werden."); return; } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `lego-fehlteile-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); setBackupStatus("Backup wurde heruntergeladen."); };
  const importBackup = async (file?: File) => { if (!file) return; setBackupStatus("Backup wird geprüft und zusammengeführt …"); try { const content: unknown = JSON.parse(await file.text()); const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Backup konnte nicht importiert werden."); setBackupStatus(`${data.merged.instances} Exemplare wurden ergänzt; vorhandene Daten blieben erhalten.`); await refresh(); } catch (e) { setBackupStatus(e instanceof Error ? e.message : "Backup konnte nicht importiert werden."); } finally { if (backupInput.current) backupInput.current.value = ""; } };
  const removeInstance = async () => {
    if (!selected || !window.confirm(`„${selected.definition.name}“ aus der Sammlung entfernen?`)) return;
    await fetch(`/api/instances/${selected.id}`, { method: "DELETE" }); setSelected(null); await refresh(); setMessage("Set-Exemplar entfernt.");
  };
  const receiveShoppingOrder = async (line: ShoppingGroup["sets"][number]) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/shopping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: line.instanceId, inventoryItemId: line.inventoryItemId, receiveQuantity: line.ordered }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Eingang konnte nicht gebucht werden.");
      setMessage(`${line.ordered} Teil(e) als eingetroffen verbucht.`);
      try { await refresh(); } catch { setError("Eingang wurde gebucht, die Übersicht konnte aber nicht aktualisiert werden. Lade die Seite erneut."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Eingang konnte nicht gebucht werden."); }
    finally { setBusy(false); }
  };
  const refreshDefinition = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setNumber: selected.definition.setNumber, previewRefresh: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Setdaten konnten nicht aktualisiert werden.");
      setInventoryPreview(data.inventoryDelta);
    } catch (e) { setError(e instanceof Error ? e.message : "Setdaten konnten nicht aktualisiert werden."); }
    finally { setBusy(false); }
  };
  const applyInventoryRefresh = async () => { if (!selected) return; setBusy(true); try { const response = await fetch("/api/sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setNumber: selected.definition.setNumber, forceRefresh: true, instanceId: selected.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Setdaten konnten nicht aktualisiert werden."); setSelected(data); setInventoryPreview(null); await refresh(); setMessage("Inventar aktualisiert. Bestehende Fehlmengen wurden erhalten."); } catch (e) { setError(e instanceof Error ? e.message : "Aktualisierung fehlgeschlagen."); } finally { setBusy(false); } };
  const searchManualPart = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/parts?q=${encodeURIComponent(manualQuery.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Teilesuche fehlgeschlagen.");
      setManualParts(data.parts); setManualColors(data.colors);
      if (!data.parts.length) throw new Error("Kein passendes Teil gefunden.");
      setManualPart(data.parts.find((item: LegoPartSearch) => item.part_num.toLowerCase() === manualQuery.trim().toLowerCase()) ?? data.parts[0]);
      setManualColor(data.colors.find((color: LegoColorOption) => color.name.toLowerCase() === "red")?.id ?? data.colors[0]?.id ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Teilesuche fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const addManualPart = async () => {
    if (!selected || !manualPart) return;
    const belongs = selected.inventory.some((item) => item.part.number === manualPart.part_num && item.color.sourceId === manualColor);
    if (!belongs && !manualAllowOutside) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/instances/${selected.id}/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partNumber: manualPart.part_num, colorId: manualColor, quantity: Number(manualQuantity) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Fehlteil konnte nicht hinzugefügt werden.");
      setManualOpen(false); setManualPart(null); setManualParts([]); setManualAllowOutside(false); setError("");
      const updatedResponse = await fetch(`/api/instances/${selected.id}`); if (!updatedResponse.ok) throw new Error("Das Set wurde aktualisiert, die Ansicht konnte aber nicht neu geladen werden."); const updated = await updatedResponse.json(); setSelected(updated); await refresh();
      setMessage(data.belongsToSet ? "Fehlteil zum Set hinzugefügt." : "Zusätzliches Fehlteil außerhalb des Setinventars hinzugefügt.");
    } catch (e) { setError(e instanceof Error ? e.message : "Fehlteil konnte nicht hinzugefügt werden."); }
    finally { setBusy(false); }
  };

  const visibleSets = useMemo(() => {
    const filtered = sets.filter((item) => (filter === "all" || (filter === "incomplete" ? item.complete < 100 : filter === "complete" ? item.complete === 100 : filter === "near" ? item.missing > 0 && item.missing <= 20 : filter === "sale" ? item.collectionStatus === "FOR_SALE" : item.collectionStatus === "UNCHECKED")) && `${item.definition.setNumber} ${item.definition.name} ${item.nickname ?? ""}`.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de")));
    return filtered.sort((a, b) => sort === "priority" ? a.missing - b.missing || a.positions - b.positions : sort === "recent" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : sort === "name" ? a.definition.name.localeCompare(b.definition.name) : sort === "year" ? (b.definition.year ?? 0) - (a.definition.year ?? 0) : sort === "missing" ? b.missing - a.missing : sort === "complete" ? a.complete - b.complete : a.definition.setNumber.localeCompare(b.definition.setNumber, undefined, { numeric: true }));
  }, [sets, filter, query, sort]);

  const visibleItems = useMemo(() => {
    const q = search.toLocaleLowerCase("de");
    const items = (selected?.inventory ?? []).filter((item) => (tab === "missing" ? item.missing > 0 : partFilter !== "missing" || item.missing > 0) && (tab === "missing" || partColorFilter === "all" || item.color.name === partColorFilter) && (tab !== "inventory" || inventoryReviewFilter !== "unchecked" || !item.reviewed) && `${item.part.number} ${item.part.name} ${item.color.name} ${item.part.categoryName ?? ""} ${item.sectionName ?? ""}`.toLocaleLowerCase("de").includes(q));
    const order = tab === "missing" ? missingSort : inventoryGroup;
    return items.sort((a, b) => order === "color" ? a.color.name.localeCompare(b.color.name, "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : order === "category" ? (a.part.categoryName ?? "Andere").localeCompare(b.part.categoryName ?? "Andere", "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : order === "section" ? (a.sectionName ?? "Ohne Abschnitt").localeCompare(b.sectionName ?? "Ohne Abschnitt", "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : order === "name" ? a.part.name.localeCompare(b.part.name, "de") || a.color.name.localeCompare(b.color.name, "de") : a.part.number.localeCompare(b.part.number, undefined, { numeric: true }));
  }, [selected, search, partFilter, partColorFilter, inventoryGroup, inventoryReviewFilter, missingSort, tab]);
  useEffect(() => {
    if (!sessionItemId) return;
    const index = visibleItems.findIndex((item) => item.id === sessionItemId);
    if (index >= 0) { setInventoryIndex(index); setSessionItemId(null); }
  }, [visibleItems, sessionItemId]);
  useEffect(() => {
    if (!selected || tab !== "inventory" || sessionReadyFor !== selected.id || (sessionItemId && !visibleItems.some((item) => item.id === sessionItemId))) return;
    if (sessionSaveTimer.current !== null) window.clearTimeout(sessionSaveTimer.current);
    const currentItemId = visibleItems[inventoryIndex]?.id ?? null;
    sessionSaveTimer.current = window.setTimeout(() => { void fetch(`/api/instances/${selected.id}/session`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentItemId, groupBy: inventoryGroup, onlyUnchecked: inventoryReviewFilter === "unchecked" }) }); }, 220);
    return () => { if (sessionSaveTimer.current !== null) window.clearTimeout(sessionSaveTimer.current); };
  }, [selected?.id, tab, sessionReadyFor, sessionItemId, visibleItems, inventoryIndex, inventoryGroup, inventoryReviewFilter]);
  const sortedMissingGroups = useMemo(() => [...missingGroups].sort((a, b) => {
    if (missingListSort === "quantity") return b.quantity - a.quantity || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de");
    if (missingListSort === "number") return a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de");
    return a.color.name.localeCompare(b.color.name, "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true });
  }), [missingGroups, missingListSort]);
  const visibleStockRows = useMemo(() => {
    const term = stockQuery.trim().toLocaleLowerCase("de");
    return [...(looseStockData?.stock ?? [])].filter((row) => `${row.part.number} ${row.part.name} ${row.color.name} ${row.locations.map((location) => location.name).join(" ")}`.toLocaleLowerCase("de").includes(term)).sort((a, b) => stockSort === "color" ? a.color.name.localeCompare(b.color.name, "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : stockSort === "quantity" ? b.quantity - a.quantity || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de"));
  }, [looseStockData, stockQuery, stockSort]);
  const minifigGroups = useMemo(() => {
    const query = minifigQuery.trim().toLocaleLowerCase("de");
    return minifigData.filter((group) => `${group.part.number} ${group.part.name} ${group.color.name} ${group.sets.map((set) => `${set.name} ${set.setNumber} ${set.nickname ?? ""}`).join(" ")}`.toLocaleLowerCase("de").includes(query)).sort((a, b) => minifigSort === "color" ? a.color.name.localeCompare(b.color.name, "de") || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : minifigSort === "quantity" ? b.quantity - a.quantity || a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) : a.part.number.localeCompare(b.part.number, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de"));
  }, [minifigData, minifigQuery, minifigSort]);
  const inventoryItem = visibleItems[inventoryIndex];
  const itemsPerPage = 60;
  const pageItems = visibleItems.slice(itemsPage * itemsPerPage, (itemsPage + 1) * itemsPerPage);
  const pageCount = Math.ceil(visibleItems.length / itemsPerPage);
  useEffect(() => {
    if (!selected || tab !== "inventory" || !inventoryItem) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); setInventoryIndex((index) => Math.min(visibleItems.length - 1, index + 1)); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setInventoryIndex((index) => Math.max(0, index - 1)); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); void updateQuantity(selected, inventoryItem, 1); }
      else if (event.key === "-") { event.preventDefault(); void updateQuantity(selected, inventoryItem, -1); }
      else if (event.key === "Enter") { event.preventDefault(); void updateQuantity(selected, inventoryItem, undefined, 0); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, tab, inventoryItem, visibleItems.length]);
  useEffect(() => {
    if (!selected || tab !== "inventory") return;
    const start = (event: TouchEvent) => { if (event.target instanceof Element && event.target.closest(".inventory-focus")) touchStartX.current = event.changedTouches[0]?.clientX ?? null; };
    const end = (event: TouchEvent) => {
      const origin = touchStartX.current; touchStartX.current = null;
      if (origin === null || !(event.target instanceof Element) || !event.target.closest(".inventory-focus")) return;
      const delta = (event.changedTouches[0]?.clientX ?? origin) - origin;
      if (Math.abs(delta) > 65) setInventoryIndex((index) => Math.max(0, Math.min(visibleItems.length - 1, index + (delta < 0 ? 1 : -1))));
    };
    window.addEventListener("touchstart", start, { passive: true }); window.addEventListener("touchend", end, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchend", end); };
  }, [selected?.id, tab, visibleItems.length]);

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => { setSelected(null); setPage("sets"); }} aria-label="Zur Sammlung"><span className="brand-mark"><Cube size={21} weight="fill" /></span><span>stein für stein<small>LEGO Sammlung</small></span></button>
      <div className="nav-caption">SAMMLUNG</div>
      <nav className="side-nav" aria-label="Hauptnavigation">
        <button className={page === "sets" && !selected ? "active" : ""} onClick={() => { setSelected(null); setPage("sets"); }}><SquaresFour size={19} />Meine Sets<span className="nav-count">{sets.length}</span></button>
        <button className={page === "missing" ? "active" : ""} onClick={() => { setPage("missing"); setSelected(null); }}><ClipboardText size={19} />Fehlteile{missingGroups.length > 0 && <span className="nav-count">{missingGroups.length}</span>}</button>
        <button className={page === "shopping" ? "active" : ""} onClick={() => { setPage("shopping"); setSelected(null); }}><CheckCircle size={19} />Einkaufsliste</button>
        <button className={page === "looseStock" ? "active" : ""} onClick={() => void openLooseStock()}><Cube size={19} />Teilebestand</button>
        <button className={page === "prices" ? "active" : ""} onClick={() => { setPage("prices"); setSelected(null); }}><ChartDonut size={19} />Marktwerte</button>
        <button className={page === "minifigs" ? "active" : ""} onClick={() => { setSelected(null); setPage("minifigs"); void refreshMinifigs(); }}><Cube size={19} />Minifiguren</button>
      </nav>
      <div className="side-bottom"><button className={page === "statistics" ? "active" : ""} onClick={() => void openStatistics()}><ChartDonut size={19} />Statistiken</button><button className={page === "diagnostics" ? "active" : ""} onClick={() => void openDiagnostics()}><Wrench size={19} />Diagnose</button><div className="side-note"><span className="status-dot" />Lokale Sammlung<br /><small>Änderungen werden gespeichert</small></div></div>
    </aside>

    <GlobalSearch onOpenSet={(id) => { setPage("sets"); void openInstance(id); }} onOpenPart={(id, partNumber) => { setPage("sets"); setSearch(partNumber); void openInstance(id, "all"); }} />
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Sammlung</span>{selected && <><CaretRight size={13} /><span>{selected.definition.setNumber}</span></>}</div><div className="top-actions"><button className="icon-button" aria-label="Neu laden" onClick={() => void refresh()}><ArrowsClockwise size={18} /></button><button className="avatar" aria-label="Sammlerprofil">S</button></div></header>

      {selected ? <section className="content detail-view">
        <div className="heading-actions"><button className="back-link" onClick={() => setSelected(null)}><ArrowLeft size={16} />Zurück zu Meine Sets</button><button className="button secondary" onClick={() => setTab("details")}>Exemplar, Karton & Anleitung</button></div>
        <div className="detail-heading"><div><div className="eyebrow">LEGO {selected.definition.setNumber}{selected.definition.year ? ` · ${selected.definition.year}` : ""}</div><h1>{selected.nickname || selected.definition.name}</h1><p className="muted">{selected.nickname && <>{selected.definition.name} <span className="dot-sep">·</span> </>}{selected.total ? `${number(selected.total)} Soll-Teile` : "Inventar wird importiert"}</p></div><div className="heading-actions"><button className="button secondary" disabled={busy} onClick={() => void refreshDefinition()}><ArrowsClockwise size={16} />Setdaten aktualisieren</button><button className="button secondary" onClick={() => setTab("inventory")}><ClipboardText size={16} />Inventur starten</button><button className="button quiet" aria-label="Set-Exemplar entfernen" onClick={() => void removeInstance()}><Archive size={17} /></button></div></div>
        <div className="tabs" role="tablist" aria-label="Setdetails">{([["overview", "Übersicht"], ["missing", `Fehlteile ${selected.missing || ""}`], ["all", "Alle Teile"], ["inventory", "Inventur"]] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}<button className="manual-tab-action" onClick={() => { setManualOpen(true); setError(""); setManualParts([]); setManualPart(null); }}><Plus size={15} />Manuell hinzufügen</button></div>
        {tab === "overview" && <><div className="detail-grid"><article className="set-hero panel"><button className="hero-image-button" aria-label={`${selected.definition.name} vergrößert anzeigen`} onClick={() => selected.definition.imageUrl && setImagePreview({ src: selected.definition.imageUrl, alt: `${selected.definition.name}, LEGO Set ${selected.definition.setNumber}`, caption: `${selected.definition.name} · LEGO ${selected.definition.setNumber}` })}><Image src={selected.definition.imageUrl} alt={`${selected.definition.name} Setbild`} className="hero-image" /></button><div className="hero-overlay"><span className="hero-tag">{selected.definition.year ?? "LEGO Set"}</span><h2>{selected.definition.name}</h2><span>{selected.definition.setNumber} · {number(selected.total)} Teile</span></div><span className="hero-zoom-hint">Bild vergrößern</span></article><div className="detail-stats"><article className="stat-card panel"><div className="stat-label">VOLLSTÄNDIGKEIT</div><div className="stat-large">{percent(selected.complete)}</div><div className="progress-track"><span style={{ width: `${selected.complete}%` }} /></div><small>{number(selected.reviewedQuantity - selected.missing)} von {number(selected.total)} Teile bestätigt · {number(selected.reviewedPositions)} / {number(selected.inventoryPositions)} Positionen geprüft</small></article><article className="stat-card panel"><div className="stat-label">FEHLENDE TEILE</div><div className="stat-large">{number(selected.missing)}</div><small>Über {selected.positions} unterschiedliche Positionen</small><button className="text-action" onClick={() => setTab("missing")}>Fehlteile ansehen <CaretRight size={15} /></button></article><article className="quick-panel panel"><div><span className="quick-icon"><CheckCircle size={19} /></span><b>{selected.complete === 100 ? "Set ist komplett" : selected.missing ? "Weiter Teile erfassen" : "Inventur noch offen"}</b><small>{selected.complete === 100 ? "Alle Soll-Teile sind vorhanden." : `Inventur zu ${percent(selected.checkedPercent)} geprüft.`}</small></div><button className="button primary" onClick={() => setTab("inventory")}>{selected.missing === 0 ? "Inventur öffnen" : "Inventur fortsetzen"}<CaretRight size={16} /></button></article></div></div><CollectionMeta instance={selected} onSaved={() => { void openInstance(selected.id); void refresh(); }} /><QRLabel instanceId={selected.id} setNumber={selected.definition.setNumber} name={selected.nickname || selected.definition.name} location={selected.storageLocation?.name ?? null} /><SetOrders instanceId={selected.id} items={selected.inventory} /><SetPhotos instanceId={selected.id} /></>}
        {tab !== "overview" && <div className="inventory-panel panel"><div className="inventory-toolbar"><div><h2>{tab === "missing" ? "Noch fehlende Teile" : tab === "inventory" ? "Inventur" : "Soll-Inventar"}</h2><p>{tab === "missing" ? "Teile gefunden? Mit einem Klick zurückbuchen." : "Suche Teile nach Nummer, Name oder Farbe."}</p></div><div className="inventory-filters"><label className="searchbox"><MagnifyingGlass size={17} /><input aria-label="Teile suchen" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Teil, Nummer oder Farbe …" /></label>{tab === "missing" ? <select aria-label="Fehlteile sortieren" value={missingSort} onChange={(e) => setMissingSort(e.target.value)}><option value="color">Farbe, dann Teilnummer</option><option value="number">Teilnummer</option><option value="name">Name</option></select> : <><select aria-label="Teile filtern" value={partFilter} onChange={(e) => setPartFilter(e.target.value)}><option value="all">Alle Teile</option><option value="missing">Nur fehlende</option></select><select aria-label="Nach Farbe filtern" value={partColorFilter} onChange={(e) => setPartColorFilter(e.target.value)}><option value="all">Alle Farben</option>{[...new Set(selected.inventory.map((item) => item.color.name))].sort().map((color) => <option value={color} key={color}>{color}</option>)}</select></>}</div></div>
          {tab === "inventory" && <div className="inventory-mode">{inventoryItem ? <><div className="inventory-mode-toolbar"><label>Sortieren nach <select value={inventoryGroup} onChange={(e) => setInventoryGroup(e.target.value)}><option value="number">Partnummer</option><option value="color">Farbe</option><option value="category">Kategorie</option></select></label><label className="review-filter"><input type="checkbox" checked={inventoryReviewFilter === "unchecked"} onChange={(e) => setInventoryReviewFilter(e.target.checked ? "unchecked" : "all")} />Nur ungeprüfte</label><span>Teil {number(inventoryIndex + 1)} von {number(visibleItems.length)}</span></div><div className="inventory-focus"><ZoomableImage src={inventoryItem.part.imageUrl} alt={`${inventoryItem.color.name} ${inventoryItem.part.name}`} caption={`${inventoryItem.part.name} · ${inventoryItem.part.number} · ${inventoryItem.color.name}`} className="focus-image-wrap" imageClassName="focus-image" onOpen={setImagePreview} /><div className="focus-part-number">{inventoryItem.part.number}</div><h3>{inventoryItem.part.name}</h3><div className="focus-color"><i className="color-swatch" style={{ backgroundColor: inventoryItem.color.rgb ? `#${inventoryItem.color.rgb}` : "#d3d3ce" }} />{inventoryItem.color.name}</div><div className="focus-counts"><div><small>BENÖTIGT</small><b>{inventoryItem.quantity}</b></div><div><small>FEHLT</small><b className={inventoryItem.missing ? "text-red" : "text-green"}>{inventoryItem.missing}</b></div><div><small>STATUS</small><b className={inventoryItem.reviewed ? "text-green" : ""}>{inventoryItem.reviewed ? "Geprüft" : "Offen"}</b></div></div><div className="focus-controls"><button className="button secondary" disabled={!inventoryItem.missing} onClick={() => void updateQuantity(selected, inventoryItem, -1)}><CaretDown size={18} />Fehlt weniger</button><button className="button secondary" disabled={inventoryItem.missing >= inventoryItem.quantity} onClick={() => void updateQuantity(selected, inventoryItem, 1)}><Plus size={18} />Fehlt mehr</button><button className="button primary" onClick={() => void updateQuantity(selected, inventoryItem, undefined, 0)}><Check size={18} />Alles vorhanden</button></div></div><div className="inventory-pagination"><button className="button secondary" disabled={inventoryIndex === 0} onClick={() => setInventoryIndex((index) => Math.max(0, index - 1))}><CaretLeft size={17} />Zurück</button><button className="button secondary" disabled={inventoryIndex >= visibleItems.length - 1} onClick={() => setInventoryIndex((index) => Math.min(visibleItems.length - 1, index + 1))}>Weiter<CaretRight size={17} /></button></div></> : <div className="empty-state"><CheckCircle size={30} /><b>Keine Teile gefunden</b><span>Ändere die Suche oder den Filter.</span></div>}</div>}
          {tab !== "inventory" && <><div className="parts-list">{pageItems.filter((item) => tab !== "missing" || item.missing > 0).map((item) => <article className={`part-row ${item.missing ? "has-missing" : ""}`} key={item.id}><ZoomableImage src={item.part.imageUrl} alt={`${item.color.name} ${item.part.name}`} caption={`${item.part.name} · ${item.part.number} · ${item.color.name}`} className="part-image-wrap" imageClassName="part-image" onOpen={setImagePreview} /><div className="part-info"><strong>{item.part.name}</strong><span><code>{item.part.number}</code><span className="dot-sep">·</span><i className="color-swatch" style={{ backgroundColor: item.color.rgb ? `#${item.color.rgb}` : "#d3d3ce" }} />{item.color.name}</span></div><div className="part-quantity"><small>SOLL</small><b>{number(item.quantity)}</b></div><div className="part-quantity missing-quantity"><small>FEHLT</small><b>{number(item.missing)}</b></div><div className="quantity-controls">{tab === "all" && <button type="button" className={`reviewed-toggle ${item.reviewed ? "is-reviewed" : "needs-review"}`} aria-label={item.reviewed ? "Prüfung zurücksetzen" : "Als geprüft markieren"} aria-pressed={item.reviewed} title={item.reviewed ? "Geprüft · klicken zum Zurücksetzen" : "Noch ungeprüft · klicken zum Bestätigen"} disabled={busy} onClick={() => void updateReview(selected, item, !item.reviewed)}><Check size={16} />{item.reviewed ? "Geprüft" : "Prüfen"}</button>}<button type="button" aria-label={`Fehlmenge für ${item.part.number} verringern`} disabled={!item.missing || busy} onClick={() => void updateQuantity(selected, item, -1)}><CaretDown size={17} /></button><button type="button" aria-label={`Fehlmenge für ${item.part.number} erhöhen`} disabled={item.missing >= item.quantity || busy} onClick={() => void updateQuantity(selected, item, 1)}><Plus size={17} /></button><button type="button" className="found-button" disabled={!item.missing || busy} onClick={() => void updateQuantity(selected, item, undefined, 0)}><Check size={16} /><span>Gefunden</span></button></div></article>)}{!visibleItems.length && <div className="empty-state"><Cube size={28} /><b>{tab === "missing" ? "Keine Fehlteile" : "Keine Teile gefunden"}</b><span>{tab === "missing" ? "Dieses Set ist vollständig." : "Passe deine Suche an."}</span></div>}</div>{visibleItems.length > itemsPerPage && <div className="list-pagination"><span>{number(itemsPage * itemsPerPage + 1)}–{number(Math.min((itemsPage + 1) * itemsPerPage, visibleItems.length))} von {number(visibleItems.length)} Teilen</span><div><button className="button secondary" disabled={!itemsPage} onClick={() => setItemsPage((page) => Math.max(0, page - 1))}><CaretLeft size={15} />Zurück</button><span>Seite {itemsPage + 1} / {pageCount}</span><button className="button secondary" disabled={itemsPage >= pageCount - 1} onClick={() => setItemsPage((page) => Math.min(pageCount - 1, page + 1))}>Weiter<CaretRight size={15} /></button></div></div>}</>}
        </div>}
        {tab === "inventory" && inventoryItem && <InventoryItemEditor instanceId={selected.id} item={inventoryItem} groupBy={inventoryGroup} onGroupBy={setInventoryGroup} onSaved={() => { void fetch(`/api/instances/${selected.id}`, { cache: "no-store" }).then((response) => response.json()).then(setSelected); setUndoAvailable(selected.id); void refresh(); }} />}
        {tab === "overview" && <SetHistory instanceId={selected.id} />}
      </section> : page === "sets" ? <section className="content">
        <div className="page-heading"><div><div className="eyebrow">DEINE SAMMLUNG</div><h1>Meine Sets</h1><p>Jedes Teil bringt dich dem fertigen Set näher.</p></div><button className="button primary" onClick={() => { setDialog(true); setError(""); }}><Plus size={18} weight="bold" />Set hinzufügen</button></div>
        <div className="collection-summary"><div><span className="summary-icon"><Cube size={17} /></span><b>{sets.length}</b><span>Sets in deiner Sammlung</span></div><span className="summary-divider" /><div><span className="summary-icon alert"><ClipboardText size={17} /></span><b>{number(sets.reduce((sum, item) => sum + item.missing, 0))}</b><span>Teile auf der Fehlteileliste</span></div></div>
        <div className="collection-toolbar"><div className="filter-pills" role="group" aria-label="Sets filtern">{[["all", "Alle"], ["incomplete", "Unvollständig"], ["near", "Fast fertig"], ["complete", "Komplett"], ["sale", "Zum Verkauf"], ["unchecked", "Ungeprüft"]].map(([value, label]) => <button className={filter === value ? "chosen" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="toolbar-right"><label className="searchbox"><MagnifyingGlass size={17} /><input aria-label="Sets suchen" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen …" /></label><label className="select-wrap"><SlidersHorizontal size={15} /><select aria-label="Sets sortieren" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Neueste zuerst</option><option value="priority">Wenigste Fehlteile</option><option value="number">Setnummer</option><option value="name">Name</option><option value="year">Erscheinungsjahr</option><option value="missing">Fehlteile</option><option value="complete">Vollständigkeit</option></select><CaretDown size={14} /></label></div></div>
        {visibleSets.length ? <div className="set-grid">{visibleSets.map((item) => <button className="set-card panel" key={item.id} onClick={() => { void openInstance(item.id); }}><div className="card-art"><Image src={item.definition.imageUrl} alt={`${item.definition.name} Setbild`} className="card-image" /><span className={`card-status ${item.missing ? "incomplete" : item.complete === 100 ? "complete" : "incomplete"}`}>{item.missing ? <><span className="status-dot red" />{number(item.missing)} fehlen</> : item.complete === 100 ? <><CheckCircle size={14} weight="fill" />Komplett</> : <>{number(item.reviewedPositions)} / {number(item.inventoryPositions)} geprüft</>}</span></div><div className="card-content"><span className="eyebrow">LEGO {item.definition.setNumber}{item.definition.year ? ` · ${item.definition.year}` : ""}</span><h2>{item.nickname || item.definition.name}</h2>{item.nickname && <p className="card-subtitle">{item.definition.name}</p>}<div className="card-stats"><span>{number(item.total)} Teile</span><b>{percent(item.complete)}</b></div><div className="progress-track"><span style={{ width: `${item.complete}%` }} /></div></div></button>)}</div> : <div className="empty-collection panel"><div className="empty-cube"><Cube size={30} weight="light" /></div><h2>{sets.length ? "Keine Sets für diesen Filter" : "Deine Sammlung beginnt hier"}</h2><p>{sets.length ? "Ändere den Filter oder suche nach einem anderen Set." : "Füge dein erstes Set über die Setnummer hinzu. Inventar und Setbild werden automatisch geladen."}</p>{sets.length ? <button className="button secondary" onClick={() => { setFilter("all"); setQuery(""); }}>Filter zurücksetzen</button> : <button className="button primary" onClick={() => setDialog(true)}><Plus size={17} />Erstes Set hinzufügen</button>}</div>}
      </section> : page === "prices" ? <PriceWorkspace instances={sets} missingGroups={missingGroups} /> : page === "statistics" ? <section className="content statistics-page">
        <div className="page-heading"><div><div className="eyebrow">DEINE SAMMLUNG IN ZAHLEN</div><h1>Statistiken</h1><p>Inventur, Vielfalt und kleine Sammlungsrekorde auf einen Blick.</p></div><button className="button secondary" onClick={() => void openStatistics()}><ArrowsClockwise size={16} />Aktualisieren</button></div>
        {!statistics ? <div className="panel stats-loading"><CircleNotch className="spin" size={22} />Statistiken werden berechnet …</div> : <>
          <div className="statistics-overview">
            <article className="panel statistics-card"><span className="summary-icon"><SquaresFour size={17} /></span><small>Sammlung</small><strong>{number(statistics.overview.instances)} <em>Exemplare</em></strong><span>{number(statistics.overview.definitions)} verschiedene Sets · {number(statistics.overview.repeatedInstances)} Mehrfachexemplare</span></article>
            <article className="panel statistics-card"><span className="summary-icon"><Cube size={17} /></span><small>Teilebestand</small><strong>{number(statistics.overview.totalPieces)} <em>Teile</em></strong><span>Ø {number(statistics.overview.avgPiecesPerSet)} Teile je Exemplar · {number(statistics.overview.positions)} Inventarpositionen</span></article>
            <article className="panel statistics-card"><span className="summary-icon alert"><ClipboardText size={17} /></span><small>Noch zu tun</small><strong>{number(statistics.overview.totalMissing)} <em>Fehlteile</em></strong><span>{number(statistics.overview.uncheckedPieces)} Teile noch ungeprüft</span></article>
            <article className="panel statistics-card"><span className="summary-icon"><CheckCircle size={17} /></span><small>Bestätigt vorhanden</small><strong>{percent(statistics.overview.completionPercent)}</strong><span>{number(statistics.overview.completeInstances)} von {number(statistics.overview.instances)} Exemplaren komplett</span></article>
          </div>

          <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">FORTSCHRITT</div><h2>Inventur und Vollständigkeit</h2><p>Geprüft bedeutet: gezählt und als vorhanden oder fehlend erfasst.</p></div></div><div className="stats-progress-grid"><article className="panel stats-progress-card"><div><span>Inventur geprüft</span><b>{percent(statistics.overview.checkedPercent)}</b></div><div className="progress-track"><span style={{ width: `${statistics.overview.checkedPercent}%` }} /></div><small>{number(statistics.overview.totalReviewed)} / {number(statistics.overview.totalPieces)} Teile kontrolliert</small></article><article className="panel stats-progress-card"><div><span>Als vorhanden bestätigt</span><b>{percent(statistics.overview.completionPercent)}</b></div><div className="progress-track"><span style={{ width: `${statistics.overview.completionPercent}%` }} /></div><small>{number(statistics.overview.confirmedPresent)} da · {number(statistics.overview.totalMissing)} fehlen</small></article><article className="panel stats-progress-card"><div><span>Einkaufsstatus</span><b>{number(statistics.overview.wantedPieces + statistics.overview.orderedPieces)} Teile</b></div><div className="shopping-meter"><i style={{ width: `${statistics.overview.totalMissing ? statistics.overview.orderedPieces / statistics.overview.totalMissing * 100 : 0}%` }} /></div><small>{number(statistics.overview.wantedPieces)} vorgemerkt · {number(statistics.overview.orderedPieces)} bestellt</small></article></div></section>

          <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNGSMIX</div><h2>Themen, Epochen und Teile</h2><p>Welche Welten und Teilebereiche deine Sammlung prägen.</p></div></div><div className="stats-chart-grid"><article className="panel stats-chart-card"><h3>Sets nach Thema</h3><StatBars items={statistics.themes.map((item) => ({ name: item.name, count: item.count }))} label="Sets nach Thema" /></article><article className="panel stats-chart-card"><h3>Sets nach Erscheinungsjahr</h3><StatBars items={statistics.eras.map((item) => ({ name: item.name, count: item.count }))} label="Sets nach Epoche" /></article><article className="panel stats-chart-card"><h3>Häufigste Teilekategorien</h3><StatBars items={statistics.categories} label="Teilekategorien" formatter={number} /></article><article className="panel stats-chart-card"><h3>Farben im Sollinventar</h3><StatBars items={statistics.commonColors.map((item) => ({ name: item.name, count: item.count }))} label="Farben in der Sammlung" /></article><article className="panel stats-chart-card"><h3>Sammlung gewachsen</h3><StatBars items={statistics.collectionHistory.map((item) => ({ name: new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${item.month}-01T00:00:00Z`)), count: item.count }))} label="Hinzugefügte Exemplare je Monat" formatter={(value) => `${number(value)} Sets`} /></article></div></section>

          <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">FEHLTEILE UND EINKAUF</div><h2>Was noch gesucht wird</h2><p>Die häufigsten Kombinationen aus Teil und Farbe sowie die Verteilung der Fehlteile.</p></div></div><div className="stats-chart-grid"><article className="panel stats-chart-card"><h3>Fehlteile nach Farbe</h3><StatBars items={statistics.missingColors.map((item) => ({ name: item.name, count: item.count }))} label="Fehlteile nach Farbe" /></article><article className="panel stats-chart-card"><h3>Am häufigsten fehlende Teile</h3><div className="stats-part-list">{statistics.commonMissing.slice(0, 7).map((item) => <div className="stats-part-row" key={`${item.part.number}-${item.color.name}`}><span className="stats-color-dot" style={{ backgroundColor: item.color.rgb ? `#${item.color.rgb}` : "#d3d3ce" }} /><span><b>{item.part.name}</b><small>{item.part.number} · {item.color.name}</small></span><strong>{number(item.count)}×</strong></div>)}{!statistics.commonMissing.length && <p className="muted">Keine Fehlteile vorhanden.</p>}</div></article></div></section>

          <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SAMMLUNGSREKORDE</div><h2>Ranglisten und Kuriositäten</h2><p>Ein paar Zahlen zum Vergleichen, Planen und Staunen.</p></div></div><div className="stats-fun-grid"><article className="panel stats-fun-card"><small>GRÖSSTER BAUSTELLENFALL</small>{statistics.topMissingSets[0] ? <><b>{statistics.topMissingSets[0].nickname || statistics.topMissingSets[0].name}</b><span>LEGO {statistics.topMissingSets[0].setNumber} · {number(statistics.topMissingSets[0].missing)} fehlen</span></> : <b>Keine Fehlteile</b>}</article><article className="panel stats-fun-card"><small>ÄLTESTES SETJAHR</small><b>{statistics.oldestSet?.name ?? "Noch offen"}</b><span>{statistics.oldestSet ? `${statistics.oldestSet.year} · LEGO ${statistics.oldestSet.setNumber}` : "Jahresdaten fehlen"}</span></article><article className="panel stats-fun-card"><small>JÜNGSTES SETJAHR</small><b>{statistics.newestSet?.name ?? "Noch offen"}</b><span>{statistics.newestSet ? `${statistics.newestSet.year} · LEGO ${statistics.newestSet.setNumber}` : "Jahresdaten fehlen"}</span></article><article className="panel stats-fun-card"><small>FEHLTEIL-KONZENTRATION</small><b>{statistics.fiveSetMissingShare} %</b><span>der Fehlteile stecken in den fünf unvollständigsten Sets.</span></article><article className="panel stats-fun-card"><small>TEILEVIELFALT</small><b>{number(statistics.overview.differentParts)} Teiletypen · {number(statistics.overview.differentColors)} Farben</b><span>In deinen Setinventaren vertreten.</span></article><article className="panel stats-fun-card"><small>WIEDERHOLUNGSTÄTER</small><b>{number(statistics.repeats.length)} Setnummern mehrfach</b><span>{number(statistics.overview.repeatedInstances)} Exemplare gehören zu mehrfach vorhandenen Sets.</span></article><article className="panel stats-fun-card"><small>FEHLTEILE PRO SET</small><b>Ø {number(statistics.overview.avgMissingPerSet)}</b><span>Fehlende Teile über alle Exemplare gerechnet.</span></article></div></section>

          <section className="stats-section"><div className="stats-section-heading"><div><div className="eyebrow">SET-RANGLISTEN</div><h2>Fehlteile und Fortschritt je Exemplar</h2></div></div><div className="stats-rank-grid"><article className="panel stats-rank-card"><h3>Die meisten Fehlteile</h3>{statistics.topMissingSets.map((item, index) => <div className="stats-rank-row" key={item.id}><b className="rank-number">{index + 1}</b><Image src={item.imageUrl} alt="" className="stats-set-thumb" /><span><strong>{item.nickname || item.name}</strong><small>LEGO {item.setNumber} · {number(item.total)} Teile</small></span><b className="text-red">{number(item.missing)} fehlen</b></div>)}{!statistics.topMissingSets.length && <p className="muted">Alle Sets sind vollständig.</p>}</article><article className="panel stats-rank-card"><h3>Am weitesten geprüft</h3>{statistics.highestCompletion.map((item, index) => <div className="stats-rank-row" key={item.id}><b className="rank-number">{index + 1}</b><Image src={item.imageUrl} alt="" className="stats-set-thumb" /><span><strong>{item.nickname || item.name}</strong><small>LEGO {item.setNumber} · {number(item.reviewedPositions)} / {number(item.inventoryPositions)} Positionen geprüft</small></span><b>{percent(item.checkedPercent)}</b></div>)}</article></div></section>
        </>}
      </section> : page === "missing" ? <section className="content">
        <div className="page-heading"><div><div className="eyebrow">SAMMELÜBERSICHT</div><h1>Fehlteile</h1><p>Alles, was deinen Sets noch fehlt, an einem Ort.</p></div><button className="button secondary" onClick={() => void refresh()}><ArrowsClockwise size={16} />Aktualisieren</button></div>
        <div className="collection-summary"><div><span className="summary-icon alert"><ClipboardText size={17} /></span><b>{number(missingGroups.reduce((sum, g) => sum + g.quantity, 0))}</b><span>Teile insgesamt</span></div><span className="summary-divider" /><div><span className="summary-icon"><Cube size={17} /></span><b>{missingGroups.length}</b><span>unterschiedliche Positionen</span></div></div>
        <div className="global-list-toolbar"><label className="select-wrap"><SlidersHorizontal size={15} /><select aria-label="Fehlteile sortieren" value={missingListSort} onChange={(event) => setMissingListSort(event.target.value)}><option value="color">Farbe</option><option value="number">Teilenummer</option><option value="quantity">Gesamte Fehlmenge</option></select><CaretDown size={14} /></label></div>
        <div className="global-list panel">{sortedMissingGroups.map((group) => <article className="global-row" key={`${group.part.id}-${group.color.id}`}><ZoomableImage src={group.part.imageUrl} alt={`${group.color.name} ${group.part.name}`} caption={`${group.part.name} · ${group.part.number} · ${group.color.name}`} className="global-image" imageClassName="global-image-art" onOpen={setImagePreview} /><div className="global-part"><b>{group.part.name}</b><span><code>{group.part.number}</code><span className="dot-sep">·</span><i className="color-swatch" style={{ backgroundColor: group.color.rgb ? `#${group.color.rgb}` : "#d3d3ce" }} />{group.color.name}</span></div><div className="global-set-list">{group.sets.map((set) => <div key={set.instanceId}><button onClick={() => { setPage("sets"); void openInstance(set.instanceId, "missing"); }}>{set.nickname || set.name} <span>({set.setNumber})</span></button><b>{set.quantity}×</b><button className="mini-found" aria-label={`1 Teil bei ${set.name} gefunden`} onClick={async () => { await fetch("/api/missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, found: 1 }) }); setMessage("Ein Teil als gefunden markiert."); await refresh(); }}><Check size={14} />1 gefunden</button><button className="mini-found" aria-label={`${set.quantity} Teile bei ${set.name} gefunden`} onClick={async () => { await fetch("/api/missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, found: set.quantity }) }); setMessage("Alle Teile als gefunden markiert."); await refresh(); }}><Check size={14} />Alle</button><button className="mini-found" onClick={async () => { const result = await fetch("/api/shopping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, status: "WANTED", quantity: set.quantity }) }); const data = await result.json(); if (!result.ok) setError(data.error ?? "Einkaufsliste konnte nicht geändert werden."); else { setMessage("Zur Einkaufsliste hinzugefügt."); await refresh(); } }}><Plus size={14} />Einkauf</button></div>)}</div><b className="global-total">{group.quantity}×</b></article>)}{!missingGroups.length && <div className="empty-state"><CheckCircle size={30} /><b>Alles da</b><span>Aktuell fehlen keine Teile in deinen Sets.</span></div>}</div>
      </section> : page === "shopping" ? <section className="content"><div className="page-heading"><div><div className="eyebrow">SAMMELÜBERSICHT</div><h1>Einkaufsliste</h1><p>Vorgemerkte und bereits bestellte Fehlteile.</p></div><button className="button secondary" onClick={() => void refresh()}><ArrowsClockwise size={16} />Aktualisieren</button></div><div className="global-list panel">{shoppingGroups.map((group) => <article className="global-row" key={`${group.part.id}-${group.color.id}`}><ZoomableImage src={group.part.imageUrl} alt={`${group.color.name} ${group.part.name}`} caption={`${group.part.name} · ${group.part.number} · ${group.color.name}`} className="global-image" imageClassName="global-image-art" onOpen={setImagePreview} /><div className="global-part"><b>{group.part.name}</b><span><code>{group.part.number}</code> · {group.color.name}</span></div><div className="global-set-list">{group.sets.map((set) => <div key={set.instanceId}><span>{set.nickname || set.setName} ({set.setNumber})</span><span>{set.wanted} vorgemerkt · {set.ordered} bestellt</span><button className="mini-found" disabled={!set.wanted} onClick={async () => { const response = await fetch("/api/shopping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, moveToOrdered: true }) }); const data = await response.json(); if (!response.ok) setError(data.error ?? "Status konnte nicht geändert werden."); else await refresh(); }}><Check size={14} />Als bestellt markieren</button><button className="mini-found" onClick={async () => { await fetch("/api/shopping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, status: "WANTED", quantity: 0 }) }); await refresh(); }}>Entfernen</button></div>)}</div><b className="global-total">{group.wanted + group.ordered}×</b></article>)}{!shoppingGroups.length && <div className="empty-state"><ClipboardText size={30} /><b>Einkaufsliste ist leer</b><span>Füge Positionen über die Fehlteileübersicht hinzu.</span></div>}</div></section> : page === "minifigs" ? <section className="content">
        <div className="page-heading"><div><div className="eyebrow">FIGURENTEILE AUS DEINEN SETS</div><h1>Minifiguren</h1><p>Physische Teile, die Rebrickable den Minifiguren deiner Sets zuordnet.</p></div><button className="button secondary" disabled={minifigLoading} onClick={() => void refreshMinifigs()}><ArrowsClockwise size={16} />{minifigLoading ? "Lädt …" : "Aktualisieren"}</button></div>
        <div className="collection-summary"><div><span className="summary-icon"><Cube size={17} /></span><b>{number(minifigGroups.length)}</b><span>Teil und Farbe</span></div><span className="summary-divider" /><div><span className="summary-icon"><CheckCircle size={17} /></span><b>{number(minifigGroups.reduce((sum, group) => sum + group.quantity, 0))}</b><span>Figurenteile insgesamt</span></div><span className="summary-divider" /><div><span className="summary-icon alert"><ClipboardText size={17} /></span><b>{number(minifigGroups.reduce((sum, group) => sum + group.missing, 0))}</b><span>davon fehlend</span></div></div>
        <div className="global-list-toolbar"><label className="searchbox"><MagnifyingGlass size={17} /><input aria-label="Minifigurenteile suchen" placeholder="Teil, Nummer, Farbe oder Set …" value={minifigQuery} onChange={(event) => setMinifigQuery(event.target.value)} /></label><label className="select-wrap"><SlidersHorizontal size={15} /><select aria-label="Minifigurenteile sortieren" value={minifigSort} onChange={(event) => setMinifigSort(event.target.value)}><option value="number">Teilenummer</option><option value="color">Farbe</option><option value="quantity">Anzahl</option></select><CaretDown size={14} /></label></div>
        <div className="global-list panel">{minifigGroups.map((group) => <article className="global-row" key={`${group.part.id}-${group.color.id}`}><ZoomableImage src={group.part.imageUrl} alt={`${group.color.name} ${group.part.name}`} caption={`${group.part.name} · ${group.part.number} · ${group.color.name}`} className="global-image" imageClassName="global-image-art" onOpen={setImagePreview} /><div className="global-part"><b>{group.part.name}</b><span><code>{group.part.number}</code><span className="dot-sep">·</span><i className="color-swatch" style={{ backgroundColor: group.color.rgb ? `#${group.color.rgb}` : "#d3d3ce" }} />{group.color.name}</span></div><div className="global-set-list">{group.sets.map((set) => <div key={set.instanceId}><button onClick={() => { setPage("sets"); void openInstance(set.instanceId, "all"); }}>{set.nickname || set.name} <span>({set.setNumber})</span></button><span>{number(set.quantity)}× benötigt{set.missing > 0 ? ` · ${number(set.missing)} fehlen` : " · komplett"}</span>{set.missing > 0 && <button className="mini-found" onClick={async () => { const response = await fetch("/api/missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: set.instanceId, inventoryItemId: set.inventoryItemId, found: set.missing }) }); const data = await response.json(); if (!response.ok) setError(data.error ?? "Fehlteile konnten nicht aktualisiert werden."); else { setMessage("Minifigurenteile als gefunden markiert."); await refreshMinifigs(); await refresh(); } }}><Check size={14} />Alle gefunden</button>}</div>)}</div><b className="global-total">{number(group.quantity)}×</b></article>)}{!minifigGroups.length && <div className="empty-state"><Cube size={30} /><b>{minifigLoading ? "Minifigurenteile werden geladen …" : minifigLoadError ? "Minifigurenteile konnten nicht geladen werden" : "Keine Minifigurenteile gefunden"}</b><span>{minifigLoading ? "Die Teile werden aus den importierten Setinventaren zusammengestellt." : minifigLoadError ? "Prüfe die Verbindung und lade die Ansicht erneut." : "Die Teile werden beim Aktualisieren der Setdaten erkannt. Öffne ein Set und wähle „Setdaten aktualisieren“."}</span></div>}</div>
      </section> : page === "looseStock" ? <section className="content">
        <div className="page-heading"><div><div className="eyebrow">SAMMLUNG</div><h1>Teilebestand</h1><p>Eigene lose Teile verwalten und mit offenen Fehlteilen abgleichen.</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void openLooseStock()}><ArrowsClockwise size={16} />Aktualisieren</button><button className="button primary" onClick={() => { setManualQuery(""); setManualParts([]); setManualPart(null); setStockDialog(true); }}><Plus size={16} />Teil eintragen</button></div></div>
        <div className="collection-summary"><div><span className="summary-icon"><Cube size={17} /></span><b>{number(looseStockData?.stock.reduce((sum, row) => sum + row.quantity, 0) ?? 0)}</b><span>lose Teile</span></div><span className="summary-divider" /><div><span className="summary-icon"><CheckCircle size={17} /></span><b>{number(looseStockData?.summary.covered ?? 0)}</b><span>Fehlteile abgedeckt</span></div><span className="summary-divider" /><div><span className="summary-icon alert"><ClipboardText size={17} /></span><b>{number(looseStockData?.summary.toBuy ?? 0)}</b><span>noch zu besorgen</span></div><span className="summary-divider" /><div><span className="summary-icon"><SquaresFour size={17} /></span><b>{number(looseStockData?.stock.length ?? 0)}</b><span>Teil-Farb-Positionen</span></div></div>
        <section className="panel stock-locations-panel"><div><b>Lagerorte</b><span>Teile und Einstandspreise bearbeitest du direkt bei der jeweiligen Position.</span></div><div className="heading-actions"><select aria-label="Lagerort für neue Teile" value={stockLocationId} onChange={(event) => setStockLocationId(event.target.value)}><option value="">Kein Lagerort</option>{storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><input aria-label="Neuen Lagerortnamen" value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} placeholder="Neuen Lagerort anlegen" /><button className="button secondary" disabled={!newLocationName.trim()} onClick={() => void addStorageLocation()}>Anlegen</button></div></section>
        <div className="global-list-toolbar"><label className="searchbox"><MagnifyingGlass size={17} /><input aria-label="Teilebestand durchsuchen" placeholder="Teil, Teilenummer, Farbe oder Lagerort …" value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} /></label><label className="select-wrap"><SlidersHorizontal size={15} /><select aria-label="Teilebestand sortieren" value={stockSort} onChange={(event) => setStockSort(event.target.value)}><option value="number">Teilenummer</option><option value="color">Farbe</option><option value="quantity">Menge</option></select><CaretDown size={14} /></label></div>
        <div className="global-list panel">{busy && !looseStockData ? <div className="empty-state"><CircleNotch className="spin" size={28} /><b>Bestand wird geladen …</b></div> : visibleStockRows.map((row) => <article className="global-row stock-group-row" key={row.id}><ZoomableImage src={row.part.imageUrl} alt={`${row.color.name} ${row.part.name}`} caption={`${row.part.name} · ${row.part.number} · ${row.color.name}`} className="global-image" imageClassName="global-image-art" onOpen={setImagePreview} /><div className="global-part"><b>{row.part.name}</b><span><code>{row.part.number}</code> · {row.color.name}</span><span>Bestand {number(row.quantity)} · Fehlbedarf {number(row.missingQuantity)} · zu kaufen {number(row.toBuy)}</span>{row.unitCost !== null && <small>Ø Einstand {row.unitCost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € pro Teil</small>}{row.locations.map((location) => <div className="stock-bin-row" key={location.id}><span>{location.name}: <b>{number(location.quantity)}×</b>{location.unitCost !== null ? ` · ${location.unitCost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Teil` : " · kein Preis"}</span><button className="button quiet" onClick={() => setEditingStockBin({ id: location.id, quantity: location.quantity, locationId: location.locationId ?? "", unitCost: location.unitCost === null ? "" : location.unitCost.toFixed(2) })}>Bearbeiten</button></div>)}</div><StockAssignment partId={row.part.id} colorId={row.color.id} sets={row.sets} available={row.quantity} onAssigned={async () => { const response = await fetch("/api/loose-stock", { cache: "no-store" }); if (response.ok) setLooseStockData(await response.json()); await refresh(); }} /></article>)}{!busy && !visibleStockRows.length && <div className="empty-state"><Cube size={30} /><b>{stockQuery ? "Keine passenden Teile" : "Teilebestand ist leer"}</b><span>{stockQuery ? "Passe den Suchbegriff an." : "Füge lose Teile hinzu, damit sie Fehlteile in deinen Sets abdecken können."}</span></div>}</div>
      </section> : <section className="content">
        <div className="page-heading"><div><div className="eyebrow">SYSTEMSTATUS</div><h1>Diagnose</h1><p>Lokale Daten und Verbindung zur Teilequelle.</p></div><button className="button secondary" onClick={() => void openDiagnostics()}><ArrowsClockwise size={16} />Status aktualisieren</button></div>
        <div className="diagnostic-grid"><article className="panel diagnostic-card"><div className="diagnostic-icon"><SquaresFour size={19} /></div><small>Set-Definitionen</small><strong>{diagnostics?.sets ?? "–"}</strong></article><article className="panel diagnostic-card"><div className="diagnostic-icon"><Archive size={19} /></div><small>Set-Exemplare</small><strong>{diagnostics?.instances ?? "–"}</strong></article><article className="panel diagnostic-card"><div className="diagnostic-icon"><Cube size={19} /></div><small>Teile / Farben</small><strong>{number(diagnostics?.parts ?? 0)} / {number(diagnostics?.colors ?? 0)}</strong></article><article className="panel diagnostic-card"><div className="diagnostic-icon"><ChartDonut size={19} /></div><small>Letzter Import</small><strong className="diagnostic-date">{diagnostics?.lastImport ? dateTimeFormatter.format(new Date(diagnostics.lastImport)) : "Noch keiner"}</strong></article></div>
        <article className="panel provider-panel"><div><div className="eyebrow">DATENQUELLE</div><h2>Rebrickable API</h2><p>Setdaten und Teileinventare werden beim Import lokal gespeichert.</p><span className="provider-status"><i className={providerStatus.includes("erfolgreich") ? "status-dot green" : "status-dot"} />{providerStatus || "Verbindung noch nicht getestet"}</span></div><button className="button primary" onClick={() => void testConnection()}><ArrowsClockwise size={16} />API-Verbindung testen</button></article>
        <article className="panel provider-panel"><div><div className="eyebrow">DATENSICHERUNG</div><h2>Backup und Wiederherstellung</h2><p>Exportiere deine Sammlung als JSON. Ein Import ergänzt Daten und überschreibt keine bestehenden Fehlmengen.</p>{backupStatus && <span className="provider-status">{backupStatus}</span>}<input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={(event) => void importBackup(event.target.files?.[0])} /></div><div className="heading-actions"><button className="button secondary" onClick={() => void exportBackup()}><Archive size={16} />Backup exportieren</button><button className="button secondary" onClick={() => backupInput.current?.click()}>Backup ergänzen</button></div></article>
      </section>}
    </main>
    {page === "diagnostics" && diagnostics && <aside className="panel shopping-tools"><b>Datenqualität</b><span>{number(diagnostics.partsWithoutCategory)} Teile ohne Kategorie</span><span>{number(diagnostics.partsWithoutImage)} Teile ohne Bild</span><span>{number(diagnostics.partsWithoutBricklinkId)} Teile ohne BrickLink-ID</span><span>{number(diagnostics.colorsWithoutBricklinkId)} Farben ohne BrickLink-ID</span></aside>}
    {selected && tab === "details" && <div className="dialog-backdrop" role="presentation"><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="instance-details-title"><button className="dialog-close" aria-label="Schließen" onClick={() => setTab("overview")}><X size={18} /></button><div className="eyebrow">LEGO {selected.definition.setNumber}</div><h2 id="instance-details-title">Exemplar, Zustand und Aufbewahrung</h2><p>Anleitung und Originalkarton werden getrennt erfasst, inklusive ihres Zustands.</p><label className="field-label">Lagerort<select value={detailDraft.storageLocationId} onChange={(event) => setDetailDraft({ ...detailDraft, storageLocationId: event.target.value })}><option value="">Kein Lagerort</option>{storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="field-label">Zustand des Sets<select value={detailDraft.condition} onChange={(event) => setDetailDraft({ ...detailDraft, condition: event.target.value })}><option value="">Nicht angegeben</option>{[["LIKE_NEW", "Wie neu"], ["GOOD", "Gut"], ["PLAYED", "Gebraucht"], ["DAMAGED", "Beschädigt"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={detailDraft.hasInstructions} onChange={(event) => setDetailDraft({ ...detailDraft, hasInstructions: event.target.checked })} /> Anleitung vorhanden</label>{detailDraft.hasInstructions && <label className="field-label">Anleitungszustand<select value={detailDraft.instructionsCondition} onChange={(event) => setDetailDraft({ ...detailDraft, instructionsCondition: event.target.value })}><option value="">Nicht angegeben</option>{["MINT", "VERY_GOOD", "GOOD", "WORN", "DAMAGED"].map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}</select></label>}<label><input type="checkbox" checked={detailDraft.hasBox} onChange={(event) => setDetailDraft({ ...detailDraft, hasBox: event.target.checked })} /> Originalkarton vorhanden</label>{detailDraft.hasBox && <label className="field-label">Kartonzustand<select value={detailDraft.boxCondition} onChange={(event) => setDetailDraft({ ...detailDraft, boxCondition: event.target.value })}><option value="">Nicht angegeben</option>{["MINT", "VERY_GOOD", "GOOD", "WORN", "DAMAGED"].map((value) => <option key={value} value={value}>{conditionLabel(value)}</option>)}</select></label>}<label className="field-label">Notizen<textarea value={detailDraft.notes} maxLength={3000} onChange={(event) => setDetailDraft({ ...detailDraft, notes: event.target.value })} /></label><label className="field-label">Neuen Lagerort anlegen<input value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} placeholder="z. B. Keller, Regal A" /></label><div className="dialog-actions"><button className="button secondary" onClick={() => void addStorageLocation()} disabled={!newLocationName.trim()}>Lagerort anlegen</button><button className="button primary" disabled={busy} onClick={() => void saveInstanceDetails()}><Check size={16} />Speichern</button></div></section></div>}
    {stockDialog && <div className="dialog-backdrop" role="presentation"><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="stock-add-title"><button className="dialog-close" aria-label="Schließen" onClick={() => setStockDialog(false)}><X size={18} /></button><h2 id="stock-add-title">Teil zum Bestand hinzufügen</h2><form onSubmit={searchManualPart}><label className="field-label">Teilenummer<input value={manualQuery} onChange={(event) => setManualQuery(event.target.value)} placeholder="z. B. 3001" required /></label><button className="button secondary">Teil suchen</button></form>{manualParts.length > 0 && <div className="search-results">{manualParts.map((part) => <button className="result-row" key={part.part_num} onClick={() => setManualPart(part)}><Image src={part.part_img_url} alt={part.name} className="result-image" /><span>{part.name} · {part.part_num}</span></button>)}</div>}{manualPart && <><h3>{manualPart.name} · {manualPart.part_num}</h3><label className="field-label">Farbe<select value={manualColor} onChange={(event) => setManualColor(Number(event.target.value))}>{manualColors.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}</select></label><label className="field-label">Menge<input type="number" min={1} value={manualQuantity} onChange={(event) => setManualQuantity(Number(event.target.value))} /></label><label className="field-label">Einstandspreis je Teil (€)<input type="number" min={0} step="0.01" value={manualUnitCost} onChange={(event) => setManualUnitCost(event.target.value)} placeholder="Optional" /></label><button className="button primary" disabled={busy} onClick={() => void addLooseStock()}>Bestand speichern</button></>}</section></div>}
    {editingStockBin && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditingStockBin(null); }}><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="stock-edit-title"><button className="dialog-close" aria-label="Schließen" disabled={busy} onClick={() => setEditingStockBin(null)}><X size={18} /></button><div className="eyebrow">BESTANDSVERWALTUNG</div><h2 id="stock-edit-title">Lagerposition bearbeiten</h2><label className="field-label">Menge<input type="number" min={0} max={100000} value={editingStockBin.quantity} onChange={(event) => setEditingStockBin({ ...editingStockBin, quantity: Math.max(0, Number(event.target.value)) })} /></label><label className="field-label">Lagerort<select value={editingStockBin.locationId} onChange={(event) => setEditingStockBin({ ...editingStockBin, locationId: event.target.value })}><option value="">Kein Lagerort</option>{storageLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="field-label">Einstandspreis je Teil (€)<input type="number" min={0} step="0.01" value={editingStockBin.unitCost} onChange={(event) => setEditingStockBin({ ...editingStockBin, unitCost: event.target.value })} placeholder="Optional" /></label><p>Menge 0 entfernt diese Lagerposition. Beim Verschieben in einen Lagerort mit demselben Teil wird der Bestand dort zusammengeführt.</p>{error && <p className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setEditingStockBin(null)}>Abbrechen</button><button className="button primary" disabled={busy} onClick={() => void saveStockBin()}>{busy ? "Speichert …" : "Änderungen speichern"}</button></div></section></div>}
    {page === "shopping" && <aside className="panel shopping-tools"><div className="heading-actions"><a className="button secondary" href="/api/shopping/export?format=csv">CSV exportieren</a><a className="button secondary" href="/api/shopping/export?format=xml">BrickLink XML</a></div><b>Bestellung erhalten</b>{shoppingGroups.flatMap((group) => group.sets.filter((set) => set.ordered > 0).map((set) => <div className="shopping-receive-row" key={`${set.instanceId}-${set.inventoryItemId}`}><span>{set.ordered}× {group.part.number} · {group.color.name}<small>{set.nickname || set.setName}</small></span><button className="mini-found" disabled={busy} onClick={() => void receiveShoppingOrder(set)}><Check size={14} />Alle erhalten</button></div>))}</aside>}

    {inventoryPreview && <div className="dialog-backdrop" role="presentation"><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="inventory-preview-title"><button className="dialog-close" aria-label="Schließen" onClick={() => setInventoryPreview(null)}><X size={18} /></button><div className="eyebrow">INVENTARÄNDERUNG</div><h2 id="inventory-preview-title">Änderungen vor Übernahme</h2><p>{inventoryPreview.added.length} neue, {inventoryPreview.removed.length} entfallene und {inventoryPreview.changed.length} geänderte Positionen.</p>{inventoryPreview.removed.some((item) => item.missing > 0) && <p className="inline-error">Bei {inventoryPreview.removed.filter((item) => item.missing > 0).length} entfernten Positionen sind Fehlmengen eingetragen. Diese bleiben als manuelle Positionen erhalten.</p>}<div className="search-results">{[...inventoryPreview.added.slice(0, 5).map((item) => `+ ${item.part} · ${item.color ?? ""} ×${item.quantity}`), ...inventoryPreview.removed.slice(0, 5).map((item) => `− ${item.part} · ${item.color} ×${item.quantity}${item.missing ? ` · ${item.missing} fehlen` : ""}`), ...inventoryPreview.changed.slice(0, 5).map((item) => `↔ ${item.part} · ${item.color} ${item.oldQuantity} → ${item.newQuantity}`)].map((line) => <div className="results-label" key={line}>{line}</div>)}{!inventoryPreview.added.length && !inventoryPreview.removed.length && !inventoryPreview.changed.length && <div className="results-label">Keine Änderungen am Inventar.</div>}</div><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setInventoryPreview(null)}>Abbrechen</button><button className="button primary" disabled={busy} onClick={() => void applyInventoryRefresh()}>{busy ? "Wird übernommen …" : "Änderungen übernehmen"}</button></div></section></div>}
    {imagePreview && <dialog ref={imageDialog} className="image-lightbox" aria-label={imagePreview.caption} onClose={() => setImagePreview(null)} onClick={(event) => { if (event.target === event.currentTarget) imageDialog.current?.close(); }}><button className="lightbox-close" autoFocus aria-label="Bild schließen" onClick={() => imageDialog.current?.close()}><X size={21} /></button><Image src={imagePreview.src} alt={imagePreview.alt} className="lightbox-image" loading="eager" /><p>{imagePreview.caption}</p></dialog>}
    <PwaInstall />
    <button className="theme-toggle" onClick={() => setThemeMode((mode) => mode === "dark" ? "light" : "dark")}>{themeMode === "dark" ? "Helles Design" : "Dunkles Design"}</button>
    {message && <div className="toast" role="status"><CheckCircle size={18} />{message}{undoAvailable && <button className="undo-toast-action" onClick={() => void undoLastInventoryChange()}>Rückgängig</button>}<button aria-label="Meldung schließen" onClick={() => setMessage("")}><X size={15} /></button></div>}
    {error && !dialog && !manualOpen && <div className="toast error-toast" role="alert">{error}<button aria-label="Meldung schließen" onClick={() => setError("")}><X size={15} /></button></div>}
    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDialog(false); }}><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="dialog-close" aria-label="Schließen" onClick={() => !busy && setDialog(false)}><X size={18} /></button><div className="dialog-icon"><PlusCircle size={23} /></div><div className="eyebrow">NEUES SET</div><h2 id="add-title">Set hinzufügen</h2><p>Gib die Setnummer ein. Name, Bild und Teileliste holen wir automatisch.</p>{!chosenResult ? <form onSubmit={searchForSet}><label className="field-label" htmlFor="set-number">Setnummer</label><div className="input-with-button"><input autoFocus id="set-number" inputMode="text" value={setNumber} onChange={(e) => setSetNumber(e.target.value)} placeholder="z. B. 75192" required /><button className="button primary" disabled={busy || !setNumber.trim()}>{busy ? <CircleNotch className="spin" size={17} /> : <MagnifyingGlass size={17} />}Suchen</button></div><label className="field-label" htmlFor="nickname">Eigener Name <span>(optional)</span></label><input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="z. B. Flohmarkt-Fund" maxLength={80} />{error && <p className="inline-error" role="alert">{error}</p>}{searchResults.length > 0 && <div className="search-results"><div className="results-label">{searchResults.length} Treffer · Set auswählen</div>{searchResults.map((result) => <button type="button" className="result-row" key={result.set_num} onClick={() => setChosenResult(result)}><Image src={result.set_img_url} alt="" className="result-image" /><span><b>{result.name}</b><small>LEGO {result.set_num} · {result.year} · {number(result.num_parts)} Teile</small></span><CaretRight size={16} /></button>)}</div>}</form> : <div className="chosen-set"><Image src={chosenResult.set_img_url} alt={`${chosenResult.name} Setbild`} className="chosen-image" /><div className="eyebrow">LEGO {chosenResult.set_num}</div><h3>{chosenResult.name}</h3><p>{chosenResult.year} · Theme {chosenResult.theme_id} · {number(chosenResult.num_parts)} Teile</p><div className="import-note"><span className="status-dot" />Das vollständige Inventar wird jetzt geladen.</div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setChosenResult(null)}>Zurück</button><button className="button primary" disabled={busy} onClick={() => void addInstance(chosenResult)}>{busy ? <><CircleNotch className="spin" size={17} />Inventar wird importiert</> : <><Check size={17} />Set hinzufügen</>}</button></div></div>}</section></div>}
    {manualOpen && selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setManualOpen(false); }}><section className="add-dialog panel" role="dialog" aria-modal="true" aria-labelledby="manual-title"><button className="dialog-close" aria-label="Schließen" onClick={() => !busy && setManualOpen(false)}><X size={18} /></button><div className="dialog-icon"><Cube size={23} /></div><div className="eyebrow">LEGO {selected.definition.setNumber}</div><h2 id="manual-title">Fehlteil ergänzen</h2><p>Suche nach Teilenummer und wähle die passende Farbe.</p>{!manualPart ? <form onSubmit={searchManualPart}><label className="field-label" htmlFor="manual-part-number">Teilenummer</label><div className="input-with-button"><input autoFocus id="manual-part-number" value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="z. B. 3001" required /><button className="button primary" disabled={busy || !manualQuery.trim()}>{busy ? <CircleNotch className="spin" size={17} /> : <MagnifyingGlass size={17} />}Suchen</button></div>{error && <p className="inline-error" role="alert">{error}</p>}{manualParts.length > 0 && <div className="search-results"><div className="results-label">Passendes Teil auswählen</div>{manualParts.map((part) => <div className="result-row" key={part.part_num}><ZoomableImage src={part.part_img_url} alt={part.name} caption={`${part.name} · ${part.part_num}`} className="result-image" imageClassName="result-image-art" onOpen={setImagePreview} /><button type="button" className="result-select" onClick={() => setManualPart(part)}><span><b>{part.name}</b><small>Nummer {part.part_num}</small></span><CaretRight size={16} /></button></div>)}</div>}</form> : <div className="manual-choice"><ZoomableImage src={manualPart.part_img_url} alt={manualPart.name} caption={`${manualPart.name} · ${manualPart.part_num}`} className="chosen-image" imageClassName="chosen-image-art" onOpen={setImagePreview} /><div className="eyebrow">{manualPart.part_num}</div><h3>{manualPart.name}</h3><label className="field-label" htmlFor="manual-color">Farbe</label><select id="manual-color" value={manualColor} onChange={(e) => setManualColor(Number(e.target.value))}>{manualColors.map((color) => <option value={color.id} key={color.id}>{color.name}</option>)}</select><label className="field-label" htmlFor="manual-quantity">Fehlende Anzahl</label><input id="manual-quantity" type="number" min={1} max={10000} value={manualQuantity} onChange={(e) => setManualQuantity(Math.max(1, Number(e.target.value)))} />{!selected.inventory.some((item) => item.part.number === manualPart.part_num && item.color.sourceId === manualColor) && <div className="outside-warning"><b>Dieses Teil steht nicht im offiziellen Setinventar.</b><span>Prüfe Teilenummer und Farbe. Du kannst es trotzdem bewusst als Fehlteil erfassen.</span><label><input type="checkbox" checked={manualAllowOutside} onChange={(e) => setManualAllowOutside(e.target.checked)} />Trotzdem hinzufügen</label></div>}{error && <p className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => { setManualPart(null); setError(""); }}>Zurück</button><button className="button primary" disabled={busy || (!selected.inventory.some((item) => item.part.number === manualPart.part_num && item.color.sourceId === manualColor) && !manualAllowOutside)} onClick={() => void addManualPart()}>{busy ? <CircleNotch className="spin" size={17} /> : <Check size={17} />}Fehlteil hinzufügen</button></div></div>}</section></div>}
  </div>;
}
