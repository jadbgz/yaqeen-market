export type Product={slug:string;name:string;shop:string;category:string;price:number;color:string;description:string;format:string;trust:string[]};
export const products:Product[]=[
  {slug:'musc-blanc',name:'Musc blanc',shop:'Boutique Démo 06',category:'Parfums',price:24,color:'#c8ae7a',format:'50 ml',description:'Un musc doux et enveloppant présenté par une maison indépendante de la communauté.',trust:['Identité vendeur contrôlée','Composition documentée','Expédition depuis la France']},
  {slug:'essentiel',name:"L'essentiel",shop:'Boutique Démo 07',category:'Livres',price:18,color:'#b86950',format:'Relié',description:'Un ouvrage à transmettre, sélectionné auprès d’une maison d’édition indépendante.',trust:['Éditeur identifié','Édition française','Vendeur professionnel']},
  {slug:'serum-nigelle',name:'Sérum nigelle',shop:'Boutique Démo 08',category:'Soins',price:29,color:'#c8a354',format:'30 ml',description:'Un soin concentré à intégrer à une routine simple et documentée.',trust:['INCI disponible','Origine documentée','Vendeur professionnel']},
  {slug:'musc-oud',name:'Musc oud',shop:'Boutique Démo 09',category:'Parfums',price:32,color:'#46635a',format:'50 ml',description:'Une composition boisée proposée par une maison française spécialisée.',trust:['Identité vendeur contrôlée','Fiche produit relue','Expédition suivie']},
];
export const getProduct=(slug:string)=>products.find(product=>product.slug===slug);
