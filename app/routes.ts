import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/start.ts"),
  route("media/:md5/:file", "routes/media.ts"),
  route("api/suggest", "routes/suggest.ts"),
  route(":region/search", "routes/search.tsx"),
  route(":region/*", "routes/page.tsx"),
] satisfies RouteConfig;
