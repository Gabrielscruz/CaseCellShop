/**
 * Constrói a chave de cache para a listagem paginada do catálogo
 */
export function buildCatalogCacheKey(
  cursor: string | undefined,
  limit: number,
): string {
  const cursorKey = cursor || 'first'
  return `catalog:cursor:${cursorKey}:limit:${limit}`
}

/**
 * Constrói chaves de cache arbitrárias a partir de um namespace e parâmetros
 */
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
