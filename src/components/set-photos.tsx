"use client";

import { useEffect, useState } from "react";
import { Camera, Trash, UploadSimple } from "@phosphor-icons/react";

type Photo = { id: string; name: string; mimeType: string; data: string; createdAt: string };

export function SetPhotos({ instanceId }: { instanceId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);
  const reload = async () => {
    const response = await fetch(`/api/instances/${instanceId}/photos`, { cache: "no-store" });
    if (response.ok) setPhotos(await response.json());
  };
  useEffect(() => { void reload(); }, [instanceId]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) { setError("Bitte ein JPG-, PNG- oder WebP-Foto bis 6 MB auswählen."); return; }
    setBusy(true); setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Foto konnte nicht gelesen werden.")); reader.onerror = () => reject(new Error("Foto konnte nicht gelesen werden.")); reader.readAsDataURL(file); });
      const response = await fetch(`/api/instances/${instanceId}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mimeType: file.type, data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Foto konnte nicht gespeichert werden.");
      setPhotos((current) => [result, ...current]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Foto konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    const response = await fetch(`/api/instances/${instanceId}/photos?photoId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setPhotos((current) => current.filter((photo) => photo.id !== id));
  };
  return <section className="set-photos panel"><div className="set-photos-heading"><div><span className="eyebrow">ZUSTAND UND NACHWEISE</span><h3>Eigene Fotos</h3><small>Set, Verpackung, Anleitung oder Belege · bis zu 20 Bilder</small></div><label className="button secondary" tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}><UploadSimple size={16} />Foto hinzufügen<input type="file" aria-label="Foto hinzufügen" accept="image/jpeg,image/png,image/webp" disabled={busy} hidden onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>{error && <p className="inline-error">{error}</p>}{photos.length ? <div className="set-photo-grid">{photos.map((photo) => <article key={photo.id}><button className="photo-preview" aria-label={`${photo.name} vergrößern`} onClick={() => setPreview(photo)}><img src={photo.data} alt={photo.name} loading="lazy" /></button><span>{photo.name}</span><button aria-label={`${photo.name} löschen`} onClick={() => void remove(photo.id)}><Trash size={15} /></button></article>)}</div> : <div className="set-photo-empty"><Camera size={20} />Noch keine eigenen Fotos</div>}{preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={preview.name} onClick={() => setPreview(null)}><button aria-label="Schließen" onClick={() => setPreview(null)}>×</button><img src={preview.data} alt={preview.name} /></div>}</section>;
}
