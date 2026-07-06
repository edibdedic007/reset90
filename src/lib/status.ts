export function getHealthStatus() {
  return { status: "ok" as const };
}

export function getReadinessStatus() {
  return {
    status: "not_ready" as const,
    checks: {
      database: "not_configured" as const,
    },
  };
}
