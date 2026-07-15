export const formatPrice = (price: number, currency = "EUR") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(price);

const categoryLabels: Record<string, string> = {
  parfums: "Parfums",
  cosmetiques: "Cosmétiques",
  livres: "Livres",
  mode: "Mode",
  "bien-etre": "Bien-être",
  complements: "Compléments",
  maison: "Maison",
};

export const categories = ["Tous", ...Object.values(categoryLabels)];

export function categoryLabel(category: string) {
  return categoryLabels[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export function categoryValue(label: string) {
  if (label === "Tous") return null;
  return Object.entries(categoryLabels).find(([, value]) => value === label)?.[0] ?? label.toLowerCase();
}
