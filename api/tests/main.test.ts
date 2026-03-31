import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createApp } from "../src/main.js";

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
  const createResponse = await fetch(`${getBaseUrl()}/api/v1/orgs`, {
    body: JSON.stringify({ id: "org_123", name: "Acme" }),
    headers: {
      "content-type": "application/json",
      "x-org-id": "org_123",
      "x-user-id": "user_123",
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
      "x-org-id": "org_123",
      "x-user-id": "user_123",
    },
  });

  assert.equal(readResponse.status, 200);
  assert.deepEqual(await readResponse.json(), {
    createdBy: "user_123",
    id: "org_123",
    name: "Acme",
  });
});
