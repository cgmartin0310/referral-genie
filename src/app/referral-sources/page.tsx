'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Menu, Switch } from '@headlessui/react';
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import MainLayout from '../../components/layout/MainLayout';
import AddPracticeModal from '../../components/AddPracticeModal';
import EditPracticeModal from '../../components/EditPracticeModal';
import CountyPullPanel from '../../components/setup/CountyPullPanel';
import type { PracticeView, ProviderView } from '@/lib/practices/present';

interface Clinic {
  id: string;
  name: string;
}

interface SourcesResponse {
  practices: PracticeView[];
  totals: {
    practices: number;
    organizations: number;
    providers: number;
    withFax: number;
    estimate: { low: number; high: number; byDiscipline: { key: string; label: string; low: number; high: number }[] };
  };
  counties: { fips: string | null; name: string | null; practices: number }[];
}

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatFax(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return value ?? '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

function mixLabel(mix: Record<string, number>): string {
  return Object.entries(mix)
    .sort((left, right) => right[1] - left[1])
    .map(([type, count]) => `${SHORT[type] ?? type} ${count}`)
    .join(' · ');
}

function rangeOf(low: number, high: number): string {
  return low === high ? `${low}` : `${low}–${high}`;
}

/** "Speech therapy 1–3 · Occupational therapy 0–2", skipping disciplines with nothing. */
function disciplineText(rows: { label: string; low: number; high: number }[] | undefined): string {
  return (rows ?? [])
    .filter((row) => row.high > 0)
    .map((row) => `${row.label} ${rangeOf(row.low, row.high)}`)
    .join(' · ');
}

function estimateText(estimate: PracticeView['estimate']): string {
  if (!estimate) return '—';
  return estimate.low === estimate.high ? `${estimate.low}` : `${estimate.low}–${estimate.high}`;
}

/** A practice (org NPI or shared Google listing) groups its providers; anyone else is their own referral source. */
function isGroup(source: PracticeView): boolean {
  return source.kind !== 'provider';
}

/* ------------------------------------------------------------------ */

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function OwnFaxToggle({ provider }: { provider: ProviderView }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (useOwnFax: boolean) => axios.patch(`/api/providers/${provider.id}`, { useOwnFax }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['practices'] }),
    onError: () => toast.error('Could not update the fax setting'),
  });
  const disabled = !provider.faxNumber;
  return (
    <Switch
      checked={provider.useOwnFax}
      disabled={disabled || mutation.isPending}
      onChange={(value: boolean) => mutation.mutate(value)}
      title={disabled ? 'No fax on file for this provider' : 'Send faxes to this provider’s own line'}
      className={classNames(
        provider.useOwnFax ? 'bg-green-600' : 'bg-gray-200',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2',
      )}
    >
      <span
        className={classNames(
          provider.useOwnFax ? 'translate-x-4' : 'translate-x-0',
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition',
        )}
      />
    </Switch>
  );
}

function SendsTo({ provider }: { provider: ProviderView }) {
  const { sendsTo } = provider;
  if (!sendsTo.number) return <span className="text-sm text-red-600">No fax on file</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
      <span className="font-mono">{formatFax(sendsTo.number)}</span>
      <span
        className={classNames(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          sendsTo.level === 'provider' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600',
        )}
      >
        {sendsTo.level === 'provider' ? 'own line' : 'office'}
      </span>
      {sendsTo.fellBack && <span className="text-xs text-amber-600">own line requested, none on file</span>}
    </span>
  );
}

function ClinicChips({ clinics }: { clinics: PracticeView['clinics'] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {clinics.map((clinic) => (
        <span
          key={clinic.id}
          title={`On ${clinic.name}’s list`}
          className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20"
        >
          {clinic.name.split(' ')[0]}
        </span>
      ))}
    </div>
  );
}

function RowMenu({ source, onEdit }: { source: PracticeView; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => axios.delete(`/api/practices/${source.id}`),
    onSuccess: () => {
      toast.success(`Deleted ${source.name}. Restore it under Show deleted.`);
      queryClient.invalidateQueries({ queryKey: ['practices'] });
    },
    onError: () => toast.error('Could not delete'),
  });
  return (
    <Menu as="div" className="relative">
      <Menu.Button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label={`Actions for ${source.name}`}>
        <EllipsisVerticalIcon className="h-5 w-5" />
      </Menu.Button>
      {/* Anchored: drawn outside the list's card and flipped upward near the bottom, so the last row's menu is not cut off. */}
      <Menu.Items
        anchor="bottom end"
        className="z-50 w-36 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 [--anchor-gap:4px] focus:outline-none"
      >
        <Menu.Item>
          {({ active }) => (
            <button type="button" onClick={onEdit} className={classNames('block w-full px-3 py-2 text-left text-sm', active ? 'bg-gray-100 text-gray-900' : 'text-gray-700')}>
              Edit
            </button>
          )}
        </Menu.Item>
        <Menu.Item>
          {({ active }) => (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete ${source.name}? Pulling the county again will not bring it back; you can restore it under Show deleted.`)) remove.mutate();
              }}
              className={classNames('block w-full px-3 py-2 text-left text-sm', active ? 'bg-red-50 text-red-700' : 'text-red-600')}
            >
              Delete
            </button>
          )}
        </Menu.Item>
      </Menu.Items>
    </Menu>
  );
}

function RemoveProvider({ provider }: { provider: ProviderView }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => axios.patch(`/api/providers/${provider.id}`, { hidden: true }),
    onSuccess: () => {
      toast.success(`Removed ${provider.name}. Restore under Show deleted.`);
      queryClient.invalidateQueries({ queryKey: ['practices'] });
    },
    onError: () => toast.error('Could not remove the provider'),
  });
  return (
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => remove.mutate()}
      className="text-xs font-medium text-gray-400 hover:text-red-600"
      title="Take this provider off the list; later pulls keep them off"
    >
      Remove
    </button>
  );
}

/* ------------------------------------------------------------------ */

function SourceRow({
  source,
  selected,
  onToggle,
  onEdit,
}: {
  source: PracticeView;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const group = isGroup(source);
  const canExpand = group && source.providers.length > 0;
  const solo = !group ? source.providers[0] : null;
  const addressLine = [source.address, source.city, source.zipCode].filter(Boolean).join(', ');
  // A provider on their own still shows the clinic Google lists at their address.
  const listedAt = solo && source.placeName && source.placeName.toLowerCase() !== source.name.toLowerCase()
    ? source.placeName
    : null;

  return (
    <li className={classNames('bg-white', selected && 'bg-green-50/40')}>
      <div className="grid grid-cols-12 items-center gap-x-4 px-4 py-3 sm:px-6">
        <div className="col-span-12 flex items-center gap-3 lg:col-span-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${source.name}`}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
          />
          {group ? (
            <button
              type="button"
              onClick={() => canExpand && setOpen(!open)}
              disabled={!canExpand}
              aria-expanded={open}
              aria-label={open ? 'Hide providers' : 'Show providers'}
              className={classNames('rounded p-0.5 text-gray-400', canExpand ? 'hover:bg-gray-100 hover:text-gray-600' : 'opacity-30')}
            >
              <ChevronRightIcon className={classNames('h-4 w-4 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="p-0.5 text-gray-300" aria-hidden="true">
              <UserIcon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {source.name}
              {source.editedFields.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400" title={`You edited: ${source.editedFields.join(', ')}`}>
                  edited
                </span>
              )}
              {source.nameAmbiguous && (
                <span className="ml-2 text-xs font-normal text-amber-600" title="Two organizations share this address">
                  shared address
                </span>
              )}
            </p>
            <p className="truncate text-sm text-gray-500">
              {listedAt && <span className="text-gray-700">{listedAt} · </span>}
              {addressLine}
              {source.website && (
                <>
                  {' · '}
                  <a
                    href={source.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-700 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {source.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </>
              )}
              {source.rating != null && (
                <span className="ml-2 text-xs text-gray-500" title="Google rating">
                  ★ {source.rating.toFixed(1)}{source.reviewCount ? ` (${source.reviewCount})` : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="col-span-6 mt-2 whitespace-nowrap lg:col-span-2 lg:mt-0">
          {source.faxNumber ? (
            <p className="flex items-center gap-1.5 font-mono text-sm text-gray-800">
              <PrinterIcon className="h-4 w-4 text-gray-400" />
              {formatFax(source.faxNumber)}
            </p>
          ) : (
            <p className="text-sm text-gray-400">No fax</p>
          )}
          {source.phone && <p className="text-xs text-gray-500">{formatFax(source.phone)}</p>}
        </div>

        <div className="col-span-6 mt-2 lg:col-span-3 lg:mt-0">
          {group ? (
            <>
              <p className="text-sm font-medium text-gray-900">
                {source.providerCount === 0
                  ? (source.kind === 'organization' ? 'Organization' : 'No providers on NPI')
                  : `${source.providerCount} provider${source.providerCount === 1 ? '' : 's'}`}
              </p>
              {source.providerCount > 0 && <p className="truncate text-xs text-gray-500">{mixLabel(source.taxonomyMix)}</p>}
            </>
          ) : (
            <p className="text-sm text-gray-700">{solo?.sourceTypeLabel ?? mixLabel(source.taxonomyMix)}</p>
          )}
        </div>

        <div className="col-span-6 mt-2 whitespace-nowrap lg:col-span-2 lg:mt-0 lg:text-right">
          <p className="text-sm font-semibold text-gray-900" title={disciplineText(source.estimate?.byDiscipline) || undefined}>
            {estimateText(source.estimate)}
          </p>
          <p className="text-xs text-gray-500">est. referrals / mo</p>
        </div>

        <div className="col-span-6 mt-2 flex items-center justify-end gap-1 lg:col-span-1 lg:mt-0">
          <ClinicChips clinics={source.clinics} />
          <RowMenu source={source} onEdit={onEdit} />
        </div>
      </div>

      {open && (
        <ul className="border-t border-gray-100 bg-gray-50/60">
          {source.providers.map((provider) => (
            <li
              key={provider.id}
              className="grid grid-cols-12 items-center gap-x-4 px-4 py-2 pl-[4.25rem] text-sm sm:px-6 lg:pl-[4.75rem]"
            >
              <div className="col-span-12 lg:col-span-4">
                <span className="font-medium text-gray-900">{provider.name}</span>
                <span className="ml-2 text-xs text-gray-500">NPI {provider.npiNumber}</span>
              </div>
              <div className="col-span-6 text-gray-600 lg:col-span-2">{provider.sourceTypeLabel}</div>
              <div className="col-span-6 lg:col-span-5">
                <SendsTo provider={provider} />
              </div>
              <div className="col-span-12 mt-1 flex items-center justify-end gap-2 lg:col-span-1 lg:mt-0">
                <span className="text-xs text-gray-500">Own fax</span>
                <OwnFaxToggle provider={provider} />
                <RemoveProvider provider={provider} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function SourceList({ clinics, onPull }: { clinics: Clinic[]; onPull: () => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [countyFips, setCountyFips] = useState('');
  const [hasFax, setHasFax] = useState(false);
  const [clinicId, setClinicId] = useState('');
  const [hideListed, setHideListed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<PracticeView | null>(null);

  // Arriving from a clinic page: preselect that clinic and hide what it already has.
  useEffect(() => {
    const fromClinic = new URLSearchParams(window.location.search).get('clinic');
    if (fromClinic) {
      setClinicId(fromClinic);
      setHideListed(true);
    }
  }, []);

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (countyFips) search.set('countyFips', countyFips);
    if (hasFax) search.set('hasFax', '1');
    if (hideListed && clinicId) search.set('notOnClinicId', clinicId);
    return search.toString();
  }, [q, countyFips, hasFax, hideListed, clinicId]);

  const { data, isLoading } = useQuery({
    queryKey: ['practices', params],
    queryFn: async () => (await axios.get<SourcesResponse>(`/api/practices?${params}`)).data,
  });

  const addToClinic = useMutation({
    mutationFn: async () =>
      (await axios.post(`/api/clinic-locations/${clinicId}/practices`, { practiceIds: [...selected] })).data as {
        added: number;
        alreadyListed: number;
      },
    onSuccess: (result) => {
      const clinic = clinics.find((row) => row.id === clinicId)?.name ?? 'the clinic';
      toast.success(
        result.alreadyListed
          ? `Added ${result.added} to ${clinic} (${result.alreadyListed} already listed)`
          : `Added ${result.added} to ${clinic}`,
      );
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['practices'] });
    },
    onError: () => toast.error('Could not add to the clinic'),
  });

  const sources = data?.practices ?? [];
  const allVisibleSelected = sources.length > 0 && sources.every((row) => selected.has(row.id));
  const clinicName = clinics.find((row) => row.id === clinicId)?.name;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search providers, organizations, streets"
              className="w-full rounded-md border-gray-300 pl-9 text-sm focus:border-green-600 focus:ring-green-600"
            />
          </label>
          <select
            value={countyFips}
            onChange={(event) => setCountyFips(event.target.value)}
            className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600"
          >
            <option value="">All counties</option>
            {(data?.counties ?? []).map((county) => (
              <option key={county.fips ?? 'none'} value={county.fips ?? ''}>
                {county.name} ({county.practices})
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={hasFax}
              onChange={(event) => setHasFax(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
            />
            Has fax
          </label>
          <label
            className={classNames('inline-flex items-center gap-2 text-sm', clinicId ? 'text-gray-700' : 'text-gray-400')}
            title={clinicId ? '' : 'Choose a clinic first'}
          >
            <input
              type="checkbox"
              checked={hideListed}
              disabled={!clinicId}
              onChange={(event) => setHideListed(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600 disabled:opacity-40"
            />
            Not yet on list
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
            />
            Show deleted
          </label>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={clinicId}
            onChange={(event) => setClinicId(event.target.value)}
            className="rounded-md border-gray-300 text-sm focus:border-green-600 focus:ring-green-600"
          >
            <option value="">Add to clinic…</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!clinicId || selected.size === 0 || addToClinic.isPending}
            onClick={() => addToClinic.mutate()}
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {selected.size > 0 && clinicName ? `Add ${selected.size} to ${clinicName}` : 'Add selected'}
          </button>
        </div>
      </div>

      <EditPracticeModal practice={editing} onClose={() => setEditing(null)} />
      {showDeleted ? (
        <DeletedList />
      ) : (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(sources.map((row) => row.id)))}
            aria-label="Select all shown"
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
          />
          <span>
            {sources.length} referral source{sources.length === 1 ? '' : 's'}
            {selected.size > 0 && <span className="ml-2 normal-case text-green-700">· {selected.size} selected</span>}
          </span>
        </div>

        {isLoading ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>
        ) : sources.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-900">No referral sources yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Pick a county and pull its pediatricians and primary care physicians from NPI.
            </p>
            <button
              type="button"
              onClick={onPull}
              className="mt-4 inline-flex items-center rounded-md bg-[#0B2A5B] px-3 py-2 text-sm font-semibold text-white hover:bg-[#123a7a]"
            >
              Pull a county
            </button>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-gray-200">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                selected={selected.has(source.id)}
                onToggle={() => toggle(source.id)}
                onEdit={() => setEditing(source)}
              />
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

/** What a person deleted or removed, each with Restore. */
function DeletedList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['practices', 'deleted'],
    queryFn: async () =>
      (await axios.get<{ practices: PracticeView[]; providers: ProviderView[] }>('/api/practices?deleted=1')).data,
  });
  const restore = useMutation({
    mutationFn: async (target: { kind: 'practice' | 'provider'; id: string }) =>
      target.kind === 'practice'
        ? axios.patch(`/api/practices/${target.id}`, { hidden: false })
        : axios.patch(`/api/providers/${target.id}`, { hidden: false }),
    onSuccess: () => {
      toast.success('Restored');
      queryClient.invalidateQueries({ queryKey: ['practices'] });
    },
    onError: () => toast.error('Could not restore'),
  });

  const practices = data?.practices ?? [];
  const providers = data?.providers ?? [];
  const Row = ({ title, detail, onRestore }: { title: string; detail: string; onRestore: () => void }) => (
    <li className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
        <p className="truncate text-sm text-gray-500">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={restore.isPending}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        Restore
      </button>
    </li>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">
        Deleted · {practices.length} referral source{practices.length === 1 ? '' : 's'} · {providers.length} provider{providers.length === 1 ? '' : 's'}
      </div>
      {isLoading ? (
        <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>
      ) : practices.length + providers.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-500">Nothing deleted.</p>
      ) : (
        <ul role="list" className="divide-y divide-gray-200">
          {practices.map((practice) => (
            <Row
              key={practice.id}
              title={practice.name}
              detail={[practice.address, practice.city].filter(Boolean).join(', ')}
              onRestore={() => restore.mutate({ kind: 'practice', id: practice.id })}
            />
          ))}
          {providers.map((provider) => (
            <Row
              key={provider.id}
              title={provider.name}
              detail={`${provider.sourceTypeLabel}${provider.practiceName ? ` · removed from ${provider.practiceName}` : ''}`}
              onRestore={() => restore.mutate({ kind: 'provider', id: provider.id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ReferralSourcesPage() {
  const [adding, setAdding] = useState(false);
  const [pulling, setPulling] = useState(false);

  const { data: clinics } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => (await axios.get<Clinic[]>('/api/clinic-locations')).data,
  });
  const { data: totals } = useQuery({
    queryKey: ['practices', ''],
    queryFn: async () => (await axios.get<SourcesResponse>('/api/practices')).data,
  });

  const stats = totals?.totals;

  // Nothing pulled yet: open the county pull so the first step is on screen.
  useEffect(() => {
    if (stats && stats.practices === 0) setPulling(true);
  }, [stats]);

  const openPull = () => {
    setPulling(true);
    setTimeout(() => document.getElementById('pull-county')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <MainLayout>
      <div className="sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Referral Sources</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Pediatricians and primary care physicians from NPI, grouped under their practice and named as Google lists it;
            open a row to see them. Check sources and add them to a clinic’s referral list.
          </p>
        </div>
        <Menu as="div" className="relative mt-4 sm:mt-0">
          <Menu.Button className="inline-flex items-center gap-1 rounded-md bg-[#0B2A5B] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#123a7a]">
            <PlusIcon className="h-4 w-4" /> Add source <ChevronDownIcon className="h-4 w-4" />
          </Menu.Button>
          <Menu.Items className="absolute right-0 z-10 mt-2 w-64 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
            <Menu.Item>
              {({ active }) => (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={classNames(active && 'bg-gray-50', 'block w-full px-4 py-2 text-left text-sm text-gray-700')}
                >
                  Add manually
                  <span className="block text-xs text-gray-500">A school, program, or office without an NPI</span>
                </button>
              )}
            </Menu.Item>
            <Menu.Item>
              {({ active }) => (
                <Link href="/prospecting" className={classNames(active && 'bg-gray-50', 'block px-4 py-2 text-sm text-gray-700')}>
                  Search Google listings
                  <span className="block text-xs text-gray-500">Find businesses by type near an address</span>
                </Link>
              )}
            </Menu.Item>
          </Menu.Items>
        </Menu>
      </div>
      <AddPracticeModal open={adding} onClose={() => setAdding(false)} />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Providers" value={stats?.providers ?? '—'} />
        <StatTile
          label="Practices"
          value={stats?.organizations ?? '—'}
          hint={stats ? `${stats.practices - stats.organizations} providers listed on their own` : undefined}
        />
        <StatTile
          label="With a fax"
          value={stats?.withFax ?? '—'}
          hint={stats ? `${stats.practices - stats.withFax} need research` : undefined}
        />
        <StatTile
          label="Est. referrals / month"
          value={stats ? `${stats.estimate.low}–${stats.estimate.high}` : '—'}
          hint={stats ? disciplineText(stats.estimate.byDiscipline) || 'across all sources' : undefined}
        />
      </div>

      <div id="pull-county" className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setPulling((open) => !open)}
          aria-expanded={pulling}
          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
        >
          <span>
            <span className="block text-sm font-semibold text-gray-900">Pull referral sources for a county</span>
            <span className="block text-sm text-gray-500">
              Pediatricians and primary care physicians from NPI, matched to Google Places, then researched for fax,
              email, and referral details.
            </span>
          </span>
          <ChevronDownIcon className={classNames('h-5 w-5 shrink-0 text-gray-400 transition-transform', pulling && 'rotate-180')} />
        </button>
        {pulling && (
          <div className="border-t border-gray-200 px-5 py-5">
            <CountyPullPanel />
          </div>
        )}
      </div>

      <div className="mt-6">
        <SourceList clinics={clinics ?? []} onPull={openPull} />
      </div>
    </MainLayout>
  );
}
