import type { IncomingMessage } from "node:http";

export interface AuthContext {
  userId: string | null;
  orgId: string | null;
}

export function resolveAuthContext(request: IncomingMessage): AuthContext {
  const userId = readHeader(request, "x-user-id");
  const orgId = readHeader(request, "x-org-id");

  return { userId, orgId };
}

function readHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}
