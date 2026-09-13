import { afterEach, describe, expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyBusinessLogin, verifySavedBusinessSession } from '../src/lib/business-login';
import { beginWorkspaceTransition, endWorkspaceTransition, workspaceFetch } from '../src/lib/workspace-transition';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; endWorkspaceTransition(); });

function client(options: { badPassword?: boolean; badSavedSession?: boolean; businessId?: string | null; role?: string; business?: boolean; conflict?: boolean; queryError?: boolean } = {}) {
  const businessId = options.businessId === undefined ? 'business-b' : options.businessId;
  const authUser = { id: 'user-b', email: 'b@example.com' };
  const rows: Record<string, unknown> = {
    profiles: { id: 'user-b', email: 'b@example.com', name: 'User B', business_id: businessId, role: options.role ?? 'staff' },
    team_members: { business_id: options.conflict ? 'business-c' : businessId, role: options.role ?? 'staff' },
    businesses: options.business === false ? null : { id: businessId, name: 'Business B' },
  };
  const session = { access_token: 'test-only', refresh_token: 'test-only', expires_in: 3600, token_type: 'bearer', user: authUser };
  return {
    auth: {
      signInWithPassword: async () => ({
        error: options.badPassword ? new Error('Invalid credentials') : null,
        data: { user: authUser, session },
      }),
      setSession: async () => ({
        error: options.badSavedSession ? new Error('Expired') : null,
        data: { session: options.badSavedSession ? null : { ...session, access_token: 'saved-access', refresh_token: 'saved-refresh' } },
      }),
      getUser: async () => ({
        error: options.badSavedSession ? new Error('Expired') : null,
        data: { user: options.badSavedSession ? null : authUser },
      }),
    },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: rows[table], error: options.queryError ? new Error('Denied') : null,
      }) }) }),
    }),
  } as unknown as SupabaseClient;
}

describe('existing business verification', () => {
  test('retains the verified business role instead of elevating staff', async () => {
    const result = await verifyBusinessLogin(client(), 'b@example.com', 'password', 'business-b');
    expect(result.user.businessId).toBe('business-b');
    expect(result.user.role).toBe('staff');
    expect(result.businessName).toBe('Business B');
  });
  test('rejects wrong credentials before any switch', async () => {
    await expect(verifyBusinessLogin(client({ badPassword: true }), 'b@example.com', 'wrong')).rejects.toThrow('Check your email');
  });
  test('rejects a login for a different saved business', async () => {
    await expect(verifyBusinessLogin(client(), 'b@example.com', 'password', 'business-a')).rejects.toThrow('different business');
  });
  test('opens a saved business session without a password', async () => {
    const result = await verifySavedBusinessSession(client(), {
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'user-b', email: 'b@example.com' },
    } as never, 'business-b');
    expect(result.user.businessId).toBe('business-b');
    expect(result.user.role).toBe('staff');
    expect(result.session.access_token).toBe('saved-access');
  });
  test('rejects an expired saved business session', async () => {
    await expect(verifySavedBusinessSession(client({ badSavedSession: true }), {
      access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'user-b', email: 'b@example.com' },
    } as never, 'business-b')).rejects.toThrow('saved sign-in expired');
  });
  test('requires an existing business and valid membership', async () => {
    for (const options of [{ businessId: null }, { business: false }, { conflict: true }, { role: 'unknown' }, { queryError: true }]) {
      await expect(verifyBusinessLogin(client(options), 'b@example.com', 'password')).rejects.toThrow();
    }
  });
});

describe('workspace request barrier', () => {
  test('drains previous requests and discards their late responses', async () => {
    let finish!: (response: Response) => void;
    globalThis.fetch = (() => new Promise<Response>((resolve) => { finish = resolve; })) as unknown as typeof fetch;
    const oldRequest = workspaceFetch('https://example.com/rest/v1/orders').catch((error) => error);
    const transition = beginWorkspaceTransition();
    await expect(workspaceFetch('https://example.com/rest/v1/customers')).rejects.toThrow('switch in progress');
    finish(new Response('[{"id":"old-business-order"}]'));
    await transition;
    expect((await oldRequest).message).toContain('previous business');
    endWorkspaceTransition();
    globalThis.fetch = (async () => new Response('[]')) as unknown as typeof fetch;
    expect(await (await workspaceFetch('https://example.com/rest/v1/orders')).json()).toEqual([]);
  });
  test('still allows session installation while business requests are blocked', async () => {
    await beginWorkspaceTransition();
    globalThis.fetch = (async () => new Response('{}')) as unknown as typeof fetch;
    expect((await workspaceFetch('https://example.com/auth/v1/user')).status).toBe(200);
    await expect(beginWorkspaceTransition()).rejects.toThrow('already in progress');
  });
});
