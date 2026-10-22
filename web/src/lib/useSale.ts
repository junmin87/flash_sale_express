import { useQuery } from '@tanstack/react-query'
import { getSale } from './api'

export const SALE_QUERY_KEY = ['sale']

const POLL_INTERVAL_MS = 5000

// Call once (in App) and pass the data down: every observer with
// refetchInterval runs its own timer
export function useSale() {
  return useQuery({
    queryKey: SALE_QUERY_KEY,
    queryFn: getSale,
    refetchInterval: POLL_INTERVAL_MS,
    // Retry once so a failing server is not hit with extra requests
    retry: 1,
  })
}
