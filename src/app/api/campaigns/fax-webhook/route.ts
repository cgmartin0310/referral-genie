import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';

// Webhook endpoint for HumbleFax status updates
export async function POST(request: NextRequest) {
  try {
    // Parse the webhook data
    const data = await request.json();
    
    // Validate the webhook signature/auth if needed
    // This would depend on how HumbleFax verifies webhooks
    
    // Extract data from the webhook
    const { 
      faxId, 
      status, 
      metadata = {},
      error = null
    } = data;
    
    const { campaignId, referralSourceId } = metadata;
    
    // Validate required fields
    if (!faxId || !status || !campaignId || !referralSourceId) {
      console.error('Missing required fields in webhook:', data);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Map HumbleFax status to our status
    let campaignStatus = 'PENDING';
    switch (status.toUpperCase()) {
      case 'DELIVERED':
      case 'COMPLETED':
        campaignStatus = 'SENT';
        break;
      case 'FAILED':
      case 'ERROR':
        campaignStatus = 'FAILED';
        break;
      case 'QUEUED':
      case 'PROCESSING':
        campaignStatus = 'PENDING';
        break;
      default:
        campaignStatus = 'PENDING';
    }
    
    // Update the campaign connection
    await prisma.campaignToReferralSource.update({
      where: {
        campaignId_referralSourceId: {
          campaignId,
          referralSourceId
        }
      },
      data: {
        status: campaignStatus,
        response: JSON.stringify({
          faxId,
          status,
          updatedAt: new Date().toISOString(),
          error
        })
      }
    });
    
    // If this was a final state (success or failure), update responseAt
    if (['SENT', 'FAILED'].includes(campaignStatus)) {
      await prisma.campaignToReferralSource.update({
        where: {
          campaignId_referralSourceId: {
            campaignId,
            referralSourceId
          }
        },
        data: {
          responseAt: new Date()
        }
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing fax webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 