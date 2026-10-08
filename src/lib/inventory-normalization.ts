export type RawInventoryRow = {
  id?: number | string;
  part: { part_num: string; name?: string; part_img_url?: string | null; part_cat_id?: number; part_cat_name?: string; external_ids?: Record<string, unknown> };
  color: { id: number; name?: string; rgb?: string | null; external_ids?: Record<string, unknown> };
  quantity: number;
  is_spare?: boolean;
  is_extra?: boolean;
  is_alternate?: boolean;
  alternate_of?: string | null;
  counterpart_of?: string | null;
  counterpart_group?: string | null;
  is_preferred_counterpart?: boolean;
  element_id?: string | null;
};

/**
 * Converts source rows into physical target quantities. Rebrickable's set inventory marks
 * spare parts with is_spare; these are always dropped. Provider adapters may expose alternate
 * or counterpart relationship metadata (some sources do not expose those relationships at all).
 * Alternates are dropped, never summed with the selected base row. For a counterpart group,
 * rows represent competing descriptions of one physical need, so only one candidate survives.
 * An explicitly preferred counterpart wins; otherwise a row identified as a counterpart wins
 * over its base row, allowing sticker/print variants to describe the built model. If a source
 * cannot establish that relationship, it must omit counterpart metadata and both ordinary
 * physically-required rows remain; inventing a relationship would silently undercount a set.
 * Extra/spare and alternate filtering runs first. Group selection is deterministic and never
 * adds counterpart quantity to the base quantity.
 */
export function normalizeInventory(rows: RawInventoryRow[]): RawInventoryRow[] {
  const counterpartBaseNumbers = new Set(rows.map((row) => row.counterpart_of).filter((value): value is string => Boolean(value)));
  const candidates = rows.filter((row) => row.quantity > 0 && !row.is_spare && !row.is_extra && !row.is_alternate && !row.alternate_of && !counterpartBaseNumbers.has(row.part.part_num));
  const grouped = new Map<string, RawInventoryRow[]>();
  const result: RawInventoryRow[] = [];
  for (const row of candidates) {
    const group = row.counterpart_group ?? row.counterpart_of;
    if (!group) { result.push(row); continue; }
    const list = grouped.get(group) ?? [];
    list.push(row);
    grouped.set(group, list);
  }
  for (const group of grouped.values()) {
    const selected = [...group].sort((a, b) => {
      const priority = (row: RawInventoryRow) => row.is_preferred_counterpart ? 2 : row.counterpart_of ? 1 : 0;
      return priority(b) - priority(a) || String(a.part.part_num).localeCompare(String(b.part.part_num));
    })[0];
    if (selected) result.push(selected);
  }
  const combined = new Map<string, RawInventoryRow>();
  for (const row of result) {
    const key = `${row.part.part_num}|${row.color.id}`;
    const existing = combined.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      if (!existing.part.part_img_url && row.part.part_img_url) existing.part.part_img_url = row.part.part_img_url;
      if (!existing.element_id && row.element_id) existing.element_id = row.element_id;
      existing.id = [existing.id, row.id].filter((id) => id !== undefined && id !== null && id !== "").join(",");
    } else combined.set(key, { ...row, part: { ...row.part }, color: { ...row.color } });
  }
  return [...combined.values()];
}

export function validateMissingQuantity(requested: number, required: number): number {
  if (!Number.isInteger(requested) || requested < 0 || requested > required) {
    throw new Error(`Fehlmenge muss eine ganze Zahl zwischen 0 und ${required} sein.`);
  }
  return requested;
}
