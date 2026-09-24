'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  MegaphoneIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import MainLayout from '../components/layout/MainLayout';
import RecentInteractionsWidget from '../components/RecentInteractionsWidget';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface Clinic {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  marketCounties: MarketCountyView[];
  referralList: { practices: number; providers: number; estimate: { low: number; high: number } };
}

interface PracticeTotals {
  totals: { practices: number; providers: number; withFax: number; estimate: { low: number; high: number } };
}

function range(value: { low: number; high: number } | undefined): string {
  if (!value) return '—';
  return value.low === value.high ? `${value.low}` : `${value.low}–${value.high}`;
}

function StatTile({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </>
  );
  const className = 'block rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm';
  return href ? (
    <Link href={href} className={`${className} hover:border-green-600/40`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function GettingStarted() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-green-700">Get started</p>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">Add your first clinic</h2>
      <ol className="mt-4 space-y-2 text-sm text-gray-700">
        <li>
          <span className="font-semibold text-[#0B2A5B]">1.</span> Under Referral Sources, pull a county: pediatricians
          and primary care physicians from NPI, enriched with Google Places and website research.
        </li>
        <li>
          <span className="font-semibold text-[#0B2A5B]">2.</span> Add your clinic.
        </li>
        <li>
          <span className="font-semibold text-[#0B2A5B]">3.</span> Add the practices that refer to that clinic to its list,
          then send them a campaign.
        </li>
      </ol>
      <Link
        href="/clinic-locations"
        className="mt-5 inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
      >
        <PlusIcon className="h-4 w-4" /> Add a clinic
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const { data: clinics, isLoading } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => (await axios.get<Clinic[]>('/api/clinic-locations')).data,
  });
  const { data: practices } = useQuery({
    queryKey: ['practices', ''],
    queryFn: async () => (await axios.get<PracticeTotals>('/api/practices')).data,
  });
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding'],
    queryFn: async () =>
      (await axios.get<{ isParagon: boolean; onboardedAt: string | null; done: number; total: number }>('/api/onboarding')).data,
  });

  const totals = practices?.totals;
  const listed = clinics?.reduce(
    (sum, clinic) => ({
      low: sum.low + clinic.referralList.estimate.low,
      high: sum.high + clinic.referralList.estimate.high,
    }),
    { low: 0, high: 0 },
  );

  return (
    <MainLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-600">Your clinics, the practices that refer to them, and what to expect.</p>

      {onboarding && !onboarding.isParagon && !onboarding.onboardedAt && (
        <Link
          href="/onboarding"
          className="mt-4 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-900 hover:bg-green-100"
        >
          <span>
            <strong>Finish setting up Referral360.</strong> {onboarding.done} of {onboarding.total} steps done.
          </span>
          <span className="font-semibold">Continue &rarr;</span>
        </Link>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Our clinics" value={clinics?.length ?? '—'} href="/clinic-locations" />
        <StatTile
          label="Practices"
          value={totals?.practices ?? '—'}
          hint={totals ? `${totals.providers} providers` : undefined}
          href="/referral-sources"
        />
        <StatTile
          label="With a fax"
          value={totals?.withFax ?? '—'}
          hint={totals ? `${totals.practices - totals.withFax} need research` : undefined}
        />
        <StatTile label="Est. referrals / month" value={range(listed)} hint="from practices on clinic lists" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Our Clinics</h2>
            <Link href="/clinic-locations" className="text-sm font-medium text-green-700 hover:text-green-600">
              Manage clinics
            </Link>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : !clinics || clinics.length === 0 ? (
            <GettingStarted />
          ) : (
            <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {clinics.map((clinic) => {
                const counties = clinic.marketCounties.length;
                return (
                  <li key={clinic.id}>
                    <Link
                      href={`/clinic-locations/${clinic.id}`}
                      className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-green-600/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{clinic.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(', ') || 'No address yet'}
                          </p>
                        </div>
                        <BuildingOffice2Icon className="h-5 w-5 shrink-0 text-[#0B2A5B]" />
                      </div>
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <dt className="text-xs text-gray-500">Practices</dt>
                          <dd className="text-lg font-semibold text-gray-900">{clinic.referralList.practices}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Providers</dt>
                          <dd className="text-lg font-semibold text-gray-900">{clinic.referralList.providers}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500">Est. / mo</dt>
                          <dd className="text-lg font-semibold text-gray-900">{range(clinic.referralList.estimate)}</dd>
                        </div>
                      </dl>
                      <p className="mt-4 flex items-center gap-1 text-xs text-gray-500">
                        {counties === 0 ? (
                          <span className="text-amber-600">No counties picked yet</span>
                        ) : (
                          <span>
                            {counties} count{counties === 1 ? 'y' : 'ies'} ·{' '}
                            {clinic.marketCounties.map((county) => county.name).join(', ')}
                          </span>
                        )}
                        <ArrowRightIcon className="ml-auto h-3.5 w-3.5" />
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Quick actions</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {[
              { href: '/referral-sources', icon: UserGroupIcon, label: 'Browse referral sources', hint: 'Add practices to a clinic’s list' },
              { href: '/campaigns/new', icon: MegaphoneIcon, label: 'New campaign', hint: 'Fax a clinic’s referral list' },
              { href: '/clinic-locations', icon: PlusIcon, label: 'Add a clinic', hint: 'Then build its referral list' },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
              >
                <action.icon className="h-5 w-5 text-[#0B2A5B]" />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{action.label}</span>
                  <span className="block text-xs text-gray-500">{action.hint}</span>
                </span>
              </Link>
            ))}
          </div>
          <RecentInteractionsWidget />
        </div>
      </div>
    </MainLayout>
  );
}
