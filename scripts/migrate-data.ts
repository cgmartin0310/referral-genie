import { PrismaClient as SourcePrismaClient } from '@prisma/client';
import { PrismaClient as TargetPrismaClient } from '@prisma/client';

// Configuration
const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL || 'postgresql://postgres.imnukgglirtjkzxphldj:Wonderbread99@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const TARGET_DATABASE_URL = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!TARGET_DATABASE_URL) {
  console.error('❌ TARGET_DATABASE_URL or DATABASE_URL environment variable is required');
  process.exit(1);
}

// Create Prisma clients for both databases
const sourceDb = new SourcePrismaClient({
  datasources: {
    db: {
      url: SOURCE_DATABASE_URL,
    },
  },
});

const targetDb = new TargetPrismaClient({
  datasources: {
    db: {
      url: TARGET_DATABASE_URL,
    },
  },
});

async function migrateData() {
  console.log('🚀 Starting data migration from Supabase to Render...\n');

  try {
    // 1. Migrate Categories (if any)
    console.log('📁 Migrating Categories...');
    const categories = await sourceDb.category.findMany();
    if (categories.length > 0) {
      await targetDb.category.createMany({
        data: categories,
        skipDuplicates: true,
      });
      console.log(`✅ Migrated ${categories.length} categories`);
    } else {
      console.log('⏭️  No categories to migrate');
    }

    // 2. Migrate Referral Sources
    console.log('\n👥 Migrating Referral Sources...');
    const referralSources = await sourceDb.referralSource.findMany();
    if (referralSources.length > 0) {
      await targetDb.referralSource.createMany({
        data: referralSources,
        skipDuplicates: true,
      });
      console.log(`✅ Migrated ${referralSources.length} referral sources`);
    } else {
      console.log('⏭️  No referral sources to migrate');
    }

    // 3. Migrate Campaigns
    console.log('\n📢 Migrating Campaigns...');
    const campaigns = await sourceDb.campaign.findMany();
    if (campaigns.length > 0) {
      await targetDb.campaign.createMany({
        data: campaigns,
        skipDuplicates: true,
      });
      console.log(`✅ Migrated ${campaigns.length} campaigns`);
    } else {
      console.log('⏭️  No campaigns to migrate');
    }

    // 4. Migrate Campaign to Referral Source relationships
    console.log('\n🔗 Migrating Campaign-ReferralSource relationships...');
    const campaignRelations = await sourceDb.campaignToReferralSource.findMany();
    if (campaignRelations.length > 0) {
      // Process in batches to avoid conflicts
      for (const relation of campaignRelations) {
        try {
          await targetDb.campaignToReferralSource.create({
            data: relation,
          });
        } catch (error) {
          // Skip if already exists
          console.log(`⚠️  Skipping duplicate relation: Campaign ${relation.campaignId} - Source ${relation.referralSourceId}`);
        }
      }
      console.log(`✅ Migrated campaign relationships`);
    } else {
      console.log('⏭️  No campaign relationships to migrate');
    }

    // 5. Migrate Interactions
    console.log('\n💬 Migrating Interactions...');
    const interactions = await sourceDb.interaction.findMany();
    if (interactions.length > 0) {
      await targetDb.interaction.createMany({
        data: interactions,
        skipDuplicates: true,
      });
      console.log(`✅ Migrated ${interactions.length} interactions`);
    } else {
      console.log('⏭️  No interactions to migrate');
    }

    // 6. Show summary
    console.log('\n📊 Migration Summary:');
    console.log('====================');
    const targetCounts = {
      categories: await targetDb.category.count(),
      referralSources: await targetDb.referralSource.count(),
      campaigns: await targetDb.campaign.count(),
      interactions: await targetDb.interaction.count(),
      campaignRelations: await targetDb.campaignToReferralSource.count(),
    };

    console.log(`Categories: ${targetCounts.categories}`);
    console.log(`Referral Sources: ${targetCounts.referralSources}`);
    console.log(`Campaigns: ${targetCounts.campaigns}`);
    console.log(`Campaign Relations: ${targetCounts.campaignRelations}`);
    console.log(`Interactions: ${targetCounts.interactions}`);

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sourceDb.$disconnect();
    await targetDb.$disconnect();
  }
}

// Run the migration
migrateData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 