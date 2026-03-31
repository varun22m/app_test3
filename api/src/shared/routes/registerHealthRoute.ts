import type { Router } from "../http/router.js";
import { sendJson } from "../http/response.js";

export function registerHealthRoute(router: Router): void {
  router.register("GET", "/api/health", (_request, response) => {
    sendJson(response, 200, { status: "ok" });
  });
}
