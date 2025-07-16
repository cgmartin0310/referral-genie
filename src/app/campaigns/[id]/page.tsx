'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import CampaignForm from '../../../components/CampaignForm';
import { formatDateForInput } from '../../../lib/utils';

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const [isLoading, setIsLoading] = useState(true);
  const [campaignData, setCampaignData] = useState<any>(null);
  const [campaignId, setCampaignId] = useState<string>('');
  
  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        setIsLoading(true);
        const { id } = await params;
        setCampaignId(id);
        const { data } = await axios.get(`/api/campaigns/${id}`);
        
        // Format dates for the form
        const formattedData = {
          ...data,
          startDate: formatDateForInput(data.startDate),
          endDate: data.endDate ? formatDateForInput(data.endDate) : null,
        };
        
        setCampaignData(formattedData);
      } catch (error) {
        console.error('Error fetching campaign:', error);
        toast.error('Failed to load campaign data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCampaign();
  }, [params]);
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p>Loading campaign data...</p>
        </div>
      </MainLayout>
    );
  }
  
  if (!campaignData) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-red-500">Campaign not found or error loading data</p>
        </div>
      </MainLayout>
    );
  }
  
  // Extract referral sources from campaign data
  const selectedReferralSources = campaignData.referralSources?.map((r: any) => r.referralSource) || [];
  
  return (
    <MainLayout>
      <div className="pb-5 mb-5 border-b border-gray-200">
        <h1 className="text-lg font-medium leading-6 text-gray-900">
          Edit Campaign
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Update your campaign details and referral sources
        </p>
      </div>
      
      <CampaignForm 
        campaignId={campaignId}
        defaultValues={{
          name: campaignData.name,
          description: campaignData.description || '',
          startDate: campaignData.startDate,
          endDate: campaignData.endDate,
          status: campaignData.status,
          type: campaignData.type,
          content: campaignData.content || '',
          documentUrl: campaignData.documentUrl,
          documentName: campaignData.documentName
        }}
        selectedReferralSources={selectedReferralSources}
      />
    </MainLayout>
  );
} 