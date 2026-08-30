import { describe, test, expect } from "vitest";

// Pure helper function to simulate the pagination logic in InvestmentActivityTab
function getPaginationState(totalItems: number, itemsPerPage: number, currentPage: number) {
  const pageCount = Math.ceil(totalItems / itemsPerPage) || 1;
  const safeCurrentPage = currentPage > pageCount ? pageCount : currentPage;
  
  const startIndex = totalItems > 0 ? (safeCurrentPage - 1) * itemsPerPage + 1 : 0;
  const endIndex = Math.min(safeCurrentPage * itemsPerPage, totalItems);

  return { pageCount, safeCurrentPage, startIndex, endIndex };
}

describe("Investment Activity Pagination", () => {
  test("73 items + pageSize 10 -> 8 pages", () => {
    const state = getPaginationState(73, 10, 1);
    expect(state.pageCount).toBe(8);
    expect(state.startIndex).toBe(1);
    expect(state.endIndex).toBe(10);
  });

  test("page 8 -> 3 items", () => {
    const state = getPaginationState(73, 10, 8);
    expect(state.pageCount).toBe(8);
    expect(state.startIndex).toBe(71);
    expect(state.endIndex).toBe(73);
  });

  test("empty result -> no pagination errors, 1 page", () => {
    const state = getPaginationState(0, 10, 1);
    expect(state.pageCount).toBe(1);
    expect(state.startIndex).toBe(0);
    expect(state.endIndex).toBe(0);
  });

  test("filter changes reducing items beyond current page -> safe fallback", () => {
    // If we were on page 8, but now filter leaves only 15 items
    const state = getPaginationState(15, 10, 8);
    expect(state.safeCurrentPage).toBe(2);
    expect(state.startIndex).toBe(11);
    expect(state.endIndex).toBe(15);
  });
});
