export function buildCatalogCacheKey(
  cursor: string | undefined,
  limit: number,
): string {
  const cursorKey = cursor || 'first'
  return `catalog:cursor:${cursorKey}:limit:${limit}`
}
