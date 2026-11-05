import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { OrgRoleName } from '@rydo/shared';

export interface AuthContext {
  userId: string;
  sessionId: string;
  viaCookie: boolean;
}

export interface OrgContext {
  organizationId: string;
  membershipId: string;
  roles: OrgRoleName[];
}

export type RydoRequest = Request & { auth?: AuthContext; org?: OrgContext };

/** The signed-in user (set by JwtAuthGuard). */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RydoRequest>().auth!);

/** The selected company, membership and roles (set by OrgGuard). */
export const Org = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RydoRequest>().org!);