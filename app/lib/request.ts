/**
 * What every route reads from a request: the region from the path (language, texts, market and currency follow from
 * it) and the fields of a POST form. The site neither reads nor writes a query string: a filtered view or a search has
 * no URL of its own, so nothing a visitor typed ends up in a link, a log or the index. Shareable filter URLs are a
 * different design: the range's fetcher, the typeahead and the route discovery mode (`react-router.config.ts`) follow from this rule.
 */
import { data } from "react-router";
import { isRegion, type Region } from "./i18n";

export function notFound(): never {
  throw data(null, { status: 404 });
}

/** The fields of a posted form (filters, sorting, search); a body that is no form is a 400. */
export async function formOf(request: Request): Promise<URLSearchParams> {
  const fields = await request.formData().catch(() => { throw data(null, { status: 400 }); });
  const form = new URLSearchParams();
  for (const [name, value] of fields) if (typeof value === "string") form.append(name, value);
  return form;
}

/** The region (`de`, `uk` or `us`) a route's `:region` segment or the field `lang` of `POST /api/suggest` holds; anything else, e.g. `en`, is a 404. */
export function regionOf(value: unknown): Region {
  return isRegion(value) ? value : notFound();
}
