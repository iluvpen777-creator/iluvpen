import cors from 'cors'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import dotenv from 'dotenv'
import express from 'express'
import { pool, testDbConnection } from './db.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || process.env.API_PORT || 8787)
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '25mb'

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((v) => v.trim())
  : true

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: jsonBodyLimit }))

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  if (forwarded) return forwarded
  return String(req.ip || req.socket?.remoteAddress || 'unknown')
}

const rateBuckets = new Map()

const hitRateLimit = ({ key, limit, windowMs }) => {
  const now = Date.now()
  const windowStart = now - windowMs
  const bucket = rateBuckets.get(key) || []
  const recent = bucket.filter((ts) => ts > windowStart)

  if (recent.length >= limit) {
    rateBuckets.set(key, recent)
    return false
  }

  recent.push(now)
  rateBuckets.set(key, recent)
  return true
}

const createRateLimit = ({ scope, limit, windowMs, message }) => {
  return (req, res, next) => {
    const key = `${scope}:${getClientIp(req)}`
    if (!hitRateLimit({ key, limit, windowMs })) {
      return res.status(429).json({ ok: false, message })
    }
    next()
  }
}

const writeAdminAuditLog = async ({ req, action, targetType, targetId = '', before = null, after = null, metadata = {} }) => {
  try {
    await pool.query(
      `insert into admin_audit_logs (
         actor_nickname, action, target_type, target_id, before_json, after_json, metadata_json, ip_address, user_agent
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        ADMIN_NICKNAME,
        action,
        targetType,
        targetId,
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(metadata),
        getClientIp(req),
        String(req.headers['user-agent'] || ''),
      ],
    )
  } catch (error) {
    console.error('[audit] failed to write admin log:', error.message)
  }
}

const safeIso = (value) => {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

const countLinks = (text = '') => {
  const matches = String(text || '').match(/https?:\/\//gi)
  return matches ? matches.length : 0
}

const hasSpamLikeContent = (text = '') => {
  const value = String(text || '')
  if (!value.trim()) return false
  if (countLinks(value) > 4) return true
  if (value.length > 8000) return true
  return false
}

const validateCommunityPayload = (payload = []) => {
  for (const item of payload) {
    if (hasSpamLikeContent(item?.title) || hasSpamLikeContent(item?.content)) {
      return 'Community post looks like spam or is too large.'
    }
  }
  return ''
}

const validateCommentsPayload = (payload = {}) => {
  for (const comments of Object.values(payload)) {
    for (const comment of comments || []) {
      if (hasSpamLikeContent(comment?.content)) {
        return 'Comment looks like spam or is too large.'
      }
      for (const reply of comment?.replies || []) {
        if (hasSpamLikeContent(reply?.content)) {
          return 'Reply looks like spam or is too large.'
        }
      }
    }
  }
  return ''
}

const mentionRegex = /(^|\s)@([a-zA-Z0-9_\-.]+)/g

const ADMIN_NICKNAME = 'i_luv_pen'
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'iluvpen-admin')
const ADMIN_TOKEN_SECRET = String(process.env.ADMIN_TOKEN_SECRET || ADMIN_PASSWORD)

const authRateLimit = createRateLimit({
  scope: 'auth',
  limit: Number(process.env.RATE_LIMIT_AUTH || 20),
  windowMs: 60 * 1000,
  message: 'Too many login/register attempts. Please try again in a minute.',
})

const communityWriteRateLimit = createRateLimit({
  scope: 'community-write',
  limit: Number(process.env.RATE_LIMIT_COMMUNITY_WRITE || 20),
  windowMs: 60 * 1000,
  message: 'Too many community updates. Please slow down and try again.',
})

const commentWriteRateLimit = createRateLimit({
  scope: 'comment-write',
  limit: Number(process.env.RATE_LIMIT_COMMENT_WRITE || 40),
  windowMs: 60 * 1000,
  message: 'Too many comment updates. Please slow down and try again.',
})

const commentLikeRateLimit = createRateLimit({
  scope: 'comment-like',
  limit: Number(process.env.RATE_LIMIT_COMMENT_LIKE || 120),
  windowMs: 60 * 1000,
  message: 'Too many like requests. Please wait a moment.',
})

const buildAdminToken = () => crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(ADMIN_NICKNAME).digest('hex')

const isAdminTokenValid = (token = '') => {
  const normalized = String(token || '').trim()
  if (!normalized) return false

  const expected = Buffer.from(buildAdminToken())
  const received = Buffer.from(normalized)
  if (expected.length !== received.length) return false
  return crypto.timingSafeEqual(expected, received)
}

const requireAdminAuth = (req, res, next) => {
  const authHeader = String(req.headers.authorization || '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!isAdminTokenValid(token)) {
    return res.status(401).json({ ok: false, message: 'Admin authentication required.' })
  }
  next()
}

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

const replaceCommentsMap = async (payload) => {
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
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
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
  profileImage: row.profile_image || '',
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
  releaseMonth: row.release_month == null ? null : Number(row.release_month),
  price: row.price || '',
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

const normalizeSite = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

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

app.post('/api/auth/register', authRateLimit, async (req, res) => {
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

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const nickname = String(req.body?.nickname || '').trim()
  const password = String(req.body?.password || '')

  if (!nickname || !password) {
    return res.status(400).json({ ok: false, message: 'Nickname and password are required.' })
  }

  try {
    if (nickname.toLowerCase() === ADMIN_NICKNAME.toLowerCase()) {
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
      }

      return res.json({
        ok: true,
        nickname: ADMIN_NICKNAME,
        profileImage: '',
        isAdmin: true,
        adminToken: buildAdminToken(),
      })
    }

    const user = await verifyUserPassword(nickname, password)
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid nickname or password.' })
    }

    return res.json({ ok: true, nickname: user.nickname, profileImage: user.profile_image || '', isAdmin: false })
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
      `select c.id, c.nickname, c.title, c.content, c.image, c.likes, c.pinned, c.created_at,
              coalesce(u.profile_image, '') as profile_image
       from community_posts c
       left join users u on lower(u.nickname) = lower(c.nickname)
       order by c.pinned desc, c.created_at desc`,
    )
    res.json(rows.map(normalizeCommunity))
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/community', communityWriteRateLimit, async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.community
  if (!Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid community payload' })
  }

  const validationError = validateCommunityPayload(payload)
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError })
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

app.patch('/api/admin/community/:id', requireAdminAuth, async (req, res) => {
  const id = String(req.params.id || '').trim()
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Community post ID is required.' })
  }

  const updates = []
  const values = [id]

  if (typeof req.body?.title === 'string') {
    values.push(String(req.body.title).trim())
    updates.push(`title = $${values.length}`)
  }
  if (typeof req.body?.content === 'string') {
    values.push(String(req.body.content).trim())
    updates.push(`content = $${values.length}`)
  }
  if (typeof req.body?.pinned === 'boolean') {
    values.push(Boolean(req.body.pinned))
    updates.push(`pinned = $${values.length}`)
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, message: 'No community post fields to update.' })
  }

  try {
    const beforeResult = await pool.query(
      `select id, nickname, title, content, image, likes, pinned, created_at
       from community_posts
       where id = $1
       limit 1`,
      [id],
    )

    const result = await pool.query(
      `update community_posts
       set ${updates.join(', ')}
       where id = $1
       returning id, pinned, title, content`,
      values,
    )

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Community post not found.' })
    }

    await writeAdminAuditLog({
      req,
      action: 'admin.community.patch',
      targetType: 'community_post',
      targetId: id,
      before: beforeResult.rows[0] || null,
      after: result.rows[0],
    })

    return res.json({ ok: true, post: result.rows[0] })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.delete('/api/admin/community/:id', requireAdminAuth, async (req, res) => {
  const id = String(req.params.id || '').trim()
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Community post ID is required.' })
  }

  try {
    const beforeResult = await pool.query(
      `select id, nickname, title, content, image, likes, pinned, created_at
       from community_posts
       where id = $1
       limit 1`,
      [id],
    )

    const result = await pool.query('delete from community_posts where id = $1', [id])
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Community post not found.' })
    }

    await writeAdminAuditLog({
      req,
      action: 'admin.community.delete',
      targetType: 'community_post',
      targetId: id,
      before: beforeResult.rows[0] || null,
      after: null,
    })

    return res.json({ ok: true, id })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.get('/api/state/pen', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, name, series, year, release_month, price, description, description_long, keywords, images, created_at
       from pen_items
       order by created_at desc`,
    )
    res.json(rows.map(normalizePen))
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/pen', requireAdminAuth, async (req, res) => {
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
        `insert into pen_items (id, name, series, year, release_month, price, description, description_long, keywords, images, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::timestamptz)`,
        [
          item.id,
          item.name,
          item.series,
          Number(item.year || 0),
          (() => {
            const parsed = Number(item.releaseMonth)
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null
            return parsed
          })(),
          String(item.price || '').trim(),
          item.description || '',
          item.descriptionLong || '',
          JSON.stringify(Array.isArray(item.keywords) ? item.keywords : []),
          JSON.stringify(Array.isArray(item.images) ? item.images : []),
          safeIso(item.createdAt),
        ],
      )
    }

    await client.query('commit')
    await writeAdminAuditLog({
      req,
      action: 'admin.pen.replace_all',
      targetType: 'pen_items',
      targetId: 'all',
      before: null,
      after: { count: payload.length },
      metadata: { ids: payload.map((item) => item.id).slice(0, 50) },
    })
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

app.put('/api/state/news', requireAdminAuth, async (req, res) => {
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
    await writeAdminAuditLog({
      req,
      action: 'admin.news.replace_all',
      targetType: 'news_posts',
      targetId: 'all',
      before: null,
      after: { count: payload.length },
      metadata: { slugs: payload.map((item) => item.slug).slice(0, 50) },
    })
    res.json({ ok: true, count: payload.length })
  } catch (error) {
    await client.query('rollback')
    res.status(500).json({ ok: false, message: error.message })
  } finally {
    client.release()
  }
})

app.get('/api/state/site', async (_req, res) => {
  try {
    const result = await pool.query(
      `select value_json
       from site_settings
       where setting_key = 'site'
       limit 1`,
    )

    if (!result.rowCount) {
      return res.json({})
    }

    return res.json(normalizeSite(result.rows[0].value_json))
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/site', requireAdminAuth, async (req, res) => {
  const payload = req.body?.site ?? req.body
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid site payload' })
  }

  try {
    const beforeResult = await pool.query(
      `select value_json
       from site_settings
       where setting_key = 'site'
       limit 1`,
    )

    const normalized = normalizeSite(payload)
    await pool.query(
      `insert into site_settings (setting_key, value_json, updated_at)
       values ('site', $1::jsonb, now())
       on conflict (setting_key)
       do update set value_json = excluded.value_json, updated_at = now()`,
      [JSON.stringify(normalized)],
    )

    await writeAdminAuditLog({
      req,
      action: 'admin.site.upsert',
      targetType: 'site_settings',
      targetId: 'site',
      before: beforeResult.rows[0]?.value_json || null,
      after: normalized,
    })

    return res.json({ ok: true, site: normalized })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
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

app.patch('/api/state/comment-like', commentLikeRateLimit, async (req, res) => {
  const commentId = String(req.body?.commentId || '').trim()
  const likes = Number(req.body?.likes)

  if (!commentId || !Number.isFinite(likes)) {
    return res.status(400).json({ ok: false, message: 'Invalid comment like payload' })
  }

  try {
    const result = await pool.query(
      `update comments
       set likes = $2
       where id = $1`,
      [commentId, Math.max(0, Math.floor(likes))],
    )

    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Comment not found' })
    }

    return res.json({ ok: true, commentId, likes: Math.max(0, Math.floor(likes)) })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/state/comments-map', commentWriteRateLimit, async (req, res) => {
  const payload = req.body?.comments || req.body
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid comments payload' })
  }

  const validationError = validateCommentsPayload(payload)
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError })
  }

  try {
    await replaceCommentsMap(payload)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.put('/api/admin/comments-map', requireAdminAuth, async (req, res) => {
  const payload = req.body?.comments || req.body
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ ok: false, message: 'Invalid comments payload' })
  }

  const validationError = validateCommentsPayload(payload)
  if (validationError) {
    return res.status(400).json({ ok: false, message: validationError })
  }

  try {
    await replaceCommentsMap(payload)
    await writeAdminAuditLog({
      req,
      action: 'admin.comments.replace_all',
      targetType: 'comments',
      targetId: 'all',
      before: null,
      after: { targetCount: Object.keys(payload).length },
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.delete('/api/admin/comment/:id', requireAdminAuth, async (req, res) => {
  const id = String(req.params.id || '').trim()
  if (!id) {
    return res.status(400).json({ ok: false, message: 'Comment ID is required.' })
  }

  try {
    const beforeResult = await pool.query(
      `select id, target_id, nickname, content, image, likes, parent_id, created_at
       from comments
       where id = $1
       limit 1`,
      [id],
    )

    const result = await pool.query('delete from comments where id = $1', [id])
    if (!result.rowCount) {
      return res.status(404).json({ ok: false, message: 'Comment not found.' })
    }

    await writeAdminAuditLog({
      req,
      action: 'admin.comment.delete',
      targetType: 'comment',
      targetId: id,
      before: beforeResult.rows[0] || null,
      after: null,
    })

    res.json({ ok: true, id })
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message })
  }
})

app.get('/api/admin/audit-logs', requireAdminAuth, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)))
  const offset = Math.max(0, Number(req.query.offset || 0))

  try {
    const result = await pool.query(
      `select id, actor_nickname, action, target_type, target_id, before_json, after_json, metadata_json, ip_address, user_agent, created_at
       from admin_audit_logs
       order by created_at desc
       limit $1
       offset $2`,
      [limit, offset],
    )

    return res.json({ ok: true, items: result.rows, limit, offset })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
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
