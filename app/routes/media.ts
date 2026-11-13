import type { Route } from "./+types/media";
import { MEDIA_WIDTHS } from "~/lib/images";
import { FILE_NAME, serveOriginal, serveScaled } from "~/lib/media.server";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * GET /media/{md5}/original{ext}: the file `files/{md5}{ext}`.
 * GET /media/{md5}/{width}{ext}.webp: the same file scaled to one of `MEDIA_WIDTHS` as WebP. SVG stays vector: it has no variant.
 * The name keeps the extension because NovaDB serves a file only under it. Neither can change under its name.
 */
export function loader({ params, request }: Route.LoaderArgs) {
  const original = params.file.match(/^original(\.[a-z0-9]{1,5})$/);
  if (original) return FILE_NAME.test(params.md5 + original[1]) ? serveOriginal(params.md5, original[1], request) : notFound();

  const variant = params.file.match(/^(\d+)(\.[a-z0-9]{1,5})\.webp$/);
  const width = MEDIA_WIDTHS.find((w) => String(w) === variant?.[1]); // not `Number()`: it would also read `0x190` and `4e2` as 400
  if (!variant || !width || variant[2] === ".svg" || !FILE_NAME.test(params.md5 + variant[2])) return notFound();
  return serveScaled(params.md5, variant[2], width, request);
}
