import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { CATALOG_ORGANIZATION_ID } from '@/lib/org';
import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { executeWithRetry } from '../../../lib/db-helpers';
import { parseLocalDate } from '../../../lib/utils';
import { audienceForClinic, targetRows } from '@/lib/campaigns/audience-db';

export async function GET() {
  try {
    const tenant = await currentTenant();
    const campaigns = await executeWithRetry(() => 
      prisma.campaign.findMany({
        where: { organizationId: tenant.organizationId },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          _count: {
            select: {
              referralSources: true,
              targets: true,
            }
          }
        }
      })
    );
    
    return NextResponse.json(campaigns);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
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
    audienceClinicId?: string | null;
  } = { name: '', type: '' };
  
  try {
    const tenant = await currentTenant();
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

    // Audience: a clinic's referral list, resolved to one fax per machine.
    const audienceClinicId = typeof data.audienceClinicId === 'string' && data.audienceClinicId.trim()
      ? data.audienceClinicId.trim()
      : null;
    const audience = audienceClinicId ? await audienceForClinic(audienceClinicId, tenant.organizationId) : null;
    if (audienceClinicId && !audience) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 400 });
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
        organizationId: tenant.organizationId,
        name: data.name,
        description: data.description || null,
        startDate: data.startDate ? parseLocalDate(data.startDate.toString()) : new Date(),
        endDate: data.endDate ? parseLocalDate(data.endDate.toString()) : null,
        status: data.status || 'DRAFT',
        type: data.type,
        content: data.content || null,
        audienceClinicId,
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
        const allowed = await tx.referralSource.findMany({
          where: {
            organizationId: CATALOG_ORGANIZATION_ID,
            id: { in: data.referralSourceIds },
          },
          select: { id: true },
        });
        await Promise.all(
          allowed.map((source) =>
            tx.campaignToReferralSource.create({
              data: {
                organizationId: tenant.organizationId,
                campaignId: newCampaign.id,
                referralSourceId: source.id,
                status: 'PENDING'
              }
            })
          )
        );
      }
      
      if (audience && audience.targets.length > 0) {
        await tx.campaignTarget.createMany({ data: targetRows(newCampaign.id, audience.targets, tenant.organizationId) });
      }

      return newCampaign;
    });
    
    return NextResponse.json(campaign);
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error creating campaign:', error);
    console.error('Attempted data:', data);
    
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
} 