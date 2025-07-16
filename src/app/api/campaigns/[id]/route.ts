import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { executeWithRetry } from '../../../../lib/db-helpers';

// Get a single campaign with its referral sources
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Explicitly await and clone the params object for Next.js 15.3.1
    const paramsCopy = await Promise.resolve({ ...params });
    const id = String(paramsCopy.id);
    
    const campaign = await executeWithRetry(() =>
      prisma.campaign.findUnique({
        where: { id },
        include: {
          referralSources: {
            include: {
              referralSource: true
            }
          }
        }
      })
    );

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Return campaign with all fields including cover sheet settings
    return NextResponse.json(campaign);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}

// Update a campaign
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let data: {
    name?: string;
    description?: string | null;
    startDate?: string | Date;
    endDate?: string | Date | null;
    status?: string;
    type?: string;
    content?: string | null;
    documentUrl?: string | null;
    documentName?: string | null;
    referralSourceIds?: string[];
  } = {};

  try {
    // For Next.js 15.3.1, we need to await params
    const paramsCopy = await params;
    const id = String(paramsCopy.id);
    
    data = await request.json();

    // Check if campaign exists
    const exists = await executeWithRetry(() =>
      prisma.campaign.findUnique({
        where: { id },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Use transaction to update campaign and manage relationships
    const updatedCampaign = await prisma.$transaction(async (tx) => {
      // First prepare the campaign data
      const campaignData = {
        name: data.name,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : data.endDate,
        status: data.status,
        type: data.type,
        content: data.content,
      };

      // Add document fields if provided
      if (data.documentUrl !== undefined) {
        Object.assign(campaignData, {
          documentUrl: data.documentUrl,
          documentName: data.documentName
        });
      }

      // Update the campaign
      const campaign = await tx.campaign.update({
        where: { id },
        data: campaignData
      });

      // If referral source IDs were provided, update the connections
      if (data.referralSourceIds) {
        // First, get current connections to compare
        const currentConnections = await tx.campaignToReferralSource.findMany({
          where: { campaignId: id },
          select: { referralSourceId: true },
        });
        
        const currentIds = currentConnections.map(c => c.referralSourceId);
        const newIds = data.referralSourceIds;
        
        // Remove connections that are no longer needed
        const idsToRemove = currentIds.filter(id => !newIds.includes(id));
        if (idsToRemove.length > 0) {
          await tx.campaignToReferralSource.deleteMany({
            where: {
              campaignId: id,
              referralSourceId: { in: idsToRemove },
            },
          });
        }
        
        // Add new connections
        const idsToAdd = newIds.filter(id => !currentIds.includes(id));
        for (const referralSourceId of idsToAdd) {
          await tx.campaignToReferralSource.create({
            data: {
              campaignId: id,
              referralSourceId,
              status: 'PENDING',
            },
          });
        }
      }

      return campaign;
    });

    return NextResponse.json(updatedCampaign);
  } catch (error) {
    console.error('Error updating campaign:', error);
    console.error('Attempted data:', data);

    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }

    return NextResponse.json(
      { error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

// Delete a campaign
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // For Next.js 15.3.1, we need to await params
    const paramsCopy = await params;
    const id = String(paramsCopy.id);
    
    // Check if campaign exists
    const exists = await executeWithRetry(() =>
      prisma.campaign.findUnique({
        where: { id },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Use transaction to delete campaign and related connections
    await prisma.$transaction(async (tx) => {
      // First delete all connections to referral sources
      await tx.campaignToReferralSource.deleteMany({
        where: { campaignId: id },
      });
      
      // Then delete the campaign itself
      await tx.campaign.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' },
      { status: 500 }
    );
  }
} 