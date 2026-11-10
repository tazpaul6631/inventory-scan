export interface PagedResultLike<T> {
  items?: T[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}

export interface PageFetchProgress {
  page: number
  pageSize: number
  totalCount: number
  totalPage: number
  downloaded: number
}

/**
 * Walk paginated APIs until hasNextPage is false (or items empty).
 * Calls onPage after each successful page so callers can persist incrementally.
 * Prefetches page N+1 while onPage handles page N (depth 1).
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{
    success?: boolean
    message?: string
    data?: PagedResultLike<T> | null
  }>,
  options?: {
    pageSize?: number
    onPage?: (items: T[], progress: PageFetchProgress) => void | Promise<void>
  },
): Promise<{ items: T[]; totalCount: number }> {
  const pageSize = options?.pageSize ?? 500
  let page = 1
  let totalCount = 0
  let totalPage = 1
  let downloaded = 0
  const all: T[] = []
  let pending = fetchPage(page, pageSize)

  for (;;) {
    const res = await pending
    if (res.success === false) {
      throw new Error(res.message || 'Paged query failed')
    }
    const data = res.data
    const items = data?.items ?? []
    totalCount = Number(data?.totalCount ?? totalCount)
    const countForPages = totalCount > 0 ? totalCount : items.length
    const computedTotalPage = Math.max(1, Math.ceil(countForPages / pageSize) || 1)
    totalPage = Math.max(1, Number(data?.totalPage ?? computedTotalPage))
    downloaded += items.length

    const hasNext =
      data?.hasNextPage === true ||
      (data?.hasNextPage !== false && items.length >= pageSize && page < totalPage)

    if (hasNext && items.length > 0) {
      pending = fetchPage(page + 1, pageSize)
    }

    if (options?.onPage) {
      await options.onPage(items, {
        page,
        pageSize,
        totalCount,
        totalPage,
        downloaded,
      })
    } else {
      all.push(...items)
    }

    if (!hasNext || items.length === 0) {
      break
    }
    page += 1
  }

  return { items: all, totalCount }
}
