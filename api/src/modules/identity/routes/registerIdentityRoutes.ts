import type { Router } from "../../../shared/http/router.js";
import { IdentityController } from "../controllers/identityController.js";

export function registerIdentityRoutes(router: Router): void {
  const controller = new IdentityController();

  router.register("GET", "/api/v1/protected", (request, response, context) =>
    controller.getProtected(request, response, context),
  );
  router.register("POST", "/api/v1/auth/sync", (request, response, context) =>
    controller.syncUser(request, response, context),
  );
  router.register("POST", "/api/v1/orgs", (request, response, context) =>
    controller.createOrg(request, response, context),
  );
  router.register("GET", "/api/v1/orgs/me", (request, response, context) =>
    controller.getMyOrg(request, response, context),
  );
  router.register("POST", "/api/v1/orgs/sync", (request, response, context) =>
    controller.syncOrg(request, response, context),
  );
  router.register(
    "POST",
    "/api/v1/org_memberships/sync",
    (request, response) => controller.syncMembership(request, response),
  );
}
