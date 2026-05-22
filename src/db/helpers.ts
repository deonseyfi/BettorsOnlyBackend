export function buildUpdateSet<T extends object>(fields: T): {
  setClauses: string;
  values: unknown[];
  nextIndex: number;
} {
  const entries = (Object.entries(fields) as [string, unknown][]).filter(([, v]) => v !== undefined);
  const setClauses = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  return { setClauses, values, nextIndex: entries.length + 1 };
}
