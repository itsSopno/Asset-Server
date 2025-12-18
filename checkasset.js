// checkAsset.js
const { MongoClient, ObjectId } = require('mongodb');

async function checkasset() {
  const client = new MongoClient('mongodb://localhost:27017'); // যদি Atlas use করো, URI change করো
  await client.connect();
  const db = client.db('plantsDB'); // তোমার DB নাম
  const asset = await db.collection('plants').findOne({ _id: new ObjectId("6934663d5986b29deae6ec80") });
  console.log(asset);
  await client.close();
}

checkasset();
