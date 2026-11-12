// The site's server: what `react-router-serve` does, plus the one setting it has no switch for.
import { createRequestHandler } from "@react-router/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import * as build from "./build/server/index.js";

const app = express();
app.disable("x-powered-by");
// TLS ends at the ingress: believe its X-Forwarded-Proto and -Host, so that request.url is the public https URL.
// React Router compares it with the Origin header of a posted form and answers 400 when they differ.
// Remove the line where the site is reached directly, without a proxy: a client could then forge those headers.
app.set("trust proxy", true);
app.use(compression());
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(morgan("tiny"));
// One URL per page: `/de` → `/de/` (a region's home page) and `/de/shop/` → `/de/shop`, query string kept. Here and not in a
// loader: for a data request of `/de/` (the client router's navigation) a loader sees `/de`, redirects to `/de/`, which
// asks for the same data again, for ever. A data request ends in `.data` and is never matched here.
app.use((req, res, next) => {
  const [path, search = ""] = req.originalUrl.split(/\?(.*)/s);
  const wanted = /^\/(de|uk|us)$/.test(path) ? `${path}/` : path.length > 4 ? path.replace(/\/+$/, "") : path;
  if ((req.method === "GET" || req.method === "HEAD") && wanted !== path) return res.redirect(301, wanted + (search && `?${search}`));
  next();
});
app.all("/{*splat}", createRequestHandler({ build }));
app.listen(process.env.PORT ?? 3000);
