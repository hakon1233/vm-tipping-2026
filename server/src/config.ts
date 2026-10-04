export type ServerConfig = {
  adminPin: string;
  leaguePin: string;
  port: number;
  databasePath: string;
  /** Lifts the group/knockout pick deadlines so picks stay editable after kickoff. */
  deadlinesDisabled: boolean;
};

type Env = Record<string, string | undefined>;

/** Reads the server's settings from the environment. Throws when a PIN is missing, so the API never runs with a guessable default. */
export function readServerConfig(env: Env): ServerConfig {
  return {
    adminPin: required(env, "ADMIN_PIN"),
    leaguePin: required(env, "LEAGUE_PIN"),
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? "data/vm-tipping.sqlite",
    deadlinesDisabled: env.DEADLINES_DISABLED === "1"
  };
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and set it.`);
  return value;
}
