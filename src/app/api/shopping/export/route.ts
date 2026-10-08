import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "xml";
  if (format !== "xml" && format !== "csv") return NextResponse.json({ error: "Format muss xml oder csv sein." }, { status: 400 });
  const rows = await prisma.shoppingItem.findMany({ where: { status: "WANTED", quantity: { gt: 0 } }, select: { quantity: true, inventoryItem: { select: { part: true, color: true } } } });
  const grouped = new Map<string, { part: typeof rows[number]["inventoryItem"]["part"]; color: typeof rows[number]["inventoryItem"]["color"]; quantity: number }>();
  for (const row of rows) {
    const item = row.inventoryItem, key = `${item.part.id}|${item.color.id}`;
    const group = grouped.get(key) ?? { part: item.part, color: item.color, quantity: 0 };
    group.quantity += row.quantity; grouped.set(key, group);
  }
  const items = [...grouped.values()].sort((a, b) => a.part.partNumber.localeCompare(b.part.partNumber, undefined, { numeric: true }) || a.color.name.localeCompare(b.color.name, "de"));
  if (format === "csv") {
    const lines = [["LEGO Teilenummer", "Teil", "Farbe", "BrickLink Teilenummer", "BrickLink Farb-ID", "Vorgemerkt"].map(csv).join(","), ...items.map((item) => [item.part.partNumber, item.part.name, item.color.name, item.part.bricklinkId ?? "", item.color.bricklinkId ?? "", item.quantity].map(csv).join(","))];
    return new NextResponse(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=lego-wunschliste.csv" } });
  }
  const missingIds = items.filter((item) => !item.part.bricklinkId || !item.color.bricklinkId);
  if (missingIds.length) return NextResponse.json({ error: `${missingIds.length} Positionen haben keine BrickLink-Teile- oder Farb-ID. Nutze CSV oder ergänze die Zuordnung zuerst.`, unmapped: missingIds.map((item) => ({ part: item.part.partNumber, color: item.color.name })) }, { status: 422 });
  const body = items.map((item) => `  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${escapeXml(item.part.bricklinkId!)}</ITEMID><COLOR>${item.color.bricklinkId}</COLOR><MINQTY>${item.quantity}</MINQTY><CONDITION>N</CONDITION><COMMENTS>${escapeXml(`${item.part.partNumber} · ${item.color.name}`)}</COMMENTS></ITEM>`).join("\n");
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n${body}${body ? "\n" : ""}</INVENTORY>`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": "attachment; filename=lego-bricklink-wanted-list.xml" } });
}
