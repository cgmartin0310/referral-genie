'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { useTenant } from '@/lib/use-tenant';
import { OUTREACH_STAGES } from '@/lib/universe';

interface Row {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  countyName: string | null;
  providerCount: number;
  faxNumber: string | null;
  phone: string | null;
  faxOptOutAt: string | null;
  outreachStage: string;
  stageChangedAt: string | null;
  rcName: string | null;
  rcPhone: string | null;
  rcEmail: string | null;
  assignee: string | null;
  healthSystem: boolean;
}

interface Response {
  practices: Row[];
  byStage: Record<string, number>;
  counties: { fips: string | null; name: string | null; practices: number }[];
}

function Cell({ row, field, placeholder, onSave }: {
  row: Row;
  field: 'rcName' | 'rcPhone' | 'rcEmail' | 'assignee';
  placeholder: string;
  onSave: (patch: Record<string, string>) => void;
}) {
  const [value, setValue] = useState(row[field] ?? '');
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => { if ((row[field] ?? '') !== value.trim()) onSave({ [field]: value }); }}
      aria-label={`${placeholder} for ${row.name}`}
      className="w-full min-w-[7rem] rounded-md border-gray-200 text-xs focus:border-green-600 focus:ring-green-600"
    />
  );
}

/** Paragon's Source Universe: every catalog practice on the outreach ladder. */
export default function UniversePage() {
  const queryClient = useQueryClient();
  const { data: me } = useTenant();
  const [countyFips, setCountyFips] = useState('');
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ ...(countyFips ? { countyFips } : {}), ...(stage ? { stage } : {}), ...(q ? { q } : {}) }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ['universe', params],
    queryFn: async () => (await axios.get<Response>(`/api/admin/universe?${params}`)).data,
    enabled: me?.isParagon === true,
  });
  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, string> }) => (await axios.patch(`/api/admin/universe/${id}`, patch)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['universe'] }),
    onError: () => toast.error('Could not save'),
  });

  if (me && !me.isParagon) {
    return <MainLayout><p className="text-sm text-gray-600">This page is for Paragon.</p></MainLayout>;
  }

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Source Universe</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Every practice in the catalog on Paragon&rsquo;s outreach ladder. Naming a practice&rsquo;s referral coordinator moves
        it to Coordinator identified. Pulls never change these fields.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {OUTREACH_STAGES.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setStage(stage === row.key ? '' : row.key)}
            className={`rounded-lg border px-4 py-3 text-left shadow-sm ${stage === row.key ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`}
          >
            <p className="text-xs font-medium text-gray-500">{row.label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{data?.byStage[row.key] ?? '—'}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search practices or towns"
          className="min-w-[14rem] rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600"
        />
        <select value={countyFips} onChange={(event) => setCountyFips(event.target.value)} className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600">
          <option value="">All counties</option>
          {(data?.counties ?? []).map((row) => <option key={row.fips ?? ''} value={row.fips ?? ''}>{row.name} ({row.practices})</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Practice</th>
              <th className="px-3 py-3 text-right">Providers</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Referral coordinator</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-4 py-3">Assigned to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading || !data ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : data.practices.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">No practices match.</td></tr>
            ) : data.practices.map((row) => (
              <tr key={`${row.id}-${row.outreachStage}-${row.rcName ?? ''}-${row.assignee ?? ''}`}>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">
                    {row.name}
                    {row.healthSystem && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700">health system</span>}
                    {row.faxOptOutAt && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-normal text-red-700">opted out</span>}
                  </p>
                  <p className="text-xs text-gray-500">{[row.city, row.countyName].filter(Boolean).join(' · ')}{row.phone ? ` · ${row.phone}` : ''}</p>
                </td>
                <td className="px-3 py-2 text-right text-gray-700">{row.providerCount}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.outreachStage}
                    onChange={(event) => save.mutate({ id: row.id, patch: { stage: event.target.value } })}
                    aria-label={`Stage for ${row.name}`}
                    className="rounded-md border-gray-200 text-xs focus:border-green-600 focus:ring-green-600"
                  >
                    {OUTREACH_STAGES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><Cell row={row} field="rcName" placeholder="Name" onSave={(patch) => save.mutate({ id: row.id, patch })} /></td>
                <td className="px-3 py-2"><Cell row={row} field="rcPhone" placeholder="Phone" onSave={(patch) => save.mutate({ id: row.id, patch })} /></td>
                <td className="px-3 py-2"><Cell row={row} field="rcEmail" placeholder="Email" onSave={(patch) => save.mutate({ id: row.id, patch })} /></td>
                <td className="px-4 py-2"><Cell row={row} field="assignee" placeholder="Paragon staff" onSave={(patch) => save.mutate({ id: row.id, patch })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
