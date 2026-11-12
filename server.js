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
app.all("/{*splat}", createRequestHandler({ build }));
app.listen(process.env.PORT ?? 3000);
