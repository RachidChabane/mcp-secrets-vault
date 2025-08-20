export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/{(\w+)}/g, (_, key) =>
    params[key]?.toString() || `{${key}}`
  );
}