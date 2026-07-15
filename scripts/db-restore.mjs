import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../server/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backupDir = path.join(__dirname, '..', 'backups')

const tableExists = async (client, name) => {
  const result = await client.query('select to_regclass($1) as reg', [name])
  return Boolean(result.rows[0]?.reg)
}

const parseJsonFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

const resolveBackupPath = async () => {
  const explicit = process.argv[2]
  if (explicit) return path.resolve(process.cwd(), explicit)

  const entries = await fs.readdir(backupDir)
  const backups = entries.filter((name) => name.endsWith('.json')).sort()
  if (!backups.length) {
    throw new Error('No backup file found. Pass a file path: npm run db:restore -- backups/backup-xxx.json')
  }
  return path.join(backupDir, backups[backups.length - 1])
}

const run = async () => {
  const backupPath = await resolveBackupPath()
  const payload = await parseJsonFile(backupPath)

  const client = await pool.connect()
  try {
    await client.query('begin')

    const tables = [
      'comment_mentions',
      'comments',
      'news_posts',
      'pen_items',
      'community_posts',
      'users',
      'site_settings',
      'admin_audit_logs',
    ]

    const existingTables = []
    for (const table of tables) {
      if (await tableExists(client, table)) existingTables.push(table)
    }

    if (existingTables.length) {
      await client.query(`truncate table ${existingTables.join(', ')} restart identity cascade`)
    }

    const hasAdminAuditTable = existingTables.includes('admin_audit_logs')

    for (const row of payload.users || []) {
      await client.query(
        `insert into users (id, nickname, password_hash, profile_image, created_at)
         values ($1, $2, $3, $4, $5::timestamptz)`,
        [row.id, row.nickname, row.password_hash, row.profile_image || '', row.created_at],
      )
    }

    for (const row of payload.communityPosts || []) {
      await client.query(
        `insert into community_posts (id, nickname, topic, title, content, image, likes, pinned, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
        [
          row.id,
          row.nickname,
          row.topic || 'General',
          row.title,
          row.content,
          row.image || '',
          Number(row.likes || 0),
          Boolean(row.pinned),
          row.created_at,
        ],
      )
    }

    for (const row of payload.penItems || []) {
      await client.query(
        `insert into pen_items (id, name, series, year, release_month, price, description, description_long, keywords, images, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::timestamptz)`,
        [
          row.id,
          row.name,
          row.series,
          Number(row.year || 0),
          row.release_month == null ? null : Number(row.release_month),
          row.price || '',
          row.description || '',
          row.description_long || '',
          JSON.stringify(Array.isArray(row.keywords) ? row.keywords : []),
          JSON.stringify(Array.isArray(row.images) ? row.images : []),
          row.created_at,
        ],
      )
    }

    for (const row of payload.newsPosts || []) {
      await client.query(
        `insert into news_posts (slug, title, subtitle, cover_image, category, tags, published_at, reading_time, content)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8, $9)`,
        [
          row.slug,
          row.title,
          row.subtitle || '',
          row.cover_image || '',
          row.category || '',
          JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
          row.published_at,
          Number(row.reading_time || 5),
          row.content || '',
        ],
      )
    }

    for (const row of payload.comments || []) {
      await client.query(
        `insert into comments (id, target_id, nickname, content, image, likes, parent_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [
          row.id,
          row.target_id,
          row.nickname,
          row.content,
          row.image || '',
          Number(row.likes || 0),
          row.parent_id || null,
          row.created_at,
        ],
      )
    }

    for (const row of payload.mentions || []) {
      await client.query(
        `insert into comment_mentions (id, comment_id, mentioned_nickname, created_at)
         values ($1, $2, $3, $4::timestamptz)`,
        [row.id, row.comment_id, row.mentioned_nickname, row.created_at],
      )
    }

    for (const row of payload.siteSettings || []) {
      await client.query(
        `insert into site_settings (setting_key, value_json, updated_at)
         values ($1, $2::jsonb, $3::timestamptz)`,
        [row.setting_key, JSON.stringify(row.value_json || {}), row.updated_at],
      )
    }

    if (hasAdminAuditTable) {
      for (const row of payload.adminAuditLogs || []) {
        await client.query(
          `insert into admin_audit_logs
            (id, actor_nickname, action, target_type, target_id, before_json, after_json, metadata_json, ip_address, user_agent, created_at)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::timestamptz)`,
          [
            row.id,
            row.actor_nickname,
            row.action,
            row.target_type,
            row.target_id || '',
            JSON.stringify(row.before_json ?? null),
            JSON.stringify(row.after_json ?? null),
            JSON.stringify(row.metadata_json || {}),
            row.ip_address || '',
            row.user_agent || '',
            row.created_at,
          ],
        )
      }
    }

    await client.query("select setval('users_id_seq', coalesce((select max(id) from users), 1), true)")
    await client.query("select setval('comment_mentions_id_seq', coalesce((select max(id) from comment_mentions), 1), true)")
    if (hasAdminAuditTable) {
      await client.query("select setval('admin_audit_logs_id_seq', coalesce((select max(id) from admin_audit_logs), 1), true)")
    }

    await client.query('commit')
    console.log(`[db:restore] restored from ${backupPath}`)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

run()
  .catch((error) => {
    console.error('[db:restore] failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
