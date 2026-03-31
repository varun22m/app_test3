import { createServer, type Server } from "node:http";

import { getConfig } from "./config/env.js";
import { registerAnalyticsRoutes } from "./modules/analytics/routes/registerAnalyticsRoutes.js";
import { registerAccountRoutes } from "./modules/accounts/routes/registerAccountRoutes.js";
import { registerIdentityRoutes } from "./modules/identity/routes/registerIdentityRoutes.js";
import { registerIntegrationRoutes } from "./modules/integrations/routes/registerIntegrationRoutes.js";
import { Router } from "./shared/http/router.js";
import { registerHealthRoute } from "./shared/routes/registerHealthRoute.js";

export function createApp(): Server {
  const router = new Router();

  registerHealthRoute(router);
  registerIdentityRoutes(router);
  registerAccountRoutes(router);
  registerIntegrationRoutes(router);
  registerAnalyticsRoutes(router);

  return createServer((request, response) => {
    void router.handle(request, response);
  });
}

export function startServer(): Server {
  const app = createApp();
  const { port } = getConfig();

  app.listen(port);
  return app;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  startServer();
}
