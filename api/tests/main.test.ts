import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { after, test } from "node:test";

const issuer = "https://clerk.test";
const keyId = "test-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

process.env.CLERK_ISSUER = issuer;
process.env.CLERK_JWKS_JSON = JSON.stringify({
  keys: [
    {
      ...publicKey.export({ format: "jwk" }),
      alg: "RS256",
      kid: keyId,
      use: "sig",
    },
  ],
});

const { createApp } = await import("../src/main.js");

const app = createApp();

await new Promise<void>((resolve) => {
  app.listen(0, () => resolve());
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    app.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

function getBaseUrl(): string {
  const address = app.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to an ephemeral port");
  }

  return `http://127.0.0.1:${address.port}`;
}

test("GET /api/health returns ok", async () => {
  const response = await fetch(`${getBaseUrl()}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("GET /api/v1/protected requires auth context", async () => {
  const response = await fetch(`${getBaseUrl()}/api/v1/protected`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    details: null,
    error: "Unauthorized",
  });
});

test("POST /api/v1/orgs and GET /api/v1/orgs/me share identity state", async () => {
  const token = createSessionToken({
    org_id: "org_123",
    sub: "user_123",
  });

  const createResponse = await fetch(`${getBaseUrl()}/api/v1/orgs`, {
    body: JSON.stringify({ id: "org_123", name: "Acme" }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(createResponse.status, 201);
  assert.deepEqual(await createResponse.json(), {
    createdBy: "user_123",
    id: "org_123",
    name: "Acme",
  });

  const readResponse = await fetch(`${getBaseUrl()}/api/v1/orgs/me`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(readResponse.status, 200);
  assert.deepEqual(await readResponse.json(), {
    createdBy: "user_123",
    id: "org_123",
    name: "Acme",
  });
});

function createSessionToken(claims: Record<string, string>): string {
  const encodedHeader = encodeBase64Url({
    alg: "RS256",
    kid: keyId,
    typ: "JWT",
  });
  const encodedPayload = encodeBase64Url({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
    iss: issuer,
  });
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    privateKey,
  );

  return `${encodedHeader}.${encodedPayload}.${signature.toString("base64url")}`;
}

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
