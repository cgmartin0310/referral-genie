'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface CountyStatus {
  fips: string;
  name: string;
  state: string;
  status: 'ready' | 'pulling' | 'failed' | 'unavailable';
  practices: number;
  progress: number | null;
  error: string | null;
}

export interface MarketStatusResponse {
  clinics: { id: string; name: string; listed: number; counties: CountyStatus[] }[];
  pulling: boolean;
}

/** The market's status, re-checked every 10 seconds while a county is being pulled. */
export function useMarketStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['market-status'],
    queryFn: async () => (await axios.get<MarketStatusResponse>('/api/referral-list/market')).data,
    refetchInterval: (current) => (current.state.data?.pulling ? 10_000 : false),
  });
  // When a pull finishes, the lists it filled are fresh.
  const wasPulling = useRef(false);
  useEffect(() => {
    const pulling = query.data?.pulling ?? false;
    if (wasPulling.current && !pulling) {
      queryClient.invalidateQueries({ queryKey: ['referral-list'] });
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
    }
    wasPulling.current = pulling;
  }, [query.data?.pulling, queryClient]);
  return query;
}

/** A notice for counties still coming in, failed, or not pullable, for one clinic or all of them. */
export default function MarketStatusNotice({ clinicId }: { clinicId?: string }) {
  const { data } = useMarketStatus();
  if (!data) return null;
  const counties = new Map<string, CountyStatus>();
  for (const clinic of data.clinics) {
    if (clinicId && clinic.id !== clinicId) continue;
    for (const county of clinic.counties) counties.set(county.fips, county);
  }
  const list = [...counties.values()];
  const pulling = list.filter((county) => county.status === 'pulling');
  const failed = list.filter((county) => county.status === 'failed');
  const unavailable = list.filter((county) => county.status === 'unavailable');
  const label = (county: CountyStatus) => `${county.name}, ${county.state}`;
  if (pulling.length + failed.length + unavailable.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {pulling.length > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden="true" />
          Building your list: gathering the practices in {pulling.map(label).join(', ')}. They appear here in a few minutes; you can
          keep working or leave this page.
        </p>
      )}
      {failed.length > 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Gathering practices in {failed.map(label).join(', ')} did not finish. It tries again on its own in a few minutes.
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {unavailable.map(label).join(', ')}: practices there cannot be gathered automatically yet. Add the ones you work with by hand.
        </p>
      )}
    </div>
  );
}
