import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { executeWithRetry } from '../../../../../lib/db-helpers';

// Update cover sheet settings for a campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get campaign ID
    const { id } = await params;
    
    // Parse request body
    const data = await request.json();

    // Validate required fields if includeCoverSheet is true
    if (data.includeCoverSheet) {
      if (!data.coverSheetFromName) {
        return NextResponse.json(
          { error: 'From Name is required for cover sheet' },
          { status: 400 }
        );
      }
      if (!data.coverSheetSubject) {
        return NextResponse.json(
          { error: 'Subject is required for cover sheet' },
          { status: 400 }
        );
      }
      if (!data.coverSheetMessage) {
        return NextResponse.json(
          { error: 'Message is required for cover sheet' },
          { status: 400 }
        );
      }
    }

    // Update campaign with cover sheet settings
    const updatedCampaign = await executeWithRetry(() =>
      prisma.campaign.update({
        where: { id },
        data: {
          includeCoverSheet: data.includeCoverSheet,
          coverSheetFromName: data.coverSheetFromName,
          coverSheetFromNumber: data.coverSheetFromNumber,
          coverSheetCompanyInfo: data.coverSheetCompanyInfo,
          coverSheetSubject: data.coverSheetSubject,
          coverSheetMessage: data.coverSheetMessage,
        },
      })
    );

    return NextResponse.json(updatedCampaign);
  } catch (error) {
    console.error('Error updating cover sheet settings:', error);
    return NextResponse.json(
      { error: 'Failed to update cover sheet settings' },
      { status: 500 }
    );
  }
} 