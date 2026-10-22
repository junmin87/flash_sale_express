import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getPurchase, purchase } from './api'
import { SALE_QUERY_KEY } from './useSale'

export function usePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: purchase,
    // Not awaited, so the result message shows without waiting for the refetch
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY })
    },
  })
}

// Run on demand (button click), so a mutation rather than a query
export function useCheckPurchase() {
  return useMutation({ mutationFn: getPurchase })
}
