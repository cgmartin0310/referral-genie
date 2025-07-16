import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import { CalendarIcon, ArrowLongRightIcon } from '@heroicons/react/24/outline';

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
}

export default function RecentInteractionsWidget() {
  // Fetch the 5 most recent interactions
  const { data: interactions, isLoading, isError } = useQuery({
    queryKey: ['recent-interactions'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/interactions');
        // Sort and limit to 5 most recent
        return data
          .sort((a: Interaction, b: Interaction) => 
            new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
      } catch (error) {
        console.error('Error fetching recent interactions:', error);
        return [];
      }
    },
    refetchInterval: 60000, // Refetch every minute
  });

  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Format the interaction type for display
  const formatType = (type: string) => {
    return type.charAt(0) + type.slice(1).toLowerCase();
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center">
          <CalendarIcon className="h-5 w-5 mr-2 text-indigo-500" />
          Recent Interactions
        </h3>
        <Link
          href="/interactions"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 flex items-center"
        >
          View all
          <ArrowLongRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </div>
      <div className="border-t border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-500"></div>
            <span className="ml-2 text-sm text-gray-500">Loading...</span>
          </div>
        ) : isError || !interactions || interactions.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No recent interactions found.
            <Link href="/interactions" className="ml-1 text-indigo-600 hover:text-indigo-500">
              Add one now
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {interactions.map((interaction: Interaction) => (
              <li key={interaction.id} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-indigo-600 truncate">
                    {interaction.referralSource?.name || 'Unknown Source'}
                  </p>
                  <div className="ml-2 flex-shrink-0 flex">
                    <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                      {formatType(interaction.type)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {interaction.notes || 'No notes'}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                    <p>{formatDate(interaction.date)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
} 