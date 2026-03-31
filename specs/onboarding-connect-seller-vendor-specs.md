# Onboarding: Connect Seller/Vendor (SP-API)
Purpose: add the next onboarding step after Amazon Ads by allowing users to connect either a Seller Central or Vendor Central account via SP-API OAuth.

## Goals
- Introduce `connect_seller_vendor` as the step after `connect_ads`.
- Provide a UI to choose Seller or Vendor and start OAuth.
- Implement SP-API OAuth callbacks and persist integration metadata.
- Store Seller/Vendor account identifiers in `accounts` and mark integration connected.

## Non-Goals
- Data ingestion, report fetching, or SP-API data sync.
- Multi-marketplace account management beyond a single seller/vendor selection.
- Replacing Clerk or `/api/v1/me` as the onboarding driver.

## Architecture

### Frontend
- `/api/v1/me` determines onboarding step and routes to `/auth/connect-seller-vendor`.
- `/auth/connect-seller-vendor` shows two cards: Seller Central + Vendor Central.
- Clicking a card opens a modal to pick region and starts OAuth.
- OAuth URL is built client-side with NEXT_PUBLIC env vars and redirects the browser.

### Backend
- `/api/v1/me` returns:
  - `create_org` if no org.
  - `connect_ads` if Ads not connected.
  - `connect_seller_vendor` if Ads connected but no seller/vendor connection.
  - `next_step` once seller or vendor is connected.
- OAuth callback exchanges `spapi_oauth_code` for tokens, uses `selling_partner_id`,
  and persists integration metadata.
- Accounts are updated by `account_id` with `seller_id` or `vc_id`.

### Data Flow
1. Ads connected.
2. FE calls `/api/v1/me` → `connect_seller_vendor`.
3. User selects Seller or Vendor and starts OAuth (state includes `account_id`).
4. Callback exchanges token, stores integration + updates account.
5. `/api/v1/me` → `next_step`.

## Endpoint/Interface Summary
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/me` | Returns onboarding step with Seller/Vendor checks | Clerk |
| `GET` | `/api/v1/integrations/amazon-sp/oauth/callback` | Seller/Vendor OAuth callback + persistence | None (state token) |

## Flow Diagram
```mermaid
flowchart TD
  A[Ads connected] --> B[Frontend calls GET /api/v1/me]
  B --> C{Seller/Vendor connected?}
  C -- No --> D[step = connect_seller_vendor]
  D --> E[/auth/connect-seller-vendor]
  E --> F[User chooses Seller or Vendor]
  F --> G[SP-API OAuth callback]
  G --> H[Persist integration + update account]
  H --> B
  C -- Yes --> I[step = next_step]
```

## Implementation Phases

### Phase 1 — Data Model + Constraints
Goal: Support Seller/Vendor identifiers and enforce uniqueness.

Files to create/modify:
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/*`

Tasks:
- [x] **1.1** Add unique constraint on `(clerk_org_id, seller_id)`.
- [x] **1.2** Add unique constraint on `(clerk_org_id, vc_id)`.
- [x] **1.3** Generate and apply Prisma migration.

Verification:
- Migration applies locally and existing ads flows still work.

### Phase 2 — SP-API OAuth Client
Goal: Implement OAuth exchange using the SP-API authorization code.

Files to create/modify:
- `apps/backend/src/modules/integrations/clients/amazon-sp-client.ts` (new)

Tasks:
- [x] **2.1** Implement token exchange based on the reference logic:
  - POST `https://api.amazon.com/auth/o2/token`
  - `grant_type=authorization_code`
  - required `client_id`, `client_secret`, `code`
- [x] **2.2** Return `{ refreshToken, accessToken }` and validate JSON response.

Verification:
- Unit tests cover token exchange parsing and identity parsing with mocked fetch.

### Phase 3 — Integration Service Updates
Goal: Determine whether a seller or vendor connection exists.

Files to create/modify:
- `apps/backend/src/modules/integrations/services/integration-service.ts`

Tasks:
- [x] **3.1** Add `isAmazonSellerConnected(clerkOrgId)`.
- [x] **3.2** Add `isAmazonVendorConnected(clerkOrgId)`.
- [x] **3.3** Add `isSellerOrVendorConnected(clerkOrgId)` helper.

Verification:
- Service functions return correct booleans for connected/disconnected states.

### Phase 4 — `/api/v1/me` Onboarding Step
Goal: Return `connect_seller_vendor` once Ads is connected.

Files to create/modify:
- `apps/backend/src/modules/identity/controllers/identity-controller.ts`

Tasks:
- [x] **4.1** When org exists and Ads connected, check Seller/Vendor connection.
- [x] **4.2** Return `connect_seller_vendor` when neither is connected.
- [x] **4.3** Return `next_step` when Seller or Vendor is connected.

Verification:
- `/api/v1/me` returns `connect_seller_vendor` for Ads-connected orgs without seller/vendor.

### Phase 5 — OAuth Callback Controller
Goal: Handle a shared Seller/Vendor OAuth callback and persist integration state.

Files to create/modify:
- `apps/backend/src/modules/integrations/controllers/amazon-sp-controller.ts` (new)
- `apps/backend/src/modules/integrations/routes.ts`
- `apps/backend/src/modules/accounts/services/account-service.ts`
- `apps/backend/src/modules/accounts/repositories/account-repository.ts`

Tasks:
- [x] **5.1** Add shared Seller/Vendor callback route + handler.
- [x] **5.2** Parse `state` as `orgId,region,accountId,accountType` and validate.
- [x] **5.3** Read `selling_partner_id` + `spapi_oauth_code` from query params.
- [x] **5.4** Exchange `spapi_oauth_code` for tokens using SP-API client.
- [x] **5.5** Upsert `integration_connections` for `amazon_seller` or `amazon_vendor`.
- [x] **5.6** Update account by `account_id` with `seller_id` or `vc_id`.
- [x] **5.7** Redirect to `/auth/connect-seller-vendor?status=success|error`.

Verification:
- Callback stores integration + account and redirects to the FE page.

### Phase 6 — Frontend UI + OAuth URLs
Goal: Add `/auth/connect-seller-vendor` and OAuth helpers.

Files to create/modify:
- `apps/frontend/src/app/auth/connect-seller-vendor/page.tsx` (new)
- `apps/frontend/src/components/integrations/seller-vendor-modal.tsx` (new)
- `apps/frontend/src/components/integrations/store-card.tsx` (reuse)
- `apps/frontend/src/utils/amazon-sp.ts` (new)

Tasks:
- [x] **6.1** Create the page layout to mirror `connect-ads`.
- [x] **6.2** Add cards for Seller + Vendor and open modal on click.
- [x] **6.3** Modal includes region selection + loading states.
- [x] **6.4** Build OAuth URL client-side with `accountType` + `accountId` in state.
- [x] **6.5** Surface errors from query params after redirect.
- [x] **6.6** Wrap query param parsing in a Suspense boundary to satisfy Next.js.

Verification:
- UI renders and redirects for both Seller and Vendor.

### Phase 7 — Onboarding Guard
Goal: Route to Seller/Vendor step when required.

Files to create/modify:
- `apps/frontend/src/app/onboarding-guard.tsx`
- `apps/frontend/src/app/onboarding-guard.test.tsx`

Tasks:
- [x] **7.1** Map `connect_seller_vendor` -> `/auth/connect-seller-vendor`.
- [x] **7.2** Prevent access to the route once step advances.
- [x] **7.3** Add a guard test for `connect_seller_vendor`.

Verification:
- Guard redirects to `/auth/connect-seller-vendor` when required.

### Phase 8 — Tests
Goal: Validate backend onboarding logic and persistence.

Files to create/modify:
- `apps/backend/tests/e2e/*`
- `apps/frontend/tests/*`

Tasks:
- [x] **8.1** `/api/v1/me` returns `connect_seller_vendor` for Ads-connected orgs.
- [x] **8.2** Shared OAuth callback persists integration + account for Seller.
- [x] **8.3** Shared OAuth callback persists integration + account for Vendor.
- [x] **8.4** FE guard redirects for `connect_seller_vendor`.

Verification:
- E2E + frontend tests pass locally.

## Error Handling
- OAuth callback missing `spapi_oauth_code`/`state`/`selling_partner_id` returns 400 and redirects with error.
- Token exchange failures return 500 and log context.
- `/api/v1/me` returns 401 when no Clerk session.

## Code Changes Summary (Targets)
### Backend
- `apps/backend/src/modules/identity/controllers/identity-controller.ts`
  - Add Seller/Vendor connection checks after Ads.
  - Return `connect_seller_vendor` when Ads connected but Seller/Vendor is not.
- `apps/backend/src/modules/integrations/services/integration-service.ts`
  - Add `isAmazonSellerConnected`, `isAmazonVendorConnected`, and `isSellerOrVendorConnected` helpers.
- `apps/backend/src/modules/integrations/clients/amazon-sp-client.ts`
  - Implement OAuth token exchange using `spapi_oauth_code`.
- `apps/backend/src/modules/integrations/controllers/amazon-sp-controller.ts`
  - Parse `state` payload (`orgId,region,accountId,accountType`).
  - Use `selling_partner_id` + `spapi_oauth_code`.
  - Persist integration + update account by `account_id`.
  - Redirect to `/auth/connect-seller-vendor?status=success|error`.
- `apps/backend/src/modules/integrations/routes.ts`
  - Register `GET /api/v1/integrations/amazon-sp/oauth/callback`.
- `apps/backend/src/modules/accounts/repositories/account-repository.ts`
  - Add helpers to update account by id for `seller_id` or `vc_id`.
- `packages/db/prisma/schema.prisma`
  - Add unique constraints for `(clerk_org_id, seller_id)` and `(clerk_org_id, vc_id)`.
- `packages/db/prisma/migrations/*`
  - Create migration for new unique constraints.

### Frontend
- `apps/frontend/src/app/auth/connect-seller-vendor/page.tsx`
  - Add UI with Seller + Vendor cards and modal for region selection.
  - Use redirect query params for success/error messaging.
  - Hardcode `accountId` initially; replace with account picker later.
- `apps/frontend/src/components/integrations/seller-vendor-modal.tsx`
  - Modal UI for region selection and connect CTA.
- `apps/frontend/src/utils/amazon-sp.ts`
  - Build OAuth URL with `accountType` + `accountId` in `state`.
  - Use NEXT_PUBLIC env vars for client id + backend callback URL.
- `apps/frontend/src/app/onboarding-guard.tsx`
  - Map `connect_seller_vendor` to `/auth/connect-seller-vendor`.

## Implementation Order
1. DB schema + migration
2. SP-API clients
3. Integration service checks
4. `/api/v1/me` onboarding logic
5. OAuth callback endpoints
6. Frontend UI + OAuth helpers
7. Onboarding guard updates
8. Tests

## Testing Requirements
- Backend unit tests for token exchange and identity parsing.
- Backend E2E tests for callbacks and `/api/v1/me` step.
- Frontend unit tests for guard redirects and connect UI.

## Code Drafts (Reference Implementation)

### Prisma Model Updates
```prisma
model Account {
  id             String   @id @default(uuid())
  clerk_org_id   String
  profile_id     String?
  seller_id      String?
  vc_id          String?
  currency       String?
  state          String   @default("active")
  name           String?
  account_type   String?
  advertiser_id  String?
  marketplace_id String?
  country_code   String?
  created_at     DateTime @default(now()) @map("created_at")
  updated_at     DateTime @updatedAt @map("updated_at")

  @@unique([clerk_org_id, profile_id])
  @@unique([clerk_org_id, seller_id])
  @@unique([clerk_org_id, vc_id])
  @@map("accounts")
}
```

### SP-API Client
```ts
// apps/backend/src/modules/integrations/clients/amazon-sp-client.ts
const AMAZON_SP_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export const exchangeCodeForTokens = async (code: string) => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.AMAZON_SP_CLIENT_ID ?? "",
    client_secret: process.env.AMAZON_SP_CLIENT_SECRET ?? "",
  });

  const response = await fetch(AMAZON_SP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Host: "api.amazon.com",
    },
    body,
  });

  const data = (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  };

  if (!response.ok || data.error) {
    throw new Error(`Amazon SP-API token error: ${response.status}`);
  }
  if (!data.refresh_token || !data.access_token) {
    throw new Error("Amazon SP-API token response missing fields");
  }

  return { refreshToken: data.refresh_token, accessToken: data.access_token };
};
```

### Shared OAuth Callback Controller
```ts
// apps/backend/src/modules/integrations/controllers/amazon-sp-controller.ts
import { type IncomingMessage, type ServerResponse } from "node:http";
import { ValidationError, respondWithError } from "../../../utils/http-errors.js";
import { requireString } from "../../../utils/validation.js";
import { upsertConnection } from "../repositories/integration-repository.js";
import { exchangeCodeForTokens } from "../clients/amazon-sp-client.js";
import {
  updateAccountSellerId,
  updateAccountVendorId,
} from "../../accounts/services/account-service.js";

const parseState = (rawState: string) => {
  const decoded = decodeURIComponent(rawState);
  const parts = decoded.split(",");
  if (parts.length !== 4) {
    throw new ValidationError("State is invalid");
  }
  const [orgId, region, accountId, accountType] = parts;
  if (!orgId || !region || !accountId) {
    throw new ValidationError("State is invalid");
  }
  if (accountType !== "seller" && accountType !== "vendor") {
    throw new ValidationError("State has invalid connection type");
  }
  return { orgId, region, accountId, accountType };
};

export const handleAmazonSpOAuthCallback = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const sellingPartnerId = requireString(
      url.searchParams.get("selling_partner_id"),
      "selling_partner_id",
    );
    const code = requireString(
      url.searchParams.get("spapi_oauth_code"),
      "spapi_oauth_code",
    );
    const rawState = requireString(url.searchParams.get("state"), "state");
    const { orgId, region, accountId, accountType } = parseState(rawState);

    const { refreshToken, accessToken } = await exchangeCodeForTokens(code);

    const provider =
      accountType === "seller" ? "amazon_seller" : "amazon_vendor";

    await upsertConnection({
      clerkOrgId: orgId,
      provider,
      status: "connected",
      connectedAt: new Date(),
      metadata: {
        connection_type: accountType,
        region,
        refresh_token: refreshToken,
        seller_id: accountType === "seller" ? sellingPartnerId : null,
        vc_id: accountType === "vendor" ? sellingPartnerId : null,
      },
    });

    if (accountType === "seller") {
      await updateAccountSellerId({
        accountId,
        sellerId: sellingPartnerId,
      });
    }

    if (accountType === "vendor") {
      await updateAccountVendorId({
        accountId,
        vendorId: sellingPartnerId,
      });
    }

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    res.writeHead(302, {
      Location: `${frontendUrl}/auth/connect-seller-vendor?status=success`,
    });
    res.end();
  } catch (error) {
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const message = error instanceof Error ? error.message : "Unknown error";
    res.writeHead(302, {
      Location: `${frontendUrl}/auth/connect-seller-vendor?status=error&message=${encodeURIComponent(message)}`,
    });
    res.end();
  }
};
```

### Integrations Routes
```ts
// apps/backend/src/modules/integrations/routes.ts
import { handleAmazonSpOAuthCallback } from "./controllers/amazon-sp-controller.js";

if (
  req.method === "GET" &&
  requestPath === "/api/v1/integrations/amazon-sp/oauth/callback"
) {
  await handleAmazonSpOAuthCallback(req, res);
  return true;
}
```

### Accounts Repository Helpers
```ts
// apps/backend/src/modules/accounts/repositories/account-repository.ts
export const updateAccountSellerId = async (params: {
  accountId: string;
  sellerId: string;
}) => {
  const { accountId, sellerId } = params;
  const updatedAt = new Date();
  const result = await prisma.$queryRaw<Account[]>`
    UPDATE accounts
    SET seller_id = ${sellerId},
        updated_at = ${updatedAt}
    WHERE id = ${accountId}
    RETURNING id, clerk_org_id, seller_id, vc_id
  `;

  return result[0] ?? null;
};

export const updateAccountVendorId = async (params: {
  accountId: string;
  vendorId: string;
}) => {
  const { accountId, vendorId } = params;
  const updatedAt = new Date();
  const result = await prisma.$queryRaw<Account[]>`
    UPDATE accounts
    SET vc_id = ${vendorId},
        updated_at = ${updatedAt}
    WHERE id = ${accountId}
    RETURNING id, clerk_org_id, seller_id, vc_id
  `;

  return result[0] ?? null;
};
```

### Frontend OAuth Helper
```ts
// apps/frontend/src/utils/amazon-sp.ts
const AMAZON_SP_SCOPE = "sellingpartnerapi::notifications";
const AMAZON_SP_RESPONSE_TYPE = "code";

const AMAZON_DOMAIN_BY_REGION: Record<string, string> = {
  EU: "amazon.co.uk",
  NA: "amazon.com",
  FE: "amazon.co.jp",
};

export const buildAmazonSpOAuthUrl = (params: {
  region: string;
  orgId: string;
  accountId: string;
  accountType: "seller" | "vendor";
}) => {
  const { region, orgId, accountId, accountType } = params;
  const clientId = process.env.NEXT_PUBLIC_AMAZON_SP_CLIENT_ID ?? "";
  const redirectUri =
    (process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "") +
    "/api/v1/integrations/amazon-sp/oauth/callback";

  if (!clientId || !redirectUri) {
    throw new Error("Amazon SP-API OAuth environment variables are missing.");
  }

  const domain = AMAZON_DOMAIN_BY_REGION[region] ?? AMAZON_DOMAIN_BY_REGION.NA;
  const state = `${orgId},${region},${accountId},${accountType}`;

  return (
    `https://www.${domain}/ap/oa` +
    `?client_id=${clientId}` +
    `&scope=${encodeURIComponent(AMAZON_SP_SCOPE)}` +
    `&response_type=${AMAZON_SP_RESPONSE_TYPE}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`
  );
};
```

### Frontend Page (Skeleton)
```tsx
// apps/frontend/src/app/auth/connect-seller-vendor/page.tsx
"use client";

import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import StoreCard from "@/components/integrations/store-card";
import SellerVendorModal from "@/components/integrations/seller-vendor-modal";
import { buildAmazonSpOAuthUrl } from "@/utils/amazon-sp";
import { redirectTo } from "@/utils/navigation";

export default function ConnectSellerVendorPage() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const [showModal, setShowModal] = useState(false);
  const [accountType, setAccountType] = useState<"seller" | "vendor">(
    "seller",
  );
  const [region, setRegion] = useState("NA");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    const orgId = organization?.id;
    const accountId = "active-account-id";
    if (!orgId || !accountId) return;

    const url = buildAmazonSpOAuthUrl({
      region,
      orgId,
      accountId,
      accountType,
    });
    redirectTo(url);
  };

  return (
    <main>
      <StoreCard
        name="Amazon Seller Central"
        description="Connect your Seller Central account."
        buttonLabel="Connect Seller"
        onConnect={() => {
          setAccountType("seller");
          setShowModal(true);
        }}
      />
      <StoreCard
        name="Amazon Vendor Central"
        description="Connect your Vendor Central account."
        buttonLabel="Connect Vendor"
        onConnect={() => {
          setAccountType("vendor");
          setShowModal(true);
        }}
      />
      <SellerVendorModal
        isOpen={showModal}
        accountType={accountType}
        selectedRegion={region}
        onRegionChange={setRegion}
        onClose={() => setShowModal(false)}
        onConnect={handleConnect}
        isLoading={isConnecting}
      />
    </main>
  );
}
```

### Onboarding Guard Update
```tsx
// apps/frontend/src/app/onboarding-guard.tsx
if (step === "connect_seller_vendor" && pathname !== "/auth/connect-seller-vendor") {
  router.replace("/auth/connect-seller-vendor");
  return;
}
if (pathname === "/auth/connect-seller-vendor" && step !== "connect_seller_vendor") {
  router.replace("/");
}
```

## Decisions
- Seller OR Vendor connection satisfies the step.
- SP-API OAuth URLs are built client-side using NEXT_PUBLIC env vars.
- Tokens and identity metadata are stored in `integration_connections.metadata`.

## Open Questions
- Exact SP-API scopes and marketplace regions for Seller/Vendor.
- Whether to require a signed `state` token or backend-generated nonce.
- Whether to encrypt refresh tokens at rest.

## Progress
- Completed Phases 1-8.
- Last verified via `npm run typecheck`, `npm run lint`, `npm run test` (iteration 24).
