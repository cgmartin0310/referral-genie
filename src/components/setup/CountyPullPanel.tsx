'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import PullEnrichPanel from './PullEnrichPanel';
import ResearchPanel from './ResearchPanel';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface SeedCounty {
  id: string;
  name: string;
  state: string;
  fips: string;
  zipCount: number;
}

/**
 * Pull one county's referral sources without going through a clinic:
 * NPI pull, then Google Places, then website research. The result lands in
 * the shared catalog as practices and providers.
 */
export default function CountyPullPanel() {
  const queryClient = useQueryClient();
  const [countyId, setCountyId] = useState('');
  const [pullProgress, setPullProgress] = useState({ anyPastNppes: false, anyCompleted: false });

  const { data, isLoading } = useQuery({
    queryKey: ['seed-counties'],
    queryFn: async () => (await axios.get<{ counties: SeedCounty[] }>('/api/county-seed')).data.counties,
  });
  const counties = data ?? [];

  useEffect(() => {
    if (!countyId && counties.length > 0) setCountyId(counties[0].id);
  }, [counties, countyId]);

  const county = counties.find((row) => row.id === countyId) ?? null;
  const view: MarketCountyView | null = county
    ? { fips: county.fips, name: county.name, state: county.state, pullReady: true, seedCountyId: county.id }
    : null;

  const refreshCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['practices'] });
    queryClient.invalidateQueries({ queryKey: ['providers'] });
  };

  return (
    <div className="space-y-5">
      <div className="max-w-sm">
        <label htmlFor="pull-county-select" className="block text-sm font-medium text-gray-700">
          County
        </label>
        <select
          id="pull-county-select"
          value={countyId}
          onChange={(event) => setCountyId(event.target.value)}
          disabled={isLoading || counties.length === 0}
          className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
        >
          {counties.length === 0 && <option value="">{isLoading ? 'Loading…' : 'No counties are set up yet'}</option>}
          {counties.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}, {row.state} · {row.zipCount} ZIPs
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          NPI has no county field, so a county is pulled by its practice ZIP codes. Only counties with a ZIP list appear
          here.
        </p>
      </div>

      {view && (
        <>
          <PullEnrichPanel
            key={view.seedCountyId ?? view.fips}
            counties={[view]}
            onProgress={(progress) => {
              setPullProgress(progress);
              if (progress.anyCompleted) refreshCatalog();
            }}
          />
          <ResearchPanel
            key={`research-${view.fips}`}
            countyFips={view.fips}
            refreshToken={`${pullProgress.anyPastNppes}-${pullProgress.anyCompleted}`}
            onProgress={({ completed }) => {
              if (completed) refreshCatalog();
            }}
          />
        </>
      )}
    </div>
  );
}
