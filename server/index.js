import cors from 'cors'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import express from 'express'
import { pool, testDbConnection } from './db.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || process.env.API_PORT || 8787)
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '10mb'

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((v) => v.trim())
  : true

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: jsonBodyLimit }))

const safeIso = (value) => {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

const mentionRegex = /(^|\s)@([a-zA-Z0-9_\-.]+)/g

const ADMIN_NICKNAME = 'i_luv_pen'

const extractMentions = (content = '') => {
  const mentions = []
  for (const match of content.matchAll(mentionRegex)) {
    mentions.push(match[2])
  }
  return [...new Set(mentions)]
}

const findUserByNickname = async (nickname) => {
  return pool.query(
    `select id, nickname, password_hash, profile_image
     from users
     where lower(nickname) = lower($1)
     limit 1`,
    [nickname],
  )
}

const verifyUserPassword = async (nickname, password) => {
  const found = await findUserByNickname(nickname)
  if (!found.rowCount) return null
  const user = found.rows[0]
  const valid = await bcrypt.compare(password, String(user.password_hash || ''))
  if (!valid) return null
  return user
}

const normalizeCommunity = (row) => ({
  id: row.id,
  nickname: row.nickname,
  title: row.title,
  content: row.content,
  image: row.image || '',
  likes: Number(row.likes || 0),
  pinned: Boolean(row.pinned),
  createdAt: new Date(row.created_at).toISOString(),
})

const normalizePen = (row) => ({
  id: row.id,
  name: row.name,
  series: row.series,
  year: Number(row.year || 0),
  description: row.description || '',
  descriptionLong: row.description_long || '',
  keywords: Array.isArray(row.keywords) ? row.keywords : [],
  images: Array.isArray(row.images) ? row.images : [],
  createdAt: new Date(row.created_at).toISOString(),
})

const normalizeNews = (row) => ({
  slug: row.slug,
  title: row.title,
  subtitle: row.subtitle || '',
  coverImage: row.cover_image || '',
  category: row.category || '',
  tags: Array.isArray(row.tags) ? row.tags : [],
  publishedAt: new Date(row.published_at).toISOString(),
  readingTime: Number(row.reading_time || 5),
  content: row.content || '',
})

const getCommentsMapFromDb = async () => {
  const { rows } = await pool.query(
    `select id, target_id, nickname, content, image, likes, parent_id, created_at
     from comments
     order by created_at asc`,
  )

  const byId = new Map()
  const byTarget = new Map()

  for (const row of rows) {
    const node = {
      id: row.id,
      nickname: row.nickname,
      content: row.content,
      image: row.image || '',
      likes: Number(row.likes || 0),
      createdAt: new Date(row.created_at).toISOString(),
      replies: [],
    }
    byId.set(row.id, { ...node, targetId: row.target_id, parentId: row.parent_id })
  }

  for (const value of byId.values()) {
    if (value.parentId) {
      const parent = byId.get(value.parentId)
      if (parent) {
        parent.replies.push({
          id: value.id,
          nickname: value.nickname,
          content: value.content,
          image: value.image,
          likes: value.likes,
          createdAt: value.createdAt,
        })
      }
      continue
    }

    if (!byTarget.has(value.targetId)) byTarget.set(value.targetId, [])
    byTarget.get(value.targetId).push({
      id: value.id,
      nickname: value.nickname,
      content: value.content,
      image: value.image,
      likes: value.likes,
      createdAt: value.createdAt,
      replies: value.replies,
    })
  }

  const result = {}
  for (const [targetId, comments] of byTarget.entries()) {
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    for (const comment of comments) {
      comment.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    }
    result[targetId] = comments
  }
  return result
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'i_luv_pen_api' })
})

app.get('/api/db-health', async (_req, res) => {
  try {
    const db = await testDbConnection()
    res.json({ ok: true, db })
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')
  const profileImage = String(req.body?.profileImage || '').trim()

  if (!nickname || nickname.length > 24) {
    return res.status(400).json({ ok: false, message: 'Nickname must be 1-24 characters.' })
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, message: 'Password must be at least 4 characters.' })
  }
  if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
    return res.status(403).json({ ok: false, message: 'This nickname is reserved.' })
  }

  try {
    const exists = await pool.query('select id from users where lower(nickname) = lower($1) limit 1', [nickname])
    if (exists.rowCount) {
      return res.status(409).json({ ok: false, message: 'Nickname already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await pool.query(
      `insert into users (nickname, password_hash, profile_image, created_at)
       values ($1, $2, $3, now())`,
      [nickname, passwordHash, profileImage],
    )

    return res.json({ ok: true, nickname, profileImage })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')

  if (!nickname || !password) {
    return res.status(400).json({ ok: false, message: 'Nickname and password are required.' })
  }

  try {
    const user = await verifyUserPassword(nickname, password)
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
    }

    return res.json({ ok: true, nickname: user.nickname, profileImage: user.profile_image || '' })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.get('/api/auth/profile/:nickname', async (req, res) => {
  const nickname = String(req.params.nickname || '').trim()
  if (!nickname) {
    return res.status(400).json({ ok: false, message: 'Nickname is required.' })
  }

  try {
    const found = await findUserByNickname(nickname)
    if (!found.rowCount) {
      return res.status(404).json({ ok: false, message: 'User not found.' })
    }
    const user = found.rows[0]
    return res.json({ ok: true, nickname: user.nickname, profileImage: user.profile_image || '' })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.patch('/api/auth/profile-image', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')
  const profileImage = String(req.body?.profileImage || '').trim()

  if (!nickname || !password) {
    return res.status(400).json({ ok: false, message: 'Nickname and password are required.' })
  }
  if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
    return res.status(403).json({ ok: false, message: 'Admin profile cannot be changed here.' })
  }

  try {
    const user = await verifyUserPassword(nickname, password)
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
    }

    await pool.query(
      `update users
       set profile_image = $2
       where id = $1`,
      [user.id, profileImage],
    )

    return res.json({ ok: true, nickname: user.nickname, profileImage })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.patch('/api/auth/password', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!nickname || !password || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Nickname, current password, and new password are required.' })
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ ok: false, message: 'New password must be at least 4 characters.' })
  }
  if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
    return res.status(403).json({ ok: false, message: 'Admin password cannot be changed here.' })
  }

  try {
    const user = await verifyUserPassword(nickname, password)
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await pool.query(
      `update users
       set password_hash = $2
       where id = $1`,
      [user.id, passwordHash],
    )

    return res.json({ ok: true, nickname: user.nickname })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.delete('/api/auth/user', async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')
  if (!nickname || !password) {
    return res.status(400).json({ ok: false, message: 'Nickname and password are required.' })
  }
  if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
    return res.status(403).json({ ok: false, message: 'Admin account cannot be deleted.' })
  }

  try {
    const user = await verifyUserPassword(nickname, password)
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
    }

    await pool.query('delete from users where id = $1', [user.id])
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.get('/api/state/community', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, nickname, title, content, image, likes, pinned, created_at
       from community_posts
       order by pinned desc, created_at desc`,
    )
    res.json(rows.map(normalizeCommunity))
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/community', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.community
  if (!Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid community payload' })
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from community_posts')

    for (const item of payload) {
      await client.query(
        `insert into community_posts (id, nickname, title, content, image, likes, pinned, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [
          item.id,
          item.nickname,
          item.title,
          item.content,
          item.image || '',
          Number(item.likes || 0),
          Boolean(item.pinned),
          safeIso(item.createdAt),
        ],
      )
    }

    await client.query('commit')
    res.json({ ok: true, count: payload.length })
  } catch (error) {
    await client.query('rollback')
    res.status(500).json({ ok: false, message: error.message })
  } finally {
    client.release()
  }
})

app.get('/api/state/pen', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, name, series, year, description, description_long, keywords, images, created_at
       from pen_items
       order by created_at desc`,
    )
    res.json(rows.map(normalizePen))
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/pen', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.pen
  if (!Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid pen payload' })
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from pen_items')

    for (const item of payload) {
      await client.query(
        `insert into pen_items (id, name, series, year, description, description_long, keywords, images, created_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz)`,
        [
          item.id,
          item.name,
          item.series,
          Number(item.year || 0),
          item.description || '',
          item.descriptionLong || '',
          JSON.stringify(Array.isArray(item.keywords) ? item.keywords : []),
          JSON.stringify(Array.isArray(item.images) ? item.images : []),
          safeIso(item.createdAt),
        ],
      )
    }

    await client.query('commit')
    res.json({ ok: true, count: payload.length })
  } catch (error) {
    await client.query('rollback')
    res.status(500).json({ ok: false, message: error.message })
  } finally {
    client.release()
  }
})

app.get('/api/state/news', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select slug, title, subtitle, cover_image, category, tags, published_at, reading_time, content
       from news_posts
       order by published_at desc`,
    )
    res.json(rows.map(normalizeNews))
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/news', async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.news
  if (!Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid news payload' })
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from news_posts')

    for (const item of payload) {
      await client.query(
        `insert into news_posts (slug, title, subtitle, cover_image, category, tags, published_at, reading_time, content)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8, $9)`,
        [
          item.slug,
          item.title,
          item.subtitle || '',
          item.coverImage || '',
          item.category || '',
          JSON.stringify(Array.isArray(item.tags) ? item.tags : []),
          safeIso(item.publishedAt),
          Number(item.readingTime || 5),
          item.content || '',
        ],
      )
    }

    await client.query('commit')
    res.json({ ok: true, count: payload.length })
  } catch (error) {
    await client.query('rollback')
    res.status(500).json({ ok: false, message: error.message })
  } finally {
    client.release()
  }
})

app.get('/api/state/comments-map', async (_req, res) => {
  try {
    const comments = await getCommentsMapFromDb()
    res.json(comments)
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/comments-map', async (req, res) => {
  const payload = req.body?.comments || req.body
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid comments payload' })
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from comment_mentions')
    await client.query('delete from comments')

    for (const [targetId, comments] of Object.entries(payload)) {
      for (const comment of comments || []) {
        await client.query(
          `insert into comments (id, target_id, nickname, content, image, likes, parent_id, created_at)
           values ($1, $2, $3, $4, $5, $6, null, $7::timestamptz)`,
          [
            comment.id,
            targetId,
            comment.nickname,
            comment.content,
            comment.image || '',
            Number(comment.likes || 0),
            safeIso(comment.createdAt),
          ],
        )

        for (const nickname of extractMentions(comment.content || '')) {
          await client.query(
            `insert into comment_mentions (comment_id, mentioned_nickname)
             values ($1, $2)`,
            [comment.id, nickname],
          )
        }

        for (const reply of comment.replies || []) {
          await client.query(
            `insert into comments (id, target_id, nickname, content, image, likes, parent_id, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
            [
              reply.id,
              targetId,
              reply.nickname,
              reply.content,
              reply.image || '',
              Number(reply.likes || 0),
              comment.id,
              safeIso(reply.createdAt),
            ],
          )

          for (const nickname of extractMentions(reply.content || '')) {
            await client.query(
              `insert into comment_mentions (comment_id, mentioned_nickname)
               values ($1, $2)`,
              [reply.id, nickname],
            )
          }
        }
      }
    }

    await client.query('commit')
    res.json({ ok: true })
  } catch (error) {
    await client.query('rollback')
    res.status(500).json({ ok: false, message: error.message })
  } finally {
    client.release()
  }
})

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      message: 'Request body is too large. Please upload a smaller image.',
    })
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ ok: false, message: 'Invalid JSON payload.' })
  }

  return next(error)
})

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`)
})

const shutdown = async () => {
  server.close()
  await pool.end()
}

process.on('SIGINT', async () => {
  await shutdown()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await shutdown()
  process.exit(0)
})
