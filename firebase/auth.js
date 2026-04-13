// Firebase Authentication Module
// Email/password authentication with human-readable error messages

import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { app } from './config.js';
import { createUserProfile } from './firestore.js';

const auth = getAuth(app);

const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.'
};

function getErrorMessage(error) {
  const code = error?.code || 'unknown';
  return ERROR_MESSAGES[code] || error?.message || 'An unknown error occurred.';
}

/**
 * Register a new user with email and password
 * @param {string} email
 * @param {string} password
 * @param {string} username
 * @returns {Promise<Object>} UserCredential
 */
async function registerUser(email, password, username) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(userCredential.user.uid, username);
    return userCredential;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Sign in existing user with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} UserCredential
 */
async function loginUser(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
async function logoutUser() {
  try {
    return await signOut(auth);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Subscribe to authentication state changes
 * @param {Function} callback - Called with user object or null
 * @returns {Function} Unsubscribe function
 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current authenticated user
 * @returns {Object|null} Current user or null
 */
function getCurrentUser() {
  return auth.currentUser;
}

export {
  registerUser,
  loginUser,
  logoutUser,
  onAuthChange,
  getCurrentUser,
  auth
};
