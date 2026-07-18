export default function CatalogueLoading() {
  return <main className="catalog-shell" aria-busy="true" aria-label="Chargement du catalogue">
    <div className="catalog-loading-head" />
    <section className="catalog-intro"><p>EXPLORER YAQEEN MARKET</p><h1>Le catalogue<br/>se <span>prépare.</span></h1></section>
    <section className="catalog-grid">{Array.from({ length: 8 }, (_, index) => <article className="catalog-card catalog-skeleton" key={index}><div/><span/><i/></article>)}</section>
  </main>;
}
