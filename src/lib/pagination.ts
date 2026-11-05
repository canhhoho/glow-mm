export function pageNumber(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 1;
}

export function validDay(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : undefined;
}
