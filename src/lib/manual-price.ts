export const manualPriceCurrencies = ["EUR", "GBP", "USD"] as const;
export type ManualPriceCurrency = (typeof manualPriceCurrencies)[number];
export const brickOwlCacheMs = 24 * 60 * 60 * 1000;

export function manualSetCacheKey(setInstanceId: string): string {
  return `manual|set|${setInstanceId}`;
}

export function manualPartCacheKey(partId: string, colorId: string): string {
  return `manual|part|${partId}|${colorId}`;
}

export function manualQuoteKey(row: { setInstanceId: string | null; partId: string | null; colorId: string | null }): string | null {
  if (row.setInstanceId) return `set:${row.setInstanceId}`;
  if (row.partId && row.colorId) return `part:${row.partId}:${row.colorId}`;
  return null;
}

/** BrickOwl darf einen gespeicherten Preis nur ersetzen, wenn er aus der API stammt und der 24-Stunden-Cache abgelaufen ist oder bewusst neu geladen wird. Manuelle Preise bleiben stehen. */
export function apiMayReplace(price: { source: string; fetchedAt: Date } | null, refresh: boolean, now = Date.now()): boolean {
  if (!price) return true;
  if (price.source === "manual") return false;
  if (!refresh && now - price.fetchedAt.getTime() < brickOwlCacheMs) return false;
  return true;
}
