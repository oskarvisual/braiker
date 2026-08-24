export const PAGE_SIZE = 25;

export function pageWindow(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  return { page, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 };
}

export function pageResult<T>(rows: T[]) {
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}
