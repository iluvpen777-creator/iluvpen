import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Pool } = pg

const ssl = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)

const config = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl,
    }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'iluvpen',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      ssl,
    }

export const pool = new Pool(config)

export const testDbConnection = async () => {
  const result = await pool.query('select now() as server_time, current_database() as db_name')
  return result.rows[0]
}
