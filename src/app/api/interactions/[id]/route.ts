import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { executeWithRetry } from '../../../../lib/db-helpers';

// Get a single interaction
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // For Next.js 15.3.1, we need to stringify params
    const id = String(params.id);
    
    const interaction = await executeWithRetry(() =>
      prisma.interaction.findUnique({
        where: {
          id,
        },
        include: {
          referralSource: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    );

    if (!interaction) {
      return NextResponse.json(
        { error: 'Interaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(interaction);
  } catch (error) {
    console.error('Error fetching interaction:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interaction' },
      { status: 500 }
    );
  }
}

// Update an interaction
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // For Next.js 15.3.1, we need to stringify params
    const id = String(params.id);
    const data = await request.json();

    // Check if interaction exists
    const exists = await executeWithRetry(() =>
      prisma.interaction.findUnique({
        where: {
          id,
        },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Interaction not found' },
        { status: 404 }
      );
    }

    // Update the interaction
    const interaction = await executeWithRetry(() =>
      prisma.interaction.update({
        where: {
          id,
        },
        data: {
          ...(data.referralSourceId !== undefined && { referralSourceId: data.referralSourceId }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.date !== undefined && { date: new Date(data.date) }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.outcome !== undefined && { outcome: data.outcome }),
        },
        include: {
          referralSource: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    );

    return NextResponse.json(interaction);
  } catch (error) {
    console.error('Error updating interaction:', error);
    return NextResponse.json(
      { error: 'Failed to update interaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Delete an interaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // For Next.js 15.3.1, we need to stringify params
    const id = String(params.id);
    
    // Check if interaction exists
    const exists = await executeWithRetry(() =>
      prisma.interaction.findUnique({
        where: {
          id,
        },
      })
    );

    if (!exists) {
      return NextResponse.json(
        { error: 'Interaction not found' },
        { status: 404 }
      );
    }

    // Delete the interaction
    await executeWithRetry(() =>
      prisma.interaction.delete({
        where: {
          id,
        },
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting interaction:', error);
    return NextResponse.json(
      { error: 'Failed to delete interaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 