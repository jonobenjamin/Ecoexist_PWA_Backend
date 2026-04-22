/**
 * Firebase ID token verification + Firestore admin role (same project as PWA).
 */
const admin = require('firebase-admin');

function ensureFirebase() {
  if (admin.apps.length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return;
  let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
  if (jsonString.startsWith('"') && jsonString.endsWith('"')) jsonString = jsonString.slice(1, -1);
  jsonString = jsonString.replace(/\\"/g, '"');
  if (!jsonString.trim().startsWith('{')) {
    const start = jsonString.indexOf('{');
    const end = jsonString.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) jsonString = jsonString.slice(start, end);
  }
  const serviceAccount = JSON.parse(jsonString);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebaseio.com`,
    storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebasestorage.app`
  });
}

async function verifyBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { ok: false };
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false };
  ensureFirebase();
  if (!admin.apps.length) return { ok: false };
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      ok: true,
      username: decoded.email || decoded.uid,
      uid: decoded.uid
    };
  } catch (e) {
    return { ok: false };
  }
}

async function isAdminInFirestore(uid) {
  if (!uid) return false;
  ensureFirebase();
  if (!admin.apps.length) return false;
  try {
    const snap = await admin.firestore().collection('users').doc(uid).get();
    if (!snap.exists) return false;
    const data = snap.data();
    if (data.status === 'revoked') return false;
    return data.role === 'admin';
  } catch (e) {
    return false;
  }
}

async function verifyAuthBearerAdminOnly(authHeader) {
  const auth = await verifyBearerToken(authHeader);
  if (!auth.ok || !auth.uid) return { ok: false };
  if (!(await isAdminInFirestore(auth.uid))) return { ok: false };
  return { ...auth, role: 'admin' };
}

module.exports = {
  ensureFirebase,
  verifyBearerToken,
  verifyAuthBearerAdminOnly,
  isAdminInFirestore
};
