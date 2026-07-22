import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
loadEnv({ path: '.env.local' })
loadEnv()
const sql = neon(process.env.DATABASE_URL)
const tables = await sql.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'wnba'
  ORDER BY table_name`)
const userCols = await sql.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users'
  ORDER BY ordinal_position`)
const fks = await sql.query(`
  SELECT count(*)::int AS n FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'wnba'`)
console.log('wnba.* tables (' + tables.length + '):')
tables.forEach(r => console.log('  ' + r.table_name))
console.log('users columns:', userCols.map(r => r.column_name).join(', '))
console.log('wnba.* FK constraints:', fks[0].n)
