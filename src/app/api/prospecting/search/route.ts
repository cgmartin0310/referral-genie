import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GEOCODE_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACES_DETAILS_API_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { location, businessType, minRating = 0, radius = 50000, pageToken } = body;

    if (!API_KEY) {
      return NextResponse.json(
        { error: 'Google API key is not configured' },
        { status: 500 }
      );
    }

    if (pageToken) {
      // If we have a page token, we can directly query the next page
      return await fetchNextPage(pageToken, minRating);
    }

    if (!location || !businessType) {
      return NextResponse.json(
        { error: 'Location and business type are required' },
        { status: 400 }
      );
    }

    // Step 1: Geocode the location
    const geocodeResponse = await fetch(
      `${GEOCODE_API_URL}?address=${encodeURIComponent(location)}&key=${API_KEY}`
    );
    
    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]?.geometry?.location) {
      console.error('Geocoding error:', geocodeData);
      return NextResponse.json(
        { error: 'Failed to geocode location' },
        { status: 400 }
      );
    }
    
    const { lat, lng } = geocodeData.results[0].geometry.location;
    const formattedAddress = geocodeData.results[0].formatted_address;
    
    // Detect if this is likely a state-level search
    const isStateSearch = geocodeData.results[0].address_components.some(
      (component: any) => 
        component.types.includes('administrative_area_level_1') && 
        !geocodeData.results[0].address_components.some(
          (c: any) => c.types.includes('locality') || c.types.includes('postal_code')
        )
    );

    console.log(`Searching businesses with radius: ${radius}m`);
    
    // Step 2: Search for businesses
    const placesResponse = await fetch(
      `${PLACES_API_URL}?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(businessType)}&key=${API_KEY}`
    );
    
    const placesData = await placesResponse.json();
    
    if (placesData.status !== 'OK' && placesData.status !== 'ZERO_RESULTS') {
      console.error('Places API error:', placesData);
      return NextResponse.json(
        { error: 'Failed to search businesses: ' + placesData.status },
        { status: 500 }
      );
    }
    
    // Step 3: Filter by rating and get additional details
    const filteredPlaces = placesData.results.filter((place: any) => place.rating >= minRating);
    
    // Get detailed information for each place
    const businesses = await Promise.all(
      filteredPlaces.map(async (place: any) => {
        try {
          const detailsResponse = await fetch(
            `${PLACES_DETAILS_API_URL}?place_id=${place.place_id}&fields=name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,website,types&key=${API_KEY}`
          );
          
          const detailsData = await detailsResponse.json();
          
          if (detailsData.status !== 'OK') {
            console.warn(`Failed to get details for ${place.name}:`, detailsData.status);
            return null;
          }
          
          const details = detailsData.result;
          
          return {
            id: place.place_id,
            name: details.name,
            address: details.formatted_address,
            location: details.geometry?.location,
            rating: details.rating,
            userRatingsTotal: details.user_ratings_total,
            phone: details.formatted_phone_number,
            website: details.website,
            types: details.types,
          };
        } catch (error) {
          console.error(`Error fetching details for ${place.name}:`, error);
          return null;
        }
      })
    );
    
    // Remove nulls from any failed requests
    const validBusinesses = businesses.filter(Boolean);
    
    console.log(`Found ${validBusinesses.length} businesses matching criteria`);
    
    return NextResponse.json({
      results: validBusinesses,
      pagination: {
        nextPageToken: placesData.next_page_token || null
      },
      searchMetadata: {
        location: formattedAddress,
        coordinates: { lat, lng },
        radius: parseInt(radius),
        isStateSearch
      }
    });
  } catch (error) {
    console.error('Error searching businesses:', error);
    return NextResponse.json(
      { error: 'Failed to search businesses' },
      { status: 500 }
    );
  }
}

async function fetchNextPage(pageToken: string, minRating = 0) {
  try {
    // Wait a moment as Google sometimes needs a delay before using the next page token
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fetch the next page of results
    const placesResponse = await fetch(
      `${PLACES_API_URL}?pagetoken=${pageToken}&key=${API_KEY}`
    );
    
    const placesData = await placesResponse.json();
    
    if (placesData.status !== 'OK' && placesData.status !== 'ZERO_RESULTS') {
      console.error('Places API error (next page):', placesData);
      return NextResponse.json(
        { error: 'Failed to load more results: ' + placesData.status },
        { status: 500 }
      );
    }
    
    // Filter by rating and get additional details
    const filteredPlaces = placesData.results.filter((place: any) => place.rating >= minRating);
    
    // Get detailed information for each place
    const businesses = await Promise.all(
      filteredPlaces.map(async (place: any) => {
        try {
          const detailsResponse = await fetch(
            `${PLACES_DETAILS_API_URL}?place_id=${place.place_id}&fields=name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,website,types&key=${API_KEY}`
          );
          
          const detailsData = await detailsResponse.json();
          
          if (detailsData.status !== 'OK') {
            console.warn(`Failed to get details for ${place.name}:`, detailsData.status);
            return null;
          }
          
          const details = detailsData.result;
          
          return {
            id: place.place_id,
            name: details.name,
            address: details.formatted_address,
            location: details.geometry?.location,
            rating: details.rating,
            userRatingsTotal: details.user_ratings_total,
            phone: details.formatted_phone_number,
            website: details.website,
            types: details.types,
          };
        } catch (error) {
          console.error(`Error fetching details for ${place.name}:`, error);
          return null;
        }
      })
    );
    
    // Remove nulls from any failed requests
    const validBusinesses = businesses.filter(Boolean);
    
    console.log(`Found ${validBusinesses.length} additional businesses`);
    
    return NextResponse.json({
      results: validBusinesses,
      pagination: {
        nextPageToken: placesData.next_page_token || null
      }
    });
  } catch (error) {
    console.error('Error loading more results:', error);
    return NextResponse.json(
      { error: 'Failed to load more results' },
      { status: 500 }
    );
  }
} 