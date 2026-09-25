'use client';

import MarketStatusNotice from '@/components/referral-list/MarketStatus';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';
import { ArrowLeftIcon, PlusIcon, PrinterIcon, UsersIcon } from '@heroicons/react/24/outline';
import MainLayout from '@/components/layout/MainLayout';
import ClinicFormFields, { clinicToForm, type ClinicFormValues } from '@/components/clinic/ClinicFormFields';
import CountyMarketPicker from '@/components/setup/CountyMarketPicker';
import type { MarketCountyView } from '@/lib/geo/market-view';
import type { PracticeView } from '@/lib/practices/present';

interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  isActive: boolean;
  marketCounties: MarketCountyView[];
  disciplines?: string[];
  pediatric?: boolean;
  payersAccepted?: string[];
  acceptingNewPatients?: boolean;
}

interface ReferralListResponse {
  practices: PracticeView[];
  totals: {
    practices: number;
    providers: number;
    estimate: { low: number; high: number; byDiscipline?: { key: string; label: string; low: number; high: number }[] };
  };
}

type Tab = 'list' | 'market';

const SHORT: Record<string, string> = {
  pediatrics: 'Pediatrics',
  pcp_family_medicine: 'Family medicine',
  pcp_general_practice: 'General practice',
  clinic_center: 'Clinic / health center',
  // Types no longer pulled; rows formed under an older list can still carry them.
  pcp_internal_medicine: 'Internal medicine',
  pediatrics_np: 'Pediatric NP',
  pcp_np_pa: 'NP / PA',
};

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatFax(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return value ?? '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function addressLine(clinic: ClinicLocation): string {
  const cityLine = [clinic.city, clinic.state].filter(Boolean).join(', ');
  const cityZip = [cityLine, clinic.zipCode].filter(Boolean).join(' ');
  return [clinic.address, cityZip].filter(Boolean).join(', ') || 'Address not added yet';
}

function rangeText(range: { low: number; high: number } | null | undefined): string {
  if (!range) return '—';
  return range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`;
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReferralList({ clinic }: { clinic: ClinicLocation }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['clinic-referral-list', clinic.id],
    queryFn: async () => (await axios.get<ReferralListResponse>(`/api/clinic-locations/${clinic.id}/practices`)).data,
  });

  const remove = useMutation({
    mutationFn: async (practiceId: string) =>
      axios.delete(`/api/clinic-locations/${clinic.id}/practices`, { data: { practiceIds: [practiceId] } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-referral-list', clinic.id] });
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      toast.success('Removed from this clinic’s list');
    },
    onError: () => toast.error('Could not remove the practice'),
  });

  const practices = data?.practices ?? [];
  const addHref = `/referral-sources?clinic=${clinic.id}`;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {practices.length} practice{practices.length === 1 ? '' : 's'} on this list
        </p>
        <Link
          href={addHref}
          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
        >
          <PlusIcon className="h-4 w-4" /> Add practices
        </Link>
      </div>

      {isLoading ? (
        <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>
      ) : practices.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <UsersIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-900">No practices on this list yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Practices come from the catalog. Pull a county under Referral Sources if it is empty, then pick the
            practices that refer to this clinic and add them here.
          </p>
          <Link
            href={addHref}
            className="mt-4 inline-flex items-center rounded-md bg-[#0B2A5B] px-3 py-2 text-sm font-semibold text-white hover:bg-[#123a7a]"
          >
            Choose practices
          </Link>
        </div>
      ) : (
        <ul role="list" className="divide-y divide-gray-200">
          {practices.map((practice) => (
            <li key={practice.id} className="grid grid-cols-12 items-center gap-x-4 px-4 py-3 sm:px-6">
              <div className="col-span-12 min-w-0 lg:col-span-4">
                <p className="truncate text-sm font-semibold text-gray-900">{practice.name}</p>
                <p className="truncate text-sm text-gray-500">
                  {[practice.address, practice.city, practice.zipCode].filter(Boolean).join(', ')}
                </p>
              </div>
              <div className="col-span-6 mt-2 whitespace-nowrap lg:col-span-2 lg:mt-0">
                {practice.faxNumber ? (
                  <p className="flex items-center gap-1.5 font-mono text-sm text-gray-800">
                    <PrinterIcon className="h-4 w-4 text-gray-400" />
                    {formatFax(practice.faxNumber)}
                  </p>
                ) : (
                  <p className="text-sm text-red-600">No fax</p>
                )}
              </div>
              <div className="col-span-6 mt-2 lg:col-span-3 lg:mt-0">
                <p className="text-sm font-medium text-gray-900">
                  {practice.providerCount === 0 ? 'Providers unknown' : `${practice.providerCount} provider${practice.providerCount === 1 ? '' : 's'}`}
                </p>
                {practice.providerCount > 0 && (
                  <p className="truncate text-xs text-gray-500">
                    {Object.entries(practice.taxonomyMix)
                      .sort((left, right) => right[1] - left[1])
                      .map(([type, count]) => `${SHORT[type] ?? type} ${count}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="col-span-6 mt-2 whitespace-nowrap lg:col-span-2 lg:mt-0 lg:text-right">
                <p className="text-sm font-semibold text-gray-900">{rangeText(practice.estimate)}</p>
                <p className="text-xs text-gray-500">est. referrals / mo</p>
              </div>
              <div className="col-span-6 mt-2 text-right lg:col-span-1 lg:mt-0">
                <button
                  type="button"
                  onClick={() => remove.mutate(practice.id)}
                  disabled={remove.isPending}
                  className="text-sm font-medium text-gray-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ClinicPage() {
  const { data: estimateSettings } = useQuery({
    queryKey: ['estimate-rates'],
    queryFn: async () => (await axios.get<{ settings: { disciplines: { key: string; label: string }[] } }>('/api/estimate-rates')).data,
  });
  const disciplineLabels = Object.fromEntries((estimateSettings?.settings.disciplines ?? []).map((row) => [row.key, row.label]));
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<ClinicFormValues | null>(null);

  const { data: clinic, isLoading, isError } = useQuery<ClinicLocation>({
    queryKey: ['clinic-location', id],
    queryFn: async () => (await axios.get(`/api/clinic-locations/${id}`)).data,
    enabled: Boolean(id),
  });
  const { data: list } = useQuery({
    queryKey: ['clinic-referral-list', id],
    queryFn: async () => (await axios.get<ReferralListResponse>(`/api/clinic-locations/${id}/practices`)).data,
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ClinicFormValues) => (await axios.put(`/api/clinic-locations/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-location', id] });
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Clinic updated');
      setEditing(false);
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to update clinic');
    },
  });

  const counties = clinic?.marketCounties ?? [];

  const totals = list?.totals;

  return (
    <MainLayout>
      <Link href="/clinic-locations" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeftIcon className="h-4 w-4" /> Our Clinics
      </Link>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading…</p>
      ) : isError || !clinic ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">This clinic could not be loaded.</p>
        </div>
      ) : (
        <>
          <div className="mt-2 sm:flex sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {clinic.name}
                {!clinic.isActive && <span className="ml-2 text-sm font-normal text-gray-500">Inactive</span>}
              </h1>
              <p className="mt-1 text-sm text-gray-600">{addressLine(clinic)}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Phone {clinic.phoneNumber || '—'} · Fax {clinic.faxNumber ? formatFax(clinic.faxNumber) : '—'}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {(clinic.disciplines?.length ?? 0) > 0
                  ? (clinic.disciplines ?? []).map((key) => disciplineLabels[key] ?? key).join(', ')
                  : 'All disciplines'}
                {' · '}
                {clinic.pediatric === false ? 'Adults' : 'Sees children'}
                {' · '}
                {clinic.acceptingNewPatients === false ? 'Not accepting new patients' : 'Accepting new patients'}
                {(clinic.payersAccepted?.length ?? 0) > 0 && ` · ${clinic.payersAccepted?.join(', ')}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData(clinicToForm(clinic));
                setEditing(true);
              }}
              className="mt-3 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 lg:mt-0"
            >
              Edit clinic
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Practices on list" value={totals?.practices ?? '—'} />
            <StatTile label="Providers" value={totals?.providers ?? '—'} hint="across listed practices" />
            <StatTile
              label="Est. referrals / month"
              value={rangeText(totals?.estimate)}
              hint={
                (totals?.estimate.byDiscipline ?? [])
                  .filter((row) => row.high > 0)
                  .map((row) => `${row.label} ${row.low === row.high ? row.low : `${row.low}–${row.high}`}`)
                  .join(' · ') || 'from listed practices'
              }
            />
            <StatTile
              label="Market"
              value={counties.length === 0 ? 'Not set' : `${counties.length} count${counties.length === 1 ? 'y' : 'ies'}`}
              hint={counties.map((county) => county.name).join(', ') || 'Counties this clinic serves'}
            />
          </div>

          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex gap-6" aria-label="Tabs">
              {(
                [
                  ['list', 'Referral list', totals?.practices],
                  ['market', 'Market', undefined],
                ] as [Tab, string, number | undefined][]
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={classNames(
                    tab === key
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                    'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium',
                  )}
                >
                  {label}
                  {count !== undefined && (
                    <span
                      className={classNames(
                        tab === key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600',
                        'ml-2 rounded-full px-2 py-0.5 text-xs',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-4">
            {tab === 'list' ? (
              <ReferralList clinic={clinic} />
            ) : (
              <div className="max-w-3xl space-y-6">
                <p className="text-sm text-gray-600">
                  The counties this clinic serves. They build its referral list: every practice in them goes on it, ready
                  to score under{' '}
                  <Link href="/relationships" className="font-medium text-green-700 hover:text-green-600">
                    Your Sources
                  </Link>
                  . Removing a county takes off its practices you have not scored.
                </p>
                <MarketStatusNotice clinicId={clinic.id} />
                <CountyMarketPicker
                  clinicId={clinic.id}
                  saved={counties}
                  onSaved={(next) => {
                    queryClient.setQueryData<ClinicLocation>(['clinic-location', id], (current) =>
                      current ? { ...current, marketCounties: next } : current,
                    );
                    queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
                    queryClient.invalidateQueries({ queryKey: ['market-status'] });
                    queryClient.invalidateQueries({ queryKey: ['referral-list'] });
                    queryClient.invalidateQueries({ queryKey: ['clinic-referral-list', id] });
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
              Edit clinic
            </Dialog.Title>
            {formData && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  updateMutation.mutate(formData);
                }}
                className="mt-4"
              >
                <ClinicFormFields values={formData} onChange={setFormData} idPrefix="edit-" />
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="inline-flex justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Saving…' : 'Save clinic'}
                  </button>
                </div>
              </form>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>
    </MainLayout>
  );
}
