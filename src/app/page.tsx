'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import MainLayout from '../components/layout/MainLayout';
import RecentInteractionsWidget from '../components/RecentInteractionsWidget';
import { UserGroupIcon, CalendarIcon, MegaphoneIcon, MapPinIcon } from '@heroicons/react/24/outline';

interface ClinicSummary {
  id: string;
  name: string;
  marketCounties?: { fips: string }[];
}

export default function Dashboard() {
  // Fetch summary data for the dashboard
  const { data: referralSources } = useQuery({
    queryKey: ['referral-sources-count'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/referral-sources');
        return { count: data.length || 0 };
      } catch (error) {
        console.error('Error fetching referral sources count:', error);
        return { count: 0 };
      }
    },
  });

  const { data: interactions } = useQuery({
    queryKey: ['interactions-count'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/interactions');
        return { count: data.length || 0 };
      } catch (error) {
        console.error('Error fetching interactions count:', error);
        return { count: 0 };
      }
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns-count'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/campaigns');
        return { count: data.length || 0 };
      } catch (error) {
        console.error('Error fetching campaigns count:', error);
        return { count: 0 };
      }
    },
  });

  const { data: clinics } = useQuery<ClinicSummary[]>({
    queryKey: ['clinic-locations'],
    queryFn: async () => {
      const { data } = await axios.get('/api/clinic-locations');
      return data;
    },
  });

  const nextClinic = clinics?.find((clinic) => (clinic.marketCounties?.length ?? 0) === 0) ?? clinics?.[0];
  const startHref = !clinics || clinics.length === 0
    ? '/clinic-locations'
    : (nextClinic && (nextClinic.marketCounties?.length ?? 0) === 0)
      ? `/clinic-locations/${nextClinic.id}#market`
      : `/clinic-locations/${nextClinic?.id}#sources`;
  const startLabel = !clinics || clinics.length === 0
    ? 'Add a clinic'
    : (nextClinic && (nextClinic.marketCounties?.length ?? 0) === 0)
      ? 'Pick counties'
      : 'Pull referral sources';

  return (
    <MainLayout>
      <div className="mb-8 overflow-hidden rounded-lg bg-white shadow">
        <div className="p-6">
          <p className="text-sm font-medium text-indigo-600">Get started</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Add a clinic</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Add the clinic site, pick the counties it serves, pull pediatric and primary care referral sources, enrich those sources with Google Places, then research missing contact details.
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <li className="text-sm text-gray-800"><span className="font-semibold text-indigo-700">1.</span> Add a clinic</li>
            <li className="text-sm text-gray-800"><span className="font-semibold text-indigo-700">2.</span> Pick counties</li>
            <li className="text-sm text-gray-800"><span className="font-semibold text-indigo-700">3.</span> Pull referral sources</li>
            <li className="text-sm text-gray-800"><span className="font-semibold text-indigo-700">4.</span> Enrich with Google Places</li>
            <li className="text-sm text-gray-800"><span className="font-semibold text-indigo-700">5.</span> Research missing info</li>
          </ol>
          <div className="mt-6">
            <Link
              href={startHref}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <MapPinIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              {startLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
        {/* Referral Sources Stat */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Referral Sources
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {referralSources?.count || 0}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/referral-sources" className="font-medium text-indigo-600 hover:text-indigo-500">
                View all
              </Link>
            </div>
            </div>
          </div>

        {/* Interactions Stat */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Interactions
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {interactions?.count || 0}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/interactions" className="font-medium text-indigo-600 hover:text-indigo-500">
                View all
              </Link>
            </div>
            </div>
          </div>

        {/* Campaigns Stat */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <MegaphoneIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Campaigns
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {campaigns?.count || 0}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <Link href="/campaigns" className="font-medium text-indigo-600 hover:text-indigo-500">
                View all
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Interactions Widget */}
        <RecentInteractionsWidget />

        {/* Future Widget Placeholder (can add more widgets here later) */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">
            Quick Actions
          </h3>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Link
                href="/clinic-locations"
                className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Add a clinic
              </Link>
            </div>
            <div>
              <Link
                href="/interactions"
                className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Record Interaction
              </Link>
            </div>
            <div>
              <Link
                href="/campaigns/new"
                className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Create Campaign
              </Link>
            </div>
            <div>
              <Link
                href="/county-seed"
                className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Pull referral sources
              </Link>
            </div>
        </div>
      </div>
    </div>
    </MainLayout>
  );
} 