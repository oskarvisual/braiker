"use client";

export function PaginationControls({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return <div className="paginationControls" aria-label="Pagination"><button type="button" className="secondaryButton" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="secondaryButton" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Next</button></div>;
}
