export function getHealthStatus() {
  return { status: "ok" as const };
}

export function getReadinessStatus(databaseReady: boolean) {
  if (databaseReady) {
    return {
      status: "ready" as const,
      checks: { database: "ready" as const },
    };
  }

  return {
    status: "not_ready" as const,
    checks: { database: "unavailable" as const },
  };
}
