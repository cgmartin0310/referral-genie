'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import InteractionList from '../../../components/InteractionList';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';

type Tab = 'details' | 'interactions';

interface ReferralSource {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  clinicLocation: string | null;
  contactPerson: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  faxNumber: string | null;
  npiNumber: string | null;
  website: string | null;
  notes: string | null;
  rating: number | null;
  expectedMonthlyReferrals: number | null;
  numberOfProviders: number | null;
  createdAt: string;
  updatedAt: string;
  categoryId: string | null;
}

export default function ReferralSourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReferralSource = async () => {
      try {
        const id = typeof params.id === 'string' ? params.id : '';
        const { data } = await axios.get(`/api/referral-sources/${id}`);
        setReferralSource(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching referral source:', error);
        toast.error('Failed to load referral source');
        router.push('/referral-sources');
      }
    };

    fetchReferralSource();
  }, [params.id, router]);

  const handleEditClick = () => {
    router.push(`/referral-sources/${referralSource?.id}/edit`);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="mt-3 text-gray-600">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => router.push('/referral-sources')}
            className="mr-4 text-gray-400 hover:text-gray-500"
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{referralSource?.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {referralSource?.clinicLocation || 'No location specified'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEditClick}
          className="mt-3 sm:mt-0 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          <PencilIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
          Edit
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('details')}
            className={`
              ${activeTab === 'details'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
            `}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('interactions')}
            className={`
              ${activeTab === 'interactions'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
              whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
            `}
          >
            Interactions
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'details' ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Contact Info */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Contact Information
                </h3>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Contact Person</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.contactPerson || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Title</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.contactTitle || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Phone</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.contactPhone || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.contactEmail || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Fax</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.faxNumber || 'Not specified'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Address */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Address
                </h3>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:py-5 sm:px-6">
                    <dt className="sr-only">Full Address</dt>
                    <dd className="text-sm text-gray-900">
                      {referralSource?.address ? (
                        <>
                          <p>{referralSource.address}</p>
                          <p>
                            {[
                              referralSource.city,
                              referralSource.state,
                              referralSource.zipCode
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </>
                      ) : (
                        'No address specified'
                      )}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Clinic Location</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.clinicLocation || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Website</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.website ? (
                        <a
                          href={referralSource.website.startsWith('http') ? referralSource.website : `https://${referralSource.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-500"
                        >
                          {referralSource.website}
                        </a>
                      ) : (
                        'Not specified'
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Additional Information
                </h3>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">NPI Number</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.npiNumber || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Expected Monthly Referrals</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.expectedMonthlyReferrals || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Number of Providers</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                      {referralSource?.numberOfProviders || 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-4 sm:py-5 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Notes</dt>
                    <dd className="text-sm text-gray-900">
                      {referralSource?.notes || 'No notes'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        ) : (
          <InteractionList
            referralSourceId={referralSource?.id}
            showAddButton={true}
          />
        )}
      </div>
    </MainLayout>
  );
} 