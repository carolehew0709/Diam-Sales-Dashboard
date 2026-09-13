export type ManualImport = { entityId: string; week: string; turnover: string; orderbook: string; forecast: string; p1: string; source: string };

export function validateManualImport(input: ManualImport) {
  const findings: string[] = [];
  if (!input.entityId) findings.push('Entity is required');
  if (!input.week || Number(input.week) < 1 || Number(input.week) > 53) findings.push('Week must be between 1 and 53');
  for (const [label, value] of [['Turnover', input.turnover], ['Order book', input.orderbook], ['Forecast', input.forecast]]) if (!value || Number.isNaN(Number(value))) findings.push(`${label} must be a number`);
  if (!input.source.trim()) findings.push('Source note is required');
  return { valid: findings.length === 0, findings, completeness: Math.round((7 - findings.length) / 7 * 100) };
}
