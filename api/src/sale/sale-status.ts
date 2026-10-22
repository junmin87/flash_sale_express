// [KO] 현재 시각과 세일 기간으로 세일 상태(upcoming/active/ended)를 판정하는 순수 함수

export type SaleStatus = 'upcoming' | 'active' | 'ended';

// The sale is active from startAt (inclusive) until endAt (exclusive)
export function getSaleStatus(
  now: number,
  startAt: number,
  endAt: number,
): SaleStatus {
  // [KO] 시작 전 → upcoming, 시작 ~ 종료 전 → active, 이후 → ended
  if (now < startAt) return 'upcoming';
  if (now < endAt) return 'active';
  return 'ended';
}
