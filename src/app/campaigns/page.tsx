'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import MainLayout from '../../components/layout/MainLayout';
import { formatDate } from '../../lib/utils';
import CoverSheetModal from '../../components/CoverSheetModal';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  type: string;
  createdAt: string;
  coverSheetFromName?: string;
  coverSheetFromNumber?: string;
  coverSheetCompanyInfo?: string;
  coverSheetSubject?: string;
  coverSheetMessage?: string;
  includeCoverSheet?: boolean;
  _count: {
    referralSources: number;
  };
}

export default function CampaignsPage() {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCoverSheetModalOpen, setIsCoverSheetModalOpen] = useState(false);

  const { data: campaigns, isLoading, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/campaigns');
        return data;
      } catch (error) {
        console.error('Error fetching campaigns:', error);
        toast.error('Failed to load campaigns');
        return [];
      }
    },
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) {
      return;
    }
    
    try {
      await axios.delete(`/api/campaigns/${id}`);
      toast.success('Campaign deleted successfully');
      refetch();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Failed to delete campaign');
    }
  };

  const openCoverSheetModal = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsCoverSheetModalOpen(true);
  };

  const getCampaignStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'COMPLETED': return 'bg-blue-100 text-blue-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCampaignTypeLabel = (type: string) => {
    switch (type) {
      case 'EMAIL': return 'Email';
      case 'FAX': return 'Fax';
      case 'CALL': return 'Call';
      case 'EVENT': return 'Event';
      case 'DIRECT_MAIL': return 'Direct Mail';
      case 'SOCIAL_MEDIA': return 'Social Media';
      default: return type;
    }
  };

  return (
    <MainLayout>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Campaigns
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Create and manage your referral source campaigns
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <Link
            href="/campaigns/new"
            className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <span className="flex items-center">
              <PlusIcon className="h-4 w-4 mr-2" />
              New Campaign
            </span>
          </Link>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="text-center py-4">Loading...</div>
            ) : campaigns?.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No campaigns found. Create one to get started.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Start Date
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Recipients
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {campaigns?.map((campaign: Campaign) => (
                    <tr key={campaign.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                        {campaign.name}
                        {campaign.description && (
                          <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">{campaign.description}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {getCampaignTypeLabel(campaign.type)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {formatDate(campaign.startDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getCampaignStatusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {campaign._count.referralSources}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                        <div className="flex items-center justify-end space-x-3">
                          <Link 
                            href={`/campaigns/${campaign.id}/view`}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            <span className="text-xs">View/Send</span>
                          </Link>
                          
                          {campaign.type === 'FAX' && (
                            <button
                              onClick={() => openCoverSheetModal(campaign)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Edit Cover Sheet"
                            >
                              <DocumentTextIcon className="h-5 w-5" />
                              <span className="sr-only">Edit Cover Sheet</span>
                            </button>
                          )}
                          
                          <Link 
                            href={`/campaigns/${campaign.id}`}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            <PencilIcon className="h-5 w-5" />
                            <span className="sr-only">Edit</span>
                          </Link>
                          <button
                            onClick={() => handleDelete(campaign.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <TrashIcon className="h-5 w-5" />
                            <span className="sr-only">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      
      {selectedCampaign && (
        <CoverSheetModal
          campaignId={selectedCampaign.id}
          coverSheetSettings={{
            coverSheetFromName: selectedCampaign.coverSheetFromName,
            coverSheetFromNumber: selectedCampaign.coverSheetFromNumber,
            coverSheetCompanyInfo: selectedCampaign.coverSheetCompanyInfo,
            coverSheetSubject: selectedCampaign.coverSheetSubject,
            coverSheetMessage: selectedCampaign.coverSheetMessage,
            includeCoverSheet: selectedCampaign.includeCoverSheet
          }}
          isOpen={isCoverSheetModalOpen}
          onClose={() => setIsCoverSheetModalOpen(false)}
          onSuccess={() => refetch()}
        />
      )}
    </MainLayout>
  );
} 