export default function CatalogueLoading() {
  return <main className="catalog-shell" aria-busy="true">
    <div className="catalog-loading-head" />
    <section className="catalog-intro" role="status">
      <p>EXPLORER YAQEEN MARKET</p>
      <h1>Le catalogue<br/>se <span>prépare.</span></h1>
      <span className="sr-only">Chargement des produits publiés</span>
    </section>
    <section className="catalog-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <article className="catalog-card catalog-skeleton" key={index}><div/><span/><i/></article>)}
    </section>
  </main>;
}
