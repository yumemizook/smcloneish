// Firebase Usage Examples
// Reference for using auth and firestore modules

import { registerUser, loginUser, logoutUser, onAuthChange, getCurrentUser } from './auth.js';
import {
  submitScore,
  getLeaderboard,
  getUserScores,
  getUserProfile,
  syncProfileToOnline,
  isUserAdmin,
  banUser,
  unbanUser,
  setUserRole,
  invalidateScore,
  deleteScore
} from './firestore.js';

// ==================== AUTHENTICATION EXAMPLES ====================

// Monitor auth state changes
onAuthChange((user) => {
  if (user) {
    console.log('User signed in:', user.uid, user.email);
  } else {
    console.log('User signed out');
  }
});

// Register a new user
async function exampleRegister() {
  try {
    const userCredential = await registerUser('player@example.com', 'password123', 'RhythmMaster');
    console.log('Registered:', userCredential.user.uid);
  } catch (error) {
    console.error('Registration failed:', error.message);
  }
}

// Login existing user
async function exampleLogin() {
  try {
    const userCredential = await loginUser('player@example.com', 'password123');
    console.log('Logged in:', userCredential.user.uid);
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}

// Logout
async function exampleLogout() {
  try {
    await logoutUser();
    console.log('Logged out successfully');
  } catch (error) {
    console.error('Logout failed:', error.message);
  }
}

// ==================== SCORE SUBMISSION EXAMPLE ====================

// Submit a realistic score after gameplay
async function exampleSubmitScore() {
  const user = getCurrentUser();
  if (!user) {
    console.error('Must be logged in to submit scores');
    return;
  }

  // Example: Get songKey from profile.js getSongKey(meta, chart)
  const scoreData = {
    username: 'RhythmMaster',
    songKey: 'My Song|||Artist Name|||Hard|||12',
    songTitle: 'My Song',
    songArtist: 'Artist Name',
    difficulty: 'Hard',
    meter: 12,
    rate: 1.0,
    judge: 4,
    wifePercent: 96.5,
    accuracy: 98.2,
    ssr: 21.5,
    skillsetSSRs: {
      stream: 18.5,
      jumpstream: 22.3,
      handstream: 15.2,
      stamina: 20.1,
      jackSpeed: 19.8,
      chordjack: 17.4,
      technical: 21.0,
      overall: 21.5
    },
    grade: 'AAAA',
    clearType: 'FC',
    maxCombo: 1250,
    judgments: {
      marvelous: 800,
      perfect: 150,
      great: 50,
      good: 10,
      bad: 0,
      miss: 0,
      mine: 0
    },
    totalNotes: 1010,
    playTime: 145,
    chartMSD: {
      stream: 18.5,
      jumpstream: 22.3,
      handstream: 15.2,
      stamina: 20.1
    }
  };

  try {
    const scoreId = await submitScore(user.uid, scoreData);
    console.log('Score submitted with ID:', scoreId);
  } catch (error) {
    console.error('Score submission failed:', error.message);
  }
}

// ==================== LEADERBOARD EXAMPLES ====================

// Get leaderboard for a specific chart
async function exampleGetLeaderboard() {
  try {
    const scores = await getLeaderboard('My Song|||Artist Name|||Hard|||12', 1.0, 4, 50);
    console.log('Leaderboard:', scores);

    scores.forEach((score, index) => {
      console.log(`${index + 1}. ${score.username} - ${score.wifePercent.toFixed(2)}% (${score.grade})`);
    });
  } catch (error) {
    console.error('Failed to get leaderboard:', error.message);
  }
}

// Get user's score history
async function exampleGetUserScores() {
  const user = getCurrentUser();
  if (!user) {
    console.error('Must be logged in');
    return;
  }

  try {
    const scores = await getUserScores(user.uid, 25);
    console.log('User scores:', scores);
  } catch (error) {
    console.error('Failed to get user scores:', error.message);
  }
}

// ==================== PROFILE EXAMPLES ====================

// Get user profile
async function exampleGetProfile() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const profile = await getUserProfile(user.uid);
    console.log('Profile:', profile);
    console.log('Overall Rating:', profile.ratings.overall);
    console.log('Total Plays:', profile.totalPlays);
  } catch (error) {
    console.error('Failed to get profile:', error.message);
  }
}

// Sync local profile to online
async function exampleSyncProfile() {
  const user = getCurrentUser();
  if (!user || !window.PlayerProfile) return;

  try {
    const localProfile = window.PlayerProfile.getStats();
    await syncProfileToOnline(user.uid, localProfile);
    console.log('Profile synced to online');
  } catch (error) {
    console.error('Profile sync failed:', error.message);
  }
}

// ==================== INTEGRATION WITH GAMEPLAY ====================

// Example: Submit score after completing a song
async function submitGameplayScore(meta, chart, gameState, ssrData) {
  const user = getCurrentUser();
  if (!user) {
    console.log('Not logged in - score not submitted to online leaderboard');
    return;
  }

  // Build songKey using profile.js function
  const songKey = window.PlayerProfile.getSongKey(meta, chart);

  const scoreData = {
    username: (await getUserProfile(user.uid)).name,
    songKey: songKey,
    songTitle: meta.title,
    songArtist: meta.artist,
    difficulty: chart.difficulty,
    meter: parseInt(chart.meter) || 0,
    rate: window.currentRate || 1.0,
    judge: window.userConfig?.judgeDifficulty || 4,
    wifePercent: gameState.wifePercent || 0,
    accuracy: gameState.accuracy || 0,
    ssr: ssrData.overall || 0,
    skillsetSSRs: {
      stream: ssrData.stream || 0,
      jumpstream: ssrData.jumpstream || 0,
      handstream: ssrData.handstream || 0,
      stamina: ssrData.stamina || 0,
      jackSpeed: ssrData.jackSpeed || 0,
      chordjack: ssrData.chordjack || 0,
      technical: ssrData.technical || 0,
      overall: ssrData.overall || 0
    },
    grade: gameState.grade || 'F',
    clearType: gameState.clearType || 'Failed',
    maxCombo: gameState.maxCombo || 0,
    judgments: {
      marvelous: gameState.judgments?.marvelous || 0,
      perfect: gameState.judgments?.perfect || 0,
      great: gameState.judgments?.great || 0,
      good: gameState.judgments?.good || 0,
      bad: gameState.judgments?.bad || 0,
      miss: gameState.judgments?.miss || 0,
      mine: gameState.judgments?.mine || 0
    },
    totalNotes: gameState.totalNotes || 0,
    playTime: Math.floor((Date.now() - gameState.startTime) / 1000),
    chartMSD: ssrData.chartMSD || null
  };

  try {
    const scoreId = await submitScore(user.uid, scoreData);
    console.log('Score submitted to online leaderboard:', scoreId);
    return scoreId;
  } catch (error) {
    console.error('Online score submission failed:', error.message);
  }
}

// ==================== ADMIN OPERATIONS ====================

// Check if current user is admin
async function exampleCheckAdmin() {
  const user = getCurrentUser();
  if (!user) {
    console.log('Not logged in');
    return false;
  }

  try {
    const admin = await isUserAdmin(user.uid);
    console.log('Is admin:', admin);
    return admin;
  } catch (error) {
    console.error('Failed to check admin status:', error.message);
    return false;
  }
}

// Ban a user (admin only)
async function exampleBanUser(targetUid, reason) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in as admin');
    return;
  }

  try {
    await banUser(targetUid, admin.uid, reason || 'Violation of terms');
    console.log('User banned successfully');
  } catch (error) {
    console.error('Ban failed:', error.message);
  }
}

// Unban a user (admin only)
async function exampleUnbanUser(targetUid) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in as admin');
    return;
  }

  try {
    await unbanUser(targetUid, admin.uid);
    console.log('User unbanned successfully');
  } catch (error) {
    console.error('Unban failed:', error.message);
  }
}

// Promote user to admin (admin only)
async function examplePromoteToAdmin(targetUid) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in as admin');
    return;
  }

  try {
    await setUserRole(targetUid, admin.uid, 'admin');
    console.log('User promoted to admin');
  } catch (error) {
    console.error('Promotion failed:', error.message);
  }
}

// Invalidate a suspicious score (admin only)
async function exampleInvalidateScore(scoreId, reason) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in as admin');
    return;
  }

  try {
    await invalidateScore(scoreId, admin.uid, reason || 'Suspicious gameplay');
    console.log('Score invalidated');
  } catch (error) {
    console.error('Invalidation failed:', error.message);
  }
}

// Permanently delete a score (admin only - use with caution)
async function exampleDeleteScore(scoreId) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in as admin');
    return;
  }

  if (!confirm('WARNING: This permanently deletes the score. Continue?')) {
    return;
  }

  try {
    await deleteScore(scoreId, admin.uid);
    console.log('Score permanently deleted');
  } catch (error) {
    console.error('Deletion failed:', error.message);
  }
}

// Admin panel: Get all scores for review
async function exampleAdminGetRecentScores(limitCount = 50) {
  const admin = getCurrentUser();
  if (!admin) {
    console.error('Must be logged in');
    return;
  }

  try {
    // Note: This would need a new function in firestore.js
    // For now, use getUserScores on suspicious users
    console.log('Review scores via individual user lookups');
  } catch (error) {
    console.error('Failed:', error.message);
  }
}

export {
  exampleRegister,
  exampleLogin,
  exampleLogout,
  exampleSubmitScore,
  exampleGetLeaderboard,
  exampleGetUserScores,
  exampleGetProfile,
  exampleSyncProfile,
  submitGameplayScore,
  exampleCheckAdmin,
  exampleBanUser,
  exampleUnbanUser,
  examplePromoteToAdmin,
  exampleInvalidateScore,
  exampleDeleteScore,
  exampleAdminGetRecentScores
};
