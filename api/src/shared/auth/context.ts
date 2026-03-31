import type { IncomingMessage } from "node:http";
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

import { getConfig } from "../../config/env.js";
import { HttpError } from "../http/errors.js";

export interface AuthContext {
  userId: string | null;
  orgId: string | null;
}

interface ClerkJwk extends JsonWebKey {
  alg?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
}

interface ClerkJwksResponse {
  keys?: ClerkJwk[];
}

interface ClerkSessionClaims {
  exp?: number;
  iss?: string;
  nbf?: number;
  orgId?: string | null;
  org_id?: string | null;
  sub?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

const jwksCache = new Map<string, Promise<Map<string, ClerkJwk>>>();

export async function resolveAuthContext(
  request: IncomingMessage,
): Promise<AuthContext> {
  const token = readBearerToken(request);

  if (!token) {
    return { orgId: null, userId: null };
  }

  const claims = await verifyClerkToken(token);

  return {
    orgId: claims.org_id ?? claims.orgId ?? null,
    userId: claims.sub ?? null,
  };
}

function readBearerToken(request: IncomingMessage): string | null {
  const value = request.headers.authorization;

  if (Array.isArray(value)) {
    return extractBearerToken(value[0]);
  }

  return extractBearerToken(value);
}

function extractBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Unauthorized");
  }

  return token;
}

async function verifyClerkToken(token: string): Promise<ClerkSessionClaims> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new HttpError(401, "Unauthorized");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonSegment<JwtHeader>(encodedHeader);
  const payload = parseJsonSegment<ClerkSessionClaims>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new HttpError(401, "Unauthorized");
  }

  const { clerkIssuer } = getConfig();

  if (clerkIssuer && payload.iss !== clerkIssuer) {
    throw new HttpError(401, "Unauthorized");
  }

  validateExpiry(payload);

  const jwk = await getJwk(header.kid);
  const verifierInput = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = decodeBase64Url(encodedSignature);
  const isValidSignature = verify(
    "RSA-SHA256",
    verifierInput,
    createPublicKey({ format: "jwk", key: jwk as JsonWebKey }),
    signature,
  );

  if (!isValidSignature || !payload.sub) {
    throw new HttpError(401, "Unauthorized");
  }

  return payload;
}

function validateExpiry(payload: ClerkSessionClaims): void {
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.nbf === "number" && payload.nbf > now) {
    throw new HttpError(401, "Unauthorized");
  }

  if (typeof payload.exp === "number" && payload.exp <= now) {
    throw new HttpError(401, "Unauthorized");
  }
}

async function getJwk(kid: string): Promise<ClerkJwk> {
  const jwks = await getJwks();
  const jwk = jwks.get(kid);

  if (!jwk) {
    throw new HttpError(401, "Unauthorized");
  }

  return jwk;
}

async function getJwks(): Promise<Map<string, ClerkJwk>> {
  const { clerkJwksJson, clerkJwksUrl } = getConfig();
  const cacheKey = clerkJwksJson ?? clerkJwksUrl;

  if (!cacheKey) {
    throw new HttpError(401, "Unauthorized");
  }

  const cachedJwks = jwksCache.get(cacheKey);

  if (cachedJwks) {
    return cachedJwks;
  }

  const loadPromise = loadJwks(clerkJwksJson, clerkJwksUrl);
  jwksCache.set(cacheKey, loadPromise);
  return loadPromise;
}

async function loadJwks(
  clerkJwksJson: string | null,
  clerkJwksUrl: string | null,
): Promise<Map<string, ClerkJwk>> {
  const rawJwks = clerkJwksJson
    ? parseRawJwks(clerkJwksJson)
    : await fetchRemoteJwks(clerkJwksUrl);

  const jwks = new Map<string, ClerkJwk>();

  for (const key of rawJwks.keys ?? []) {
    if (key.kid) {
      jwks.set(key.kid, key);
    }
  }

  if (jwks.size === 0) {
    throw new HttpError(401, "Unauthorized");
  }

  return jwks;
}

function parseRawJwks(clerkJwksJson: string): ClerkJwksResponse {
  try {
    return JSON.parse(clerkJwksJson) as ClerkJwksResponse;
  } catch {
    throw new HttpError(401, "Unauthorized");
  }
}

async function fetchRemoteJwks(clerkJwksUrl: string | null): Promise<ClerkJwksResponse> {
  if (!clerkJwksUrl) {
    throw new HttpError(401, "Unauthorized");
  }

  const response = await fetch(clerkJwksUrl);

  if (!response.ok) {
    throw new HttpError(401, "Unauthorized");
  }

  return (await response.json()) as ClerkJwksResponse;
}

function parseJsonSegment<T>(value: string): T {
  try {
    return JSON.parse(decodeBase64Url(value).toString("utf8")) as T;
  } catch {
    throw new HttpError(401, "Unauthorized");
  }
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
