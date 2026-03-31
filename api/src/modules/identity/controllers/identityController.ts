import type { IncomingMessage, ServerResponse } from "node:http";

import type { RequestContext } from "../../../shared/http/router.js";
import { sendJson } from "../../../shared/http/response.js";
import { readJsonBody } from "../../../shared/utils/readJsonBody.js";
import { IdentityService } from "../services/identityService.js";
import type {
  OrgMembershipRequestDto,
  OrgRequestDto,
  SyncUserRequestDto,
} from "../types/dtos.js";

export class IdentityController {
  constructor(private readonly identityService: IdentityService = new IdentityService()) {}

  getProtected(
    _request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext,
  ): void {
    sendJson(response, 200, this.identityService.getProtected(context.auth));
  }

  async syncUser(
    request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext,
  ): Promise<void> {
    const body = await readJsonBody<SyncUserRequestDto>(request);
    sendJson(response, 200, this.identityService.syncUser(body, context.auth));
  }

  async createOrg(
    request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext,
  ): Promise<void> {
    const body = await readJsonBody<OrgRequestDto>(request);
    sendJson(response, 201, this.identityService.createOrg(body, context.auth));
  }

  getMyOrg(
    _request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext,
  ): void {
    sendJson(response, 200, this.identityService.getMyOrg(context.auth));
  }

  async syncOrg(
    request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext,
  ): Promise<void> {
    const body = await readJsonBody<OrgRequestDto>(request);
    sendJson(response, 200, this.identityService.syncOrg(body, context.auth));
  }

  async syncMembership(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await readJsonBody<OrgMembershipRequestDto>(request);
    sendJson(response, 200, this.identityService.syncMembership(body));
  }
}
