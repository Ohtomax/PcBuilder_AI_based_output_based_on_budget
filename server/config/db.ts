import 'dotenv/config';
import { PrismaClient } from '@/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import {resolve} from 'node:path';

const connectionString = process.env.DATABASE_URL;

if(!connectionString){
    throw new Error("Database connection key is missing")
}

const url = new URL(connectionString);
url.searchParams.set('sslmode', 'verify-full');
url.searchParams.set('sslrootcert', resolve('certs/prod-ca-2021.crt'));

const adapter = new PrismaPg({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
})

export const prisma = new PrismaClient({ adapter });
