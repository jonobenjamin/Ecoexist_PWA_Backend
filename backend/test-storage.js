// Test script to diagnose Firebase Storage issues
// Run with: node test-storage.js

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase (same as server.js)
function initializeFirebase() {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        console.log('🔧 Initializing Firebase...');

        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }
        jsonString = jsonString.replace(/\\"/g, '"');

        const serviceAccount = JSON.parse(jsonString);
        console.log('✅ Service account parsed for project:', serviceAccount.project_id);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`
        });

        console.log('✅ Firebase Admin SDK initialized');
        return admin.firestore();

      } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set');
      throw new Error('Firebase service account key not configured');
    }
  }
  return admin.firestore();
}

async function testStorage() {
  try {
    console.log('🧪 Testing Firebase Storage setup...\n');

    // Initialize Firebase
    const db = initializeFirebase();

    // Test Firestore first
    console.log('📊 Testing Firestore connection...');
    const testDoc = await db.collection('test').doc('storage-test').set({
      timestamp: new Date().toISOString(),
      test: 'storage-connection-test'
    });
    console.log('✅ Firestore working\n');

    // Test Storage
    console.log('🗄️  Testing Firebase Storage...');
    const storage = admin.storage();
    const bucket = storage.bucket();

    console.log('📦 Bucket name:', bucket.name);

    // Check if bucket exists
    console.log('🔍 Checking if bucket exists...');
    const [exists] = await bucket.exists();

    if (!exists) {
      console.log('❌ BUCKET DOES NOT EXIST!');
      console.log('\n🔧 SOLUTION: Create a storage bucket in Firebase Console:');
      console.log('1. Go to https://console.firebase.google.com/');
      console.log('2. Select your project');
      console.log('3. Go to Storage in the left sidebar');
      console.log('4. Click "Get started"');
      console.log('5. Choose a location for your bucket');
      console.log('6. Click "Done"');
      console.log('\nAfter creating the bucket, image uploads should work.');
      return;
    }

    console.log('✅ Bucket exists');

    // Test bucket permissions by trying to list files
    console.log('🔐 Testing bucket permissions...');
    try {
      const [files] = await bucket.getFiles({ maxResults: 1 });
      console.log('✅ Bucket permissions OK (can list files)');
    } catch (permError) {
      console.log('⚠️  Bucket permissions issue:', permError.message);
      console.log('This might cause image upload failures.');
    }

    // Test upload permissions with a small test file
    console.log('📤 Testing upload permissions...');
    try {
      const testFileName = `test/${Date.now()}_test.txt`;
      const testFile = bucket.file(testFileName);

      await testFile.save('test content', {
        metadata: { contentType: 'text/plain' }
      });

      console.log('✅ Upload permissions OK');

      // Clean up test file
      await testFile.delete();
      console.log('🧹 Cleaned up test file');

    } catch (uploadError) {
      console.log('❌ Upload permissions failed:', uploadError.message);
      console.log('This is likely why image uploads are failing.');
    }

    console.log('\n🎉 Firebase Storage test completed!');
    console.log('If you see this message, Storage should be working for image uploads.');

  } catch (error) {
    console.error('❌ Storage test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
console.log('🔍 FIREBASE STORAGE DIAGNOSTIC TEST');
console.log('=====================================\n');

testStorage().then(() => {
  console.log('\n🏁 Test script finished');
  console.log('\n📋 NEXT STEPS:');
  console.log('1. If test passed: Images should work! Test in your app.');
  console.log('2. If test failed: Follow the error messages above.');
  console.log('3. Check Vercel deployment: Visit https://your-app.vercel.app/test-storage');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test script crashed:', error);
  console.log('\n🔧 TROUBLESHOOTING:');
  console.log('1. Create .env file with your Vercel environment variables');
  console.log('2. Run: node test-storage.js');
  console.log('3. If still failing, check Firebase Console > Storage');
  process.exit(1);
});