import type { PurchaseResult, PurchaseStatus } from '../types/purchase'
import type { SaleState, SetSaleInput } from '../types/sale'

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function isApiResponse(body: unknown): body is ApiResponse<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { success?: unknown }).success === 'boolean'
  )
}

// The only place that calls fetch. Unwraps { success, data } or throws ApiError
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network request failed')
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  // e.g. an HTML error page from the proxy
  if (!isApiResponse(body)) {
    throw new ApiError('INVALID_RESPONSE', `Unexpected response (HTTP ${res.status})`)
  }
  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message)
  }
  return body.data as T
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function getSale(): Promise<SaleState> {
  return request<SaleState>('/sale')
}

export function purchase(userId: string): Promise<PurchaseResult> {
  return postJson<PurchaseResult>('/purchases', { userId })
}

export function getPurchase(userId: string): Promise<PurchaseStatus> {
  return request<PurchaseStatus>(`/purchases/${encodeURIComponent(userId)}`)
}

export function setSale(input: SetSaleInput): Promise<SaleState> {
  return postJson<SaleState>('/admin/sale', input)
}
