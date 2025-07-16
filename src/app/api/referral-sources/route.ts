import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { executeWithRetry } from '../../../lib/db-helpers';

export async function GET() {
  try {
    const referralSources = await executeWithRetry(() => 
      prisma.referralSource.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      })
    );
    
    return NextResponse.json(referralSources);
  } catch (error) {
    console.error('Error fetching referral sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referral sources' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let data: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    clinicLocation?: string | null;
    contactPerson?: string | null;
    contactTitle?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    faxNumber?: string | null;
    npiNumber?: string | null;
    website?: string | null;
    notes?: string | null;
    rating?: number | null;
    expectedMonthlyReferrals?: number | null;
    numberOfProviders?: number | null;
    categoryId?: string | null;
  } = { name: '' }; // Initialize with empty name to avoid linter error
  
  try {
    data = await request.json();
    
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }
    
    const referralSource = await executeWithRetry(() => 
      prisma.referralSource.create({
        data: {
          name: data.name,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          zipCode: data.zipCode || null,
          clinicLocation: data.clinicLocation || null,
          contactPerson: data.contactPerson || null,
          contactTitle: data.contactTitle || null,
          contactPhone: data.contactPhone || null,
          contactEmail: data.contactEmail || null,
          ...(data.faxNumber !== undefined ? { faxNumber: data.faxNumber } : {}),
          ...(data.npiNumber !== undefined ? { npiNumber: data.npiNumber } : {}),
          website: data.website || null,
          notes: data.notes || null,
          rating: data.rating || null,
          expectedMonthlyReferrals: data.expectedMonthlyReferrals || null,
          numberOfProviders: data.numberOfProviders || null,
          categoryId: data.categoryId || null
        } as any
      })
    );
    
    return NextResponse.json(referralSource);
  } catch (error) {
    console.error('Error creating referral source:', error);
    
    // Log the request data for debugging
    console.error('Attempted to create with data:', data);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      
      // Check for Prisma-specific errors
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'A referral source with this name already exists' },
          { status: 409 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to create referral source' },
      { status: 500 }
    );
  }
} 