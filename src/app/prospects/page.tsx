'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import type { ProspectView } from '@/lib/prospects/db';

interface Response {
  market: { fips: string; name: string | null }[];
  prospects: ProspectView[];
  totals: { practices: number; providers: number; approved: number; excluded: number; proposed: number };
}

const MIX_LABEL: Record<string, string> = {
  pediatrics: 'Pediatrics',
  pcp_family_medicine: 'Family medicine',
  pcp_general_practice: 'General practice',
  ent: 'ENT',
  neurology: 'Neurology',
  orthopedics: 'Orthopedics',
  sports_medicine: 'Sports medicine',
  pmr: 'PM&R',
};

const STATUS_STYLE: Record<ProspectView['status'], string> = {
  proposed: 'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  excluded: 'bg-gray-100 text-gray-500',
};

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function mixText(mix: Record<string, number>): string {
  return Object.entries(mix)
    .sort((left, right) => right[1] - left[1])
    .map(([type, count]) => `${MIX_LABEL[type] ?? type} ${count}`)
    .join(' · ');
}

/** The subscriber reviews the practices near it that are not yet its referral sources. */
export default function ProspectsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | ProspectView['status']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ['prospects'],
    queryFn: async () => (await axios.get<Response>('/api/prospects')).data,
  });

  const decide = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: 'approved' | 'excluded' | 'proposed' }) =>
      (await axios.post<{ decided: number }>('/api/prospects/decide', { practiceIds: ids, status })).data,
    onSuccess: (result, { status }) => {
      toast.success(`${result.decided} ${status === 'proposed' ? 'put back to proposed' : status}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: () => toast.error('Could not save the decision'),
  });

  const rows = useMemo(
    () => (data?.prospects ?? []).filter((row) => filter === 'all' || row.status === filter),
    [data, filter],
  );
  const marketName = (data?.market ?? []).map((row) => row.name ?? row.fips).join(', ');
  const totals = data?.totals;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Prospects</h1>

      {isLoading ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : !data || data.market.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600">
          Add a clinic with its address, or set its market counties, to see the practices near it.{' '}
          <Link href="/clinic-locations" className="font-medium text-green-700 hover:underline">Our Clinics</Link>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900">
            We&rsquo;ve identified <strong>{totals?.practices} practices</strong> and <strong>{totals?.providers} providers</strong>{' '}
            in {marketName} that are not in your referral sources. With your approval, we&rsquo;ll market to them on your
            behalf. Exclude any we should skip. Each practice counts once, for your nearest clinic.
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-md bg-gray-100 p-1 text-sm">
              {(['all', 'proposed', 'approved', 'excluded'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={classNames('rounded px-3 py-1 capitalize', filter === key ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-600')}
                >
                  {key}
                  {key !== 'all' && totals ? ` (${totals[key]})` : ''}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selected.size === 0 || decide.isPending}
                onClick={() => decide.mutate({ ids: [...selected], status: 'excluded' })}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
              >
                Exclude {selected.size || ''}
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || decide.isPending}
                onClick={() => decide.mutate({ ids: [...selected], status: 'proposed' })}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || decide.isPending}
                onClick={() => decide.mutate({ ids: [...selected], status: 'approved' })}
                className="rounded-md border border-green-600 bg-white px-3 py-2 text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50 disabled:opacity-40"
              >
                Approve {selected.size || ''}
              </button>
              <button
                type="button"
                disabled={!totals?.proposed || decide.isPending}
                onClick={() => {
                  const ids = (data.prospects ?? []).filter((row) => row.status === 'proposed').map((row) => row.practiceId);
                  if (window.confirm(`Approve all ${ids.length} proposed practices for outreach?`)) decide.mutate({ ids, status: 'approved' });
                }}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300"
              >
                Approve all proposed
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3" />
                  <th className="px-3 py-3">Practice</th>
                  <th className="px-3 py-3">Specialty</th>
                  <th className="px-3 py-3 text-right">Distance</th>
                  <th className="px-3 py-3 text-right">Providers</th>
                  <th className="px-3 py-3 text-right">Est. / mo</th>
                  <th className="px-3 py-3 text-right">Fit</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-500">Nothing here.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.practiceId} className={row.status === 'excluded' ? 'text-gray-400' : ''}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.practiceId)}
                        onChange={() => toggle(row.practiceId)}
                        aria-label={`Select ${row.name}`}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">
                        {row.name}
                        {row.healthSystem && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700">health system</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {[row.address, row.city].filter(Boolean).join(', ')}
                        {row.nearest ? ` · nearest: ${row.nearest.clinicName}` : ''}
                        {!row.faxNumber ? ' · no fax yet' : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{mixText(row.mix)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.nearest ? `${row.nearest.miles} mi` : '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.providers}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.estimate ? `${row.estimate.low}–${row.estimate.high}` : '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">{row.fit}</td>
                    <td className="px-4 py-3">
                      <span
                        className={classNames('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[row.status])}
                        title={row.decidedAt ? `${row.status} ${new Date(row.decidedAt).toLocaleString()}${row.decidedBy ? ` by ${row.decidedBy}` : ''}` : undefined}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Fit weighs expected referrals for your clinic&rsquo;s disciplines, distance, practice size, and pediatric focus.
            Place data &copy; Google.
          </p>
        </>
      )}
    </MainLayout>
  );
}
