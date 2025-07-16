import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres.imnukgglirtjkzxphldj:Wonderbread99@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    },
  },
});

async function checkData() {
  try {
    console.log('🔍 Checking Supabase database contents...\n');

    const counts = {
      categories: await prisma.category.count(),
      referralSources: await prisma.referralSource.count(),
      campaigns: await prisma.campaign.count(),
      interactions: await prisma.interaction.count(),
      campaignRelations: await prisma.campaignToReferralSource.count(),
    };

    console.log('📊 Data Summary:');
    console.log('================');
    console.log(`Categories: ${counts.categories}`);
    console.log(`Referral Sources: ${counts.referralSources}`);
    console.log(`Campaigns: ${counts.campaigns}`);
    console.log(`Campaign Relations: ${counts.campaignRelations}`);
    console.log(`Interactions: ${counts.interactions}`);

    if (counts.referralSources > 0) {
      console.log('\n📋 Sample Referral Sources:');
      const sources = await prisma.referralSource.findMany({ take: 3 });
      sources.forEach(source => {
        console.log(`  - ${source.name} (${source.city}, ${source.state})`);
      });
    }

    if (counts.campaigns > 0) {
      console.log('\n📢 Sample Campaigns:');
      const campaigns = await prisma.campaign.findMany({ take: 3 });
      campaigns.forEach(campaign => {
        console.log(`  - ${campaign.name} (Status: ${campaign.status})`);
      });
    }

  } catch (error) {
    console.error('❌ Error connecting to Supabase:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData(); 