import postgres from 'postgres';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL env var is required');

const sql = postgres(env.DATABASE_URL);

export default sql;
