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
  npiRecords: number;
  /** What the NPI file holds for this county before any pull. */
  snapshot: {
    providers: number;
    organizations: number;
    mix: Record<string, number>;
    estimate: { low: number; high: number } | null;
  } | null;
}

const MIX_LABEL: Record<string, string> = {
  pediatrics: 'pediatrics',
  pcp_family_medicine: 'family medicine',
  pcp_general_practice: 'general practice',
  ent: 'ENT',
  neurology: 'neurology',
  orthopedics: 'orthopedics',
  sports_medicine: 'sports medicine',
  pmr: 'PM&R',
};

interface NpiFileStatus {
  loaded: boolean;
  records: number;
  latest: { fileName: string; status: string; finishedAt: string | null; rowsKept: number } | null;
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

  const { data: npiFile } = useQuery({
    queryKey: ['npi-file'],
    queryFn: async () => (await axios.get<NpiFileStatus>('/api/npi-file')).data,
  });
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
                {npiFile?.loaded
                  ? ` · ${row.npiRecords.toLocaleString()} on NPI file`
                  : row.zipCount > 0
                    ? ` · ${row.zipCount} ZIP${row.zipCount === 1 ? '' : 's'}`
                    : ' · no ZIPs on file'}
              </option>
            ))}
          </select>
        </div>
      </div>
      {npiFile?.loaded ? (
        <p className="text-xs text-gray-500">
          Source: the NPI file{npiFile.latest ? ` (${npiFile.latest.fileName.replace(/NPPES_Data_Dissemination_|_V2\.zip/g, '').replace('_', ' ')})` : ''}
          , {npiFile.records.toLocaleString()} providers and practices mapped to counties by practice ZIP. Complete and
          immediate; no API limits.
        </p>
      ) : (
        <p className="text-xs text-amber-700">
          The NPI file is not loaded, so pulls query the NPPES API ZIP by ZIP, which is slower, capped at 1,200 rows
          per ZIP, and cannot see practices registered under a PO Box ZIP. Load it with{' '}
          <code className="rounded bg-amber-50 px-1">npm run npi:load -- --states NC</code> on the server.
        </p>
      )}

      {county?.snapshot && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">
            Before pulling: {county.snapshot.providers.toLocaleString()} providers and{' '}
            {county.snapshot.organizations.toLocaleString()} organizations on the NPI file
            {county.snapshot.estimate
              ? `, an estimated ${county.snapshot.estimate.low}–${county.snapshot.estimate.high} referrals a month`
              : ''}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {Object.entries(county.snapshot.mix)
              .sort((left, right) => right[1] - left[1])
              .map(([type, count]) => `${count} ${MIX_LABEL[type] ?? type}`)
              .join(' · ')}
            {' · '}Paragon&rsquo;s rates; a range, not a promise. The pull groups these into practices.
          </p>
        </div>
      )}

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
