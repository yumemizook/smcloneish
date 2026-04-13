// Firebase App Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB6rPZGGiWYQy208y2Fp7sJLWWDoiQNliQ',
  authDomain: 'donguri-online.firebaseapp.com',
  projectId: 'donguri-online',
  storageBucket: 'donguri-online.firebasestorage.app',
  messagingSenderId: '566556732306',
  appId: '1:566556732306:web:7b7ca5e6192fc5e42caf4b',
  measurementId: 'G-KZ96Y7S4R4'
};

const app = initializeApp(firebaseConfig);

export { app };

