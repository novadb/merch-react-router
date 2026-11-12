/**
 * A live product range: facet filters as a POST form (the URL stays the page's), sorting and the product grid.
 * Without JavaScript every change is a form the browser posts, answered by the page. In the browser a fetcher posts the
 * same form to the route's action and the range shows its answer in place: no page load, the scroll position and the
 * focused control stay, a card that stays is the same element. "Show more" clicks itself as it comes near the window.
 */
import { useEffect, useLayoutEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { useFetcher } from "react-router";
import { srcSet } from "~/lib/images";
import { RANGE_BATCH, SORTS, type FacetValue, type Product, type RangeData, type Sort } from "~/lib/products";
import { CARD_SIZES, ProductCard, type Ctx } from "./Content";

type Props = {
  ctx: Ctx;
  /** The range as the page was rendered with it; the fetcher's answers replace it. */
  range: RangeData;
  groupNames: Record<number, string>;
  /** Hidden fields that must survive a filter change, e.g. the search query. */
  keep?: Record<string, string>;
};

export function Range({ ctx, range, groupNames, keep = {} }: Props) {
  const { text } = ctx;
  const fetcher = useFetcher<{ range: RangeData }>();
  const { items, total, facets, selection, defaultSort } = fetcher.data?.range ?? range;
  const sorts = SORTS.filter((s) => s !== "relevance" || defaultSort === "relevance");
  const sortLabel: Record<Sort, string> = {
    relevance: text.sortRelevance, name: text.sortName, "price-asc": text.sortPriceAsc, "price-desc": text.sortPriceDesc,
  };

  const section = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const busy = fetcher.state !== "idle";
  const appending = busy && fetcher.formData?.has("shown"); // only "Show more" posts `shown`

  /**
   * Posts the form with the control that submitted it (its name and value travel along, as in the browser's own submit).
   * `flushSync`: the range is marked busy at once, not in a transition that the answer may overtake.
   */
  const post = (submitter: HTMLElement | null) => fetcher.submit((submitter as HTMLButtonElement | null) ?? form.current, { method: "post", flushSync: true });

  function onChange(event: ChangeEvent<HTMLElement>) {
    const control = event.target as HTMLInputElement | HTMLSelectElement;
    // Also the sort <select form="facets"> outside the form. A price applies on Enter or "Apply", not per keystroke.
    if (control.form && control.form === form.current && control.type !== "number" && control.form.reportValidity()) post(null);
  }

  /** A keyboard user who pressed "Show more" goes on with the first new card: its index. */
  const focusFrom = useRef<number>(undefined);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter === more.current) {
      if (busy) return; // a filter change is running: its answer comes first
      if (document.activeElement === submitter) focusFrom.current = items.length;
    }
    post(submitter);
  }

  // "Show more" clicks itself within 600 px of the window. Observed anew after every answer: an observer reports a
  // change of intersection only, and the button may still be near after the cards were added.
  useEffect(() => {
    const button = more.current;
    if (!button || busy) return;
    const nearEnd = new IntersectionObserver(([entry]) => entry.isIntersecting && button.click(), { rootMargin: "600px 0px" });
    nearEnd.observe(button);
    return () => nearEnd.disconnect();
  }, [items, busy]);

  // The last scroll position before an answer is shown: the browser moves it when the page gets shorter.
  const scrolled = useRef(0);
  useEffect(() => {
    const keep = () => (scrolled.current = scrollY);
    keep();
    addEventListener("scroll", keep, { passive: true });
    return () => removeEventListener("scroll", keep);
  }, []);

  const shownFor = useRef(selection);
  useLayoutEffect(() => {
    if (shownFor.current === selection) return; // the first render: nothing was posted yet
    shownFor.current = selection;
    // The fields are the browser's (React sets only their defaults): show what the answer was computed for, e.g. after
    // "Reset". Called on the prototype: the button `name="reset"` hides the form's own `reset`.
    HTMLFormElement.prototype.reset.call(form.current);
    // The scroll position stays. Only when it cannot (the page is now shorter than it) or shows no result any more
    // (they end above the window) the range is shown from its start.
    const el = section.current!;
    const start = parseFloat(getComputedStyle(el).scrollMarginTop); // where the range starts below the sticky header
    if (Math.abs(scrollY - scrolled.current) > 1 || el.lastElementChild!.getBoundingClientRect().bottom < start) el.scrollIntoView({ behavior: "instant" });
    // The card's link takes the focus: one `.product-card__link` per card (`ProductCard`).
    if (focusFrom.current !== undefined) el.querySelectorAll<HTMLElement>(".product-card__link")[focusFrom.current]?.focus();
    focusFrom.current = undefined;
  }, [selection]);

  return (
    <section className="range" id="range" aria-label={text.filter} aria-busy={busy && !appending ? true : undefined} onChange={onChange} ref={section}>
      {/* `#range`: without JavaScript the answer opens at the range. */}
      <form className="facets" id="facets" method="post" action="#range" onSubmit={onSubmit} ref={form}>
        {Object.entries(keep).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        {facets.group.length > 1 && (
          <FacetGroup legend={text.group} name="group" values={facets.group.filter((v) => groupNames[Number(v.value)])} labelOf={(v) => groupNames[Number(v)]} />
        )}
        <FacetGroup legend={text.colour} name="color" values={facets.color} labelOf={text.value} swatchOf={text.swatch} />
        {facets.material.length > 0 && <FacetGroup legend={text.material} name="material" values={facets.material} labelOf={text.value} />}
        <fieldset className="facet">
          <legend>{text.availability}</legend>
          <label className="facet__option">
            <input type="checkbox" name="stock" value="1" defaultChecked={selection.stock} />
            <span>{text.inStock}</span>
            <span className="facet__count">{facets.inStock}</span>
          </label>
        </fieldset>
        <fieldset className="facet facet--price">
          <legend>{text.price}</legend>
          <label>
            <span>{text.from}</span>
            <input type="number" name="min" inputMode="numeric" min={0} placeholder={String(facets.priceMin)} defaultValue={selection.min} />
          </label>
          <label>
            <span>{text.to}</span>
            <input type="number" name="max" inputMode="numeric" min={0} placeholder={String(facets.priceMax)} defaultValue={selection.max} />
          </label>
        </fieldset>
        <div className="facets__actions">
          <button type="submit" className="button">{text.apply}</button>
          <button type="submit" name="reset" value="1" className="button button--ghost">{text.reset}</button>
        </div>
      </form>
      <div className="range__main">
        <div className="range__bar">
          <p className="range__count" aria-live="polite">{text.results(total)}</p>
          <label className="range__sort">
            <span>{text.sort}</span>
            <select name="sort" form="facets" defaultValue={selection.sort ?? defaultSort}>
              {sorts.map((s) => <option key={s} value={s}>{sortLabel[s]}</option>)}
            </select>
          </label>
        </div>
        {total ? (
          <div className="grid" aria-busy={appending ? true : undefined}>{items.map((p, i) => <ProductCard key={p.id} product={p} ctx={ctx} eager={Boolean(fetcher.data) && i < RANGE_BATCH} />)}</div>
        ) : (
          <p className="range__empty">{text.noResults}</p>
        )}
        {/* Posts the filters again with one batch more. */}
        {total > items.length && (
          <button type="submit" form="facets" name="shown" value={selection.shown + RANGE_BATCH} className="button button--ghost range__more" ref={more}>
            {text.showMore}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Loads the pictures of a range's first cards, at most 1.5 s: a filter or sorting that brings a card on screen then
 * shows its picture at once instead of popping it in. The browser picks the same file from `srcset` as for the card.
 */
export async function preloadPictures(items: Product[]) {
  const pictures = items.slice(0, RANGE_BATCH).flatMap((p) => p.image ? [Object.assign(new Image(), { sizes: CARD_SIZES, srcset: srcSet(p.image.src) ?? "", src: p.image.src })] : []);
  await Promise.race([Promise.allSettled(pictures.map((img) => img.decode())), new Promise((done) => setTimeout(done, 1500))]);
}

type FacetGroupProps = {
  legend: string;
  name: string;
  values: FacetValue[];
  labelOf: (value: string) => string;
  /** A colour facet: the swatch of a value, a CSS colour from the PIM. */
  swatchOf?: (value: string) => string | undefined;
};

function FacetGroup(props: FacetGroupProps) {
  if (!props.values.length) return null;
  return (
    <fieldset className="facet">
      <legend>{props.legend}</legend>
      {props.values.map((v) => (
        <label key={v.value} className="facet__option">
          {/* No hit with the other filters: stays listed (the list never changes), but cannot be chosen. */}
          <input type="checkbox" name={props.name} value={v.value} defaultChecked={v.selected} disabled={v.count === 0 && !v.selected} />
          {props.swatchOf && <span className="swatch" style={{ "--swatch": props.swatchOf(v.value) } as React.CSSProperties} aria-hidden="true" />}
          <span>{props.labelOf(v.value)}</span>
          <span className="facet__count">{v.count}</span>
        </label>
      ))}
    </fieldset>
  );
}
