// Firebase Firestore Module
// Online profiles and leaderboard functionality

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { app } from './config.js';

const db = getFirestore(app);

// ==================== PROFILE FUNCTIONS ====================

/**
 * Create a new user profile in Firestore
 * @param {string} uid - User ID from Firebase Auth
 * @param {string} username - Display name
 */
async function createUserProfile(uid, username) {
  const userRef = doc(db, 'users', uid);

  const profileData = {
    name: username,
    username: username,
    role: 'user',             // 'user' or 'admin'
    banned: false,            // true if user is banned
    banReason: null,          // reason for ban if banned
    joinedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    lastPlayed: serverTimestamp(),
    totalPlays: 0,
    totalPlayTime: 0,
    totalNotesHit: 0,
    totalRankedScores: 0,
    overallRating: 0.0,
    ratings: {
      stream: 0,
      jumpstream: 0,
      handstream: 0,
      chordjack: 0,
      technical: 0,
      jackSpeed: 0,
      stamina: 0,
      overall: 0
    },
    stats: {
      totalMarvelous: 0,
      totalPerfect: 0,
      totalGreat: 0,
      totalGood: 0,
      totalBad: 0,
      totalMiss: 0,
      totalMinesHit: 0,
      highestCombo: 0,
      bestAccuracy: 0,
      worstAccuracy: 100,
      avgAccuracy: 0,
      sessionsPlayed: 0
    }
  };

  await setDoc(userRef, profileData, { merge: true });
}

/**
 * Get a user profile by UID
 * @param {string} uid - User ID
 * @returns {Promise<Object|null>} Profile data or null
 */
async function getUserProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { uid, ...snapshot.data() };
}

/**
 * Update specific fields in a user profile
 * @param {string} uid - User ID
 * @param {Object} fields - Fields to update
 */
/**
 * Check if current user is an admin
 * @param {string} uid - User ID to check
 * @returns {Promise<boolean>}
 */
async function isUserAdmin(uid) {
  const profile = await getUserProfile(uid);
  return profile?.role === 'admin';
}

/**
 * Update user profile (with role-based permissions)
 * Regular users can only update their own non-protected fields
 * @param {string} uid - Target user ID
 * @param {Object} fields - Fields to update
 * @param {string} [adminUid] - Admin user ID (for admin operations)
 */
async function updateUserProfile(uid, fields, adminUid = null) {
  const userRef = doc(db, 'users', uid);

  // Check if this is an admin operation
  const isAdmin = adminUid ? await isUserAdmin(adminUid) : false;

  const updates = { ...fields };

  if (!isAdmin) {
    // Regular users cannot modify these fields
    const protectedFields = ['joinedAt', 'createdAt', 'overallRating', 'role', 'banned', 'banReason'];
    protectedFields.forEach(field => delete updates[field]);
  }

  // Add lastPlayed timestamp if updating own profile
  if (!adminUid || adminUid === uid) {
    updates.lastPlayed = serverTimestamp();
  }

  await updateDoc(userRef, updates);
}

/**
 * Ban a user (admin only)
 * @param {string} targetUid - User to ban
 * @param {string} adminUid - Admin performing the ban
 * @param {string} reason - Ban reason
 */
async function banUser(targetUid, adminUid, reason = 'Violation of terms') {
  const isAdmin = await isUserAdmin(adminUid);
  if (!isAdmin) {
    throw new Error('Admin privileges required');
  }

  const userRef = doc(db, 'users', targetUid);
  await updateDoc(userRef, {
    banned: true,
    banReason: reason
  });

  console.log(`User ${targetUid} banned by admin ${adminUid}: ${reason}`);
}

/**
 * Unban a user (admin only)
 * @param {string} targetUid - User to unban
 * @param {string} adminUid - Admin performing the unban
 */
async function unbanUser(targetUid, adminUid) {
  const isAdmin = await isUserAdmin(adminUid);
  if (!isAdmin) {
    throw new Error('Admin privileges required');
  }

  const userRef = doc(db, 'users', targetUid);
  await updateDoc(userRef, {
    banned: false,
    banReason: null
  });

  console.log(`User ${targetUid} unbanned by admin ${adminUid}`);
}

/**
 * Set user role (admin only)
 * @param {string} targetUid - User to modify
 * @param {string} adminUid - Admin making the change
 * @param {string} role - 'user' or 'admin'
 */
async function setUserRole(targetUid, adminUid, role) {
  if (!['user', 'admin'].includes(role)) {
    throw new Error('Invalid role. Must be "user" or "admin"');
  }

  const isAdmin = await isUserAdmin(adminUid);
  if (!isAdmin) {
    throw new Error('Admin privileges required');
  }

  const userRef = doc(db, 'users', targetUid);
  await updateDoc(userRef, { role });
}

// ==================== SCORE FUNCTIONS ====================

/**
 * Submit a score to the global leaderboard
 * @param {string} uid - User ID
 * @param {Object} scoreData - Score information
 * @returns {Promise<string>} Document ID of the submitted score
 */
async function submitScore(uid, scoreData) {
  const scoresCollection = collection(db, 'scores');
  const scoreRef = doc(scoresCollection);

  const completeScoreData = {
    uid: uid,
    username: scoreData.username || 'Anonymous',
    songKey: scoreData.songKey,
    songTitle: scoreData.songTitle || 'Unknown',
    songArtist: scoreData.songArtist || 'Unknown',
    difficulty: scoreData.difficulty || 'Unknown',
    meter: scoreData.meter || 0,
    rate: scoreData.rate || 1.0,
    judge: scoreData.judge || 4,
    wifePercent: scoreData.wifePercent || 0,
    accuracy: scoreData.accuracy || 0,
    ssr: scoreData.ssr || 0,
    skillsetSSRs: {
      stream: scoreData.skillsetSSRs?.stream || 0,
      jumpstream: scoreData.skillsetSSRs?.jumpstream || 0,
      handstream: scoreData.skillsetSSRs?.handstream || 0,
      stamina: scoreData.skillsetSSRs?.stamina || 0,
      jackSpeed: scoreData.skillsetSSRs?.jackSpeed || 0,
      chordjack: scoreData.skillsetSSRs?.chordjack || 0,
      technical: scoreData.skillsetSSRs?.technical || 0,
      overall: scoreData.skillsetSSRs?.overall || 0
    },
    grade: scoreData.grade || 'F',
    clearType: scoreData.clearType || 'Failed',
    maxCombo: scoreData.maxCombo || 0,
    judgments: {
      marvelous: scoreData.judgments?.marvelous || 0,
      perfect: scoreData.judgments?.perfect || 0,
      great: scoreData.judgments?.great || 0,
      good: scoreData.judgments?.good || 0,
      bad: scoreData.judgments?.bad || 0,
      miss: scoreData.judgments?.miss || 0,
      mine: scoreData.judgments?.mine || 0
    },
    totalNotes: scoreData.totalNotes || 0,
    playTime: scoreData.playTime || 0,
    chartMSD: scoreData.chartMSD || null,
    date: serverTimestamp(),
    submittedAt: serverTimestamp(),
    valid: true
  };

  await setDoc(scoreRef, completeScoreData);

  // Recalculate user's overall rating
  await recalcOverallRating(uid);

  return scoreRef.id;
}

/**
 * Get leaderboard for a specific song/chart
 * @param {string} songKey - Song identifier
 * @param {number} rate - Playback rate
 * @param {number} judge - Judge difficulty level
 * @param {number} limitCount - Maximum results (default 50)
 * @returns {Promise<Array>} Array of score objects
 */
async function getLeaderboard(songKey, rate, judge, limitCount = 50) {
  const scoresQuery = query(
    collection(db, 'scores'),
    where('songKey', '==', songKey),
    where('rate', '==', rate),
    where('judge', '==', judge),
    where('valid', '==', true),
    orderBy('wifePercent', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(scoresQuery);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get all scores for a specific user
 * @param {string} uid - User ID
 * @param {number} limitCount - Maximum results (default 100)
 * @returns {Promise<Array>} Array of score objects
 */
async function getUserScores(uid, limitCount = 100) {
  const scoresQuery = query(
    collection(db, 'scores'),
    where('uid', '==', uid),
    where('valid', '==', true),
    orderBy('submittedAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(scoresQuery);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get top scores for a user (best SSRs)
 * @param {string} uid - User ID
 * @param {number} limitCount - Maximum results (default 25)
 * @returns {Promise<Array>} Array of score objects sorted by SSR
 */
async function getUserTopScores(uid, limitCount = 25) {
  const scoresQuery = query(
    collection(db, 'scores'),
    where('uid', '==', uid),
    where('valid', '==', true),
    orderBy('ssr', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(scoresQuery);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Recalculate overall rating for a user
 * TODO: Implement Etterna-style aggregate_skill algorithm
 * @param {string} uid - User ID
 */
async function recalcOverallRating(uid) {
  console.log('[TODO] Recalculate overall rating for uid: ' + uid);
  // Future implementation will:
  // 1. Fetch all valid scores for user
  // 2. Group by songKey, keep PB for each
  // 3. Apply aggregate_skill algorithm to each skillset
  // 4. Update user's ratings and overallRating
}

// ==================== BATCH PROFILE SYNC ====================

/**
 * Sync local profile stats to Firestore
 * @param {string} uid - User ID
 * @param {Object} localProfile - Profile data from PlayerProfile
 */
async function syncProfileToOnline(uid, localProfile) {
  const updates = {
    totalPlays: localProfile.totalPlays,
    totalPlayTime: localProfile.totalPlayTime,
    totalNotesHit: localProfile.totalNotesHit,
    ratings: localProfile.ratings,
    stats: localProfile.stats,
    lastPlayed: serverTimestamp()
  };

  await updateUserProfile(uid, updates);
}

/**
 * Invalidate a score (admin only)
 * Sets valid=false instead of deleting
 * @param {string} scoreId - Score document ID
 * @param {string} adminUid - Admin performing the action
 * @param {string} reason - Reason for invalidation
 */
async function invalidateScore(scoreId, adminUid, reason = 'Invalidated by admin') {
  const isAdmin = await isUserAdmin(adminUid);
  if (!isAdmin) {
    throw new Error('Admin privileges required');
  }

  const scoreRef = doc(db, 'scores', scoreId);
  await updateDoc(scoreRef, {
    valid: false,
    invalidatedAt: serverTimestamp(),
    invalidatedBy: adminUid,
    invalidationReason: reason
  });

  console.log(`Score ${scoreId} invalidated by admin ${adminUid}: ${reason}`);
}

/**
 * Permanently delete a score (admin only - use with caution)
 * @param {string} scoreId - Score document ID
 * @param {string} adminUid - Admin performing the deletion
 */
async function deleteScore(scoreId, adminUid) {
  const isAdmin = await isUserAdmin(adminUid);
  if (!isAdmin) {
    throw new Error('Admin privileges required');
  }

  const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const scoreRef = doc(db, 'scores', scoreId);
  await deleteDoc(scoreRef);

  console.log(`Score ${scoreId} permanently deleted by admin ${adminUid}`);
}

export {
  db,
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  isUserAdmin,
  banUser,
  unbanUser,
  setUserRole,
  submitScore,
  getLeaderboard,
  getUserScores,
  getUserTopScores,
  invalidateScore,
  deleteScore,
  recalcOverallRating,
  syncProfileToOnline
};
