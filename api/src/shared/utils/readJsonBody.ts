import type { IncomingMessage } from "node:http";

import { HttpError } from "../http/errors.js";

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    throw new HttpError(400, "Request body is required");
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(rawBody) as T;
  } catch (error) {
    throw new HttpError(400, "Request body must be valid JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
