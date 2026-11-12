/**
 * The shop: Shopify's own Buy Button and cart (a floating toggle and a drawer), configured in the shop where possible:
 * product titles (translations), the markets GB and US with fixed prices. Handed in: the site's colours, and the region's
 * country, so that the cart prices in the region's market and currency. Also handed in: the label of the buy button and
 * the cart's five visible texts, because the SDK's are English and no shop setting changes them (its accessibility
 * labels stay English). Without the shop's domain and token (from the server's environment) there are no buttons and no cart.
 */
import { useEffect, useRef } from "react";
import { useRouteLoaderData } from "react-router";
import { useText, type Region, type Texts } from "~/lib/i18n";
import type { loader as rootLoader } from "~/root";

const SDK = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
/** Each region is a market of the shop. `moneyFormat` null: the shop's own (EUR). */
const MARKETS: Record<Region, { country: string; moneyFormat: string | null }> = {
  de: { country: "DE", moneyFormat: null }, uk: { country: "GB", moneyFormat: "£{{amount}}" }, us: { country: "US", moneyFormat: "${{amount}}" },
};

type Shop = { domain: string; token: string; region: Region; text: Texts };
// The SDK comes from Shopify's CDN as a global and has no types.
type ShopifyUi = any;
declare global { interface Window { ShopifyBuy?: ShopifyUi } }

/** The shop of this page's region, or undefined without domain and token. */
function useShop(): Shop | undefined {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const text = useText();
  return root?.shopify.domain && root.shopify.token ? { ...root.shopify, region: root.region, text } : undefined;
}

/** Shopify's cart: one per document, started with the page. Renders nothing itself: the SDK adds its toggle and drawer. */
export function ShopifyCart() {
  const shop = useShop();
  useEffect(() => void (shop && startShop(shop).catch((error) => console.warn("Shopify unavailable", error))), []);
  return null;
}

/** The buy button of a product, drawn by Shopify in an iframe inside this element. */
export function BuyButton({ shopifyId }: { shopifyId: string }) {
  const shop = useShop();
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = node.current!;
    let gone = false;
    if (shop) startShop(shop).then(({ ui, button }) => gone || ui.createComponent("product", {
      id: shopifyId,
      node: host,
      options: {
        product: {
          contents: { img: false, imgWithCarousel: false, title: false, variantTitle: false, price: false, description: false, quantity: false, buttonWithQuantity: false },
          text: { button: shop.text.addToCart },
          styles: { product: { "max-width": "none", "margin": "0", "text-align": "left" }, button: { ...button, padding: "14px 28px" } },
        },
      },
    }), () => {}); // `ShopifyCart` reports the failure
    return () => {
      gone = true;
      host.replaceChildren();
    };
  }, [shopifyId]);
  return <div className="pdp__buy" data-shopify-product={shopifyId} ref={node} />;
}

let started: Promise<{ ui: ShopifyUi; button: Record<string, unknown> }> | undefined;

/** Loads the SDK and creates the cart, once per document; the buy buttons wait for it. */
function startShop(shop: Shop) {
  return (started ??= (async () => {
    const { domain, token, region, text } = shop;
    const market = MARKETS[region];
    await loadScript(SDK);
    const client = window.ShopifyBuy.buildClient({ domain, storefrontAccessToken: token, language: region === "de" ? "de" : "en" });
    priceInMarket(client, shop, market.country);
    const ui = await window.ShopifyBuy.UI.onReady(client);

    // The cart formats every amount with one `moneyFormat` (SDK default "${{amount}}"), whatever the cart's currency: the region's, else the shop's.
    const moneyFormat = market.moneyFormat ?? (await client.shop.fetchInfo()).moneyFormat;

    // Shopify draws everything in iframes: the site's colours (light or dark theme) go in as styles.
    const css = getComputedStyle(document.documentElement);
    const [accent, accentInk, surface, ink, line] = ["--accent", "--accent-ink", "--surface", "--ink", "--line"].map((name) => css.getPropertyValue(name).trim());
    const accented = { "background-color": accent, color: accentInk };
    const button = { ...accented, "border-radius": "999px", ":hover": accented, ":focus": accented };
    const panel = { "background-color": surface, color: ink };
    const inks = (...parts: string[]) => Object.fromEntries(parts.map((part) => [part, { color: ink }]));
    const control = { color: ink, "background-color": surface, "border-color": line };

    await ui.createComponent("cart", {
      moneyFormat,
      options: {
        cart: { startOpen: false, text: { title: text.cart, total: text.subtotal, button: text.checkout, empty: text.cartEmpty, notice: text.cartNotice }, styles: { cart: panel, header: panel, footer: panel, ...inks("title", "close", "subtotalText", "subtotal", "notice", "empty"), button } },
        lineItem: { styles: { lineItem: { "border-color": line }, ...inks("itemTitle", "variantTitle", "price", "fullPrice"), quantityInput: control, quantityButton: control } },
        toggle: { styles: { toggle: button, iconPath: { fill: accentInk }, count: { color: accentInk } } },
      },
    });
    return { ui, button };
  })());
}

/**
 * A cart prices in the market of its buyer's country. A new cart gets the country of the region; a cart that was started in
 * another region (there is one cart per browser) is moved to it before the cart shows it.
 */
function priceInMarket(client: ShopifyUi, { domain, token }: Shop, countryCode: string) {
  const create = client.checkout.create.bind(client.checkout);
  client.checkout.create = (input: ShopifyUi = {}) => create({ ...input, buyerIdentity: { ...input.buyerIdentity, countryCode } });
  const fetchCart = client.checkout.fetch.bind(client.checkout);
  client.checkout.fetch = async (id: string) => {
    const cart = await fetchCart(id);
    if (!cart || cart.buyerIdentity?.countryCode === countryCode) return cart;
    const moved = await fetch(`https://${domain}/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
      body: JSON.stringify({
        query: "mutation($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) { cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) { userErrors { message } } }",
        variables: { cartId: id, buyerIdentity: { countryCode } },
      }),
    }).then((res) => res.json());
    if (moved.errors || moved.data.cartBuyerIdentityUpdate.userErrors.length) console.warn("Shopify: the cart stays in its old market", moved);
    return fetchCart(id);
  };
}

function loadScript(src: string) {
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src, async: true, onload: resolve, onerror: reject });
    document.head.append(script);
  });
}
