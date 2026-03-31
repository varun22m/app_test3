export interface ProtectedResponseDto {
  orgId: string | null;
  userId: string;
}

export interface SyncUserRequestDto {
  email?: string;
  name?: string;
  userId?: string;
}

export interface SyncUserResponseDto {
  email: string | null;
  name: string | null;
  orgId: string | null;
  userId: string;
}

export interface OrgRequestDto {
  id: string;
  name: string;
}

export interface OrgResponseDto extends OrgRequestDto {
  createdBy: string;
}

export interface OrgMembershipRequestDto {
  orgId: string;
  role: string;
  userId: string;
}

export interface OrgMembershipResponseDto extends OrgMembershipRequestDto {}
