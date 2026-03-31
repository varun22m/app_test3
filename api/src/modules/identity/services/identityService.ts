import type { AuthContext } from "../../../shared/auth/context.js";
import { HttpError } from "../../../shared/http/errors.js";
import {
  identityRepository,
  type IdentityRepository,
} from "../repositories/identityRepository.js";
import type {
  OrgMembershipRequestDto,
  OrgMembershipResponseDto,
  OrgRequestDto,
  OrgResponseDto,
  ProtectedResponseDto,
  SyncUserRequestDto,
  SyncUserResponseDto,
} from "../types/dtos.js";

export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository = identityRepository,
  ) {}

  getProtected(auth: AuthContext): ProtectedResponseDto {
    if (!auth.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    return {
      orgId: auth.orgId,
      userId: auth.userId,
    };
  }

  syncUser(
    input: SyncUserRequestDto,
    auth: AuthContext,
  ): SyncUserResponseDto {
    const userId = input.userId ?? auth.userId;

    if (!userId) {
      throw new HttpError(400, "userId is required");
    }

    return this.repository.syncUser({
      email: input.email ?? null,
      name: input.name ?? null,
      orgId: auth.orgId,
      userId,
    });
  }

  createOrg(input: OrgRequestDto, auth: AuthContext): OrgResponseDto {
    if (!auth.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    assertNonEmpty(input.id, "id");
    assertNonEmpty(input.name, "name");

    return this.repository.createOrUpdateOrg(input, auth.userId);
  }

  getMyOrg(auth: AuthContext): OrgResponseDto {
    if (!auth.orgId) {
      throw new HttpError(404, "Organization not found");
    }

    const org = this.repository.getOrg(auth.orgId);

    if (!org) {
      throw new HttpError(404, "Organization not found");
    }

    return org;
  }

  syncOrg(input: OrgRequestDto, auth: AuthContext): OrgResponseDto {
    if (!auth.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    assertNonEmpty(input.id, "id");
    assertNonEmpty(input.name, "name");

    return this.repository.createOrUpdateOrg(input, auth.userId);
  }

  syncMembership(
    input: OrgMembershipRequestDto,
  ): OrgMembershipResponseDto {
    assertNonEmpty(input.orgId, "orgId");
    assertNonEmpty(input.role, "role");
    assertNonEmpty(input.userId, "userId");

    return this.repository.syncMembership(input);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
}
