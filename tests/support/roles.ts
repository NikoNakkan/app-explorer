import path from 'node:path';

/** Roles come from .env: ROLES=admin,clerk,viewer */
export const ROLES: string[] = (process.env.ROLES ?? '')
  .split(',')
  .map((r: string) => r.trim())
  .filter(Boolean);

function envKey(role: string): string {
  return role.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** Credentials for a role, from ROLE_<ROLE>_USER / ROLE_<ROLE>_PASS in .env. */
export function credentials(role: string): { user: string; pass: string } {
  const key = envKey(role);
  const user = process.env[`ROLE_${key}_USER`];
  const pass = process.env[`ROLE_${key}_PASS`];
  if (!user || !pass) throw new Error(`Missing ROLE_${key}_USER / ROLE_${key}_PASS in .env`);
  return { user, pass };
}

/** Where the saved login state for a role lives. Same path the agents pass to browser_set_storage_state. */
export function authFile(role: string): string {
  return path.join('.auth', `${role}.json`);
}
