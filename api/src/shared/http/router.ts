import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthContext } from "../auth/context.js";
import { resolveAuthContext } from "../auth/context.js";
import { HttpError, isHttpError } from "./errors.js";
import { sendJson } from "./response.js";

export interface RequestContext {
  auth: AuthContext;
  url: URL;
}

export type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
) => Promise<void> | void;

interface RouteDefinition {
  handler: RouteHandler;
  method: string;
  path: string;
}

export class Router {
  readonly #routes: RouteDefinition[] = [];

  register(method: string, path: string, handler: RouteHandler): void {
    this.#routes.push({
      handler,
      method: method.toUpperCase(),
      path,
    });
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = (request.method ?? "GET").toUpperCase();
    const url = new URL(request.url ?? "/", "http://localhost");
    const route = this.#routes.find(
      (candidate) =>
        candidate.method === method && candidate.path === url.pathname,
    );

    if (!route) {
      sendJson(response, 404, { error: "Not Found" });
      return;
    }

    const context: RequestContext = {
      auth: resolveAuthContext(request),
      url,
    };

    try {
      await route.handler(request, response, context);
    } catch (error) {
      if (isHttpError(error)) {
        sendJson(response, error.statusCode, {
          details: error.details,
          error: error.message,
        });
        return;
      }

      sendJson(
        response,
        500,
        {
          error: "Internal Server Error",
        },
      );
    }
  }
}

export function requireUser(context: RequestContext): string {
  if (!context.auth.userId) {
    throw new HttpError(401, "Unauthorized");
  }

  return context.auth.userId;
}
