# AGENTS.md

Single source of truth for coding agents in this repository; `CLAUDE.md` only imports it. A line stays only if an agent would decide wrongly without it.

## Project

"Nova Merchandising": a demo website that shows NovaDB as CMS and PIM in one. Every page, product, price, picture and UI text is read live from NovaDB's Delivery API. Stack: React Router 8 (framework mode: server render, then hydration), TypeScript.

Agencies and developers read this code to learn how the stack works with NovaDB, then change it for their own project. Measure every change against that: easy to read (a short path from URL to HTML, no layer of our own, fewer lines); the NovaDB code in the open, one place per concern; everything else (shop, pictures, SEO, deployment) in the smallest form that is right in concept; modern, idiomatic React Router and TypeScript; a complete site on the live API.

This is the **reference implementation**: ports to other stacks copy its HTML structure, CSS classes, label keys (`app/lib/i18n.ts`), routes and shared files (`app/site.css`, `public/`) unchanged and run its Playwright suite against themselves. A change to any of those is a contract change: say so in your answer.

Non-goals: reading NovaDB in the browser, writes to NovaDB, a database or shared cache, query strings, a cart of our own.

## Commands and gates

- Run: `npm run dev`. It needs the Delivery login in its environment (`NOVA_DELIVERY_URL`, `NOVA_DELIVERY_USER`, `NOVA_DELIVERY_PASSWORD`) and fails loudly without it.
- `npm run typecheck` (typegen, then `tsc`), `npm run build`, `docker build .`
- `npx playwright test` against a running site (`BASE_URL` selects the target, default `npm run start` on port 3000). Not the dev server: it has no `server.js`, so the redirect test fails there. CI leaves out the tests tagged `@shopify` (buy button, cart): run them locally.
- Local container (`localhost:4000`, podman): `uv run scripts/refresh-container.py` after every completed change; `--full` after a change to `package.json`, `package-lock.json` or `Dockerfile`.
- Done means: typecheck and build pass, `docker build` succeeds, and the suite is green against the real Delivery API. "Should work" is not a result; report each gate with its output.
- The suite asserts structure and data rules, not CMS copy. Its seed paths (e.g. `/uk/shop/t-shirts/we-build-value`) are CMS data: if one disappears, fix the test's path, not the app.

## NovaDB

Before touching `app/lib/` or `app/components/Content.tsx` read `NOVADB.md`: the model and the Delivery API's concepts (identifiers, `lang`, `props`, variants, references, Visual Document, files, search). The wire protocol (routes, filter and sort grammar, paging) is in the product documentation it links. `README.md` lists which file does what.

- Read-only, branch `merchDemo`.
- Every NovaDB name (branch, types, attributes, market variants) is an API identifier and stands only in `app/lib/schema.ts`. An unavoidable numeric ID goes there too, as a named constant.
- A missing `props` key means unset or untranslated: omit it. Never fall back to another language or to `displayName`.
- Never print `NOVA_DELIVERY_URL/USER/PASSWORD`. The token stays on the server: pictures go through the `/media` proxy.
- Other env: `DEMO_BRANCH` (default `merchDemo`; not `NOVA_BRANCH`, which shells export for other work), `SHOPIFY_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN`, `SITE_URL` (set it in production), `MEDIA_CACHE_DIR`.
- `app/lib/delivery.server.ts` caches responses for 60 s: after a NovaDB data change wait a minute or restart before judging output.
- A UI text is a `merchLabel` object in NovaDB: a new text is a new label there plus its key in `app/lib/i18n.ts`. The name of a product attribute is not a label: it is the name of the attribute's definition (`ATTRIBUTE_TEXT`). A missing text prints `⟦key⟧` and fails the suite.

## Rules

- Fix the cause, not the symptom: no swallowed exception, fallback value or retry that hides a defect. Missing env or data fails loudly (`env()` in `app/lib/delivery.server.ts`).
- Never weaken, skip or delete a test to get green.
- Change only what the task needs; list unrelated findings at the end of your answer (`file:line`).
- Ask before adding a dependency or touching `Dockerfile` or deploy configuration.
- Comments say why the code is this way (a constraint of NovaDB, the framework, browser or contract) or what a name stands for, true for a reader who never saw an earlier version. A declaration other files use gets a doc comment when name and type leave something open (a unit, what a missing value means); a file header or one comment for a group may cover several. Never what the code plainly does or how it changed: that goes in the pull request. No TODO, no commented-out code; test names likewise.

## Where the code does not say why

- Everything must work without JavaScript: check a changed page with JS off (the suite has such tests) and its HTML with `curl`.
- A module that reads NovaDB (or uses Node) ends in `.server.ts`; a component imports only the others (`import type` excepted: it is erased). Data reaches the browser only through loaders and actions.
- The site writes no query string and reads none (a foreign one is ignored): filters, sorting and search are POST forms answered with the page itself, so a filtered view has no URL of its own. That is intended. A route that accepts a form needs an `action` export, or the POST is a 405; a loader never sees the posted fields (the action answers them).
- The range posts through a fetcher, never a navigation: a POST navigation would change history and scroll. Cards in a range are keyed by product: a card that stays keeps its element.
- The region switch is a plain `<a>` (a document load): Shopify's cart takes the region's market when the page starts. CMS rich text links are document loads too.
- `app/site.css`, `NOVADB.md` and everything in `public/` (`favicon.svg`, `robots.txt`, the fonts) are the same files in every port, kept identical from outside this repository: never adapt them to this stack. Only how they reach the browser is this demo's own (`?url` in `root.tsx`). `site.css` is also the CMS editor's stylesheet: keep its `@editor` markers, and between them nothing of the header, the range or the product page.
- Page content is made from a closed set of components: a class `merch*` in content that is not in `COMPONENT_CLASSES` (`tests/site.spec.ts`) fails the suite. Compose, or follow the structure with CSS, before asking for a new one.
- The shop is Shopify's own Buy Button and cart (`app/components/Shop.tsx`, the React form of the shared client script's Shopify part: change both together). What the shop can configure (prices per market, product titles, languages) is configured there, not in code. Without `SHOPIFY_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN` there are no buy buttons and no cart, silently: keep both in `.env`.

## Git

- Branch from a fresh `origin/main` as `feature/<id>-<slug>` or `bugfix/<id>-<slug>` (`<id>` is the number of the work item, the slug lower-case words). `main` changes only by pull request, completed as **squash merge** with the source branch deleted; direct and force pushes to `main` are rejected.
- **Title and description of the PR are the one public commit message.** Write them with the skill `pr-text` (title up to 60 characters, description optional, up to three lines), check them with `scripts/check-pr-text.py`, get the user's approval, and set the merge commit message explicitly to that text.
- The PR needs a review, a linked work item, resolved comments and a green build (typecheck, build, `docker build`, the suite without `@shopify`). A red build can be CMS data (a seed path), not code.
- Everything on `main` is public and mirrored read-only to GitHub (never push there): no addresses, accounts, tracker numbers or secrets in files or commit messages. No tags, no version numbers.
- Pushing, merging and tagging need explicit approval.

## Deployment

The site is one container (`Dockerfile`, port 3000) with no state of its own: the media cache refills by itself. Where and how it is hosted is the operator's choice. It only needs its environment (see NovaDB) from the platform's secrets, with `SITE_URL` set to the public origin. Never push images, deploy or change DNS without explicit approval.
