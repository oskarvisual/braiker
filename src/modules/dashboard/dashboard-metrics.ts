export function botCapitalBreakdown(managedCapital: string, unallocatedCapital: string) {
  const allocated = Math.max(0, Number(managedCapital) - Number(unallocatedCapital));
  return { allocated: allocated.toFixed(12).replace(/\.0+$/, ""), available: Number(unallocatedCapital).toFixed(12).replace(/\.0+$/, "") };
}
