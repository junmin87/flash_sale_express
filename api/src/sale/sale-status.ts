// Pure function that returns the sale status (upcoming/active/ended) from the
// current time and the sale window

export type SaleStatus = 'upcoming' | 'active' | 'ended';

// The sale is active from startAt (inclusive) until endAt (exclusive)
export function getSaleStatus(
  now: number,
  startAt: number,
  endAt: number,
): SaleStatus {
  if (now < startAt) return 'upcoming';
  if (now < endAt) return 'active';
  return 'ended';
}
