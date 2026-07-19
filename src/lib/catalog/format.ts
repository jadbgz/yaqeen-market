export const formatPrice = (price: number, currency = "EUR") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(price);

export const categoryLabels = {
  parfums: "Parfums",
  cosmetiques: "Cosmétiques",
  livres: "Livres",
  mode: "Mode",
  "bien-etre": "Bien-être",
  complements: "Compléments",
  maison: "Maison",
} as const;

export type CatalogCategory = keyof typeof categoryLabels;

export const categories = ["Tous", ...Object.values(categoryLabels)];

export function categoryLabel(category: string) {
  return category in categoryLabels
    ? categoryLabels[category as CatalogCategory]
    : category.charAt(0).toUpperCase() + category.slice(1);
}

export function categoryValue(label: string) {
  if (label === "Tous") return null;
  return Object.entries(categoryLabels).find(([, value]) => value === label)?.[0] ?? label.toLowerCase();
}
