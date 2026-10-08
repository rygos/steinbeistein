"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QRLabel({ instanceId, setNumber, name, location }: { instanceId: string; setNumber: string; name: string; location: string | null }) {
  const [data, setData] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void QRCode.toDataURL(`${window.location.origin}/?instance=${encodeURIComponent(instanceId)}`, { width: 240, margin: 1, errorCorrectionLevel: "M" }).then(setData).catch(() => setError("QR-Code konnte nicht erstellt werden.")); }, [instanceId]);
  return <div className="qr-label panel" data-print-label><div><span className="eyebrow">LAGERBESCHRIFTUNG</span><h3>QR-Code</h3><small>Scannen öffnet genau dieses Set-Exemplar.</small></div>{data ? <img src={data} alt={`QR-Code für Set ${setNumber}`} /> : <small>{error || "Wird erstellt …"}</small>}<div className="qr-label-copy"><b>LEGO {setNumber}</b><span>{name}</span><small>{location || "Kein Lagerort eingetragen"}</small></div><button className="button secondary" onClick={() => { document.documentElement.dataset.printMode = "label"; window.print(); window.setTimeout(() => delete document.documentElement.dataset.printMode, 1000); }}>Etikett drucken</button></div>;
}
