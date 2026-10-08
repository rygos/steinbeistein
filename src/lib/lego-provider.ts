import { RawInventoryRow } from "@/lib/inventory-normalization";

export type LegoSet = { set_num: string; name: string; year: number; theme_id: number; num_parts: number; set_img_url: string | null; theme?: string };
export type LegoPart = { part_num: string; name: string; part_img_url: string | null };
export type LegoColor = { id: number; name: string; rgb: string | null };
type RebrickableMinifigure = { set_num: string; quantity: number };
export interface LegoDataProvider {
  readonly name: string;
  searchSets(query: string): Promise<LegoSet[]>;
  getInventory(setNumber: string): Promise<{ id?: number; results: RawInventoryRow[]; minifigCount?: number; minifigPartRows?: number }>;
  getThemeName(themeId: number): Promise<string>;
  searchParts(query: string): Promise<LegoPart[]>;
  getColors(): Promise<LegoColor[]>;
  getPartCategories(): Promise<Map<number, string>>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

const API = "https://rebrickable.com/api/v3/lego";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RebrickableProvider implements LegoDataProvider {
  readonly name = "rebrickable";
  private partCategories: Promise<Map<number, string>> | null = null;
  constructor(private readonly apiKey = process.env.REBRICKABLE_API_KEY) {}
  private async get<T>(path: string): Promise<T> {
    if (!this.apiKey) throw new Error("Rebrickable API-Key fehlt. Hinterlege REBRICKABLE_API_KEY in .env und starte den Dienst neu.");
    let lastError = "Rebrickable ist momentan nicht erreichbar.";
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`${API}${path}`, { headers: { Authorization: `key ${this.apiKey}`, Accept: "application/json" }, next: { revalidate: 3600 } });
      if (response.ok) return response.json() as Promise<T>;
      if (response.status === 429 || response.status >= 500) {
        lastError = response.status === 429 ? "Rebrickable hat das API-Limit erreicht." : `Rebrickable meldet ${response.status}.`;
        const retry = Number(response.headers.get("Retry-After"));
        if (attempt < 3) await pause(retry > 0 ? retry * 1000 : 400 * 2 ** attempt);
        continue;
      }
      const detail = await response.text();
      throw new Error(response.status === 401 || response.status === 403 ? "Rebrickable hat den API-Key abgelehnt. Prüfe den Key in .env." : `Rebrickable-Anfrage fehlgeschlagen (${response.status}): ${detail.slice(0, 180)}`);
    }
    throw new Error(lastError);
  }
  async searchSets(query: string): Promise<LegoSet[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const result = await this.get<{ results: LegoSet[] }>(`/sets/?search=${encodeURIComponent(normalized)}&page_size=100`);
    const exact = result.results.filter((set) => set.set_num.toLowerCase() === normalized.toLowerCase());
    if (exact.length === 1) exact[0].theme = await this.getThemeName(exact[0].theme_id);
    return result.results;
  }
  async getInventory(setNumber: string): Promise<{ id?: number; results: RawInventoryRow[]; minifigCount: number; minifigPartRows: number }> {
    const results: RawInventoryRow[] = [];
    let url: string | null = `${API}/sets/${encodeURIComponent(setNumber)}/parts/?page_size=1000`;
    let inventoryId: number | undefined;
    while (url) {
      const response: { results: RawInventoryRow[]; next: string | null; id?: number; set_num?: string } = await this.fetchPage<RawInventoryRow>(url);
      inventoryId ??= response.set_num ? undefined : response.id;
      results.push(...response.results);
      url = response.next;
    }
    const minifigures = await this.fetchPages<RebrickableMinifigure>(`${API}/sets/${encodeURIComponent(setNumber)}/minifigs/?page_size=1000`);
    let minifigPartRows = 0;
    for (const figure of minifigures) {
      const parts = await this.fetchPages<RawInventoryRow>(`${API}/minifigs/${encodeURIComponent(figure.set_num)}/parts/?page_size=1000`);
      minifigPartRows += parts.length;
      results.push(...parts.map((part) => ({ ...part, quantity: part.quantity * figure.quantity })));
    }
    return { id: inventoryId, results, minifigCount: minifigures.length, minifigPartRows };
  }
  async getThemeName(themeId: number): Promise<string> {
    try { const theme = await this.get<{ name: string }>(`/themes/${themeId}/`); return theme.name; }
    catch { return `Theme ${themeId}`; }
  }
  async searchParts(query: string): Promise<LegoPart[]> {
    const response = await this.get<{ results: LegoPart[] }>(`/parts/?search=${encodeURIComponent(query.trim())}&page_size=100`);
    return response.results;
  }
  async getColors(): Promise<LegoColor[]> {
    const response = await this.get<{ results: LegoColor[] }>("/colors/?page_size=1000");
    return response.results;
  }
  async getPartCategories(): Promise<Map<number, string>> {
    this.partCategories ??= this.fetchPages<{ id: number; name: string }>(`${API}/part_categories/?page_size=1000`).then((categories) => new Map(categories.map((category) => [category.id, category.name]))).catch((error: unknown) => { this.partCategories = null; throw error; });
    return this.partCategories;
  }
  private async fetchPages<T>(firstUrl: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = firstUrl;
    while (url) {
      const page: { results: T[]; next: string | null; id?: number; set_num?: string } = await this.fetchPage<T>(url);
      results.push(...page.results);
      url = page.next;
    }
    return results;
  }
  private async fetchPage<T>(url: string): Promise<{ results: T[]; next: string | null; id?: number; set_num?: string }> {
    if (!this.apiKey) throw new Error("Rebrickable API-Key fehlt. Hinterlege REBRICKABLE_API_KEY in .env und starte den Dienst neu.");
    // Paginated URLs are still restricted to the configured Rebrickable origin.
    const parsed = new URL(url);
    if (parsed.origin !== "https://rebrickable.com") throw new Error("Ungültiger Rebrickable-Paginierungslink.");
    let lastError = "Inventar konnte nicht geladen werden.";
    for (let attempt = 0; attempt < 4; attempt++) {
      let response: Response;
      try { response = await fetch(url, { headers: { Authorization: `key ${this.apiKey}`, Accept: "application/json" }, next: { revalidate: 3600 } }); }
      catch { lastError = "Netzwerkfehler beim Laden des Inventars."; response = new Response(null, { status: 503 }); }
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) throw new Error(`Inventar konnte nicht geladen werden (${response.status}).`);
      lastError = response.status === 429 ? "Rebrickable hat das API-Limit erreicht." : `Rebrickable meldet ${response.status}.`;
      if (attempt < 3) {
        const retry = Number(response.headers.get("Retry-After"));
        await pause(retry > 0 ? Math.min(retry * 1000, 10000) : 400 * 2 ** attempt);
      }
    }
    throw new Error(lastError);
  }
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try { await this.get<{ results: unknown[] }>("/colors/?page_size=1"); return { ok: true, message: "Rebrickable-Verbindung erfolgreich." }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Verbindung fehlgeschlagen." }; }
  }
}

export const legoProvider: LegoDataProvider = new RebrickableProvider();
