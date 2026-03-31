export interface AppConfig {
  clerkIssuer: string | null;
  clerkJwksJson: string | null;
  clerkJwksUrl: string | null;
  port: number;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return {
    clerkIssuer: readOptionalEnv(env.CLERK_ISSUER),
    clerkJwksJson: readOptionalEnv(env.CLERK_JWKS_JSON),
    clerkJwksUrl: readOptionalEnv(env.CLERK_JWKS_URL),
    port,
  };
}

function readOptionalEnv(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}
