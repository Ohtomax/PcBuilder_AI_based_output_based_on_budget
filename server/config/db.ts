import 'dotenv/config';
import pg from 'pg';
import { PrismaClient } from '@/generated/prisma/client.js';

const { Pool } = pg;

export const prisma = new PrismaClient();
