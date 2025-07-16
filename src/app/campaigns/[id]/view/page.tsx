'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useRouter, useParams } from 'next/navigation';
import MainLayout from '../../../../components/layout/MainLayout';
import { formatDate } from '../../../../lib/utils';
import { DocumentIcon, PaperAirplaneIcon, PencilIcon } from '@heroicons/react/24/outline';

// ViewCampaignPage component - NOT async, use hooks instead
export default function ViewCampaignPage() {
  const router = useRouter();
  const params = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  // Extract campaignId safely using useParams
  const campaignId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  
  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const { data } = await axios.get(`/api/campaigns/${campaignId}`);
        setCampaign(data);
      } catch (error) {
        console.error('Error fetching campaign:', error);
        toast.error('Failed to load campaign');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCampaign();
  }, [campaignId]);
  
  const sendCampaign = async () => {
    if (!campaign) return;
    
    setSending(true);
    try {
      const { data } = await axios.post(`/api/campaigns/${campaignId}/send`);
      setResults(data.results);
      toast.success('Campaign sent successfully!');
      
      // Refresh campaign data to show updated status
      const { data: updatedCampaign } = await axios.get(`/api/campaigns/${campaignId}`);
      setCampaign(updatedCampaign);
    } catch (error) {
      console.error('Error sending campaign:', error);
      toast.error('Failed to send campaign');
    } finally {
      setSending(false);
    }
  };
  
  // Redirect to campaigns list
  const goBack = () => {
    router.push('/campaigns');
  };
  
  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-700">Loading campaign...</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  if (!campaign) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-gray-900">Campaign not found</h2>
          <p className="mt-2 text-gray-600">The campaign you're looking for doesn't exist or has been deleted.</p>
          <button
            onClick={goBack}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Campaigns
          </button>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="md:flex md:items-center md:justify-between mb-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            {campaign.name}
          </h2>
          {campaign.description && (
            <p className="mt-1 text-gray-500">{campaign.description}</p>
          )}
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            type="button"
            onClick={goBack}
            className="ml-3 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={sendCampaign}
            disabled={sending || campaign.status === 'ACTIVE'}
            className={`ml-3 inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
              sending || campaign.status === 'ACTIVE'
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {sending ? 'Sending...' : 'Send Campaign'}
          </button>
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Campaign Type</h3>
          <p className="mt-1 text-base font-semibold text-gray-900">{campaign.type}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Start Date</h3>
          <p className="mt-1 text-base font-semibold text-gray-900">{formatDate(campaign.startDate)}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Status</h3>
          <p className="mt-1">
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
              campaign.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
              campaign.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
              campaign.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
              campaign.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {campaign.status}
            </span>
          </p>
        </div>
      </div>
      
      <div className="mt-8">
        <h3 className="text-lg font-medium text-gray-900">Referral Sources</h3>
        {campaign.referralSources.length === 0 ? (
          <p className="mt-2 text-gray-500">No referral sources added to this campaign.</p>
        ) : (
          <div className="mt-4 flow-root">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                      Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Sent Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {campaign.referralSources.map((connection: any) => (
                    <tr key={connection.referralSource.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
                        <div className="font-medium text-gray-900">{connection.referralSource.name}</div>
                        {connection.referralSource.faxNumber && (
                          <div className="text-gray-500">Fax: {connection.referralSource.faxNumber}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                          connection.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                          connection.status === 'SENT' ? 'bg-green-100 text-green-800' :
                          connection.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {connection.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {connection.sentAt ? formatDate(connection.sentAt) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {results && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900">Send Results</h3>
          <div className="mt-4 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Successful</h4>
                <p className="text-2xl font-bold text-green-600">{results.success}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Failed</h4>
                <p className="text-2xl font-bold text-red-600">{results.failed}</p>
              </div>
            </div>
            
            {results.failed > 0 && results.details.failed.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Errors</h4>
                <ul className="space-y-2">
                  {results.details.failed.map((failure: any, index: number) => (
                    <li key={index} className="text-sm text-red-600">
                      <span className="font-medium">{failure.name}:</span> {failure.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
} 