import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SellerChrome } from "@/components/seller-chrome";
import { getViewer } from "@/lib/auth/dal";
import { getSellerDashboard, getSellerProductMedia, getSellerProducts } from "@/lib/seller/dal";
import { deleteProductMedia, uploadProductMedia } from "./actions";

export const dynamic = "force-dynamic";

const statusLabel = { pending: "À revoir", approved: "Approuvée", rejected: "Refusée" } as const;

export default async function ProductMediaPage({ params, searchParams }: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ productId }, query, viewer, dashboard, products] = await Promise.all([params, searchParams, getViewer(), getSellerDashboard(), getSellerProducts()]);
  if (!viewer || !dashboard || !products) redirect("/seller");
  const product = products.find((item) => item.id === productId);
  if (!product) notFound();
  const media = await getSellerProductMedia(productId);
  if (!media) notFound();
  const locked = product.status !== "draft" && product.status !== "rejected";
  const nextPosition = [1,2,3,4,5,6].find((position) => !media.some((item) => item.position === position)) ?? 6;

  return <SellerChrome shopName={dashboard.shop.name} shopStatus={dashboard.shop.status} userName={viewer.displayName || viewer.email || "Membre"} activeRoute="products">
    <div className="seller-content seller-media-page">
      <div className="seller-page-head"><div><p className="seller-kicker">MÉDIAS PRODUIT · 1 À 6</p><h1>{product.title}<span>.</span></h1><p>Chaque image est décodée, normalisée en WebP puis soumise à la même décision que la fiche.</p></div><Link className="seller-secondary" href="/seller/produits">← Retour aux produits</Link></div>
      {query.uploaded && <div className="seller-success" role="status"><span>✓</span><div><strong>Image enregistrée dans l’espace privé.</strong><p>Elle ne sera visible par les clients qu’après approbation.</p></div></div>}
      {query.deleted && <div className="seller-success" role="status"><span>✓</span><div><strong>Image supprimée.</strong></div></div>}
      {(query.invalid || query.invalid_file || query.invalid_dimensions || query.register_error || query.storage_error || query.delete_error) && <div className="seller-form-feedback">L’opération a été refusée. Utilisez une image JPEG, PNG, WebP ou AVIF de 500 × 500 px minimum et 6 Mo maximum, puis vérifiez l’emplacement.</div>}

      <section className="seller-media-grid">
        {media.map((item) => <article key={item.id}>
          <div className="seller-media-preview">{item.signedUrl ? <Image src={item.signedUrl} alt={item.altText} fill sizes="(max-width: 800px) 100vw, 320px" unoptimized /> : <span>Aperçu indisponible</span>}</div>
          <div><span className={`seller-state seller-state-${item.status}`}>{statusLabel[item.status]}</span><strong>Image {item.position}</strong><p>{item.altText}</p><small>{item.width} × {item.height} · {Math.ceil(item.byteSize / 1024)} Ko</small></div>
          {!locked && item.status !== "approved" && <form action={deleteProductMedia}><input type="hidden" name="productId" value={productId}/><input type="hidden" name="mediaId" value={item.id}/><input type="hidden" name="storagePath" value={item.storagePath}/><button type="submit">Supprimer</button></form>}
        </article>)}
      </section>

      {!locked && media.filter((item) => item.status !== "rejected").length < 6 ? <form action={uploadProductMedia} className="seller-media-upload">
        <input type="hidden" name="productId" value={productId}/>
        <header><span>＋</span><div><p>NOUVELLE IMAGE</p><h2>Montrer le produit honnêtement.</h2></div></header>
        <div className="seller-form-grid"><label>Fichier source<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required/></label><label>Position<input name="position" type="number" min="1" max="6" defaultValue={nextPosition} required/></label><label className="seller-field-wide">Texte alternatif<input name="altText" minLength={5} maxLength={240} required placeholder={`Ex. ${product.title} vu de face sur fond clair`}/></label></div>
        <p>Source ≤ 6 Mo · 500 px minimum par côté · sortie WebP ≤ 2 400 px · aucune publication automatique.</p>
        <button type="submit">Traiter et enregistrer l’image →</button>
      </form> : <div className="seller-catalog-empty"><p>{locked ? "MÉDIAS VERROUILLÉS PENDANT LA REVUE" : "SIX IMAGES ACTIVES"}</p><h2>{locked ? "La décision protège la version soumise." : "La galerie est complète."}</h2></div>}
    </div>
  </SellerChrome>;
}
