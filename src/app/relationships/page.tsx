'use client';

import { useRef, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowUpTrayIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import MainLayout from '@/components/layout/MainLayout';
import type { RelationshipView } from '@/lib/relationships/db';
import { LAST_REFERRAL, ORIGIN, REFERRAL_VOLUME, STRENGTH } from '@/lib/relationships/trs';

interface ListResponse {
  relationships: RelationshipView[];
  totals: { sources: number; referringRecently: number; averageTrs: number | null; strong: number; matched: number };
}

interface ImportReport {
  accepted: number;
  merged: number;
  matched: number;
  rejected: { line: number; reason: string }[];
}

interface Clinic {
  id: string;
  name: string;
}

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const labelOf = (options: readonly { key: string; label: string }[], key: string | null) =>
  options.find((option) => option.key === key)?.label ?? '—';

const BAND_STYLE: Record<RelationshipView['band'], string> = {
  trusted: 'bg-green-50 text-green-700 ring-green-600/20',
  warm: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  cold: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

function Tile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

function Select({ id, label, options, value, onChange }: {
  id: string;
  label: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
      >
        <option value="">Choose…</option>
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </div>
  );
}

const EMPTY = {
  name: '', practiceName: '', npi: '', specialty: '', phone: '', fax: '', email: '', zip: '', type: 'physician',
  clinicLocationId: '', lastReferral: '', referralVolume: '', strength: '', origin: '',
};

/** Add a referral source by hand, answering the questions that set its trust score. */
function AddModal({ open, onClose, clinics }: { open: boolean; onClose: () => void; clinics: Clinic[] }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const save = useMutation({
    mutationFn: async () => (await axios.post<{ trs: number; matched: boolean }>('/api/relationships', values)).data,
    onSuccess: (result) => {
      toast.success(`Added, trust score ${result.trs}${result.matched ? '; found in the catalog' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['relationships'] });
      setValues(EMPTY);
      onClose();
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not add');
    },
  });
  const input = (key: keyof typeof EMPTY, label: string, className = 'col-span-6 sm:col-span-3') => (
    <div className={className}>
      <label htmlFor={`rel-${key}`} className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        id={`rel-${key}`}
        value={values[key]}
        onChange={(event) => set(key)(event.target.value)}
        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
      />
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <Dialog.Panel className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-gray-900">Add a referral source</Dialog.Title>
          <p className="mt-1 text-sm text-gray-500">
            A provider or practice that already refers to you, knows you, or that you&rsquo;d like to hear from. The answers
            below set its trust score, which shapes the tone and frequency of outreach.
          </p>
          <form
            onSubmit={(event) => { event.preventDefault(); save.mutate(); }}
            className="mt-4 grid grid-cols-6 gap-3"
          >
            {input('name', 'Provider or practice name', 'col-span-6')}
            {input('practiceName', 'Practice (if a provider)')}
            {input('npi', 'NPI (optional)')}
            {input('phone', 'Phone')}
            {input('fax', 'Fax')}
            {input('zip', 'ZIP')}
            <div className="col-span-6 sm:col-span-3">
              <label htmlFor="rel-clinic" className="block text-sm font-medium text-gray-700">Your clinic</label>
              <select
                id="rel-clinic"
                value={values.clinicLocationId}
                onChange={(event) => set('clinicLocationId')(event.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
              >
                <option value="">All clinics</option>
                {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
              </select>
            </div>
            <div className="col-span-6 sm:col-span-3"><Select id="rel-last" label="Last referral to you" options={LAST_REFERRAL} value={values.lastReferral} onChange={set('lastReferral')} /></div>
            <div className="col-span-6 sm:col-span-3"><Select id="rel-volume" label="How many referrals so far" options={REFERRAL_VOLUME} value={values.referralVolume} onChange={set('referralVolume')} /></div>
            <div className="col-span-6 sm:col-span-3"><Select id="rel-strength" label="Relationship strength" options={STRENGTH} value={values.strength} onChange={set('strength')} /></div>
            <div className="col-span-6 sm:col-span-3"><Select id="rel-origin" label="Where it was built" options={ORIGIN} value={values.origin} onChange={set('origin')} /></div>
            <div className="col-span-6 mt-2 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={save.isPending || !values.name.trim()} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50">
                {save.isPending ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

/** A subscriber's own referral sources: entered or uploaded, scored, and matched to the catalog. */
export default function RelationshipsPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['relationships'],
    queryFn: async () => (await axios.get<ListResponse>('/api/relationships')).data,
  });
  const { data: clinics } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => (await axios.get<Clinic[]>('/api/clinic-locations')).data,
  });

  const upload = useMutation({
    mutationFn: async (csv: string) => (await axios.post<ImportReport>('/api/relationships/import', { csv })).data,
    onSuccess: (result) => {
      setReport(result);
      queryClient.invalidateQueries({ queryKey: ['relationships'] });
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not import the file');
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => axios.delete(`/api/relationships/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['relationships'] }),
    onError: () => toast.error('Could not remove'),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error('Save the spreadsheet as CSV first (File > Save As > CSV), then upload that file.');
      return;
    }
    upload.mutate(await file.text());
    if (fileInput.current) fileInput.current.value = '';
  };

  const totals = data?.totals;
  const rows = data?.relationships ?? [];

  return (
    <MainLayout>
      <div className="sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Your referral sources</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            The providers and practices that already refer to you or know you. Each gets a 0&ndash;100 trust score from
            your answers; it shapes outreach tone and frequency and never who is offered a referral.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
          <a href="/api/relationships/template" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Download template
          </a>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="h-4 w-4" /> {upload.isPending ? 'Importing…' : 'Upload CSV'}
          </button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#0B2A5B] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#123a7a]"
          >
            <PlusIcon className="h-4 w-4" /> Add one
          </button>
        </div>
      </div>
      <AddModal open={adding} onClose={() => setAdding(false)} clinics={clinics ?? []} />

      {report && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <p className="font-medium text-gray-900">
              Imported: {report.accepted} added, {report.merged} merged into sources you already had, {report.rejected.length} rejected.
              {' '}{report.matched} found in the catalog.
            </p>
            <button type="button" onClick={() => setReport(null)} className="text-gray-400 hover:text-gray-600" aria-label="Dismiss">×</button>
          </div>
          {report.rejected.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-gray-600">
              {report.rejected.slice(0, 20).map((row) => <li key={row.line}>Row {row.line}: {row.reason}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Sources" value={totals?.sources ?? '—'} hint={totals ? `${totals.matched} found in the catalog` : ''} />
        <Tile label="Referring recently" value={totals?.referringRecently ?? '—'} hint="a referral in the last 6 months" />
        <Tile label="Average trust score" value={totals?.averageTrs ?? '—'} hint="shapes your outreach plan" />
        <Tile label="Strong relationships" value={totals?.strong ?? '—'} hint="trust score 80 or more" />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">
            No sources yet. Upload your spreadsheet (download the template to see the columns) or add one at a time.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">Source</th>
                <th className="px-3 py-3">Last referral</th>
                <th className="px-3 py-3">Referrals</th>
                <th className="px-3 py-3">Relationship</th>
                <th className="px-3 py-3">Trust</th>
                <th className="px-3 py-3">Clinic</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">
                      {[row.practiceName, row.npi ? `NPI ${row.npi}` : null].filter(Boolean).join(' · ')}
                      {row.catalog && (
                        <span className="text-green-700" title={`Matched by ${row.catalog.matchedBy}`}>
                          {row.practiceName || row.npi ? ' · ' : ''}In the catalog as {row.catalog.name}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{labelOf(LAST_REFERRAL, row.lastReferral)}</td>
                  <td className="px-3 py-3 text-gray-700">{labelOf(REFERRAL_VOLUME, row.referralVolume)}</td>
                  <td className="px-3 py-3 text-gray-700">{labelOf(STRENGTH, row.strength)}</td>
                  <td className="px-3 py-3">
                    <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BAND_STYLE[row.band])}>
                      {row.trs} · {row.band}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{row.clinicName ?? 'All'}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`Remove ${row.name} from your sources?`)) remove.mutate(row.id); }}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`Remove ${row.name}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}
