const cron = require('node-cron');
const { MongoClient } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvqow0e.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
});

async function updateExpiredSubscriptions() {
  try {
    await client.connect();
    const database = client.db('newswaveDB');
    const users = database.collection('users');

    const now = new Date();
    const result = await users.updateMany(
      { premiumExpiry: { $lte: now } },
      { $set: { isPremium: false, subscriptionPlan: null, premiumExpiry: null } }
    );

    console.log(`Expired subscriptions updated: ${result.modifiedCount}`);
  } catch (error) {
    // console.error('Error updating expired subscriptions', error);
  } finally {
    await client.close();
  }
}

cron.schedule('* * * * *', () => {
//   console.log('Running subscription expiration check...');
  updateExpiredSubscriptions();
});
