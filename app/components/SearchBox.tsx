/**
 * The search form: a POST to /{region}/search, the query in the field `q`. In the browser the input becomes an ARIA
 * combobox over POST /api/suggest (products and pages while typing, keys ↑ ↓ Enter Esc); without JavaScript it is a plain form.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Form, useFetcher, useNavigate, useRouteLoaderData } from "react-router";
import { useText } from "~/lib/i18n";
import type { loader as rootLoader } from "~/root";
import type { Suggestions } from "~/routes/suggest";

const SUGGEST = "/api/suggest";

/** `large`: the search page's own form, with a button and the query it was posted with. */
export function SearchBox({ large = false, query }: { large?: boolean; query?: string }) {
  const text = useText();
  const region = useRouteLoaderData<typeof rootLoader>("root")!.region;
  const navigate = useNavigate();
  const fetcher = useFetcher<Suggestions>();
  const listId = `suggest-${useId()}`;
  const form = useRef<HTMLFormElement>(null);
  // The combobox exists only where it works: in the browser, after hydration.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [q, setQ] = useState<string>(); // the query the list was asked for; undefined: closed
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const result = q && fetcher.data;
  const open = Boolean(result);
  /** An option leads to a product or page; the last one ("search all") has no address and submits the search form. */
  const options = result ? [...result.products.map((p) => p.url), ...result.pages.map((p) => p.url), undefined] : [];
  const optionId = (index: number) => `${listId}-${index}`;

  function close() {
    setQ(undefined);
    setActive(-1);
  }

  function choose(index: number) {
    const href = options[index];
    close(); // the box stays in the header while the next page loads
    if (href) navigate(href);
    else form.current?.requestSubmit();
  }

  function onInput(value: string) {
    clearTimeout(timer.current);
    const typed = value.trim();
    if (typed.length < 2) return close();
    timer.current = setTimeout(() => {
      setQ(typed);
      setActive(-1);
      fetcher.submit({ lang: region, q: typed }, { method: "post", action: SUGGEST }); // POST: no URL carries a query string
    }, 150);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open) return;
    const step = (by: number) => setActive((active + by + options.length) % options.length);
    if (event.key === "ArrowDown") step(1);
    else if (event.key === "ArrowUp") step(-1);
    else if (event.key === "Escape") close();
    else if (event.key === "Enter" && active >= 0) choose(active);
    else return;
    event.preventDefault();
  }

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /** `aria-selected` of an option: set on all of them once one is highlighted. */
  const selected = (index: number) => (active < 0 ? undefined : index === active);
  const option = (index: number, href: string | undefined, children: React.ReactNode) => (
    <li id={optionId(index)} key={index} className="suggest__option" role="option" data-href={href} aria-selected={selected(index)}
      onMouseDown={(event) => { event.preventDefault(); choose(index); }}>
      {children}
    </li>
  );

  return (
    <Form className={large ? "search search--large" : "search"} role="search" method="post" action={`/${region}/search`} ref={form}>
      <input type="search" name="q" defaultValue={query} placeholder={text.searchPlaceholder} aria-label={text.search} autoComplete="off"
        {...(ready && { role: "combobox", "aria-controls": listId, "aria-autocomplete": "list", "aria-expanded": open })}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        onChange={(event) => onInput(event.target.value)} onKeyDown={onKeyDown} onBlur={() => setTimeout(close, 100)} />
      {ready && (
        <ul id={listId} className="suggest" role="listbox" hidden={!open}>
          {result && (
            <>
              {result.products.length > 0 && <li className="suggest__heading" role="presentation">{text.products}</li>}
              {result.products.map((p, i) => option(i, p.url, <>
                {p.image && <img src={p.image} alt="" width={40} height={40} />}
                <span className="suggest__name">{p.name}</span>
                <span className="suggest__price">{p.price}</span>
              </>))}
              {result.pages.length > 0 && <li className="suggest__heading" role="presentation">{text.pagesFound}</li>}
              {result.pages.map((page, i) => option(result.products.length + i, page.url, <span className="suggest__name">{page.title}</span>))}
              {option(options.length - 1, undefined, <span className="suggest__name suggest__all">{`${text.searchAll} “${q}”`}</span>)}
            </>
          )}
        </ul>
      )}
      {large && <button type="submit" className="button">{text.search}</button>}
    </Form>
  );
}
