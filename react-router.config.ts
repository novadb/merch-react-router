import type { Config } from "@react-router/dev/config";

// `initial`: the page carries the manifest of every route (there are six), so the browser never asks the server for
// one while navigating (`/__manifest?p=…`, a URL with a query string).
export default { ssr: true, routeDiscovery: { mode: "initial" } } satisfies Config;
