import type {
  OrgMembershipRequestDto,
  OrgMembershipResponseDto,
  OrgRequestDto,
  OrgResponseDto,
  SyncUserResponseDto,
} from "../../modules/identity/types/dtos.js";

export interface IdentityDatabase {
  createOrUpdateOrg(input: OrgRequestDto, createdBy: string): OrgResponseDto;
  getOrg(orgId: string): OrgResponseDto | null;
  syncMembership(input: OrgMembershipRequestDto): OrgMembershipResponseDto;
  syncUser(record: SyncUserResponseDto): SyncUserResponseDto;
}

class InMemoryIdentityDatabase implements IdentityDatabase {
  readonly #memberships = new Map<string, OrgMembershipResponseDto>();

  readonly #orgs = new Map<string, OrgResponseDto>();

  readonly #users = new Map<string, SyncUserResponseDto>();

  syncUser(record: SyncUserResponseDto): SyncUserResponseDto {
    this.#users.set(record.userId, record);
    return record;
  }

  createOrUpdateOrg(input: OrgRequestDto, createdBy: string): OrgResponseDto {
    const record: OrgResponseDto = {
      ...input,
      createdBy,
    };

    this.#orgs.set(input.id, record);
    return record;
  }

  getOrg(orgId: string): OrgResponseDto | null {
    return this.#orgs.get(orgId) ?? null;
  }

  syncMembership(
    input: OrgMembershipRequestDto,
  ): OrgMembershipResponseDto {
    this.#memberships.set(
      `${input.orgId}:${input.userId}`,
      input,
    );
    return input;
  }
}

const identityDatabase = new InMemoryIdentityDatabase();

export function getIdentityDatabase(): IdentityDatabase {
  return identityDatabase;
}
