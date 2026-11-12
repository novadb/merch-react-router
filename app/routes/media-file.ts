import type { Route } from "./+types/media-file";
import { FILE_NAME, serveMedia } from "~/lib/media.server";

/** GET /media/{md5}{ext}: the file `files/{md5}{ext}`, unchangeable under this name. */
export function loader({ params, request }: Route.LoaderArgs) {
  if (!FILE_NAME.test(params.name)) return new Response("Not found", { status: 404 });
  return serveMedia(`file-${params.name}`, `files/${params.name}`, request);
}
