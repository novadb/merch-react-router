/** Picture URLs of the media proxy (`app/lib/media.server.ts`) and their scaled variants, for server and browser. */

/** `src`: the file by content address, `/media/{md5}{extension}`. */
export type Image = { src: string };

/** Widths of the scaled variants (`/media/{width}/{md5}{ext}`): a fixed list, so the cache cannot be filled with arbitrary sizes. */
export const MEDIA_WIDTHS = [400, 800, 1200, 1600];

/** The file name of a picture URL `/media/{md5}{ext}` that has scaled variants (`/media/{width}/{md5}{ext}`): not SVG, which is vector, nor a URL that is not a media file. */
function scalable(src: string): string | undefined {
  const name = src.match(/^\/media\/([^/]+)$/)?.[1];
  return name?.endsWith(".svg") ? undefined : name;
}

/** `srcset` of a picture URL: all its scaled variants; undefined for SVG and for a URL that is not a media file. */
export function srcSet(src: string): string | undefined {
  const name = scalable(src);
  return name && MEDIA_WIDTHS.map((w) => `/media/${w}/${name} ${w}w`).join(", ");
}

/** The smallest scaled variant of a picture URL, for small pictures such as the typeahead's; SVG stays as it is. */
export function smallSrc(src: string): string {
  const name = scalable(src);
  return name ? `/media/${MEDIA_WIDTHS[0]}/${name}` : src;
}
