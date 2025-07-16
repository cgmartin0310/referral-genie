import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import InteractionModal from './InteractionModal';

interface Interaction {
  id: string;
  referralSourceId: string;
  referralSource?: {
    id: string;
    name: string;
  };
  type: string;
  date: string;
  notes: string | null;
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InteractionListProps {
  referralSourceId?: string;
  showReferralSource?: boolean;
  limit?: number;
  className?: string;
  showAddButton?: boolean;
}

export default function InteractionList({
  referralSourceId,
  showReferralSource = false,
  limit,
  className = '',
  showAddButton = true
}: InteractionListProps) {
  // State for the interaction modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<string | null>(null);

  // Build the API URL with query parameters if needed
  const apiUrl = referralSourceId 
    ? `/api/interactions?referralSourceId=${referralSourceId}`
    : '/api/interactions';

  // Fetch interactions data
  const { data: interactions, isLoading, isError, refetch } = useQuery({
    queryKey: ['interactions', referralSourceId],
    queryFn: async () => {
      try {
        const { data } = await axios.get(apiUrl);
        return data as Interaction[];
      } catch (error) {
        console.error('Error fetching interactions:', error);
        toast.error('Failed to load interactions');
        return [];
      }
    },
  });

  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Format the interaction type for display
  const formatType = (type: string) => {
    return type.charAt(0) + type.slice(1).toLowerCase();
  };

  // Handle opening the modal for creating a new interaction
  const handleAddInteraction = () => {
    setSelectedInteraction(null);
    setIsModalOpen(true);
  };

  // Handle opening the modal for editing an existing interaction
  const handleEditInteraction = (id: string) => {
    setSelectedInteraction(id);
    setIsModalOpen(true);
  };

  // Handle deleting an interaction
  const handleDeleteInteraction = async (id: string) => {
    if (!confirm('Are you sure you want to delete this interaction?')) {
      return;
    }

    try {
      await axios.delete(`/api/interactions/${id}`);
      toast.success('Interaction deleted successfully');
      refetch();
    } catch (error) {
      console.error('Error deleting interaction:', error);
      toast.error('Failed to delete interaction');
    }
  };

  // Handle closing the modal
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedInteraction(null);
  };

  // Handle successful interaction creation/update
  const handleModalSuccess = () => {
    refetch();
  };

  // Apply limit to displayed interactions if specified
  const displayedInteractions = limit && interactions ? interactions.slice(0, limit) : interactions;

  return (
    <div className={`bg-white shadow sm:rounded-lg ${className}`}>
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <h3 className="text-base font-semibold leading-6 text-gray-900">Interactions</h3>
        {showAddButton && (
          <button
            type="button"
            onClick={handleAddInteraction}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" />
            Add Interaction
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
          <span className="ml-2 text-gray-600">Loading...</span>
        </div>
      ) : isError ? (
        <div className="px-4 py-5 sm:p-6 text-center text-red-500">
          Error loading interactions. Please try again.
        </div>
      ) : displayedInteractions && displayedInteractions.length > 0 ? (
        <div className="overflow-hidden">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead>
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                        Type
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Date
                      </th>
                      {showReferralSource && (
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Referral Source
                        </th>
                      )}
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Notes
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Outcome
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayedInteractions.map((interaction) => (
                      <tr key={interaction.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                          {formatType(interaction.type)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDate(interaction.date)}
                        </td>
                        {showReferralSource && interaction.referralSource && (
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {interaction.referralSource.name}
                          </td>
                        )}
                        <td className="px-3 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {interaction.notes || 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {interaction.outcome || 'N/A'}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleEditInteraction(interaction.id)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteInteraction(interaction.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <TrashIcon className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-5 sm:p-6 text-center text-gray-500">
          No interactions found.
          {showAddButton && (
            <button
              type="button"
              onClick={handleAddInteraction}
              className="ml-2 text-indigo-600 hover:text-indigo-500"
            >
              Add one now
            </button>
          )}
        </div>
      )}

      {/* Interaction Modal */}
      <InteractionModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        referralSourceId={referralSourceId}
        interactionId={selectedInteraction || undefined}
      />
    </div>
  );
} 