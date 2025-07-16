'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import InteractionList from '../../components/InteractionList';
import InteractionModal from '../../components/InteractionModal';
import { PlusIcon } from '@heroicons/react/24/outline';

export default function InteractionsPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleAddInteraction = () => {
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
  };

  const handleModalSuccess = () => {
    // No need to refetch - the InteractionList component will handle this
  };

  return (
    <MainLayout>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Interactions
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Track and manage all interactions with your referral sources.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            onClick={handleAddInteraction}
            className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4 inline-block" />
            Add Interaction
          </button>
        </div>
      </div>

      <div className="mt-8">
        <InteractionList 
          showReferralSource={true}
          showAddButton={false}
        />
      </div>

      {/* Add Interaction Modal */}
      <InteractionModal
        isOpen={isAddModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </MainLayout>
  );
} 