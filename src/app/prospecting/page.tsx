'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';

interface BusinessListing {
  id: string;
  name: string;
  address: string;
  rating: number;
  userRatingsTotal: number;
  phone?: string;
  website?: string;
  types: string[];
}

interface SearchMetadata {
  location: string;
  coordinates: { lat: number; lng: number };
  radius: number;
  isStateSearch: boolean;
}

export default function ProspectingPage() {
  const [location, setLocation] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [minRating, setMinRating] = useState(4.0);
  const [searchRadius, setSearchRadius] = useState(50000); // 50km default
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<BusinessListing[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [clinicLocations, setClinicLocations] = useState<Array<{id: string, name: string}>>([]);
  
  // Fetch clinic locations on mount
  useEffect(() => {
    const fetchClinicLocations = async () => {
      try {
        const response = await axios.get('/api/clinic-locations');
        setClinicLocations(response.data.filter((loc: any) => loc.isActive));
      } catch (error) {
        console.error('Error fetching clinic locations:', error);
      }
    };
    fetchClinicLocations();
  }, []);
  
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location || !businessType) {
      toast.error('Please enter both location and business type');
      return;
    }
    
    setIsSearching(true);
    setSearchResults([]);
    setNextPageToken(null);
    setSearchMetadata(null);
    
    try {
      const { data } = await axios.post('/api/prospecting/search', {
        location,
        businessType,
        minRating,
        radius: searchRadius
      });
      
      setSearchResults(data.results);
      setNextPageToken(data.pagination?.nextPageToken || null);
      setSearchMetadata(data.searchMetadata || null);
      
      if (data.results.length === 0) {
        toast("No results found matching your criteria", { icon: '🔍' });
      } else {
        toast.success(`Found ${data.results.length} businesses`);
      }
    } catch (error) {
      console.error('Error searching businesses:', error);
      toast.error('Failed to search businesses');
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleLoadMore = async () => {
    if (!nextPageToken) return;
    
    setIsLoadingMore(true);
    
    try {
      const { data } = await axios.post('/api/prospecting/search', {
        location,
        businessType,
        minRating,
        radius: searchRadius,
        pageToken: nextPageToken
      });
      
      setSearchResults([...searchResults, ...data.results]);
      setNextPageToken(data.pagination?.nextPageToken || null);
      
      if (data.results.length > 0) {
        toast.success(`Loaded ${data.results.length} more businesses`);
      } else {
        toast("No more results available", { icon: '✓' });
      }
    } catch (error) {
      console.error('Error loading more businesses:', error);
      toast.error('Failed to load more businesses');
    } finally {
      setIsLoadingMore(false);
    }
  };
  
  const handleAddToDatabase = async (business: BusinessListing) => {
    try {
      // Parse the address components from the full address string
      let address = business.address;
      let city = '';
      let state = '';
      let zipCode = '';
      
      // Improved parsing logic for Google Places formatted addresses
      const addressParts = business.address.split(',').map(part => part.trim());
      
      // Remove country if it's the last part (e.g., "USA" or "US")
      if (addressParts.length > 2 && 
          (addressParts[addressParts.length - 1] === 'USA' || 
           addressParts[addressParts.length - 1] === 'US')) {
        addressParts.pop();
      }
      
      if (addressParts.length >= 3) {
        // Format typically like: "123 Main St, City, State ZIP"
        address = addressParts[0];
        city = addressParts[1];
        
        // Parse state and zip from the last part (typically "State ZIP")
        const stateZipPart = addressParts[addressParts.length - 1];
        const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s+(.+)/);
        
        if (stateZipMatch) {
          state = stateZipMatch[1];  // Two-letter state code
          zipCode = stateZipMatch[2]; // ZIP code
        } else {
          // If can't parse, just use the whole part as state
          state = stateZipPart;
        }
      }
      
      console.log("Parsed address components:", { address, city, state, zipCode });
      
      // Detect clinic location from city
      let clinicLocationId = null;
      if (city) {
        // Try to match city to a clinic location
        const cityLower = city.toLowerCase();
        const matchedLocation = clinicLocations.find(
          location => cityLower.includes(location.name.toLowerCase())
        );
        if (matchedLocation) {
          clinicLocationId = matchedLocation.id;
        }
      }
      
      const { data } = await axios.post('/api/referral-sources', {
        name: business.name,
        address: address,
        city: city,
        state: state,
        zipCode: zipCode,
        clinicLocationId: clinicLocationId,
        contactPhone: business.phone || null,
        contactEmail: null,
        website: business.website || null,
        notes: `Google Rating: ${business.rating} (${business.userRatingsTotal} reviews)\nBusiness Types: ${business.types.join(', ')}`,
        faxNumber: null,
        npiNumber: null
      });
      
      toast.success(`Added ${business.name} to your referral sources`);
      
      // Optionally add visual feedback to the button or disable it
      const button = document.getElementById(`add-button-${business.id}`);
      if (button) {
        button.innerHTML = 'Added ✓';
        button.classList.add('bg-green-50', 'text-green-700', 'ring-green-600/20');
        button.classList.remove('bg-white', 'text-gray-900', 'ring-gray-300', 'hover:bg-gray-50');
        button.setAttribute('disabled', 'true');
      }
      
    } catch (error: any) {
      console.error('Error adding business to database:', error);
      
      // Log more detailed error information
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
      
      // Get a more specific error message if available
      let errorMessage = 'Failed to add business to database';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Special handling for duplicate sources
      if (error.response?.status === 409) {
        toast.error(`${business.name} already exists in your referral sources`);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  return (
    <MainLayout>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Business Prospecting</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Search Google Business Listings</h2>
          
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="location" className="block text-sm font-medium leading-6 text-gray-900">
                  Location
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="location"
                    id="location"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="City, state, or zip code"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="sm:col-span-3">
                <label htmlFor="businessType" className="block text-sm font-medium leading-6 text-gray-900">
                  Business Type
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="businessType"
                    id="businessType"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="e.g., dentist, physical therapy, veterinarian, etc."
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="sm:col-span-2">
                <label htmlFor="minRating" className="block text-sm font-medium leading-6 text-gray-900">
                  Minimum Rating
                </label>
                <div className="mt-2">
                  <select
                    id="minRating"
                    name="minRating"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    value={minRating}
                    onChange={(e) => setMinRating(parseFloat(e.target.value))}
                  >
                    <option value="0">Any Rating</option>
                    <option value="3.0">3.0+</option>
                    <option value="3.5">3.5+</option>
                    <option value="4.0">4.0+</option>
                    <option value="4.5">4.5+</option>
                  </select>
                </div>
              </div>
              
              <div className="sm:col-span-2">
                <label htmlFor="searchRadius" className="block text-sm font-medium leading-6 text-gray-900">
                  Search Radius
                </label>
                <div className="mt-2">
                  <select
                    id="searchRadius"
                    name="searchRadius"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    value={searchRadius}
                    onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                  >
                    <option value="5000">5 km (~3 miles)</option>
                    <option value="10000">10 km (~6 miles)</option>
                    <option value="25000">25 km (~15 miles)</option>
                    <option value="50000">50 km (~31 miles)</option>
                    <option value="100000">100 km (~62 miles)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSearching}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300"
              >
                {isSearching ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : 'Search Businesses'}
              </button>
            </div>
          </form>
        </div>
        
        {searchResults.length > 0 && (
          <div className="overflow-hidden bg-white shadow sm:rounded-md">
            <div className="flex justify-between items-center px-4 py-5 sm:px-6">
              <h2 className="text-lg font-medium text-gray-900">
                Search Results ({searchResults.length})
              </h2>
              
              {searchMetadata && (
                <div className="text-xs text-gray-500">
                  <p>Searching near: {searchMetadata.location}</p>
                  <p>Coordinates: {searchMetadata.coordinates.lat.toFixed(4)}, {searchMetadata.coordinates.lng.toFixed(4)}</p>
                  <p>Radius: {(searchMetadata.radius/1000).toFixed(1)} km ({Math.round(searchMetadata.radius/1609)} miles)</p>
                </div>
              )}
            </div>
            
            <ul className="divide-y divide-gray-200">
              {searchResults.map((business) => (
                <li key={business.id}>
                  <div className="px-4 py-5 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium leading-6 text-gray-900 truncate">
                          {business.name}
                        </h3>
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <span className="truncate">{business.address}</span>
                        </div>
                        <div className="mt-1 flex items-center">
                          <span className="text-sm text-gray-500 mr-1">Rating:</span>
                          <span className="text-sm font-medium text-yellow-600">{business.rating}</span>
                          <span className="text-sm text-gray-400 ml-2">({business.userRatingsTotal} reviews)</span>
                        </div>
                        {business.phone && (
                          <div className="mt-1 text-sm text-gray-500">
                            Phone: {business.phone}
                          </div>
                        )}
                        {business.website && (
                          <div className="mt-1 text-sm text-gray-500">
                            <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                              Website
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <button
                          type="button"
                          id={`add-button-${business.id}`}
                          onClick={() => handleAddToDatabase(business)}
                          className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        >
                          Add as Referral Source
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            
            {nextPageToken && (
              <div className="px-4 py-4 sm:px-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {isLoadingMore ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading more...
                    </>
                  ) : 'Load More Results'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
} 