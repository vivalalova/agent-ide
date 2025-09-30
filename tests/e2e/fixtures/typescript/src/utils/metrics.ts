export interface Metrics {
  requests: number;
  errors: number;
  latency: number;
}

export function calculateMetrics(): Metrics {
  return {
    requests: 0,
    errors: 0,
    latency: 0
  };
}