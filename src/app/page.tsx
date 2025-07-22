'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import MainLayout from '../components/layout/MainLayout';
import RecentInteractionsWidget from '../components/RecentInteractionsWidget';
import { UserGroupIcon, CalendarIcon, MegaphoneIcon } from '@heroicons/react/24/outline';

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

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-700">
          Track and manage your referral sources, interactions, and campaigns
          </p>
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
                href="/referral-sources/new"
                className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Add Referral Source
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
                href="/prospecting"
                className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Find Prospects
              </Link>
          </div>
        </div>
      </div>
    </div>
    </MainLayout>
  );
} 