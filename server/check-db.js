import { pool, testDbConnection } from './db.js'

try {
  const row = await testDbConnection()
  console.log('DB connection OK')
  console.log(`database: ${row.db_name}`)
  console.log(`server_time: ${row.server_time}`)
  await pool.end()
  process.exit(0)
} catch (error) {
  console.error('DB connection failed')
  console.error(error.message)
  await pool.end()
  process.exit(1)
}
