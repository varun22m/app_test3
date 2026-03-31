export interface AppConfig {
  port: number;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return { port };
}
