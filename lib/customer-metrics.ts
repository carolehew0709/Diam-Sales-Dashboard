import type { CustomerAnalysis } from "./graphics-types";

export const customerGrowth = (prior: number, current: number) =>
  prior > 0 ? current / prior - 1 : null;
export function customerMetrics(analysis: CustomerAnalysis) {
  const keyTotal = analysis.customers.reduce((n, c) => n + c.current, 0);
  const priorTotal = analysis.customers.reduce((n, c) => n + c.prior, 0);
  const total = analysis.breakdown.reduce((n, g) => n + g.values[3], 0);
  return {
    keyTotal,
    priorTotal,
    total,
    keyShare: total > 0 ? keyTotal / total : null,
    growth: customerGrowth(priorTotal, keyTotal),
  };
}
