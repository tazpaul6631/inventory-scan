const SKELETON_ROW_COUNT = 10

/** Placeholder rows shown inside a DataTable while data is loading (see `.table-skeleton`). */
export const skeletonRows: { id: string }[] = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => ({ id: `sk-${index}` }),
)

export function useTableSkeleton() {
  return { skeletonRows }
}
