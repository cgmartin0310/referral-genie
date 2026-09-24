'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { useTenant } from '@/lib/use-tenant';
import { CALL_OUTCOMES, OUTREACH_STAGES } from '@/lib/universe';

interface QueueRow {
  id: string;
  name: string;
  city: string | null;
  countyName: string | null;
  phone: string | null;
  faxNumber: string | null;
  providerCount: number;
  outreachStage: string;
  rcName: string | null;
  rcPhone: string | null;
  assignee: string | null;
  touches: number;
  lastTouch: { outcome: string; at: string; notes: string | null; actor: string | null } | null;
}

const stageLabel = (key: string) => OUTREACH_STAGES.find((row) => row.key === key)?.label ?? key;
const outcomeLabel = (key: string) => CALL_OUTCOMES.find((row) => row.key === key)?.label ?? key;

function CallPanel({ row, script, caller, onLogged }: { row: QueueRow; script: string; caller: string; onLogged: () => void }) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [rcName, setRcName] = useState(row.rcName ?? '');
  const [rcPhone, setRcPhone] = useState(row.rcPhone ?? '');
  const [fax, setFax] = useState('');
  const log = useMutation({
    mutationFn: async () =>
      (await axios.post<{ stage: string; optedOut: boolean }>('/api/admin/calls', { practiceId: row.id, outcome, notes, rcName, rcPhone, faxNumber: fax })).data,
    onSuccess: (result) => {
      toast.success(result.optedOut ? `${row.name} opted out for every subscriber` : `Logged. ${row.name} is now ${stageLabel(result.stage)}.`);
      onLogged();
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not log the call');
    },
  });
  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold text-gray-900">{row.name}</p>
        <p className="text-sm text-gray-600">
          {row.phone ? <a href={`tel:${row.phone}`} className="font-medium text-green-700 hover:underline">{row.phone}</a> : 'No phone'}
          {' · '}{row.providerCount} provider{row.providerCount === 1 ? '' : 's'} · {stageLabel(row.outreachStage)}
          {row.faxNumber ? ` · fax on file ${row.faxNumber}` : ' · no fax on file'}
        </p>
      </div>
      <blockquote className="rounded-md border-l-4 border-green-500 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        {script.replace('{caller}', caller).replace('{practice}', row.name)}
      </blockquote>
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">How did it go?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CALL_OUTCOMES.map((option) => (
            <label key={option.key} className="inline-flex items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name={`outcome-${row.id}`}
                value={option.key}
                checked={outcome === option.key}
                onChange={() => setOutcome(option.key)}
                className="h-4 w-4 border-gray-300 text-green-600 focus:ring-green-600"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={rcName} onChange={(event) => setRcName(event.target.value)} placeholder="Coordinator name" className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600" />
        <input value={rcPhone} onChange={(event) => setRcPhone(event.target.value)} placeholder="Coordinator phone" className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600" />
        <input value={fax} onChange={(event) => setFax(event.target.value)} placeholder="Confirmed referral fax" className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600" />
      </div>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Notes (no patient information)" className="block w-full rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600" />
      <button
        type="button"
        onClick={() => log.mutate()}
        disabled={!outcome || log.isPending}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300"
      >
        {log.isPending ? 'Logging…' : 'Log call'}
      </button>
    </div>
  );
}

/** Paragon's call queue: practices still working toward an engaged referral coordinator. */
export default function CallQueuePage() {
  const queryClient = useQueryClient();
  const { data: me } = useTenant();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['call-queue'],
    queryFn: async () => (await axios.get<{ queue: QueueRow[]; script: string; caller: string }>('/api/admin/calls')).data,
    enabled: me?.isParagon === true,
  });

  if (me && !me.isParagon) return <MainLayout><p className="text-sm text-gray-600">This page is for Paragon.</p></MainLayout>;

  const queue = data?.queue ?? [];
  const active = queue.find((row) => row.id === activeId) ?? queue[0] ?? null;

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Call queue</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Practices still working toward an engaged referral coordinator, least recently called first. Each call is logged and
        moves the practice along the Source Universe ladder; a request not to be contacted opts it out for every subscriber.
      </p>
      {isLoading || !data ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="mt-6 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">Nobody to call right now.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm lg:col-span-2">
            {queue.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(row.id)}
                  className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${active?.id === row.id ? 'bg-green-50' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500">
                    {[row.city, stageLabel(row.outreachStage)].filter(Boolean).join(' · ')}
                    {row.lastTouch
                      ? ` · last: ${outcomeLabel(row.lastTouch.outcome).toLowerCase()} ${new Date(row.lastTouch.at).toLocaleDateString()}`
                      : ' · not called yet'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
            {active && (
              <CallPanel
                key={active.id}
                row={active}
                script={data.script}
                caller={data.caller}
                onLogged={() => {
                  setActiveId(null);
                  queryClient.invalidateQueries({ queryKey: ['call-queue'] });
                  queryClient.invalidateQueries({ queryKey: ['universe'] });
                }}
              />
            )}
          </section>
        </div>
      )}
    </MainLayout>
  );
}
