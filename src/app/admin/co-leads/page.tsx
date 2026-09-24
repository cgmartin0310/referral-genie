'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { useTenant } from '@/lib/use-tenant';
import { CO_STAGES } from '@/lib/acquisition/leads';

interface Lead {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  countyName: string | null;
  phone: string | null;
  faxNumber: string | null;
  therapists: { pt?: number; ot?: number; st?: number };
  pediatric: boolean;
  stage: string;
  notes: string | null;
  assignee: string | null;
}

interface Response {
  leads: Lead[];
  byStage: Record<string, number>;
  pulledCounties: { fips: string; name: string | null; leads: number }[];
  therapistsOnFile: Record<string, number>;
}

function Editable({ lead, field, placeholder, onSave }: { lead: Lead; field: 'notes' | 'assignee'; placeholder: string; onSave: (patch: Record<string, string>) => void }) {
  const [value, setValue] = useState(lead[field] ?? '');
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => { if ((lead[field] ?? '') !== value.trim()) onSave({ [field]: value }); }}
      aria-label={`${placeholder} for ${lead.name}`}
      className="w-full min-w-[8rem] rounded-md border-gray-200 text-xs focus:border-green-600 focus:ring-green-600"
    />
  );
}

/** Paragon's clinic-owner leads: therapy practices to recruit as subscribers. */
export default function CoLeadsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useTenant();
  const [countyFips, setCountyFips] = useState('');
  const [stage, setStage] = useState('');
  const [pediatric, setPediatric] = useState(false);
  const params = new URLSearchParams({ ...(countyFips ? { countyFips } : {}), ...(stage ? { stage } : {}), ...(pediatric ? { pediatric: '1' } : {}) }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ['co-leads', params],
    queryFn: async () => (await axios.get<Response>(`/api/admin/co-leads?${params}`)).data,
    enabled: me?.isParagon === true,
  });
  const { data: counties } = useQuery({
    queryKey: ['counties', 'NC'],
    queryFn: async () => (await axios.get<{ counties: { fips: string; name: string }[] }>('/api/counties?state=NC')).data.counties,
    enabled: me?.isParagon === true,
  });
  const pull = useMutation({
    mutationFn: async () => (await axios.post<{ records: number; leads: number; retired: number }>('/api/admin/co-leads/pull', { countyFips })).data,
    onSuccess: (result) => {
      toast.success(`${result.leads} practices from ${result.records} NPI records${result.retired ? `; ${result.retired} no longer on file` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['co-leads'] });
    },
    onError: () => toast.error('Could not pull leads'),
  });
  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, string> }) => (await axios.patch(`/api/admin/co-leads/${id}`, patch)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['co-leads'] }),
    onError: () => toast.error('Could not save'),
  });

  if (me && !me.isParagon) return <MainLayout><p className="text-sm text-gray-600">This page is for Paragon.</p></MainLayout>;

  const onFile = data?.therapistsOnFile ?? {};
  const withTherapists = (counties ?? []).filter((county) => (onFile[county.fips] ?? 0) > 0);

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Clinic owners</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Therapy practices to recruit as Referral360 subscribers, from the NPI file: physical, occupational, and speech
        therapists grouped under their clinic or shared address; a therapist on their own is a private practice. Pulling a
        county again keeps each lead&rsquo;s stage and notes.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={countyFips} onChange={(event) => setCountyFips(event.target.value)} className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600">
          <option value="">All pulled counties</option>
          {withTherapists.map((county) => (
            <option key={county.fips} value={county.fips}>{county.name} · {onFile[county.fips]} therapists on file</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => pull.mutate()}
          disabled={!countyFips || pull.isPending}
          className="rounded-md bg-[#0B2A5B] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#123a7a] disabled:bg-gray-300"
        >
          {pull.isPending ? 'Pulling…' : 'Pull this county'}
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pediatric} onChange={(event) => setPediatric(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600" />
          Pediatric focus only
        </label>
        {Object.keys(onFile).length === 0 && data && (
          <span className="text-sm text-amber-700">No therapists on the NPI file yet: reload it on Render (npm run npi:load -- --states NC).</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {CO_STAGES.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setStage(stage === row.key ? '' : row.key)}
            className={`rounded-lg border px-3 py-2 text-left shadow-sm ${stage === row.key ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'}`}
          >
            <p className="text-xs font-medium text-gray-500">{row.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-900">{data?.byStage[row.key] ?? '—'}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Practice</th>
              <th className="px-3 py-3">Therapists</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading || !data ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : data.leads.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">No leads yet. Choose a county and pull it.</td></tr>
            ) : data.leads.map((lead) => (
              <tr key={`${lead.id}-${lead.stage}-${lead.assignee ?? ''}-${lead.notes ?? ''}`}>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">
                    {lead.name}
                    {lead.pediatric && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">pediatric</span>}
                  </p>
                  <p className="text-xs text-gray-500">{[lead.address, lead.city, lead.countyName].filter(Boolean).join(' · ')}</p>
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {[['PT', lead.therapists.pt], ['OT', lead.therapists.ot], ['ST', lead.therapists.st]]
                    .filter(([, count]) => (count as number) > 0)
                    .map(([label, count]) => `${label} ${count}`)
                    .join(' · ') || 'Clinic'}
                </td>
                <td className="px-3 py-2 text-gray-700">{lead.phone ?? '—'}</td>
                <td className="px-3 py-2">
                  <select
                    value={lead.stage}
                    onChange={(event) => save.mutate({ id: lead.id, patch: { stage: event.target.value } })}
                    aria-label={`Stage for ${lead.name}`}
                    className="rounded-md border-gray-200 text-xs focus:border-green-600 focus:ring-green-600"
                  >
                    {CO_STAGES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><Editable lead={lead} field="assignee" placeholder="Paragon staff" onSave={(patch) => save.mutate({ id: lead.id, patch })} /></td>
                <td className="px-4 py-2"><Editable lead={lead} field="notes" placeholder="Notes" onSave={(patch) => save.mutate({ id: lead.id, patch })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
