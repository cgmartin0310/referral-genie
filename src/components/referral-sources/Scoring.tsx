'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@headlessui/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { TIER_INFO, TIERS, type Tier } from '@/lib/referral-list/tiers';

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
export function TierButtons({ value, onChange, disabled }: { value: Tier | null; onChange: (tier: Tier | null) => void; disabled?: boolean }) {
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
export function AddMissingDialog({ open, onClose, clinics, defaultClinicId, onAdded }: {
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
      const { data } = await axios.get('/api/practices', { params: { q: q.trim(), scope: 'catalog' } });
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
                  {hits.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No practice in the catalog matches that isn’t already on your lists.</li>}
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

