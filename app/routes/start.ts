import { redirect } from "react-router";
import type { Route } from "./+types/start";

/** English language tags that get British English (the `uk` region) rather than US English. */
const UK_TAGS = /^en-(gb|ie|au|nz|za|in|sg)\b/;

/** `/` → the visitor's region: `/de/` for German browsers, `/uk/` for British English and its neighbours, else `/us/`. */
export function loader({ request }: Route.LoaderArgs) {
  const preferred = request.headers.get("Accept-Language")?.split(",")[0]?.trim().toLowerCase() ?? "";
  return redirect(preferred.startsWith("de") ? "/de/" : UK_TAGS.test(preferred) ? "/uk/" : "/us/");
}
