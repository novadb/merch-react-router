/** The product page: PIM data (price per market, stock, specs) plus similar products. */
import { formatPrice } from "~/lib/i18n";
import { srcSet } from "~/lib/images";
import type { Product } from "~/lib/products";
import { ProductCard, type Ctx } from "./Content";
import { BuyButton } from "./Shop";

type Props = { ctx: Ctx; product: Product; groupName?: string; similar: Product[] };

export function ProductDetail({ ctx, product: p, groupName, similar }: Props) {
  const { text, region } = ctx;
  const specs: [string, string][] = [
    [text.sku, p.sku ?? ""],
    [text.colour, p.color ? text.value(p.color) : ""],
    [text.material, p.materials.map(text.value).join(", ")],
    [text.volume, p.volume ? `${p.volume} ml` : ""],
    [text.screenSize, p.screenSize ? `${p.screenSize}″` : ""],
    [text.finish, p.finishes.map(text.value).join(", ")],
    [text.pieces, p.pieces ? text.pieceCount(p.pieces) : ""],
  ];
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
            <span className={p.inStock === false ? "badge badge--muted" : "badge"}>{p.inStock === false ? text.soldOut : text.available}</span>
          </p>
          {p.shopifyId && p.inStock !== false && <BuyButton shopifyId={p.shopifyId} />}
          {p.descriptionHtml && <div className="pdp__description" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />}
          <dl className="specs">
            {specs.filter(([, value]) => value).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
      {similar.length > 0 && (
        <section className="merchBand">
          <h2 className="headline">{text.similar}</h2>
          <div className="grid">{similar.map((s) => <ProductCard key={s.id} product={s} ctx={ctx} />)}</div>
        </section>
      )}
    </>
  );
}
