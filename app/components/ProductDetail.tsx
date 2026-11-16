/** The product page: PIM data (price per market, stock, specs, claims, set contents) plus similar products, accessories and spare parts. */
import { Link } from "react-router";
import { formatPrice } from "~/lib/i18n";
import { srcSet } from "~/lib/images";
import { colorsOf, inStockOf, type Product } from "~/lib/products";
import { ProductCard, type Ctx } from "./Content";
import { BuyButton } from "./Shop";

type Props = {
  ctx: Ctx;
  product: Product;
  groupName?: string;
  /** The rows of a set product, see `setContents`. */
  contents: { quantity: number; name: string; url?: string }[];
  similar: Product[];
  accessories: Product[];
  spareParts: Product[];
};

export function ProductDetail({ ctx, product: p, groupName, contents, similar, accessories, spareParts }: Props) {
  const { text, region } = ctx;
  const inStock = inStockOf(p);
  const deliveryDays = p.articles.filter((a) => a.stock > 0).flatMap((a) => a.deliveryDays ?? []);
  const specs: [string, string][] = [
    [text.sku, p.articles.map((a) => a.sku).join(", ")],
    [text.colour, colorsOf(p).map(text.value).join(", ")],
    [text.material, p.materials.map(text.value).join(", ")],
    [text.volume, p.volume ? `${p.volume} ml` : ""],
    [text.screenSize, p.screenSize ? `${p.screenSize}″` : ""],
    [text.finish, p.finishes.map(text.value).join(", ")],
    [text.pieces, p.pieces ? text.pieceCount(p.pieces) : ""],
    [text.delivery, deliveryDays.length ? String(Math.min(...deliveryDays)) : ""],
  ];
  const bands: [string, Product[]][] = [[text.similar, similar], [text.accessories, accessories], [text.spareParts, spareParts]];
  return (
    <>
      <article className="pdp">
        <div className="pdp__media">
          {p.image && <img src={p.image.src} srcSet={srcSet(p.image.src)} sizes="(min-width: 760px) 55vw, 100vw" alt={p.name} width={400} height={400} />}
        </div>
        <div className="pdp__info">
          {groupName && <p className="merchKicker">{groupName}</p>}
          <h1 className="pdp__name">{p.name}</h1>
          <p className="pdp__price">
            {formatPrice(p.price, ctx.market, region)}
            <span className={inStock === false ? "badge badge--muted" : "badge"}>{inStock === false ? text.soldOut : text.available}</span>
          </p>
          {p.shopifyId && inStock !== false && <BuyButton shopifyId={p.shopifyId} />}
          {p.descriptionHtml && <div className="pdp__description" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />}
          <dl className="specs">
            {specs.filter(([, value]) => value).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {contents.length > 0 && (
            <>
              <h2 className="pdp__subhead">{text.setContents}</h2>
              <ul className="pdp__list">
                {contents.map((row) => (
                  <li key={row.name}>{row.quantity} × {row.url ? <Link to={row.url}>{row.name}</Link> : row.name}</li>
                ))}
              </ul>
            </>
          )}
          {p.claims.length > 0 && (
            <>
              <h2 className="pdp__subhead">{text.claims}</h2>
              <ul className="pdp__list">{p.claims.map((claim) => <li key={claim}>{claim}</li>)}</ul>
            </>
          )}
        </div>
      </article>
      {bands.filter(([, products]) => products.length > 0).map(([title, products]) => (
        <section className="merchBand" key={title}>
          <h2 className="headline">{title}</h2>
          <div className="grid">{products.map((s) => <ProductCard key={s.id} product={s} ctx={ctx} />)}</div>
        </section>
      ))}
    </>
  );
}
