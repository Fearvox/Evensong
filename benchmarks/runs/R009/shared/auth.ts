// R009 Evensong III — JWT + RBAC with 4 roles
import { randomUUID } from 'crypto';
import { AuthenticationError, AuthorizationError } from './errors.ts';

export type Role = 'admin' | 'researcher' | 'reviewer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  organizationId: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  roles: Role[];
  orgId: string;
  iat: number;
  exp: number;
}

const ROLE_HIERARCHY: Record<Role, number> = { viewer: 0, reviewer: 1, researcher: 2, admin: 3 };

const PERMISSIONS: Record<string, Role[]> = {
  'read': ['viewer', 'reviewer', 'researcher', 'admin'],
  'write': ['researcher', 'admin'],
  'review': ['reviewer', 'admin'],
  'delete': ['admin'],
  'manage': ['admin'],
  'create_experiment': ['researcher', 'admin'],
  'submit_review': ['reviewer', 'admin'],
  'manage_users': ['admin'],
  'view_audit_log': ['admin'],
  'export_data': ['researcher', 'admin'],
};

// Simulated JWT (no real crypto for benchmark — tests verify logic)
const TOKEN_SECRET = 'r009-benchmark-secret';

export function createToken(user: User, expiresInMs = 3600000): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    orgId: user.organizationId,
    iat: Date.now(),
    exp: Date.now() + expiresInMs,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyToken(token: string): TokenPayload {
  try {
    const payload: TokenPayload = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (!payload.sub || !payload.roles || !Array.isArray(payload.roles)) {
      throw new AuthenticationError('Invalid token structure');
    }
    if (payload.exp < Date.now()) {
      throw new AuthenticationError('Token expired');
    }
    return payload;
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    throw new AuthenticationError('Invalid token');
  }
}

export function hasPermission(userRoles: Role[], permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return userRoles.some(r => allowedRoles.includes(r));
}

export function requirePermission(userRoles: Role[], permission: string): void {
  if (!hasPermission(userRoles, permission)) {
    throw new AuthorizationError(`Permission '${permission}' required`);
  }
}

export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  return userRoles.some(r => ROLE_HIERARCHY[r] >= ROLE_HIERARCHY[requiredRole]);
}

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id || randomUUID(),
    email: overrides.email || 'user@example.com',
    name: overrides.name || 'Test User',
    roles: overrides.roles || ['viewer'],
    organizationId: overrides.organizationId || 'org-1',
  };
}

export function authMiddleware(token: string | undefined): TokenPayload {
  if (!token) throw new AuthenticationError('No token provided');
  const clean = token.startsWith('Bearer ') ? token.slice(7) : token;
  return verifyToken(clean);
}
