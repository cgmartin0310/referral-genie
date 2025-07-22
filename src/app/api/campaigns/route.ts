import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { executeWithRetry } from '../../../lib/db-helpers';
import { parseLocalDate } from '../../../lib/utils';

export async function GET() {
  try {
    const campaigns = await executeWithRetry(() => 
      prisma.campaign.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          _count: {
            select: {
              referralSources: true
            }
          }
        }
      })
    );
    
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let data: {
    name: string;
    description?: string | null;
    startDate?: string | Date;
    endDate?: string | Date | null;
    status?: string;
    type: string;
    content?: string | null;
    documentUrl?: string | null;
    documentName?: string | null;
    referralSourceIds?: string[];
  } = { name: '', type: '' };
  
  try {
    data = await request.json();
    
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!data.type) {
      return NextResponse.json(
        { error: 'Campaign type is required' },
        { status: 400 }
      );
    }
    
    // Use transaction to create campaign and relationships
    const campaign = await prisma.$transaction(async (tx) => {
      // Debug logging
      console.log('Creating campaign with dates:', {
        startDateInput: data.startDate,
        endDateInput: data.endDate,
        startDateParsed: data.startDate ? parseLocalDate(data.startDate.toString()) : null,
        endDateParsed: data.endDate ? parseLocalDate(data.endDate.toString()) : null,
      });
      
      // Create the campaign
      const campaignData = {
        name: data.name,
        description: data.description || null,
        startDate: data.startDate ? parseLocalDate(data.startDate.toString()) : new Date(),
        endDate: data.endDate ? parseLocalDate(data.endDate.toString()) : null,
        status: data.status || 'DRAFT',
        type: data.type,
        content: data.content || null,
      };

      // Add the document fields if available
      if (data.documentUrl) {
        Object.assign(campaignData, { 
          documentUrl: data.documentUrl,
          documentName: data.documentName || null 
        });
      }

      const newCampaign = await tx.campaign.create({
        data: campaignData
      });
      
      // If referral sources were provided, create the connections
      if (data.referralSourceIds && data.referralSourceIds.length > 0) {
        // Create connections to referral sources
        await Promise.all(
          data.referralSourceIds.map(referralSourceId =>
            tx.campaignToReferralSource.create({
              data: {
                campaignId: newCampaign.id,
                referralSourceId: referralSourceId,
                status: 'PENDING'
              }
            })
          )
        );
      }
      
      return newCampaign;
    });
    
    return NextResponse.json(campaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
    console.error('Attempted data:', data);
    
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
} 