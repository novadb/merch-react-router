/** Pictures by file object ID → the unchangeable URLs of the media proxy (`app/lib/media.server.ts`). */
import { list, type NovaObject } from "./delivery.server";
import type { Image } from "./images";
import { IMAGE, TYPE } from "./schema";

/**
 * Images by file object ID from objects the API delivered (the `refs` of a read with `resolve`): a content object only
 * holds the file object's ID, and the hash that names the file is on that object. An image without hash or extension has no file and is left out.
 */
export function toImages(objs: NovaObject[]): Map<number, Image> {
  const images = new Map<number, Image>();
  for (const { meta, props } of objs) {
    if (!props[IMAGE.md5] || !props[IMAGE.extension]) continue;
    images.set(meta.id, { src: `/media/${props[IMAGE.md5]}${props[IMAGE.extension]}` });
  }
  return images;
}

/** The images of pages and documents, whose IDs are known beforehand (a document node names its image by ID). The type is language-neutral, `en-US` only satisfies the request. */
export async function imagesByIds(ids: number[]): Promise<Map<number, Image>> {
  if (!ids.length) return new Map();
  return toImages((await list(TYPE.image, { lang: "en-US", filter: `meta.id = ${ids.join(", ")}` })).objs);
}
