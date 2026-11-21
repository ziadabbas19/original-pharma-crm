/**
 * A fake API for browser checks that only need the client: a signed-in session with the given
 * grants, empty lists for everything else, and per-test answers on top. See page.mockApi.
 */

export const ADMIN_GRANTS = [
  'users:read',
  'users:manage',
  'users:create',
  'users:reset-password',
  'roles:read',
  'territories:read',
  'customers:read',
  'visits:read',
  'orders:read',
  'products:read',
  'stats:read',
  'audit:read',
  'settings:manage',
].map((key) => ({ key, scope: 'all' }))

export function profile(overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.test',
    fullName: 'Test Admin',
    preferredLanguage: 'en',
    roles: [
      {
        id: '00000000-0000-0000-0000-0000000000a1',
        key: 'Admin',
        nameAr: 'مدير النظام',
        nameEn: 'System admin',
        level: 0,
      },
    ],
    managerId: null,
    territoryId: null,
    mustChangePassword: false,
    ...overrides,
  }
}

/**
 * handler(request) for page.mockApi. `routes` maps "METHOD /path" to a reply or a function of the
 * request; unknown GETs answer an empty list, other verbs 204.
 */
export function mockSession({ grants = ADMIN_GRANTS, user = profile(), routes = {} } = {}) {
  return (request) => {
    const key = `${request.method} ${request.path}`
    if (key in routes) {
      const route = routes[key]
      return typeof route === 'function' ? route(request) : route
    }
    if (key === 'POST /api/auth/refresh') {
      return {
        body: {
          accessToken: 'test-token',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          expiresIn: 900,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          user,
        },
      }
    }
    if (key === 'GET /api/auth/me')
      return { body: { user, permissions: grants, permissionsVersion: 1, maxDiscountPercent: null } }
    if (key === 'GET /api/notifications/unread-count') return { body: { count: 0 } }
    if (request.method === 'GET') return { body: [] }
    return { status: 204 }
  }
}
