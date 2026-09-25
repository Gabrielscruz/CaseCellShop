export function buildCatalogCacheKey(
  cursor: string | undefined,
  limit: number,
): string {
  const cursorKey = cursor || 'first'
  return `catalog:cursor:${cursorKey}:limit:${limit}`
}

export function buildCacheKey(
  namespace: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const serializedParams = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(':')

  return serializedParams ? `${namespace}:${serializedParams}` : namespace
}
