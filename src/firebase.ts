import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, getDocFromServer } from 'firebase/firestore';

// Firebase configuration
let firebaseConfig: any;

// Check if we have environment variables (Production/Vercel)
if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
  firebaseConfig = {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
  };
} else {
  // Fallback to local JSON file (Local Development/AI Studio)
  try {
    const configs = import.meta.glob('../firebase-applet-config.json', { eager: true });
    const config = configs['../firebase-applet-config.json'] as any;
    if (config && config.default) {
      firebaseConfig = config.default;
    } else {
      throw new Error("Config not found");
    }
  } catch (e) {
    console.error("Firebase configuration not found. Please check your environment variables or firebase-applet-config.json");
    // Provide a dummy config to prevent crash during build if everything is missing
    firebaseConfig = { projectId: "placeholder" };
  }
}

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Test connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

export { signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot };
export type { User };
