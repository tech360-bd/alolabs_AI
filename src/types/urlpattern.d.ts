export {}

declare global {
  type URLPatternInput = string | URLPatternInit

  interface URLPatternInit {
    protocol?: string
    username?: string
    password?: string
    hostname?: string
    port?: string
    pathname?: string
    search?: string
    hash?: string
    baseURL?: string
  }

  interface URLPatternOptions {
    ignoreCase?: boolean
  }

  interface URLPattern {
    test(input?: URLPatternInput, baseURL?: string | URL): boolean
    exec(input?: URLPatternInput, baseURL?: string | URL): URLPatternResult | null
  }

  interface URLPatternResult {
    inputs: URLPatternInput[]
    protocol: URLPatternComponentResult
    username: URLPatternComponentResult
    password: URLPatternComponentResult
    hostname: URLPatternComponentResult
    port: URLPatternComponentResult
    pathname: URLPatternComponentResult
    search: URLPatternComponentResult
    hash: URLPatternComponentResult
  }

  interface URLPatternComponentResult {
    input: string
    groups: Record<string, string | undefined>
  }
}
