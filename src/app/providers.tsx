'use client'

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { SessionProvider } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'

/**
 * Switching organization (or account) in Clerk: everything loaded so far
 * belongs to the one before, so it is dropped and loaded again for this one.
 * Without this, pages kept showing the previous organization's clinics until
 * a reload.
 */
function ResetOnOrganizationChange() {
  const { isLoaded, userId, orgId } = useAuth()
  const queryClient = useQueryClient()
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (!isLoaded) return
    const who = `${userId ?? ''}|${orgId ?? ''}`
    if (seen.current !== null && seen.current !== who) {
      queryClient.resetQueries()
    }
    seen.current = who
  }, [isLoaded, userId, orgId, queryClient])
  return null
}

export function Providers({ children, clerk = false }: { children: React.ReactNode; clerk?: boolean }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
      },
    },
  }))

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {clerk && <ResetOnOrganizationChange />}
        <Toaster position="top-right" />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  )
}
