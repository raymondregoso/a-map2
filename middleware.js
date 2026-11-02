// Runs on Vercel before every request: only signed-in JVM Lending employees get the app or its API.
import { next } from "@vercel/functions";
import { readSession } from "./api/_auth.js";

export const config = { runtime: "nodejs" };

// Reachable without signing in: the sign-in page, its API, and the logo files it shows.
const OPEN = new Set(["/login", "/login.html", "/api/login", "/api/logout", "/jvm-logo.png", "/jvm-icon.svg", "/favicon.ico"]);

export default function middleware(request) {
  const url = new URL(request.url);
  if (OPEN.has(url.pathname)) return next();
  if (readSession(request.headers.get("cookie"))) return next({ headers: { "Cache-Control": "private, no-store" } });
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const back = url.pathname + url.search;
  const to = new URL("/login", url);
  if (back !== "/") to.searchParams.set("next", back);
  return Response.redirect(to, 302);
}
