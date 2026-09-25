'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog } from '@headlessui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowUpTrayIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import MainLayout from '@/components/layout/MainLayout';
import ImportSourcesDialog from '@/components/referral-list/ImportSourcesDialog';
import MarketStatusNotice from '@/components/referral-list/MarketStatus';
import type { PracticeView } from '@/lib/practices/present';
import { TIER_INFO, TIERS, type Tier } from '@/lib/referral-list/tiers';

interface Entry {
  id: string;
  clinic: { id: string; name: string };
  tier: Tier | null;
  addedFrom: string;
  private: boolean;
  practice: PracticeView;
}

interface ListResponse {
  clinics: { id: string; name: string }[];
  counts: Record<string, number>;
  truncated: boolean;
  entries: Entry[];
}

type TierFilter = Tier | 'unscored' | 'all';

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function errorMessage(error: unknown, fallback: string): string {
  return (axios.isAxiosError(error) ? error.response?.data?.error : null) || fallback;
}

const TIER_STYLE: Record<Tier, { on: string; chip: string }> = {
  trusted: { on: 'bg-green-600 text-white ring-green-600', chip: 'bg-green-50 text-green-700' },
  warm: { on: 'bg-amber-500 text-white ring-amber-500', chip: 'bg-amber-50 text-amber-700' },
  cold: { on: 'bg-sky-600 text-white ring-sky-600', chip: 'bg-sky-50 text-sky-700' },
  not_fit: { on: 'bg-gray-600 text-white ring-gray-600', chip: 'bg-gray-100 text-gray-600' },
};

/** One click scores a practice; clicking its tier again clears it. */
function TierButtons({ value, onChange, disabled }: { value: Tier | null; onChange: (tier: Tier | null) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group" aria-label="Score">
      {TIERS.map((tier, index) => (
        <button
          key={tier}
          type="button"
          disabled={disabled}
          title={TIER_INFO[tier].outreach}
          aria-pressed={value === tier}
          onClick={() => onChange(value === tier ? null : tier)}
          className={classNames(
            'whitespace-nowrap px-2.5 py-1 text-xs font-medium ring-1 ring-inset focus:z-10 disabled:opacity-50',
            index === 0 && 'rounded-l-md',
            index === TIERS.length - 1 && 'rounded-r-md',
            index > 0 && '-ml-px',
            value === tier ? TIER_STYLE[tier].on : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
          )}
        >
          {TIER_INFO[tier].label}
        </button>
      ))}
    </div>
  );
}

interface CatalogHit {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  faxNumber: string | null;
  providerCount: number;
}

const inputClass = 'block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-500 focus:ring-green-500';

/**
 * Add a practice missing from a clinic's list: find it in the catalog first;
 * when the catalog lacks it, add it by hand (private to this subscriber).
 */
function AddMissingDialog({ open, onClose, clinics, defaultClinicId, onAdded }: {
  open: boolean;
  onClose: () => void;
  clinics: { id: string; name: string }[];
  defaultClinicId: string | null;
  onAdded: () => void;
}) {
  const [clinicId, setClinicId] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CatalogHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [byHand, setByHand] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', zipCode: '', phone: '', faxNumber: '', website: '' });
  const [tier, setTier] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClinicId(defaultClinicId ?? clinics[0]?.id ?? '');
    setQ('');
    setHits(null);
    setByHand(false);
    setForm({ name: '', address: '', city: '', state: '', zipCode: '', phone: '', faxNumber: '', website: '' });
    setTier(null);
  }, [open, defaultClinicId, clinics]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!q.trim() || !clinicId) return;
    setSearching(true);
    try {
      const { data } = await axios.get('/api/practices', { params: { q: q.trim(), notOnClinicId: clinicId } });
      setHits((data.practices as CatalogHit[]).slice(0, 25));
    } catch (error) {
      toast.error(errorMessage(error, 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const addFromCatalog = async (hit: CatalogHit) => {
    try {
      await axios.post(`/api/clinic-locations/${clinicId}/practices`, { practiceIds: [hit.id], addedFrom: 'manual' });
      toast.success(`${hit.name} added.`);
      setHits((list) => list?.filter((row) => row.id !== hit.id) ?? null);
      onAdded();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add it'));
    }
  };

  const addByHand = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await axios.post(`/api/clinic-locations/${clinicId}/practices/new`, { ...form, tier });
      toast.success(`${form.name} added.`);
      onAdded();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add it'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input className={inputClass} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} {...props} />
    </label>
  );

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-medium text-gray-900">Add a missing practice</Dialog.Title>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Clinic</span>
            <select className={inputClass} value={clinicId} onChange={(event) => { setClinicId(event.target.value); setHits(null); }}>
              {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
          </label>

          {!byHand ? (
            <>
              <form onSubmit={search} className="mt-4 flex gap-2">
                <input className={inputClass} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Practice, provider, street, or town" autoFocus />
                <button type="submit" disabled={searching || !q.trim()} className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </form>
              {hits && (
                <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200">
                  {hits.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No practice in the catalog matches, or it is already on this list.</li>}
                  {hits.map((hit) => (
                    <li key={hit.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium text-gray-900">{hit.name}</span>
                        <span className="block text-xs text-gray-500">
                          {[hit.city, hit.state].filter(Boolean).join(', ')} · {hit.providerCount} provider{hit.providerCount === 1 ? '' : 's'}
                          {hit.faxNumber ? ` · fax ${hit.faxNumber}` : ' · no fax'}
                        </span>
                      </span>
                      <button type="button" onClick={() => addFromCatalog(hit)} className="text-sm font-medium text-green-700 hover:text-green-600">Add</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm text-gray-600">
                Not in the catalog?{' '}
                <button type="button" onClick={() => { setByHand(true); setForm((current) => ({ ...current, name: q.trim() })); }} className="font-medium text-green-700 hover:text-green-600">
                  Add it by hand
                </button>
                . Only your organization sees practices you add by hand.
              </p>
            </>
          ) : (
            <form onSubmit={addByHand} className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">{field('name', 'Practice name', { required: true, autoFocus: true })}</div>
              <div className="col-span-2">{field('address', 'Street address')}</div>
              {field('city', 'City')}
              <div className="grid grid-cols-2 gap-3">
                {field('state', 'State', { maxLength: 2 })}
                {field('zipCode', 'ZIP')}
              </div>
              {field('phone', 'Phone')}
              {field('faxNumber', 'Fax')}
              <div className="col-span-2">{field('website', 'Website')}</div>
              <div className="col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Score</span>
                <TierButtons value={tier} onChange={setTier} />
              </div>
              <div className="col-span-2 flex justify-between gap-3 pt-2">
                <button type="button" onClick={() => setByHand(false)} className="text-sm text-gray-600 hover:text-gray-900">← Back to search</button>
                <button type="submit" disabled={saving || !form.name.trim()} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                  {saving ? 'Adding…' : 'Add practice'}
                </button>
              </div>
            </form>
          )}
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Done</button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

/**
 * Your Sources: every practice on your clinics' referral lists. Score each
 * one; its tier sets the outreach, and Not a fit is never faxed.
 */
export default function YourSourcesPage() {
  const queryClient = useQueryClient();
  const [clinicId, setClinicId] = useState<string>('');
  const [tier, setTier] = useState<TierFilter>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const queryKey = ['referral-list', clinicId, tier, search];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () =>
      (await axios.get<ListResponse>('/api/referral-list', {
        params: { clinicId: clinicId || undefined, tier: tier === 'all' ? undefined : tier, q: search || undefined },
      })).data,
    placeholderData: (previous) => previous,
  });

  useEffect(() => setSelected([]), [clinicId, tier, search]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const clinics = data?.clinics ?? [];
  const counts = data?.counts ?? {};
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['referral-list'] });

  const score = async (ids: string[], next: Tier | null) => {
    setSaving((list) => [...list, ...ids]);
    // Show the new tier right away; the list refreshes after the save.
    queryClient.setQueryData<ListResponse>(queryKey, (current) =>
      current ? { ...current, entries: current.entries.map((entry) => (ids.includes(entry.id) ? { ...entry, tier: next } : entry)) } : current,
    );
    try {
      await axios.patch('/api/referral-list', { ids, tier: next });
      if (ids.length > 1) toast.success(`${ids.length} practices scored ${next ? TIER_INFO[next].label : 'as not scored'}.`);
      setSelected([]);
    } catch (err) {
      toast.error(errorMessage(err, 'The score was not saved'));
    } finally {
      setSaving((list) => list.filter((id) => !ids.includes(id)));
      refresh();
    }
  };

  const filters: { key: TierFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unscored', label: 'Not scored' },
    ...TIERS.map((key) => ({ key, label: TIER_INFO[key].label })),
  ];
  const allSelected = entries.length > 0 && entries.every((entry) => selected.includes(entry.id));

  return (
    <MainLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Your Sources</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Every practice on your clinics&rsquo; referral lists. Score each one: Trusted sends referrals now, Warm knows you,
            Cold is new to you, and Not a fit is never contacted. The score sets its outreach.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImporting(true)}
            disabled={clinics.length === 0}
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Upload a list
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={clinics.length === 0}
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add a missing practice
          </button>
        </div>
      </div>

      <MarketStatusNotice clinicId={clinicId || undefined} />

      {data && clinics.length === 0 ? (
        <div className="mt-8 rounded-lg bg-white px-6 py-12 text-center shadow-sm ring-1 ring-gray-900/5">
          <p className="text-sm text-gray-600">Add a clinic and the counties it serves first; its referral list is built from them.</p>
          <Link href="/clinic-locations" className="mt-4 inline-block text-sm font-medium text-green-700 hover:text-green-600">Go to Our Clinics</Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <select
              aria-label="Clinic"
              value={clinicId}
              onChange={(event) => setClinicId(event.target.value)}
              className="rounded-md border-gray-300 text-sm shadow-sm focus:border-green-500 focus:ring-green-500"
            >
              <option value="">All clinics</option>
              {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setTier(filter.key)}
                  aria-pressed={tier === filter.key}
                  className={classNames(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                    tier === filter.key ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
                  )}
                >
                  {filter.label} <span className="opacity-70">{counts[filter.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search practices or providers"
                className="block w-full rounded-md border-gray-300 pl-8 text-sm shadow-sm focus:border-green-500 focus:ring-green-500"
              />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              <span>{selected.length} selected</span>
              <span className="text-gray-400">Score them:</span>
              <TierButtons value={null} onChange={(next) => next && score(selected, next)} disabled={saving.length > 0} />
              <button type="button" onClick={() => score(selected, null)} className="text-xs text-gray-300 hover:text-white">Clear score</button>
              <button type="button" onClick={() => setSelected([])} className="ml-auto text-xs text-gray-300 hover:text-white">Cancel</button>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-900/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : entries.map((entry) => entry.id))}
                    />
                  </th>
                  <th className="px-3 py-3">Practice</th>
                  {!clinicId && <th className="px-3 py-3">Clinic</th>}
                  <th className="px-3 py-3">Fax</th>
                  <th className="px-3 py-3 text-right">Est. / mo</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
                ) : error ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-red-600">Could not load your sources.</td></tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      {counts.all ? 'Nothing matches this filter.' : 'No practices on your lists yet. Pick counties for your clinics to build them, or add practices.'}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const practice = entry.practice;
                    return (
                      <tr key={entry.id} className={classNames(selected.includes(entry.id) && 'bg-green-50/50')}>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            aria-label={`Select ${practice.name}`}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            checked={selected.includes(entry.id)}
                            onChange={() => setSelected((list) => (list.includes(entry.id) ? list.filter((id) => id !== entry.id) : [...list, entry.id]))}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-gray-900">
                            {practice.name}
                            {entry.private && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">Added by you</span>}
                          </div>
                          <div className="text-xs text-gray-500">
                            {[practice.city, practice.state].filter(Boolean).join(', ') || 'No address'}
                            {practice.providerCount > 0 && ` · ${practice.providerCount} provider${practice.providerCount === 1 ? '' : 's'}`}
                          </div>
                        </td>
                        {!clinicId && <td className="px-3 py-3 align-top text-gray-700">{entry.clinic.name}</td>}
                        <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-xs text-gray-700">
                          {practice.faxOptOut ? <span className="font-sans text-red-600">Opted out</span> : practice.faxNumber ?? <span className="font-sans text-gray-400">No fax</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right align-top text-gray-700">
                          {practice.estimate ? `${practice.estimate.low}–${practice.estimate.high}` : '—'}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <TierButtons value={entry.tier} onChange={(next) => score([entry.id], next)} disabled={saving.includes(entry.id)} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {data?.truncated && <p className="mt-2 text-xs text-gray-500">Showing the first {entries.length.toLocaleString()}. Filter by clinic or search to see the rest.</p>}
        </>
      )}

      <AddMissingDialog
        open={adding}
        onClose={() => setAdding(false)}
        clinics={clinics}
        defaultClinicId={clinicId || null}
        onAdded={refresh}
      />
      <ImportSourcesDialog open={importing} onClose={() => setImporting(false)} clinics={clinics} defaultClinicId={clinicId || null} onImported={refresh} />
    </MainLayout>
  );
}
