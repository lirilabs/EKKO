export function getEnv() {
  return {
    github: {
      user: process.env.GITHUB_USERNAME || null,
      repo: process.env.GITHUB_REPO || null,
      branch: process.env.GITHUB_BRANCH || "main",
      token: process.env.GITHUB_TOKEN || null
    },
    cryptoKey: process.env.DATA_ENCRYPTION_KEY || null,
    rateLimit: Number(process.env.RATE_LIMIT || 100)
  };
}

export function isReady(env) {
  return Boolean(
    env.github.user &&
    env.github.repo &&
    env.github.token &&
    env.cryptoKey &&
    env.cryptoKey.length === 64
  );
}
