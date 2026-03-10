const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

const router = express.Router();

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt: salt.toString('hex'), hash };
}

// Middleware to check for admin authentication (API key based) - ALWAYS ENABLED
const requireAdmin = (req, res, next) => {
  console.log('🔐 ADMIN AUTH CHECK - Request to:', req.originalUrl);

  // Check for admin API key in header (same as map dashboard uses)
  const adminKey = req.headers['x-api-key'];

  // Use environment variable for admin key, fallback to a default for development
  const expectedAdminKey = process.env.ADMIN_API_KEY || 'wildlife_admin_2024';

  console.log('🔑 Received API key:', adminKey ? '***' + adminKey.slice(-4) : 'NONE');
  console.log('🔑 Expected API key ends with:', '***' + expectedAdminKey.slice(-4));

  if (!adminKey || adminKey !== expectedAdminKey) {
    console.log('🚫 ADMIN AUTH FAILED - Access denied');
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required - invalid or missing API key',
      debug: {
        received: !!adminKey,
        expectedEndsWith: expectedAdminKey.slice(-4)
      }
    });
  }

  console.log('✅ ADMIN AUTH SUCCESSFUL - Access granted');
  // Set admin UID for logging purposes
  req.adminUid = 'admin_user';
  next();
};

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    console.log('📊 Admin API - Database being used:', db._settings?.databaseId || 'default');

    // Get all users from the users collection
    let usersSnapshot;
    try {
      usersSnapshot = await db.collection('users').orderBy('registeredAt', 'desc').get();
    } catch (e) {
      usersSnapshot = await db.collection('users').get();
    }

    const users = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role || 'user',
        status: userData.status || 'active',
        hasPassword: !!(userData.passwordSalt && userData.passwordHash),
        registeredAt: userData.registeredAt?.toDate?.() ? userData.registeredAt.toDate().toISOString() : userData.registeredAt,
        lastLogin: userData.lastLogin?.toDate?.() ? userData.lastLogin.toDate().toISOString() : userData.lastLogin
      });
    });

    // Calculate stats
    const stats = {
      total: users.length,
      active: users.filter(u => u.status === 'active').length,
      revoked: users.filter(u => u.status === 'revoked').length
    };

    res.json({
      success: true,
      users: users,
      stats: stats
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Create new user - password optional (null for app-only users)
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const identifier = (email || phone || '').toString().trim();

    if (!name || !identifier) {
      return res.status(400).json({
        success: false,
        message: 'Name and email or phone are required'
      });
    }

    const validRoles = ['admin', 'user', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'user';

    const db = admin.firestore();
    const isEmail = identifier.includes('@');
    const key = isEmail
      ? identifier.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')
      : identifier.replace(/[^0-9a-zA-Z]/g, '_');
    const docId = isEmail ? `email_${key}` : `phone_${key}`;

    const existingDoc = await db.collection('users').doc(docId).get();
    if (existingDoc.exists) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email or phone already exists'
      });
    }

    const userData = {
      uid: docId,
      name: name.trim(),
      role: userRole,
      status: 'active',
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.adminUid
    };

    if (isEmail) {
      userData.email = identifier.toLowerCase();
    } else {
      userData.phone = identifier;
    }

    if (password && password.length >= 6) {
      const { salt, hash } = hashPassword(password);
      userData.passwordSalt = salt;
      userData.passwordHash = hash;
    }
    // No password = omit fields (app-only users)

    await db.collection('users').doc(docId).set(userData);

    res.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: docId,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        status: userData.status
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Update user (name, role, password) - must be before /status route
router.patch('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, role, password } = req.body;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.adminUid
    };

    if (name !== undefined && name.trim()) {
      updates.name = name.trim();
    }

    if (role !== undefined) {
      const validRoles = ['admin', 'user', 'viewer'];
      if (validRoles.includes(role)) {
        updates.role = role;
      }
    }

    if (password !== undefined) {
      if (password.length >= 6) {
        const { salt, hash } = hashPassword(password);
        updates.passwordSalt = salt;
        updates.passwordHash = hash;
      } else if (password.length === 0) {
        updates.passwordSalt = admin.firestore.FieldValue.delete();
        updates.passwordHash = admin.firestore.FieldValue.delete();
      }
    }

    await userRef.update(updates);

    res.json({
      success: true,
      message: 'User updated successfully',
      userId: userId
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Update user status (revoke/restore)
router.patch('/users/:userId/status', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'revoked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "revoked"'
      });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user status
    await userRef.update({
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.adminUid
    });

    res.json({
      success: true,
      message: `User ${status === 'revoked' ? 'revoked' : 'restored'} successfully`,
      userId: userId,
      status: status
    });

  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// Delete user (hard delete - use with caution)
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user document
    await userRef.delete();

    // Note: You might also want to delete from Firebase Auth
    // await admin.auth().deleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
      userId: userId
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Get user details
router.get('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        id: userDoc.id,
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role || 'user',
        status: userData.status || 'active',
        registeredAt: userData.registeredAt,
        lastLogin: userData.lastLogin
      }
    });

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
  }
});

module.exports = router;