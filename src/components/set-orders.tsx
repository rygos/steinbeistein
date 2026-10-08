"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Package } from "@phosphor-icons/react";

type Item = { id: string; missing: number; part: { number: string; name: string }; color: { name: string } };
type Order = { id: string; supplier: string; orderNumber: string | null; orderedAt: string; shippingCost: number; currency: string; status: string; lines: { id: string; quantity: number; receivedQuantity: number; unitPrice: number | null; inventoryItem: { part: { partNumber: string }; color: { name: string } } }[] };

export function SetOrders({ instanceId, items }: { instanceId: string; items: Item[] }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [supplier, setSupplier] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [shipping, setShipping] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [error, setError] = useState("");
  const reload = async () => { const response = await fetch(`/api/instances/${instanceId}/orders`, { cache: "no-store" }); if (response.ok) setOrders(await response.json()); };
  useEffect(() => { void reload(); }, [instanceId]);
  useEffect(() => { if (!selectedItem && items.length) setSelectedItem(items.find((item) => item.missing > 0)?.id ?? items[0]?.id ?? ""); }, [items, selectedItem]);
  const save = async () => {
    const response = await fetch(`/api/instances/${instanceId}/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier, orderNumber: orderNumber || null, shippingCost: Number(shipping) || 0, currency: "EUR", lines: [{ inventoryItemId: selectedItem, quantity, unitPrice: unitPrice === "" ? null : Number(unitPrice) }] }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Bestellung konnte nicht angelegt werden."); return; }
    setError(""); setOrderNumber(""); setShipping(""); setUnitPrice(""); await reload();
  };
  return <section className="set-orders panel"><div className="set-photos-heading"><div><span className="eyebrow">EINKAUF UND KOSTEN</span><h3>Bestellungen</h3><small>Händler, Einzelpreis, Versand und Belegpositionen je Exemplar</small></div><Package size={22} /></div><div className="set-order-form"><label>Händler<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="z. B. BrickLink-Shop" /></label><label>Bestellnummer<input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></label><label>Teil<select value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}>{items.filter((item) => item.missing > 0).map((item) => <option key={item.id} value={item.id}>{item.part.number} · {item.color.name} · {item.missing} fehlen</option>)}</select></label><label>Menge<input type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label><label>Preis pro Teil (€)<input type="number" min={0} step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label><label>Versand (€)<input type="number" min={0} step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label><button className="button primary" disabled={!supplier.trim() || !selectedItem} onClick={() => void save()}>Bestellung speichern</button></div>{error && <p className="inline-error">{error}</p>}{orders.map((order) => <article className="set-order-row" key={order.id}><div><b>{order.supplier}</b><span>{order.orderNumber ? `Bestellung ${order.orderNumber} · ` : ""}{new Intl.DateTimeFormat("de-DE").format(new Date(order.orderedAt))}</span></div><span>{order.lines.map((line) => `${line.quantity}× ${line.inventoryItem.part.partNumber} (${line.inventoryItem.color.name})`).join(" · ")}</span><b>{order.shippingCost.toFixed(2)} {order.currency} Versand</b><CheckCircle size={18} /></article>)}{!orders.length && <small className="muted">Noch keine Bestellungen für dieses Exemplar.</small>}</section>;
}
