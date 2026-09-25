'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Menu } from '@headlessui/react';
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import MainLayout from '@/components/layout/MainLayout';
import AddPracticeModal from '@/components/AddPracticeModal';
import CountyPullPanel from '@/components/setup/CountyPullPanel';
import MarketStatusNotice from '@/components/referral-list/MarketStatus';
import { useTenant } from '@/lib/use-tenant';
import { classNames, disciplineText, SourceList, StatTile, type Clinic, type SourcesResponse } from '@/components/referral-sources/SourceList';

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
  const { data: me } = useTenant();
  const isParagon = me?.isParagon === true;

  // Nothing pulled yet: open the county pull so the first step is on screen.
  useEffect(() => {
    if (stats && stats.practices === 0 && isParagon) setPulling(true);
  }, [stats, isParagon]);

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
            {isParagon
              ? 'Pediatricians and primary care physicians from NPI, grouped under their practice and named as Google lists it; open a row to see them. Check sources and add them to a clinic’s referral list.'
              : 'The pediatric and primary care practices in your locations’ counties. Score each one: Trusted sends referrals now, Warm knows you, Cold is new to you, and Not a fit is never contacted. The score sets its outreach.'}
          </p>
        </div>
        {isParagon && (
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
        )}
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

      {isParagon && (
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
              Referring providers from the NPI file, grouped into practices, named on Google, and researched for any
              missing fax.
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
      )}

      <MarketStatusNotice />

      <div className="mt-6">
        <SourceList clinics={clinics ?? []} onPull={openPull} canEdit={isParagon} />
      </div>
    </MainLayout>
  );
}
