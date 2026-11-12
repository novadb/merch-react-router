# Nova Merchandising — React Router SSR (reference)

The reference implementation of the demo site: React Router 8 in framework mode, server-rendered, TypeScript.
Every page, product, price and picture is read live from NovaDB's Delivery API (branch `merchDemo`). All other demos
copy its HTML structure and share `app/site.css` unchanged.

Every page is rendered on the server, then React hydrates it. Everything works without JavaScript; in the browser links
navigate without a page load (`<Link>`), the range's filters apply in place (a fetcher posts the form to the route's
`action`, no page load, the URL stays), "Show more" loads while scrolling, the search box suggests while typing (a
fetcher on `/api/suggest`), and Shopify's own buy button and cart appear in the site's colours. Data only ever comes
from the server: the loaders and actions read NovaDB, the browser never does.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Before the first start copy `.env.example` to `.env` and set `NOVA_DELIVERY_URL`, `NOVA_DELIVERY_USER` and
`NOVA_DELIVERY_PASSWORD` to the Delivery API login of your NovaDB instance. `npm run dev` reads `.env` (React Router's
Vite plugin loads it into `process.env`); `npm run start` and the container take the same variables from their environment.
Optional variables (see `.env.example`): `DEMO_BRANCH` (default `merchDemo`), `SHOPIFY_DOMAIN` and
`SHOPIFY_STOREFRONT_TOKEN` (public Buy Button token; without them there is no cart), `SITE_URL` (public origin for the absolute canonical and hreflang URLs; default: the ingress's `X-Forwarded-*` headers, which a client can forge, so set it in production), `PORT`.

Production: `npm run build`, then `npm run start` (port 3000), or the `Dockerfile`.

## Test

With the built site running (`npm run build`, `npm run start`): `npx playwright test` (Firefox). The dev server lacks
`server.js` and its redirects to one URL per page, so one test fails there. `BASE_URL=http://localhost:5000 npx playwright test`
runs the same behaviour checks against another demo.

Every pull request to `main` runs the same suite in CI (`azure-pipelines.yml`: typecheck, build, `docker build`,
Playwright against the real Delivery API); the PR can only be completed when it is green. The tests tagged `@shopify`
(buy button, cart) need the Shopify variables and are not run there: `npx playwright test --grep @shopify` runs only them locally.

## Where things are

| Path | What |
|---|---|
| `NOVADB.md` | how the site reads NovaDB: the model, the Delivery API's concepts, what the site decided |
| `app/lib/schema.ts` | every NovaDB name (branch, types, attributes, market variants) as API identifiers: the one place to change |
| `app/lib/*.server.ts` | what reads NovaDB, on the server only (React Router keeps `.server` modules out of the browser) |
| `app/lib/delivery.server.ts` | Delivery API client: Basic auth from the environment, 60 s cache |
| `app/lib/i18n.ts`, `i18n.server.ts` | regions (`de`, `uk`, `us`: content language, market, currency) and the UI texts; reading NovaDB's labels |
| `app/lib/request.ts`, `seo.ts` | region and posted form fields of a request; canonical and hreflang URLs |
| `app/lib/site.server.ts` | page tree, URLs from `merchPageUrlSegment` + parent page, category page of a group |
| `app/lib/products.ts`, `products.server.ts` | the product type, full-text filter, facets (counted on the server), sorting; reading products |
| `app/lib/images.ts`, `images.server.ts` | picture URLs and their scaled variants (`srcset`); reading image objects |
| `app/components/Content.tsx`, `Range.tsx`, `ProductDetail.tsx` | Visual Document renderer, product card, page teaser; the live range with its facets; the product page |
| `app/components/SearchBox.tsx`, `Shop.tsx` | the search form with its typeahead; Shopify's buy button and cart |
| `app/site.css` | the stylesheet, the same file in every demo; `root.tsx` imports it with `?url`, so Vite serves it under a name that carries its content hash |
| `server.js` | the production server (`npm run start`): Express with the React Router handler; it trusts the proxy's `X-Forwarded-*` headers |
| `app/routes/page.tsx` | `/{region}/…` (`de`, `uk`, `us`): a page (content + live range) or a product |
| `app/routes/search.tsx`, `suggest.ts` | search page and the typeahead's JSON |
| `app/routes/media-file.ts`, `media-scaled.ts`, `app/lib/media.server.ts`, `start.ts` | picture proxy with disk cache and scaled WebP variants (`sharp`), `/` → region by `Accept-Language` |

## Deviations

None — this is the reference.
