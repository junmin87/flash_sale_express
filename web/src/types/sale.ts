export type SaleStatus = 'upcoming' | 'active' | 'ended'

export interface SaleState {
  status: SaleStatus
  startAt: string
  endAt: string
  stock: number
  totalStock: number
}

// Body of POST /api/admin/sale (dates as ISO strings)
export interface SetSaleInput {
  startAt: string
  endAt: string
  stock: number
}
