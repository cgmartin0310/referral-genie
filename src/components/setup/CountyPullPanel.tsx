'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import CountyPullRunner from './CountyPullRunner';

interface StateOption {
  code: string;
  name: string;
}

interface CountyOption {
  fips: string;
  name: string;
  state: string;
  pullReady: boolean;
  seedCountyId: string | null;
  zipCount: number;
}

/**
 * Pull one county's referral sources: NPI pull, then Google Places, then
 * website research. Any US county can be chosen; its ZIP list comes from the
 * Census crosswalk. The result lands in the catalog as practices and
 * providers. No clinic is involved.
 */
export default function CountyPullPanel() {
  const [stateCode, setStateCode] = useState('');
  const [fips, setFips] = useState('');

  const { data: states } = useQuery({
    queryKey: ['counties', 'states'],
    queryFn: async () => (await axios.get<{ states: StateOption[] }>('/api/counties')).data.states,
  });
  const { data: counties, isLoading: countiesLoading } = useQuery({
    queryKey: ['counties', stateCode],
    queryFn: async () =>
      (await axios.get<{ counties: CountyOption[] }>(`/api/counties?state=${encodeURIComponent(stateCode)}`)).data.counties,
    enabled: Boolean(stateCode),
  });

  // Changing state clears the county.
  useEffect(() => {
    setFips('');
  }, [stateCode]);

  const county = counties?.find((row) => row.fips === fips) ?? null;
  const pullable = county && county.pullReady && county.seedCountyId ? county : null;

  return (
    <div className="space-y-5">
      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pull-state" className="block text-sm font-medium text-gray-700">
            State
          </label>
          <select
            id="pull-state"
            value={stateCode}
            onChange={(event) => setStateCode(event.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
          >
            <option value="">Choose a state…</option>
            {(states ?? []).map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pull-county" className="block text-sm font-medium text-gray-700">
            County
          </label>
          <select
            id="pull-county"
            value={fips}
            onChange={(event) => setFips(event.target.value)}
            disabled={!stateCode || countiesLoading}
            className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">{!stateCode ? 'Choose a state first' : countiesLoading ? 'Loading…' : 'Choose a county…'}</option>
            {(counties ?? []).map((row) => (
              <option key={row.fips} value={row.fips} disabled={!row.pullReady}>
                {row.name}
                {row.zipCount > 0 ? ` · ${row.zipCount} ZIP${row.zipCount === 1 ? '' : 's'}` : ' · no ZIPs on file'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        NPI has no county field, so a county is pulled by the ZIP codes that lie mostly inside it. Practices in a ZIP
        that crosses the county line are kept and flagged.
      </p>

      {pullable && (
        <CountyPullRunner
          key={pullable.fips}
          countyId={pullable.seedCountyId as string}
          countyFips={pullable.fips}
          countyName={`${pullable.name}, ${pullable.state}`}
        />
      )}
    </div>
  );
}
