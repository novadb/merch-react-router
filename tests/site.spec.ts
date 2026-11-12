// Behaviour every demo must show. Asserts structure, routes and data rules — not CMS copy, which editors change.
// A region is the first URL segment: /de/ is German in euros, /uk/ English in pounds, /us/ English in dollars.
import { expect, test, type Page } from "@playwright/test";

const REGIONS = [
  { region: "de", htmlLang: "de", symbol: "€" },
  { region: "uk", htmlLang: "en-GB", symbol: "£" },
  { region: "us", htmlLang: "en-US", symbol: "$" },
] as const;

const PRODUCT = { de: "/de/shop/t-shirts/we-build-value", uk: "/uk/shop/t-shirts/we-build-value", us: "/us/shop/t-shirts/we-build-value" };
const COLLECTION = { de: "/de/kollektionen/kaffee-und-code", uk: "/uk/collections/coffee-and-code", us: "/us/collections/coffee-and-code" };

const cards = (page: Page) => page.locator(".grid .product-card");
/** The checkbox of a colour, by the name it shows: the posted value is the colour object's ID (PIM data). */
const colourBox = (page: Page, name: string) =>
  page.locator("#facets label.facet__option").filter({ has: page.getByText(name, { exact: true }) }).locator('input[name="color"]');
const price = (page: Page) => page.locator(".pdp__price").innerText();

/**
 * Runs `act` (a form submit) and waits for the page the POST answers with: loaded as a new page (search), or fetched in
 * the background and put in place of the range (filters, sorting). Neither changes the URL. While the answer is on its
 * way the range or the page is `aria-busy`.
 */
async function posted(page: Page, act: () => Promise<unknown>) {
  const response = page.waitForResponse((r) => r.request().method() === "POST" && !new URL(r.url()).pathname.startsWith("/api/"));
  await act();
  const answer = await response;
  expect(answer.status()).toBe(200);
  await page.waitForLoadState();
  await expect(page.locator("[aria-busy]")).toHaveCount(0); // the range is replaced
  return answer;
}

/** When "Show more" is near the window, it is clicked by itself once the range is in place: wait until that has run its course. */
async function settled(page: Page) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the observer has looked
  await expect(page.locator("[aria-busy]")).toHaveCount(0);
}

/** Cards a range shows at first and adds per "Show more" (1, 2 or 3 columns: always whole rows). */
const BATCH = 12;
/** The total of a range, from its count line ("43 products"). */
const total = async (page: Page) => Number((await page.locator(".range__count").innerText()).match(/\d+/)![0]);

/** Scrolls to the end of the range until every card is appended; the "Show more" button is then gone. */
async function showAll(page: Page) {
  const more = page.locator(".range__more");
  while (await more.count()) {
    const shown = await cards(page).count();
    await more.scrollIntoViewIfNeeded();
    await expect(cards(page)).not.toHaveCount(shown);
  }
  await expect(page.locator("[aria-busy]")).toHaveCount(0);
}

/** Searches through the header form: the query travels in the POST body, the result page is `/{region}/search`. */
async function search(page: Page, region: string, q: string) {
  await page.goto(`/${region}/`);
  await page.locator('header input[name="q"]').fill(q);
  await posted(page, () => page.locator("header form.search").evaluate((form: HTMLFormElement) => form.requestSubmit()));
  await expect(page).toHaveURL(new RegExp(`/${region}/search$`));
}

test("root redirects to the region of the browser language", async ({ playwright, baseURL }) => {
  for (const [acceptLanguage, target] of [["de-DE,de;q=0.9", "/de/"], ["en-GB,en;q=0.9", "/uk/"], ["en-US,en;q=0.9", "/us/"], ["fr-FR", "/us/"]]) {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Accept-Language": acceptLanguage } });
    const res = await api.get("/", { maxRedirects: 0 });
    expect(res.status(), acceptLanguage).toBe(302);
    expect(new URL(res.headers()["location"], baseURL).pathname, acceptLanguage).toBe(target);
    await api.dispose();
  }
});

for (const { region, htmlLang } of REGIONS) {
  test(`home (/${region}/) renders CMS content with live product cards and collection teasers`, async ({ page }) => {
    await page.goto(`/${region}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
    await expect(page.locator(".merchHero .merchDisplay")).toBeVisible();
    expect(await page.locator(".product-card").count()).toBeGreaterThan(3);
    expect(await page.locator(".page-teaser").count()).toBeGreaterThan(2);
    await expect(page.locator(".product-card__price").first()).not.toBeEmpty();
  });
}

test("category page shows the live range right after the hero, and facets filter it", async ({ page }) => {
  await page.goto("/uk/shop/t-shirts");
  await expect(page.locator(".main > :nth-child(2)")).toHaveClass(/range/);
  const all = await cards(page).count();
  expect(all).toBeGreaterThan(5);
  await posted(page, () => colourBox(page, "White").check()); // auto-submits
  await expect(page).toHaveURL(/\/uk\/shop\/t-shirts$/); // the filter is posted, the URL stays the page's
  await expect(colourBox(page, "White")).toBeChecked();
  const white = await cards(page).count();
  expect(white).toBeGreaterThan(0);
  expect(white).toBeLessThan(all);
  await expect(page.locator(".range__count")).toContainText(String(white));
  await posted(page, () => page.locator('.facets button[name="reset"]').click());
  await expect(page).toHaveURL(/\/uk\/shop\/t-shirts$/);
  // The reset can leave "Show more" near the window: it then appends the next batch by itself, whenever the page gets to it.
  await settled(page);
  expect(await cards(page).count()).toBeGreaterThanOrEqual(all); // the whole range is back, a batch more is fine
});

test("a query string filters nothing: the site reads none", async ({ page }) => {
  await page.goto("/uk/shop/t-shirts");
  const all = await cards(page).count();
  const white = await colourBox(page, "White").getAttribute("value");
  await page.goto(`/uk/shop/t-shirts?color=${white}&sort=price-asc&stock=1`);
  expect(await cards(page).count()).toBe(all);
  await expect(colourBox(page, "White")).not.toBeChecked();
  await page.goto("/uk/search?q=NM-MG");
  await expect(page.locator('main input[type="search"]')).toHaveValue("");
});

test("a range shows the first batch and appends the rest while scrolling, without a page load", async ({ page }) => {
  await page.goto("/uk/shop");
  const all = await total(page);
  expect(all).toBeGreaterThan(BATCH);
  await expect(cards(page)).toHaveCount(BATCH);
  await expect(page.locator(".range__more")).toHaveAttribute("value", String(2 * BATCH));
  await page.evaluate(() => ((window as { seen?: boolean }).seen = true));
  await showAll(page);
  await expect(cards(page)).toHaveCount(all);
  expect(await page.evaluate(() => (window as { seen?: boolean }).seen)).toBe(true);
  expect(new Set(await page.locator(".grid .product-card a").evaluateAll((a) => a.map((el) => el.getAttribute("href")))).size).toBe(all);
  await expect(page.locator(".range__count")).toContainText(String(all)); // the count is the whole range from the start
  // A filter starts again with the first batch.
  await posted(page, () => page.locator('#facets input[name="color"]').first().check());
  await expect(cards(page)).toHaveCount(Math.min(BATCH, await total(page)));
});

test("a facet or sort change replaces the range in place: no page load, cards that stay keep their element", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/de/shop");
  await showAll(page); // every card in the page, so any card a filter or sort brings back was there before
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const box = page.locator('#facets input[name="color"]').first();
  await box.scrollIntoViewIfNeeded();
  const colour = await box.getAttribute("value");
  // Mark the document, the checkbox position and the cards: a page load would lose the marks. The cards are marked by a
  // script's own set, not by an attribute: a morph that makes the page match the answer removes attributes it does not know.
  const top = await box.evaluate((el) => {
    (window as { seenCards?: WeakSet<Element> }).seenCards = new WeakSet(document.querySelectorAll(".grid .product-card"));
    (window as { seen?: boolean }).seen = true;
    return Math.round(el.getBoundingClientRect().top);
  });
  // Of the first `limit` cards (all by default).
  const state = (limit?: number) => page.evaluate((limit) => {
    const shown = [...document.querySelectorAll<HTMLElement>(".grid .product-card")].slice(0, limit);
    const onScreen = shown.flatMap((card) => [...card.querySelectorAll("img")])
      .filter((img) => img.getBoundingClientRect().bottom > 0 && img.getBoundingClientRect().top < innerHeight);
    return {
      samePage: (window as { seen?: boolean }).seen === true,
      cards: shown.length,
      kept: shown.filter((card) => (window as { seenCards?: WeakSet<Element> }).seenCards?.has(card)).length,
      unloaded: onScreen.filter((img) => !img.complete).length,
    };
  }, limit);
  const all = (await state()).cards;
  const scrolled = await page.evaluate(() => Math.round(scrollY));
  await posted(page, () => box.check());
  const checked = page.locator(`#facets input[name="color"][value="${colour}"]`);
  await expect(checked).toBeChecked();
  await expect(checked).toBeFocused();
  let now = await state();
  expect(now.samePage).toBe(true);
  expect(now.cards).toBeLessThan(all);
  expect(now.kept).toBe(now.cards); // every remaining card is the element that was there before
  expect(now.unloaded).toBe(0); // no picture pops in after the range is shown
  expect(await checked.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(top); // the checkbox stays under the pointer
  expect(await page.evaluate(() => Math.round(scrollY))).toBe(scrolled); // and the page does not move for it
  // Sorting brings cards from further down, whose lazy pictures were never loaded, onto the screen.
  await posted(page, () => page.locator('.facets button[name="reset"]').click());
  await settled(page); // or the sort's POST races the batch that is appended after the reset
  await posted(page, () => page.locator(".range__sort select").selectOption("price-desc"));
  // "Show more" may append the next batch at once when it is near the window, so the page is judged by its first batch.
  // Cards the filter had taken away come back: they may be new elements (`kept` is not judged), but none shows its picture late.
  const { kept: _, ...sorted } = await state(BATCH);
  expect(sorted).toEqual({ samePage: true, cards: BATCH, unloaded: 0 });
});

const facetValues = (page: Page) => page.locator("#facets input[type=checkbox]").evaluateAll((all) => all.map((el) => `${(el as HTMLInputElement).name}=${(el as HTMLInputElement).value}`));

test("the list of facet values is stable: a value without a hit stays in its place, disabled", async ({ page }) => {
  await page.goto("/de/shop");
  const values = await facetValues(page);
  // The rarest colour (the list is ordered by products, most first) leaves some group without a hit.
  await posted(page, () => page.locator('#facets input[name="color"]').last().check());
  expect(await facetValues(page)).toEqual(values);
  const none = page.locator('#facets .facet__option:has(.facet__count:text-is("0")) input');
  expect(await none.count()).toBeGreaterThan(0);
  for (const input of await none.all()) await expect(input).toBeDisabled();
  await expect(page.locator('#facets .facet__option:not(:has(.facet__count:text-is("0"))) input:disabled')).toHaveCount(0);
  // A second facet changes counts, never the list or its order.
  await posted(page, () => page.locator('#facets input[name="group"]:enabled').first().check());
  expect(await facetValues(page)).toEqual(values);
  await expect(page.locator('#facets input[name="color"]').last()).toBeEnabled(); // a chosen value can always be taken back
});

test("deep in a long range, a filter that leaves few products shows the range from its start", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/de/shop");
  await cards(page).last().scrollIntoViewIfNeeded();
  const box = page.locator('#facets input[name="color"]').last();
  await expect(box).toBeInViewport(); // the filters stick
  await posted(page, () => box.check());
  const start = await page.locator("#range").evaluate((el) => [Math.round(el.getBoundingClientRect().top), parseFloat(getComputedStyle(el).scrollMarginTop)]);
  expect(start[0]).toBe(start[1]);
  await expect(cards(page).first()).toBeInViewport();
});

test("changing a facet keeps the scroll position instead of jumping to #range", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/uk/shop/mugs#range");
  await page.evaluate(() => scrollBy(0, 120)); // scrolled below the anchor position
  const before = await page.evaluate(() => Math.round(scrollY));
  const url = page.url();
  await posted(page, () => page.locator('#facets input[type="checkbox"]').first().check()); // auto-submits
  expect(page.url()).toBe(url); // replaced in place: the address is not touched
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(before);
});

const link = (page: Page, rel: string, hreflang?: string) =>
  page.locator(`link[rel="${rel}"]${hreflang ? `[hreflang="${hreflang}"]` : ""}`);

test("filtered views and foreign query strings name the plain page as absolute canonical", async ({ page, baseURL }) => {
  await page.goto("/uk/shop/t-shirts");
  await posted(page, () => colourBox(page, "White").check());
  await expect(link(page, "canonical")).toHaveAttribute("href", `${baseURL}/uk/shop/t-shirts`);
  await page.goto(PRODUCT.us + "?utm_source=x");
  await expect(link(page, "canonical")).toHaveAttribute("href", `${baseURL}${PRODUCT.us}`);
});

test("every page lists itself and all region variants, plus x-default", async ({ page, baseURL }) => {
  const sets = [PRODUCT, COLLECTION, { de: "/de/", uk: "/uk/", us: "/us/" }];
  for (const set of sets) {
    for (const { region } of REGIONS) {
      await page.goto(set[region]);
      await expect(link(page, "canonical")).toHaveAttribute("href", `${baseURL}${set[region]}`);
      for (const { region: other, htmlLang } of REGIONS) await expect(link(page, "alternate", htmlLang)).toHaveAttribute("href", `${baseURL}${set[other]}`);
      await expect(link(page, "alternate", "x-default")).toHaveAttribute("href", `${baseURL}/`);
    }
  }
});

test("search results carry no canonical or hreflang (not meant for the index)", async ({ page }) => {
  await search(page, "uk", "mug");
  await expect(link(page, "canonical")).toHaveCount(0);
  await expect(link(page, "alternate")).toHaveCount(0);
});

test("one URL per page: trailing slashes redirect permanently to the canonical form", async ({ request }) => {
  const cases: [string, string][] = [
    ["/uk/shop/t-shirts/", "/uk/shop/t-shirts"],
    ["/uk/shop/t-shirts/?utm_source=x", "/uk/shop/t-shirts?utm_source=x"],
    ["/de", "/de/"],
    [PRODUCT.us + "/", PRODUCT.us],
  ];
  for (const [from, to] of cases) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(301);
    expect(res.headers()["location"], from).toBe(to);
  }
  for (const ok of ["/de/", "/uk/shop/t-shirts", PRODUCT.uk]) expect((await request.get(ok, { maxRedirects: 0 })).status(), ok).toBe(200);
});

test("the logo leads to the home page from any page, also when the router navigates (the data of `/de/` must not redirect to itself)", async ({ page }) => {
  for (const path of [COLLECTION.de, PRODUCT.de, "/de/shop"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.locator("header a.logo").click();
    await expect(page).toHaveURL(/\/de\/$/);
    await expect(page.locator("header a.logo")).toHaveAttribute("href", "/de/");
    await expect(page.locator("h1, .merchDisplay").first()).toBeVisible();
  }
});

test("a form posted through a proxy that ends TLS is answered", async ({ request, baseURL }) => {
  // The browser names the public https origin; the site itself may be reached over http, behind the proxy.
  const origin = `https://${new URL(baseURL!).host}`;
  const res = await request.post("/uk/search", { form: { q: "coffee" }, headers: { Origin: origin, "X-Forwarded-Proto": "https" } });
  expect(res.status()).toBe(200);
});

test("the canonical origin follows the ingress headers", async ({ request }) => {
  const res = await request.get(PRODUCT.uk, { headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "shop.example.org" } });
  expect(await res.text()).toContain('href="https://shop.example.org' + PRODUCT.uk + '"');
});

const COLLECTIONS = [
  { de: "entwickler-grundausstattung", us: "developer-essentials", products: 14 },
  { de: "kaffee-und-code", us: "coffee-and-code", products: 11 },
  { de: "produkt-und-wachstum", us: "product-and-growth", products: 18 },
];

test("a collection is an editor's page: every product is a card in the content, no live range", async ({ page }) => {
  for (const c of COLLECTIONS) {
    await page.goto(`/us/collections/${c.us}`);
    await expect(page.locator("#range, #facets"), c.us).toHaveCount(0);
    const cards = page.locator(".main .product-card");
    await expect(cards, c.us).toHaveCount(c.products);
    const links = await cards.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(new Set(links).size, `${c.us}: every product once`).toBe(c.products);
    for (const priceText of await page.locator(".main .product-card__price").allInnerTexts()) expect(priceText, c.us).toContain("$");
    for (const card of await cards.all()) expect(await card.evaluate((el) => !!el.closest(".merchBand, .merchBandDark, .merchBandWarm, .merchBandAccent, .merchSplit, .merchRail, .merchChapter")), c.us).toBe(true);
  }
});

/**
 * The closed set of Visual Components. A page is composed from these, never from a component
 * made for it: a new need is met by composing, by CSS that follows the structure, or by another view of the product
 * card, and only after a decision by adding the class here, to the editor stylesheet and to the inventory.
 */
const COMPONENT_CLASSES = [
  "merchHero", "merchKicker", "merchDisplay", "merchLead", "merchCta", "merchStatement", "merchMarquee", "merchTerminal",
  "merchBand", "merchBandDark", "merchBandWarm", "merchBandAccent", "merchSplit", "merchSplitMedia", "merchSplitText",
  "merchRail", "merchFeature", "merchChapter", "merchSpecTable", "merchProductCard", "merchPageTeaser",
];

test("every page is composed from the closed set of components", async ({ page }) => {
  await page.goto("/us/");
  const nav = await page.locator(".site-nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const paths = new Set(["/us/", ...nav.filter((href) => href.startsWith("/us/")), ...COLLECTIONS.map((c) => `/us/collections/${c.us}`)]);
  expect(paths.size, "the navigation leads to pages").toBeGreaterThan(8);
  for (const path of paths) {
    await page.goto(path);
    const used = await page.locator(".main [class*='merch']").evaluateAll((els) => [...new Set(els.flatMap((el) => [...el.classList].filter((c) => c.startsWith("merch"))))]);
    expect(used.filter((c) => !COMPONENT_CLASSES.includes(c)), `${path} uses a component outside the set`).toEqual([]);
  }
});

test("collections mix groups and are laid out differently from each other", async ({ page }) => {
  const layouts: string[] = [];
  for (const c of COLLECTIONS) {
    await page.goto(`/us/collections/${c.us}`);
    const metas = await page.locator(".main .product-card__meta").allInnerTexts();
    expect(metas.some((m) => m.includes("ml")), `${c.us} has a mug or flask`).toBe(true);
    expect(metas.some((m) => !m.includes("ml")), `${c.us} has something else`).toBe(true);
    layouts.push(await page.locator(".main").evaluate((main) => [...main.querySelectorAll(":scope > *")].map((e) => e.className.split(" ")[0]).join(" ")));
  }
  expect(new Set(layouts).size).toBe(COLLECTIONS.length);
});

test("collection prices follow the region", async ({ page }) => {
  for (const { region, symbol } of REGIONS) {
    for (const c of COLLECTIONS) {
      await page.goto(region === "de" ? `/de/kollektionen/${c.de}` : `/${region}/collections/${c.us}`);
      await expect(page.locator(".main .product-card"), `${region} ${c.us}`).toHaveCount(c.products);
      for (const priceText of await page.locator(".main .product-card__price").allInnerTexts()) expect(priceText).toContain(symbol);
    }
  }
});

for (const { region, symbol } of REGIONS) {
  test(`every price on /${region}/ is in ${symbol}`, async ({ page }) => {
    const allIn = async (path: string) => {
      const prices = await page.locator(".product-card__price, .pdp__price").allInnerTexts();
      expect(prices.length, path).toBeGreaterThan(0);
      for (const p of prices) expect(p, path).toContain(symbol);
    };
    for (const path of [`/${region}/`, `/${region}/shop/t-shirts`, PRODUCT[region]]) {
      await page.goto(path);
      await allIn(path);
    }
    await search(page, region, "NM-MG");
    await allIn("search");
    await expect(page.locator('select[name="market"]')).toHaveCount(0); // the region fixes the market, there is no switch
  });
}

test("uk and us share the English texts, de has German ones", async ({ page }) => {
  const texts = async (region: string) => {
    await page.goto(`/${region}/shop/t-shirts`);
    return [await page.locator('header input[name="q"]').getAttribute("placeholder"), await page.locator("footer").innerText(), await page.locator(".facets legend").first().innerText()];
  };
  const [uk, us, de] = [await texts("uk"), await texts("us"), await texts("de")];
  expect(uk).toEqual(us);
  expect(de).not.toEqual(uk);
});

test("every page links to this demo's source on GitHub from the footer, the error page too; the corner holds the NovaDB logo alone", async ({ page }) => {
  for (const path of ["/de/", "/uk/shop/t-shirts", "/us/no-such-page"]) {
    await page.goto(path);
    const link = page.locator("footer.site-footer a.site-footer__repo");
    await expect(link).toBeVisible();
    const name = (await link.innerText()).trim();
    expect(name).toMatch(/^merch-[a-z0-9-]+$/);
    await expect(link).toHaveAttribute("href", `https://github.com/novadb/${name}`);
    await expect(page.locator("aside.source")).toBeVisible();
    await expect(page.locator("aside.source *")).toHaveCount(0);
  }
});

test("product page: the region switch keeps the product, the price follows the region", async ({ page }) => {
  await page.goto(PRODUCT.uk);
  await expect(page.locator(".crumbs")).toContainText("T-Shirts");
  await expect(page.locator(".specs")).toContainText("NM-TS-");
  await expect(page.locator(".page-teaser")).toHaveCount(0); // no "part of these collections" box
  await expect(page.locator(".regions [aria-current]")).toHaveText("UK");
  expect(await price(page)).toContain("£");
  const sku = (await page.locator(".specs").innerText()).match(/NM-[A-Z]+-\d+-[A-Z]+/)![0];
  for (const { region, symbol } of [REGIONS[0], REGIONS[2]]) {
    await page.locator(".regions a", { hasText: region.toUpperCase() }).click();
    await expect(page).toHaveURL(PRODUCT[region]);
    expect(await price(page)).toContain(symbol);
    expect(await page.locator(".specs").innerText()).toContain(sku);
    await page.goto(PRODUCT.uk);
  }
});

test("pages and products carry the same breadcrumb from the home page down to themselves, the home page has none", async ({ page }) => {
  const trail = async (path: string) => {
    await page.goto(path);
    const crumbs = page.locator("main > .crumbs:first-child");
    await expect(crumbs.locator("li").last().locator("[aria-current=page]")).toHaveCount(1); // the page itself, not a link
    return crumbs.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  };
  expect(await trail("/uk/shop")).toEqual(["/uk/"]);
  expect(await trail("/uk/shop/t-shirts")).toEqual(["/uk/", "/uk/shop"]);
  expect(await trail(PRODUCT.uk)).toEqual(["/uk/", "/uk/shop", "/uk/shop/t-shirts"]);
  expect(await trail(COLLECTION.de)).toEqual(["/de/", "/de/kollektionen"]);
  // a page is named as in the navigation (its navigation title, else its title)
  await page.goto("/de/shop/tassen");
  expect(await page.locator('.crumbs a[href="/de/shop"]').innerText()).toBe(await page.locator('.site-nav a[href="/de/shop"]').first().innerText());
  await page.goto("/uk/");
  await expect(page.locator(".crumbs")).toHaveCount(0);
});

test("content classes the CMS uses are styled: a rail of page teasers is a grid, not full-width pictures", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/de/shop");
  const teaser = page.locator(".merchRail .page-teaser").first();
  expect((await teaser.boundingBox())!.width).toBeLessThan(500);
});

test("a picture in a chapter is shown as it is, never cropped: one straight in the chapter spans its column, one beside text is smaller", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/us/behind-this-shop");
  const pictures = page.locator(".merchChapter img");
  await expect(pictures.first()).toBeVisible();
  for (const picture of await pictures.all()) {
    await picture.scrollIntoViewIfNeeded();
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const { box, natural } = await picture.evaluate((img: HTMLImageElement) => ({ box: img.getBoundingClientRect(), natural: img.naturalWidth / img.naturalHeight }));
    expect(box.width / box.height, "the picture keeps its own proportions").toBeCloseTo(natural, 1);
  }
  const wide = page.locator(".merchChapter > .imageWithCaption img").first();
  const beside = page.locator(".merchSplit img").first();
  expect((await wide.boundingBox())!.width).toBeGreaterThan((await beside.boundingBox())!.width * 1.5);
  expect(await wide.getAttribute("sizes")).not.toBe(await beside.getAttribute("sizes"));
  expect(await wide.getAttribute("srcset")).toContain("/media/1600/");
});

test("every colour swatch is painted with the colour's hex from the PIM", async ({ page }) => {
  await page.goto("/uk/shop");
  const swatches = page.locator("#facets .swatch");
  expect(await swatches.count()).toBeGreaterThan(3);
  for (const swatch of await swatches.all()) {
    await expect(swatch).toHaveAttribute("style", /--swatch:\s*#[0-9a-f]{6}/i);
    expect(await swatch.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  }
});

test("a group brings its own attributes: sleeves show inches, stickers finish and pieces per set", async ({ page }) => {
  await page.goto("/uk/shop/laptop-sleeves/ctrl-s");
  await expect(page.locator(".specs")).toContainText("16″");
  await expect(page.locator(".specs")).not.toContainText("Finish");
  await page.goto("/uk/shop/stickers/the-whole-shop");
  await expect(page.locator(".specs")).toContainText("Glossy");
  await expect(page.locator(".specs")).toContainText("8 pieces");
  await page.goto("/de/shop/sticker/the-whole-shop");
  await expect(page.locator(".specs")).toContainText("Glänzend");
  await expect(page.locator(".specs")).toContainText("8 Stück");
  await page.goto("/de/shop/sticker");
  await expect(page.locator(".grid .product-card__meta").filter({ hasText: "Holografisch" })).toHaveCount(1);
});

// Needs SHOPIFY_DOMAIN and SHOPIFY_STOREFRONT_TOKEN on the site, and every buyable product linked to a Shopify product
// (merchProductShopifyId). Without either the site renders no button and no cart, silently.
// Every test that depends on it carries the tag @shopify: the pull request pipeline leaves them out
// (`--grep-invert @shopify`), they run locally.
test("every group sells: the buy button of a product renders in Shopify's iframe, the page has Shopify's cart toggle", { tag: "@shopify" }, async ({ page }) => {
  for (const path of [PRODUCT.uk, "/uk/shop/mugs/headless-and-happy", "/uk/shop/hoodies/commit-early-push-often", "/uk/shop/stickers/lgtm-stamp", "/uk/shop/laptop-sleeves/ctrl-s"]) {
    await page.goto(path);
    const host = page.locator(".pdp__buy[data-shopify-product]");
    await expect(host, path).toHaveCount(1);
    await expect(host.frameLocator("iframe").getByRole("button", { name: "Add to cart" }), path).toBeVisible({ timeout: 15_000 });
  }
  // Shopify's cart toggle floats at the edge of the page and shows itself once the cart holds something (next test).
  await expect(page.locator(".shopify-buy-frame--toggle")).toHaveCount(1);
  await page.goto(PRODUCT.de);
  await expect(page.locator(".pdp__buy").frameLocator("iframe").getByRole("button", { name: "In den Warenkorb" })).toBeVisible({ timeout: 15_000 });
});

// The cart prices in the market of the region: the page's price in the region's currency (markets GB and US with the fixed
// prices of NovaDB). A cart started in another region follows the region.
for (const [region, symbol] of [["uk", "£"], ["us", "$"], ["de", "€"]] as const) {
  test(`adding a product puts it in the cart at the price of /${region}/`, { tag: "@shopify" }, async ({ page }) => {
    await page.goto(PRODUCT[region]);
    const amount = (text: string) => text.replace(/[^\d.,]/g, "").replace(",", ".");
    const pagePrice = amount(await price(page));
    await page.locator(".pdp__buy").frameLocator("iframe").getByRole("button", { name: region === "de" ? "In den Warenkorb" : "Add to cart" }).click();
    const cart = page.frameLocator('iframe[name="frame-cart"]');
    await expect(cart.locator(".shopify-buy__cart-item")).toHaveCount(1, { timeout: 15_000 });
    const subtotal = cart.locator(".shopify-buy__cart__subtotal__price");
    await expect(subtotal).toContainText(symbol); // the region's currency, not the SDK's "$"
    expect(amount(await subtotal.innerText())).toBe(pagePrice);
    await cart.getByRole("button", { name: /close|schlie/i }).click();
    await expect(page.frameLocator('iframe[name="frame-toggle"]').locator(".shopify-buy__cart-toggle__count")).toHaveText("1");
    await expect(page.locator(".shopify-buy-frame--toggle")).toHaveCount(1); // one toggle: the page has no cart button of its own
  });
}

test("a cart started on /uk/ follows the region to /de/", { tag: "@shopify" }, async ({ page }) => {
  await page.goto(PRODUCT.uk);
  await page.locator(".pdp__buy").frameLocator("iframe").getByRole("button", { name: "Add to cart" }).click();
  await expect(page.frameLocator('iframe[name="frame-cart"]').locator(".shopify-buy__cart-item")).toHaveCount(1, { timeout: 15_000 });
  await page.goto(PRODUCT.de);
  await page.frameLocator('iframe[name="frame-toggle"]').locator(".shopify-buy__cart-toggle").click({ timeout: 15_000 });
  await expect(page.frameLocator('iframe[name="frame-cart"]').locator(".shopify-buy__cart__subtotal__price")).toContainText("€", { timeout: 15_000 });
});

test("the cart speaks German on /de/ and takes the page's colours in the dark theme", { tag: "@shopify" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(PRODUCT.de);
  await page.locator(".pdp__buy").frameLocator("iframe").getByRole("button", { name: "In den Warenkorb" }).click();
  const cart = page.frameLocator('iframe[name="frame-cart"]');
  await expect(cart.getByRole("button", { name: "Zur Kasse" })).toBeVisible({ timeout: 15_000 });
  await expect(cart.locator(".shopify-buy__cart__notice")).toHaveText("Versand und Rabattcodes gibst du an der Kasse an.");
  await expect(cart.locator(".shopify-buy__cart-item")).toHaveCount(1);
  // The drawer takes the page's surface colour instead of Shopify's white.
  const surface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface").trim());
  const drawer = await cart.locator(".shopify-buy__cart").evaluate((el) => getComputedStyle(el).backgroundColor);
  const probe = await page.evaluate((c) => { const e = document.createElement("i"); e.style.color = c; document.body.append(e); const rgb = getComputedStyle(e).color; e.remove(); return rgb; }, surface);
  expect(drawer).toBe(probe);
});

test("a sold-out product shows no buy button", { tag: "@shopify" }, async ({ page }) => {
  await page.goto("/uk/shop/hoodies/deploy-on-friday-sure");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("[data-shopify-product]")).toHaveCount(0);
});

test("search finds products by name and SKU and offers facets", async ({ page }) => {
  await search(page, "uk", "coffee");
  expect(await cards(page).count()).toBeGreaterThan(0);
  await search(page, "uk", "NM-MG");
  const mugs = await page.locator(".grid .product-card__meta").allInnerTexts();
  expect(mugs.length).toBeGreaterThan(3);
  expect(mugs.every((m) => m.includes("ml"))).toBe(true);
  // A facet narrows the result and keeps the query, still without a query string.
  await posted(page, () => page.locator('#facets input[name="color"]').first().check());
  await expect(page).toHaveURL(/\/uk\/search$/);
  await expect(page.locator('main input[type="search"]')).toHaveValue("NM-MG");
  expect(await cards(page).count()).toBeLessThan(mugs.length);
  await posted(page, () => page.locator('.facets button[name="reset"]').click()); // reset clears the filters, not the query
  await expect(page.locator('main input[type="search"]')).toHaveValue("NM-MG");
  expect(await cards(page).count()).toBe(mugs.length);
  await search(page, "uk", '":*[');  // Lucene syntax is neutralised, not a 500
  await expect(page.locator(".range__count")).toBeVisible();
});

test("typeahead suggests products and pages and is keyboard operable", async ({ page }) => {
  await page.goto("/uk/");
  const input = page.locator('header input[name="q"]');
  await input.fill("coffee");
  const listbox = page.locator("header .suggest");
  await expect(listbox.locator('[role="option"] img').first()).toBeVisible(); // a product with its picture
  await expect(listbox.locator(".suggest__price").first()).toContainText("£"); // the region's currency
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.press("ArrowDown");
  const selected = listbox.locator('[aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const target = await selected.getAttribute("data-href");
  await input.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  // The last option ("search all") submits the search form instead of linking to a URL with the query in it.
  await page.goto("/uk/");
  await input.fill("coffee");
  await expect(listbox.locator('[role="option"]').first()).toBeVisible();
  await input.press("ArrowDown");
  await input.press("ArrowUp"); // from the first option round to the last
  await expect(listbox.locator('[role="option"]').last()).toHaveAttribute("aria-selected", "true");
  await posted(page, () => input.press("Enter"));
  await expect(page).toHaveURL(/\/uk\/search$/);
  await expect(page.locator('main input[type="search"]')).toHaveValue("coffee");
  expect(await cards(page).count()).toBeGreaterThan(0);
});

// Tagged: the answer is JSON. A port that answers the typeahead's list as HTML only, and says so in its README, leaves
// this test out (`--grep-invert @suggest-json`); the media routes below are checked for every port.
test("the typeahead shows the 400 px variant of a picture, named by content", { tag: "@suggest-json" }, async ({ request }) => {
  const suggest = await request.post("/api/suggest", { form: { lang: "uk", q: "coffee" } });
  const { products } = await suggest.json();
  expect(products[0].image).toMatch(/^\/media\/400\/[0-9a-f-]{32,36}\.[a-z0-9]+$/);
  const thumb = await request.get(products[0].image);
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["content-type"]).toBe("image/webp");
  expect(thumb.headers()["cache-control"]).toMatch(/max-age=31536000.*immutable/);
  const thumbAgain = await request.get(products[0].image, { headers: { "If-None-Match": thumb.headers()["etag"] } });
  expect(thumbAgain.status()).toBe(304);
});

test("pictures have unchangeable URLs: the content address of the file, cached for good", async ({ page, request }) => {
  // The full picture is named by the MD5 of the file and its extension; there is no thumbnail route.
  await page.goto(PRODUCT.uk);
  const src = await page.locator(".pdp__media img").getAttribute("src");
  expect(src).toMatch(/^\/media\/[0-9a-f-]{32,36}\.[a-z0-9]+$/);
  const full = await request.get(src!);
  expect(full.status()).toBe(200);
  expect(full.headers()["cache-control"]).toMatch(/max-age=31536000.*immutable/);

  // Scaled variants (WebP) are named by width in the path, one of a fixed list; SVG has none.
  const name = src!.replace("/media/", "");
  expect(await page.locator(".pdp__media img").getAttribute("srcset")).toContain(`/media/400/${name} 400w`);
  const scaled = await request.get(`/media/400/${name}`);
  expect(scaled.status()).toBe(200);
  expect(scaled.headers()["content-type"]).toBe("image/webp");
  expect(scaled.headers()["cache-control"]).toMatch(/max-age=31536000.*immutable/);
  expect(Number(scaled.headers()["content-length"])).toBeLessThan(Number(full.headers()["content-length"]));
  const scaledAgain = await request.get(`/media/400/${name}`, { headers: { "If-None-Match": scaled.headers()["etag"] } });
  expect(scaledAgain.status()).toBe(304);

  // Nothing can have changed under such a name: whoever has the tag gets a 304 without a body.
  const etag = full.headers()["etag"];
  expect(etag).toBeTruthy();
  const again = await request.get(src!, { headers: { "If-None-Match": etag } });
  expect(again.status()).toBe(304);

  // Object IDs, unknown names and anything that is not a hash (a thumbnail route is gone) are 404.
  for (const path of ["/media/2099519", "/media/2099519/thumb", `${src}x`, "/media/00000000-0000-0000-0000-000000000000.png", "/media/thumb/abc", "/media/thumb/123", "/media/..%2Fetc", `/media/401/${name}`, `/media/0x190/${name}`, `/media/400/${name}x`, "/media/400/00000000000000000000000000000000.svg"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("robots.txt blocks every crawler and explains the crawl-budget rules for a live site", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const text = await res.text();
  const rules = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  expect(rules).toEqual(["User-agent: *", "Disallow: /"]); // the live-site rules are comments only
  expect(text).toContain("Disallow: /*/search"); // ... but they are explained
  expect(text).not.toContain("Disallow: /*?"); // query strings stay crawlable: a blocked URL never shows its canonical
});

test("no URL in the HTML carries a query string, and every form posts", async ({ page }) => {
  const check = async (path: string) => {
    const urls = await page.locator("[href], [src], [action], [data-suggest]").evaluateAll((els) =>
      els.flatMap((el) => ["href", "src", "action", "data-suggest"].map((name) => el.getAttribute(name) ?? "")));
    expect(urls.filter((u) => u.includes("?") && !u.startsWith("/@")), path).toEqual([]); // "/@…" are the Vite dev server's own files
    await expect(page.locator('form:not([method="post"])'), path).toHaveCount(0); // a GET form would write its fields into the URL
  };
  for (const path of ["/uk/", "/us/shop/t-shirts", "/de/kollektionen/entwickler-grundausstattung", PRODUCT.uk]) {
    await page.goto(path);
    await check(path);
  }
  await search(page, "uk", "coffee");
  await check("search");
});

test("unknown pages and regions are a 404, /en/ no longer exists", async ({ page }) => {
  expect((await page.goto("/uk/does-not-exist"))?.status()).toBe(404);
  for (const path of ["/fr/", "/en/", "/en/shop/t-shirts", "/en/search"]) expect((await page.goto(path))?.status(), path).toBe(404);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("facets, region switch and search still work", async ({ page }) => {
    await page.goto("/uk/shop/mugs");
    await page.locator('input[name="stock"]').check();
    await page.locator('.facets button[type="submit"]:not([name])').click();
    await expect(page).toHaveURL(/\/uk\/shop\/mugs#range$/); // lands on the range; the filter is in the POST body
    await expect(page.locator('input[name="stock"]')).toBeChecked();
    await page.locator(".regions a", { hasText: "US" }).click();
    await expect(page).toHaveURL(/\/us\/shop\/mugs$/);
    expect(await page.locator(".product-card__price").first().innerText()).toContain("$");
    await page.locator('header input[name="q"]').fill("headless");
    await page.locator('header input[name="q"]').press("Enter");
    await expect(page).toHaveURL(/\/us\/search$/);
    await expect(page.locator('main input[type="search"]')).toHaveValue("headless");
    expect(await cards(page).count()).toBeGreaterThan(0);
  });

  test("'Show more' posts the filters with one batch more", async ({ page }) => {
    await page.goto("/uk/shop");
    await page.locator('input[name="stock"]').check(); // a selection that is not applied yet travels with the button too
    await page.locator(".range__more").click();
    await expect(page).toHaveURL(/\/uk\/shop#range$/);
    await expect(page.locator('input[name="stock"]')).toBeChecked();
    const inStock = await total(page);
    expect(inStock).toBeGreaterThan(BATCH);
    await expect(cards(page)).toHaveCount(Math.min(inStock, 2 * BATCH));
    for (const text of await page.locator(".grid .product-card").allInnerTexts()) expect(text).not.toContain("Sold out");
  });
});

test("every UI text the site prints has its label in NovaDB, placeholders filled", async ({ page }) => {
  // The texts are merchLabel objects; a key the language lacks prints as ⟦key⟧ (also in <title>, aria-labels and the
  // texts handed to the page's script, so the whole HTML is checked, not just what is visible).
  for (const region of ["de", "uk"] as const) {
    const urls = [`/${region}/`, `/${region}/shop`, PRODUCT[region], COLLECTION[region], `/${region}/no-such-page`];
    for (const url of urls) {
      await page.goto(url);
      expect(await page.content(), url).not.toContain("⟦");
      await expect(page.locator("body"), url).not.toContainText(/\{[nq]\}/);
    }
    await search(page, region, "mug");
    expect(await page.content(), `${region} search`).not.toContain("⟦");
    await expect(page.locator("body")).not.toContainText(/\{[nq]\}/);
    await expect(page.locator("h1")).toContainText("mug"); // the search title carries the query
  }
});
