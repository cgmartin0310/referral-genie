import { currentTenant, tenantErrorResponse, requireParagon } from '@/lib/tenant';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import prisma from '../../../../lib/prisma';
import { executeWithRetry } from '../../../../lib/db-helpers';
import { authOptions } from '../../../../lib/auth';
import { normalizeNpiNumber } from '../../../../lib/npi';
import { changedOverridableFields, userEditProvenance } from '../../../../lib/provenance';

// Get a single referral source
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    // For Next.js 15.3.1, we need to await params
    const { id } = await params;
    
    const referralSource = await executeWithRetry(() =>
      prisma.referralSource.findFirst({
        where: {
          id,
          organizationId: CATALOG_ORGANIZATION_ID,
        },
        include: {
          clinicLocation: true,
          category: true,
        },
      })
    );

    if (!referralSource) {
      return NextResponse.json(
        { error: 'Referral source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(referralSource);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error fetching referral source:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referral source' },
      { status: 500 }
    );
  }
}

// Update a referral source
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let data: {
    name?: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    clinicLocationId?: string | null;
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
    referralFormUrl?: string | null;
    preferredChannel?: string | null;
    categoryId?: string | null;
  } = {};

  try {
    const tenant = await currentTenant();
    requireParagon(tenant);
    // For Next.js 15.3.1, we need to await params
    const { id } = await params;
    
    data = await request.json();

    // Check if referral source exists
    const exists = await executeWithRetry(() =>
      prisma.referralSource.findFirst({
        where: {
          id,
          organizationId: CATALOG_ORGANIZATION_ID,
        },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Referral source not found' },
        { status: 404 }
      );
    }

    const session = await getServerSession(authOptions);
    const actor = session?.user?.name || 'authenticated-user';
    const patch = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
      ...(data.clinicLocationId !== undefined && { clinicLocationId: data.clinicLocationId }),
      ...(data.contactPerson !== undefined && { contactPerson: data.contactPerson }),
      ...(data.contactTitle !== undefined && { contactTitle: data.contactTitle }),
      ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
      ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
      ...(data.faxNumber !== undefined && { faxNumber: data.faxNumber }),
      ...(data.npiNumber !== undefined && { npiNumber: normalizeNpiNumber(data.npiNumber) }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.rating !== undefined && { rating: data.rating }),
      ...(data.expectedMonthlyReferrals !== undefined && { expectedMonthlyReferrals: data.expectedMonthlyReferrals }),
      ...(data.numberOfProviders !== undefined && { numberOfProviders: data.numberOfProviders }),
      ...(data.referralFormUrl !== undefined && { referralFormUrl: data.referralFormUrl || null }),
      ...(data.preferredChannel !== undefined && { preferredChannel: data.preferredChannel || null }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
    };
    const edited = changedOverridableFields(exists, patch);
    const provenance = edited.length > 0
      ? userEditProvenance(exists.provenance, edited, actor, new Date().toISOString())
      : null;

    // Update the referral source
    const referralSource = await executeWithRetry(() =>
      prisma.referralSource.update({
        where: {
          id,
        },
        data: {
          ...patch,
          ...(provenance ? { provenance: provenance as unknown as Prisma.InputJsonValue } : {}),
        },
        include: {
          clinicLocation: true,
          category: true,
        },
      })
    );

    return NextResponse.json(referralSource);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error updating referral source:', error);
    console.error('Attempted to update with data:', data);

    if (error instanceof Error) {
      console.error('Error message:', error.message);

      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'A referral source with this NPI already exists' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update referral source' },
      { status: 500 }
    );
  }
}

// Delete a referral source
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await currentTenant();
    requireParagon(tenant);
    // For Next.js 15.3.1, we need to await params
    const { id } = await params;
    
    // Check if referral source exists
    const exists = await executeWithRetry(() =>
      prisma.referralSource.findFirst({
        where: {
          id,
          organizationId: CATALOG_ORGANIZATION_ID,
        },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Referral source not found' },
        { status: 404 }
      );
    }

    // First check if this referral source is used in any campaigns
    const campaignRelations = await executeWithRetry(() =>
      prisma.campaignToReferralSource.findMany({
        where: {
          referralSourceId: id,
        },
      })
    );

    // If it's used in campaigns, handle it appropriately
    if (campaignRelations.length > 0) {
      // Option 1: Delete all the campaign relationships first
      await executeWithRetry(() =>
        prisma.campaignToReferralSource.deleteMany({
          where: {
            referralSourceId: id,
          },
        })
      );
      
      console.log(`Deleted ${campaignRelations.length} campaign relationships for referral source ${id}`);
    }

    // Now delete the referral source
    await executeWithRetry(() =>
      prisma.referralSource.delete({
        where: {
          id,
        },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error deleting referral source:', error);
    return NextResponse.json(
      { error: 'Failed to delete referral source', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 