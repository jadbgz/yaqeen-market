import { z } from "zod";
import { categories } from "@/lib/catalog/format";

export const catalogSorts = ["selection", "prix-asc", "prix-desc"] as const;
export const catalogAvailability = ["all", "available"] as const;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const optionalMoney = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : Number(value),
  z.number().finite().min(0).max(100_000).optional(),
);

const schema = z.object({
  q: z.string().trim().max(80).catch(""),
  category: z.enum(categories as [string, ...string[]]).catch("Tous"),
  sort: z.enum(catalogSorts).catch("selection"),
  availability: z.enum(catalogAvailability).catch("all"),
  min: optionalMoney.catch(undefined),
  max: optionalMoney.catch(undefined),
});

export type CatalogSearch = z.infer<typeof schema>;

export function parseCatalogSearch(params: Record<string, string | string[] | undefined>): CatalogSearch {
  const parsed = schema.parse({
    q: first(params.q) ?? "",
    category: first(params.category) ?? "Tous",
    sort: first(params.sort) ?? "selection",
    availability: first(params.availability) ?? "all",
    min: first(params.min),
    max: first(params.max),
  });
  if (parsed.min !== undefined && parsed.max !== undefined && parsed.min > parsed.max) {
    return { ...parsed, min: parsed.max, max: parsed.min };
  }
  return parsed;
}

export function catalogHref(search: CatalogSearch, changes: Partial<Record<keyof CatalogSearch, string | number | undefined>>) {
  const next = { ...search, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", String(next.q));
  if (next.category && next.category !== "Tous") params.set("category", String(next.category));
  if (next.sort && next.sort !== "selection") params.set("sort", String(next.sort));
  if (next.availability && next.availability !== "all") params.set("availability", String(next.availability));
  if (next.min !== undefined && next.min !== "") params.set("min", String(next.min));
  if (next.max !== undefined && next.max !== "") params.set("max", String(next.max));
  const query = params.toString();
  return query ? `/catalogue?${query}` : "/catalogue";
}
