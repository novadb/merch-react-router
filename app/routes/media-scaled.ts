import type { Route } from "./+types/media-scaled";
import { MEDIA_WIDTHS } from "~/lib/images";
import { FILE_NAME, serveScaled } from "~/lib/media.server";

/** GET /media/{width}/{md5}{ext}: the file `files/{md5}{ext}` scaled to one of `MEDIA_WIDTHS` as WebP; unchangeable under this name. SVG stays vector: it has no scaled variant. */
export function loader({ params, request }: Route.LoaderArgs) {
  const width = MEDIA_WIDTHS.find((w) => String(w) === params.width); // not `Number()`: it would also read `0x190` and `4e2` as 400
  if (!width ||!FILE_NAME.test(params.name) || params.name.endsWith(".svg")) return new Response("Not found", { status: 404 });
  return serveScaled(params.name, width, request);
}
