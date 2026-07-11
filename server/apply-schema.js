import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const run = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const sql = await fs.readFile(schemaPath, 'utf8')
  await pool.query(sql)
  console.log('[db:migrate] schema applied successfully')
}

run()
  .catch((error) => {
    console.error('[db:migrate] failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
