import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/start.ts"),
  route("media/:width/:name", "routes/media-scaled.ts"),
  route("media/:name", "routes/media-file.ts"),
  route("api/suggest", "routes/suggest.ts"),
  route(":region/search", "routes/search.tsx"),
  route(":region/*", "routes/page.tsx"),
] satisfies RouteConfig;
