'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import MainLayout from '@/components/layout/MainLayout';
import ClinicFormFields, { emptyClinicForm, type ClinicFormValues } from '@/components/clinic/ClinicFormFields';
import FaxOptOutSettings from '@/components/FaxOptOutSettings';
import CountyMarketPicker from '@/components/setup/CountyMarketPicker';
import MarketStatusNotice from '@/components/referral-list/MarketStatus';
import ReferralListManager from '@/components/referral-list/ReferralListManager';
import type { MarketCountyView } from '@/lib/geo/market-view';
import { TIER_INFO, TIERS } from '@/lib/referral-list/tiers';

interface Progress {
  organizationName: string;
  profile: Record<'ownerName' | 'ownerPhone' | 'ownerEmail' | 'contactName' | 'contactPhone' | 'contactEmail', string>;
  steps: { contacts: boolean; clinics: boolean; market: boolean; sources: boolean; fax: boolean };
  counts: { clinics: number; listed: number; scored: number; byTier: Record<string, number> };
  done: number;
  total: number;
  onboardedAt: string | null;
}

const STEPS = [
  { key: 'contacts', title: 'Your company' },
  { key: 'clinics', title: 'Locations' },
  { key: 'market', title: 'Market' },
  { key: 'sources', title: 'Score your list' },
  { key: 'fax', title: 'Fax setup' },
  { key: 'review', title: 'How outreach starts' },
] as const;

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function Contacts({ progress }: { progress: Progress }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(progress.profile);
  useEffect(() => setValues(progress.profile), [progress.profile]);
  const save = useMutation({
    mutationFn: async () => (await axios.put<Progress>('/api/onboarding', { profile: values })).data,
    onSuccess: (next) => { queryClient.setQueryData(['onboarding'], next); toast.success('Saved'); },
    onError: () => toast.error('Could not save'),
  });
  const field = (key: keyof Progress['profile'], label: string, type = 'text') => (
    <div>
      <label htmlFor={`ob-${key}`} className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        id={`ob-${key}`}
        type={type}
        value={values[key]}
        onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
      />
    </div>
  );
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">Start with the owner. If someone else handles day-to-day work with us, add them too.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {field('ownerName', 'Owner name')}
        {field('ownerPhone', 'Owner phone', 'tel')}
        {field('ownerEmail', 'Owner email', 'email')}
        {field('contactName', 'Day-to-day contact (optional)')}
        {field('contactPhone', 'Contact phone', 'tel')}
        {field('contactEmail', 'Contact email', 'email')}
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending || !values.ownerName.trim()}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300"
      >
        {save.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function Clinics() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ClinicFormValues>(emptyClinicForm());
  const { data: clinics } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => (await axios.get<{ id: string; name: string; city: string | null; disciplines?: string[] }[]>('/api/clinic-locations')).data,
  });
  const add = useMutation({
    mutationFn: async () => (await axios.post('/api/clinic-locations', values)).data,
    onSuccess: () => {
      toast.success(`Added ${values.name}`);
      setValues(emptyClinicForm());
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding'] });
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not add the clinic');
    },
  });
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Add each location with its address and the disciplines it offers. We map referral sources to the location they
        would refer to, and estimate referrals for its disciplines.
      </p>
      {(clinics ?? []).length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {(clinics ?? []).map((clinic) => (
            <li key={clinic.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-medium text-gray-900">{clinic.name}</span>
              <span className="text-gray-500">{clinic.city ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border border-gray-200 p-4">
        <p className="mb-3 text-sm font-semibold text-gray-900">Add a location</p>
        <ClinicFormFields values={values} onChange={setValues} idPrefix="ob-" />
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending || !values.name.trim()}
          className="mt-4 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300"
        >
          {add.isPending ? 'Adding…' : 'Add location'}
        </button>
      </div>
    </div>
  );
}

interface ClinicWithMarket {
  id: string;
  name: string;
  city: string | null;
  marketCounties?: MarketCountyView[];
}

/** Each location's counties. They build its referral list: every practice in them goes on it. */
function Market() {
  const queryClient = useQueryClient();
  const { data: clinics } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => (await axios.get<ClinicWithMarket[]>('/api/clinic-locations')).data,
  });
  if (!clinics) return <p className="text-sm text-gray-500">Loading…</p>;
  if (clinics.length === 0) return <p className="text-sm text-gray-600">Add a location first.</p>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Pick the counties each location draws patients from. We put every primary care and pediatric practice in them on
        that location&rsquo;s referral list, ready for you to score. Counties we have not gathered yet take a few minutes.
      </p>
      <MarketStatusNotice />
      {clinics.map((clinic) => (
        <div key={clinic.id} className="rounded-md border border-gray-200 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-900">
            {clinic.name}
            {clinic.city && <span className="font-normal text-gray-500"> · {clinic.city}</span>}
          </p>
          <CountyMarketPicker
            clinicId={clinic.id}
            saved={clinic.marketCounties ?? []}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
              queryClient.invalidateQueries({ queryKey: ['market-status'] });
              queryClient.invalidateQueries({ queryKey: ['referral-list'] });
              queryClient.invalidateQueries({ queryKey: ['onboarding'] });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Review({ progress, onFinish, finishing }: { progress: Progress; onFinish: () => void; finishing: boolean }) {
  const { byTier } = progress.counts;
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <p>
        {progress.counts.listed} practice{progress.counts.listed === 1 ? '' : 's'} on your lists, {progress.counts.scored} scored.
        Each tier gets its own outreach:
      </p>
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {TIERS.map((tier) => (
          <li key={tier} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <span>
              <span className="font-medium text-gray-900">{TIER_INFO[tier].label}</span>
              <span className="text-gray-500"> · {TIER_INFO[tier].outreach}</span>
            </span>
            <span className="font-semibold text-gray-900">{byTier[tier] ?? 0}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-4 px-4 py-2">
          <span>
            <span className="font-medium text-gray-900">Not scored yet</span>
            <span className="text-gray-500"> · treated as Cold until you score them.</span>
          </span>
          <span className="font-semibold text-gray-900">{byTier.unscored ?? 0}</span>
        </li>
      </ul>
      <p>
        You can keep scoring, add practices, or upload a list any time under{' '}
        <Link href="/relationships" className="font-medium text-green-700 hover:underline">Your Sources</Link>.
      </p>
      {progress.done < progress.total && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
          {progress.total - progress.done} step{progress.total - progress.done === 1 ? '' : 's'} still open. You can finish now and come back to them.
        </p>
      )}
      <button
        type="button"
        onClick={onFinish}
        disabled={finishing}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:bg-gray-300"
      >
        {finishing ? 'Finishing…' : progress.onboardedAt ? 'Done' : 'Finish setup'}
      </button>
    </div>
  );
}

/** A new subscriber's setup: company, locations, market (which builds the lists), scoring, fax, and how outreach starts. */
export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<(typeof STEPS)[number]['key']>('contacts');
  const { data: progress } = useQuery({
    queryKey: ['onboarding'],
    queryFn: async () => (await axios.get<Progress>('/api/onboarding')).data,
  });
  const finish = useMutation({
    mutationFn: async () => (await axios.put<Progress>('/api/onboarding', { finish: true })).data,
    onSuccess: (next) => {
      queryClient.setQueryData(['onboarding'], next);
      toast.success('You are set up. Welcome to Referral360.');
      router.push('/');
    },
    onError: () => toast.error('Could not finish'),
  });
  const complete = (key: string) => (progress ? (progress.steps as Record<string, boolean>)[key] === true : false);
  const index = STEPS.findIndex((row) => row.key === step);

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Set up Referral360</h1>
      <p className="mt-1 text-sm text-gray-600">
        {progress ? `${progress.organizationName} · ${progress.done} of ${progress.total} steps done` : 'Loading…'}
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Setup steps">
        {STEPS.map((row, position) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setStep(row.key)}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
              step === row.key ? 'border-green-600 bg-green-50 font-medium text-green-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {complete(row.key) ? <CheckCircleIcon className="h-4 w-4 text-green-600" /> : <span className="text-xs text-gray-400">{position + 1}</span>}
            {row.title}
          </button>
        ))}
      </nav>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{STEPS[index].title}</h2>
        {!progress ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : step === 'contacts' ? (
          <Contacts progress={progress} />
        ) : step === 'clinics' ? (
          <Clinics />
        ) : step === 'market' ? (
          <Market />
        ) : step === 'sources' ? (
          <ReferralListManager heading={false} />
        ) : step === 'fax' ? (
          <div className="-mt-6"><FaxOptOutSettings /></div>
        ) : (
          <Review progress={progress} onFinish={() => finish.mutate()} finishing={finish.isPending} />
        )}
        {step !== 'review' && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => { setStep(STEPS[index + 1].key); queryClient.invalidateQueries({ queryKey: ['onboarding'] }); }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Next: {STEPS[index + 1].title}
            </button>
          </div>
        )}
      </section>
    </MainLayout>
  );
}
