import {
  getIdentityDatabase,
  type IdentityDatabase,
} from "../../../shared/db/database.js";
import type {
  OrgMembershipRequestDto,
  OrgMembershipResponseDto,
  OrgRequestDto,
  OrgResponseDto,
  SyncUserResponseDto,
} from "../types/dtos.js";

export class IdentityRepository {
  constructor(
    private readonly database: IdentityDatabase = getIdentityDatabase(),
  ) {}

  syncUser(record: SyncUserResponseDto): SyncUserResponseDto {
    return this.database.syncUser(record);
  }

  createOrUpdateOrg(input: OrgRequestDto, createdBy: string): OrgResponseDto {
    return this.database.createOrUpdateOrg(input, createdBy);
  }

  getOrg(orgId: string): OrgResponseDto | null {
    return this.database.getOrg(orgId);
  }

  syncMembership(
    input: OrgMembershipRequestDto,
  ): OrgMembershipResponseDto {
    return this.database.syncMembership(input);
  }
}

export const identityRepository = new IdentityRepository();
