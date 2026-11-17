/**
 * What every route reads from a request: the region from the path (language, texts, market and currency follow from
 * it) and the query string, whose fields are those of the range and search forms. The state of a filtered view is the
 * address, so it can be shared and Back returns to the one before; a name no form uses changes nothing.
 */
import { data } from "react-router";
import { isRegion, type Region } from "./i18n";

export function notFound(): never {
  throw data(null, { status: 404 });
}

/** The query string's fields (filters, sorting, search). */
export const queryOf = (request: Request) => new URL(request.url).searchParams;

/** The region (`de`, `uk` or `us`) a route's `:region` segment or the parameter `lang` of `/api/suggest` holds; anything else, e.g. `en`, is a 404. */
export function regionOf(value: unknown): Region {
  return isRegion(value) ? value : notFound();
}
