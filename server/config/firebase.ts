import admin from 'firebase-admin';
import { getApps, initializeApp, cert} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if(!process.env.FIREBASE_SERVICE_ACCOUNT){
    throw new Error('Missing firebase authentication key');
}

const serciceAccountconfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if(!getApps().length){
    initializeApp({
        credential: cert(serciceAccountconfig),
    });
}

export const auth = getAuth();
export { admin }; 