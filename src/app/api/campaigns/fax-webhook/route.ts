import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';

function mapFaxStatus(status: string): 'SENT' | 'FAILED' | 'PENDING' {
  switch (status.toUpperCase()) {
    case 'DELIVERED':
    case 'COMPLETED':
      return 'SENT';
    case 'FAILED':
    case 'ERROR':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

// Webhook endpoint for HumbleFax status updates
export async function POST(request: NextRequest) {
  try {
    // This route is exempt from the session check in middleware. When
    // HUMBLE_FAX_WEBHOOK_SECRET is set, the caller must present it; append
    // ?secret=<value> to the URL registered with HumbleFax.
    const expected = process.env.HUMBLE_FAX_WEBHOOK_SECRET?.trim();
    if (expected) {
      const given = request.nextUrl.searchParams.get('secret') ?? request.headers.get('x-webhook-secret');
      if (given !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Parse the webhook data
    const data = await request.json();
    
    // Extract data from the webhook
    const { 
      faxId, 
      status, 
      metadata = {},
      error = null
    } = data;
    
    const { campaignId, referralSourceId } = metadata;

    // A page sent to a campaign target (a clinic's referral list) carries
    // targetId. HumbleFax may shorten metadata, so match on the prefix.
    const targetId = typeof metadata.targetId === 'string' ? metadata.targetId : null;
    if (targetId && faxId && status) {
      const targetStatus = mapFaxStatus(status);
      await prisma.campaignTarget.updateMany({
        where: { id: { startsWith: targetId } },
        data: {
          status: targetStatus,
          response: JSON.stringify({ faxId, status, updatedAt: new Date().toISOString(), error }),
          ...(['SENT', 'FAILED'].includes(targetStatus) ? { responseAt: new Date() } : {}),
        },
      });
      return NextResponse.json({ success: true });
    }
    
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