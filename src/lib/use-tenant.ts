'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { TenantRole } from './tenant-rules';

export interface Me {
  organizationName: string;
  role: TenantRole;
  isParagon: boolean;
  via: 'clerk' | 'admin-login';
}

/** The signed-in organization and role. Paragon-only controls wait for it, so they never flash for subscribers. */
export function useTenant() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await axios.get<Me>('/api/me')).data,
    staleTime: 5 * 60 * 1000,
  });
}
