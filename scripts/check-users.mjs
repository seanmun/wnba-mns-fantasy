import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
loadEnv({ path: '.env.local' })
loadEnv()
const sql = neon(process.env.DATABASE_URL)
const rows = await sql.query(`SELECT id, email, display_name, role, created_at, updated_at FROM users WHERE email = 'smunley13@gmail.com'`)
console.log('Your row:')
if (rows.length === 0) console.log('  (none)')
else rows.forEach(r => console.log('  ' + r.id + ' | ' + r.email + ' | role=' + r.role + '\n    created: ' + r.created_at + '\n    updated: ' + r.updated_at))
const recent = await sql.query(`SELECT id, email, updated_at FROM users ORDER BY updated_at DESC LIMIT 3`)
console.log('\nMost recently updated:')
recent.forEach(r => console.log('  ' + r.email + ' @ ' + r.updated_at))
