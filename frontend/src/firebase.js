import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD-krrHYccVe1NEnkz4SuLr_Sau7M-SjPY",
  authDomain: "budgetmantra-a522a.firebaseapp.com",
  projectId: "budgetmantra-a522a",
  storageBucket: "budgetmantra-a522a.firebasestorage.app",
  messagingSenderId: "545233590984",
  appId: "1:545233590984:web:a5344e0580a927df0163fd",
  measurementId: "G-FSBGH1E1ME"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
