import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { createContext } from "../../server/_core/context";
import { appRouter } from "../../server/routers";

/**
 * Vercel Serverless Function - tRPC API handler
 * Routes: /api/trpc/* to this file via Vercel file-based routing.
 * Vercel passes the full URL so we mount at /api/trpc to strip the prefix.
 * All safety.* procedures are public and run fully in-memory (no DB needed).
 */

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}