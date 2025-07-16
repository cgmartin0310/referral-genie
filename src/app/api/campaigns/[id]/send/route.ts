import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { executeWithRetry } from '../../../../../lib/db-helpers';
import { HumbleFaxClient } from '../../../../../lib/humble-fax';

// Setup the HumbleFax client
const humbleFaxClient = new HumbleFaxClient();

// Send a campaign
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Explicitly await and clone the params object for Next.js 15.3.1
    const paramsCopy = await Promise.resolve({ ...params });
    const id = String(paramsCopy.id);
    
    // Get the campaign with referral sources
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
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check if campaign has a document URL for faxing
    if (!campaign.documentUrl) {
      return NextResponse.json(
        { error: 'Campaign does not have a document to send' },
        { status: 400 }
      );
    }

    // Get the absolute URL for the document
    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const documentUrl = `${protocol}://${host}${campaign.documentUrl}`;

    // Format phone number for HumbleFax API
    const formatPhoneNumber = (phoneNumber?: string): string | undefined => {
      if (!phoneNumber) return undefined;
      
      // Remove all non-digit characters
      let cleaned = phoneNumber.replace(/\D/g, '');
      
      // Add country code 1 if not present and length is 10 digits
      if (cleaned.length === 10) {
        cleaned = '1' + cleaned;
      }
      
      return cleaned;
    };

    // Start batch processing
    const results = [];
    const errors = [];

    // Process each referral source
    for (const connection of campaign.referralSources) {
      const { referralSource } = connection;
      
      // Skip if no fax number
      if (!referralSource.faxNumber) {
        errors.push({
          referralSourceId: referralSource.id,
          name: referralSource.name,
          error: 'No fax number provided'
        });
        continue;
      }

      try {
        // First update status to SENDING
        await prisma.campaignToReferralSource.update({
          where: {
            campaignId_referralSourceId: {
              campaignId: campaign.id,
              referralSourceId: referralSource.id
            }
          },
          data: {
            status: 'SENDING'
          }
        });
        
        // Format fax numbers correctly - this is critical for the API
        const toFaxNumber = formatPhoneNumber(referralSource.faxNumber);
        const fromFaxNumber = formatPhoneNumber(campaign.coverSheetFromNumber) || '17045695946'; // Use default if not set
        
        // Prepare fax metadata
        const metadata = {
          campaignId: campaign.id.substring(0, 10),
          referralSourceId: referralSource.id.substring(0, 10),
          campaignName: campaign.name
        };

        // Log the exact values being used for debugging
        console.log('Sending fax with full details:', {
          to: toFaxNumber || referralSource.faxNumber,
          documentUrl,
          coverSheet: {
            includeCoversheet: campaign.includeCoverSheet === true,
            fromName: campaign.coverSheetFromName || "Referral Genie",
            fromNumber: fromFaxNumber,
            companyInfo: campaign.coverSheetCompanyInfo || "",
            toName: referralSource.contactPerson || referralSource.name || "Provider",
            subject: campaign.coverSheetSubject || "Referral Information",
            message: campaign.coverSheetMessage || "Please see attached referral information.",
          }
        });

        // Send the fax using HumbleFax with cover sheet settings
        const result = await humbleFaxClient.sendFax({
          to: toFaxNumber || referralSource.faxNumber,
          documentUrl,
          metadata,
          // Add cover sheet information from campaign settings (from database)
          coverSheet: campaign.includeCoverSheet ? {
            includeCoversheet: true,
            fromName: campaign.coverSheetFromName || "Referral Genie", 
            fromNumber: fromFaxNumber,
            companyInfo: campaign.coverSheetCompanyInfo || "",
            toName: referralSource.contactPerson || referralSource.name || "Provider",
            subject: campaign.coverSheetSubject || "Referral Information",
            message: campaign.coverSheetMessage || "Please see the attached referral information.",
          } : {
            includeCoversheet: false
          }
        });

        // If the send operation was successful (API returned success)
        if (result.success) {
          console.log(`Fax sent successfully with ID: ${result.faxId || 'unknown'}`);
          
          // Use any ID we can find, even if it's not explicitly a faxId
          const faxId = result.faxId || (result.data && result.data.id) || 'unknown-' + Date.now();
          
          // Always mark as SENT if the API call was successful
          await prisma.campaignToReferralSource.update({
            where: {
              campaignId_referralSourceId: {
                campaignId: campaign.id,
                referralSourceId: referralSource.id
              }
            },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              response: JSON.stringify({ 
                faxId,
                status: result.status || 'sent',
                details: result.data || {}
              })
            }
          });

          results.push({
            referralSourceId: referralSource.id,
            name: referralSource.name,
            faxId,
            status: 'SENT'
          });
          
          // Set up a delayed status check in 3 minutes (this won't block the response)
          setTimeout(async () => {
            try {
              console.log(`Performing delayed status check for fax ${faxId} in 3 minutes...`);
              
              // Extract the correct ID to use for the status check - might be a numeric ID
              // In HumbleFax API, the sentFax ID is usually a number like 100554730
              const sentFaxId = typeof faxId === 'string' && faxId.includes('.') ? 
                  // If it looks like a tmpFaxId (has periods), try to extract the sentFaxId from the stored response
                  JSON.parse(await (async () => {
                    try {
                      const record = await prisma.campaignToReferralSource.findUnique({
                        where: {
                          campaignId_referralSourceId: {
                            campaignId: campaign.id,
                            referralSourceId: referralSource.id
                          }
                        },
                        select: { response: true }
                      });
                      return record?.response || '{}';
                    } catch (e) {
                      console.error("Error fetching response:", e);
                      return '{}';
                    }
                  })()).faxId || faxId
                : faxId;
              
              console.log(`Using sentFaxId for status check: ${sentFaxId}`);
              
              // Directly use the HumbleFax API URL and credentials
              const statusUrl = `${humbleFaxClient.apiUrl}/sentFax/${sentFaxId}`;
              console.log(`Checking final delivery status at: ${statusUrl}`);
              
              // Make the API call to check status
              const response = await fetch(statusUrl, {
                headers: {
                  Authorization: `Basic ${Buffer.from(`${process.env.HUMBLE_FAX_API_KEY}:${process.env.HUMBLE_FAX_API_SECRET}`).toString('base64')}`
                }
              });
              
              if (response.ok) {
                const statusData = await response.json();
                console.log(`Final status check result:`, statusData);
                
                // Check if the fax was successfully delivered
                const finalStatus = statusData.status === 'delivered' ? 'DELIVERED' : 
                                   statusData.status === 'failed' ? 'FAILED' : 'SENT';
                
                // Update the database with the final status
                await prisma.campaignToReferralSource.update({
                  where: {
                    campaignId_referralSourceId: {
                      campaignId: campaign.id,
                      referralSourceId: referralSource.id
                    }
                  },
                  data: {
                    status: finalStatus,
                    response: JSON.stringify({
                      faxId: sentFaxId,
                      finalStatus: statusData.status,
                      finalCheck: true,
                      details: statusData
                    })
                  }
                });
                
                console.log(`Updated final status for ${referralSource.name} to ${finalStatus}`);
              } else {
                console.log(`Failed to get final status. Status code: ${response.status}`);
                console.log(`Response text: ${await response.text()}`);
              }
            } catch (error) {
              console.error(`Error in delayed status check:`, error);
              // If check fails, don't change the status - it remains as SENT
            }
          }, 3 * 60 * 1000); // 3 minutes
        } else {
          // Log the detailed error for debugging
          console.error('Fax sending failed:', {
            error: result.error,
            status: result.status,
            details: result.data
          });
          
          // Update status to FAILED with detailed error info
          await prisma.campaignToReferralSource.update({
            where: {
              campaignId_referralSourceId: {
                campaignId: campaign.id,
                referralSourceId: referralSource.id
              }
            },
            data: {
              status: 'FAILED',
              response: JSON.stringify({ 
                error: result.error || 'Unknown error',
                status: result.status,
                data: result.data || {}
              })
            }
          });
          
          errors.push({
            referralSourceId: referralSource.id,
            name: referralSource.name,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        console.error(`Error sending fax to ${referralSource.name}:`, error);
        
        // Update status to FAILED
        await prisma.campaignToReferralSource.update({
          where: {
            campaignId_referralSourceId: {
              campaignId: campaign.id,
              referralSourceId: referralSource.id
            }
          },
          data: {
            status: 'FAILED',
            response: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        });
        
        errors.push({
          referralSourceId: referralSource.id,
          name: referralSource.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update campaign status to ACTIVE if we successfully sent at least one fax
    if (results.length > 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'ACTIVE' }
      });
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name
      },
      results: {
        success: results.length,
        failed: errors.length,
        details: {
          successful: results,
          failed: errors
        }
      }
    });
  } catch (error) {
    console.error('Error sending campaign:', error);
    return NextResponse.json(
      { error: 'Failed to send campaign', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 