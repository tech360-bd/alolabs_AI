export type PublicApiRoute = {
  path: string;
  methods: readonly string[];
};

/**
 * Match a public-route table without turning an exact path into a prefix. A
 * trailing slash is the explicit signal that an entry covers descendants.
 */
export function matchesPublicApiRoute(
  routes: readonly PublicApiRoute[],
  pathname: string,
  method: string,
): boolean {
  const verb = method.toUpperCase();
  return routes.some((route) => {
    const matchesPath = route.path.endsWith('/')
      ? pathname.startsWith(route.path)
      : pathname === route.path;
    return matchesPath && route.methods.includes(verb);
  });
}
