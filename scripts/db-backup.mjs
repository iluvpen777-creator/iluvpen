import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../server/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const backupDir = path.join(__dirname, '..', 'backups')

const tableExists = async (name) => {
  const result = await pool.query('select to_regclass($1) as reg', [name])
  return Boolean(result.rows[0]?.reg)
}

const readTable = async ({ table, query }) => {
  if (!(await tableExists(table))) return []
  const result = await pool.query(query)
  return result.rows
}

const run = async () => {
  const users = await readTable({
    table: 'users',
    query: 'select id, nickname, password_hash, profile_image, created_at from users order by id asc',
  })

  const communityPosts = await readTable({
    table: 'community_posts',
    query:
      'select id, nickname, topic, title, content, image, likes, pinned, created_at from community_posts order by created_at asc',
  })

  const penItems = await readTable({
    table: 'pen_items',
    query:
      'select id, name, series, year, release_month, price, description, description_long, keywords, images, created_at from pen_items order by created_at asc',
  })

  const newsPosts = await readTable({
    table: 'news_posts',
    query:
      'select slug, title, subtitle, cover_image, category, tags, published_at, reading_time, content from news_posts order by published_at asc',
  })

  const comments = await readTable({
    table: 'comments',
    query:
      'select id, target_id, nickname, content, image, likes, parent_id, created_at from comments order by created_at asc',
  })

  const mentions = await readTable({
    table: 'comment_mentions',
    query: 'select id, comment_id, mentioned_nickname, created_at from comment_mentions order by id asc',
  })

  const siteSettings = await readTable({
    table: 'site_settings',
    query: 'select setting_key, value_json, updated_at from site_settings order by setting_key asc',
  })

  const adminAuditLogs = await readTable({
    table: 'admin_audit_logs',
    query:
      'select id, actor_nickname, action, target_type, target_id, before_json, after_json, metadata_json, ip_address, user_agent, created_at from admin_audit_logs order by id asc',
  })

  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    users,
    communityPosts,
    penItems,
    newsPosts,
    comments,
    mentions,
    siteSettings,
    adminAuditLogs,
  }

  await fs.mkdir(backupDir, { recursive: true })

  const cliPath = process.argv[2]
  const fallbackName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const targetPath = cliPath ? path.resolve(process.cwd(), cliPath) : path.join(backupDir, fallbackName)

  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`[db:backup] created ${targetPath}`)
}

run()
  .catch((error) => {
    console.error('[db:backup] failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
