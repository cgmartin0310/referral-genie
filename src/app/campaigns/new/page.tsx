'use client';

import { useState } from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import CampaignForm from '../../../components/CampaignForm';

export default function NewCampaignPage() {
  return (
    <MainLayout>
      <div className="pb-5 mb-5 border-b border-gray-200">
        <h1 className="text-lg font-medium leading-6 text-gray-900">
          Create New Campaign
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Create a new campaign to target specific referral sources
        </p>
      </div>

      <CampaignForm />
    </MainLayout>
  );
} 