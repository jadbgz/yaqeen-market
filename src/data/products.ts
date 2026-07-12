export type Product = {
  slug: string; name: string; shop: string; category: string; price: number; rating: number;
  reviews: number; color: string; shape: string; description: string; badge?: string;
};

export const products: Product[] = [
  { slug:"musc-blanc",name:"Musc blanc",shop:"Boutique Démo 01",category:"Parfums",price:34.9,rating:4.9,reviews:124,color:"#234f48",shape:"bottle",badge:"Bestseller",description:"Un musc propre et enveloppant, travaillé autour de notes poudrées et d’un fond délicatement ambré." },
  { slug:"coran-traduction",name:"Le Coran — traduction française",shop:"Boutique Démo 02",category:"Livres",price:22,rating:4.8,reviews:86,color:"#945d48",shape:"book",description:"Une édition élégante et lisible, avec texte arabe et traduction française du sens des versets." },
  { slug:"huile-nigelle",name:"Huile de nigelle premium",shop:"Boutique Démo 03",category:"Bien-être",price:14.5,rating:4.9,reviews:211,color:"#9c7540",shape:"oil",badge:"Choix Yaqeen",description:"Huile de nigelle pressée à froid, pure et non raffinée, conditionnée dans un flacon protecteur." },
  { slug:"abaya-lina",name:"Abaya Lina",shop:"Boutique Démo 04",category:"Mode",price:59.9,rating:4.7,reviews:52,color:"#5e746c",shape:"fabric",description:"Une coupe fluide et contemporaine dans un tissu doux, opaque et agréable à porter au quotidien." },
  { slug:"ambre-noir",name:"Ambre noir",shop:"Boutique Démo 01",category:"Parfums",price:42,rating:4.8,reviews:73,color:"#1d2d3f",shape:"bottle",badge:"Nouveau",description:"Une composition profonde mêlant ambre chaud, bois fumés et une pointe subtile de vanille sèche." },
  { slug:"journal-gratitude",name:"Journal de gratitude",shop:"Boutique Démo 05",category:"Livres",price:18.5,rating:4.6,reviews:39,color:"#d36c3e",shape:"book",description:"Un compagnon guidé sur 90 jours pour cultiver l’attention, l’intention et la reconnaissance." },
  { slug:"savon-alep",name:"Savon d’Alep 30 %",shop:"Boutique Démo 03",category:"Beauté",price:8.9,rating:4.9,reviews:148,color:"#73825c",shape:"soap",description:"Savon traditionnel riche en huile de laurier, fabriqué lentement et adapté aux peaux sensibles." },
  { slug:"coffret-decouverte",name:"Coffret découverte",shop:"Boutique Démo 01",category:"Parfums",price:28,rating:4.8,reviews:64,color:"#d09b47",shape:"box",description:"Six créations emblématiques en format découverte pour trouver le parfum qui vous ressemble." },
];

export const categories = ["Tous", "Parfums", "Livres", "Mode", "Beauté", "Bien-être"];
export const formatPrice = (price:number) => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(price);
