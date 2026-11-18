import * as admin from 'firebase-admin';
import { config } from './env';
import { logger } from '../utils/logger';

let firebaseApp: admin.app.App | null = null;

function initFirebase(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;

  // Skip Firebase in dev if no credentials are configured
  const keyValue = config.firebase.serviceAccountKey;
  const projectId = config.firebase.projectId;
  if (!keyValue || !projectId) {
    logger.warn('Firebase Admin SDK not initialized — FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_KEY not set. Push notifications will be disabled.');
    return null;
  }

  try {
    let serviceAccount: admin.ServiceAccount;

    if (keyValue.startsWith('{')) {
      serviceAccount = JSON.parse(keyValue) as admin.ServiceAccount;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      serviceAccount = require(keyValue) as admin.ServiceAccount;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });

    logger.info('Firebase Admin SDK initialized', { projectId });
    return firebaseApp;
  } catch (err) {
    const error = err as Error;
    logger.error('Failed to initialize Firebase Admin SDK', { message: error.message });
    return null;
  }
}

function getFirebaseApp(): admin.app.App | null {
  if (!firebaseApp) {
    return initFirebase();
  }
  return firebaseApp;
}

async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken | null> {
  const app = getFirebaseApp();
  if (!app) return null;
  return app.auth().verifyIdToken(token);
}

async function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord | null> {
  const app = getFirebaseApp();
  if (!app) return null;
  return app.auth().getUser(uid);
}

async function revokeRefreshTokens(uid: string): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;
  await app.auth().revokeRefreshTokens(uid);
}

export { initFirebase, getFirebaseApp, verifyIdToken, getFirebaseUser, revokeRefreshTokens };
