import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Auth-Routen registrieren (kein CORS nötig bei Next.js — same-origin)
authComponent.registerRoutes(http, createAuth);

export default http;
