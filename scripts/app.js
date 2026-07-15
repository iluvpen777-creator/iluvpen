const BASE_URL = import.meta.env.BASE_URL
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const USE_REMOTE_DB = Boolean(API_BASE_URL) || Boolean(import.meta.env.DEV)
const IS_PROD = Boolean(import.meta.env.PROD)
const LOCAL_FALLBACK_ENABLED = !USE_REMOTE_DB
const REMOTE_DB_REQUIRED_MESSAGE =
  'Server DB sync is required in production. Set VITE_API_BASE_URL and redeploy.'
let hasShownSyncWarning = false

const warnRemoteDbRequired = () => {
  if (hasShownSyncWarning) return
  hasShownSyncWarning = true
  alert(REMOTE_DB_REQUIRED_MESSAGE)
}

const isBlockedLocalMode = () => IS_PROD && LOCAL_FALLBACK_ENABLED

const requireSyncedDbMode = () => {
  if (!isBlockedLocalMode()) return true
  warnRemoteDbRequired()
  return false
}

const PROFILE_AVATAR_URL = new URL('../images/profile.jpg', import.meta.url).href
const DEFAULT_USER_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23d5d5d5"/><circle cx="32" cy="24" r="12" fill="%23f6f6f6"/><path d="M12 54c4-10 12-16 20-16s16 6 20 16" fill="%23f6f6f6"/></svg>'
const IMAGE_UPLOAD_MAX_EDGE = 2560
const IMAGE_UPLOAD_TARGET_BYTES = 900 * 1024
const IMAGE_UPLOAD_MAX_SOURCE_BYTES = 40 * 1024 * 1024

const STORAGE_KEYS = {
  theme: 'iluvpen_theme',
  lang: 'iluvpen_lang',
  nickname: 'iluvpen_nickname',
  users: 'iluvpen_users',
  community: 'iluvpen_community_posts',
  comments: 'iluvpen_comments',
  commentsVersion: 'iluvpen_comments_version',
  cachedPens: 'iluvpen_cached_pens',
  cachedNews: 'iluvpen_cached_news',
  cachedCommunity: 'iluvpen_cached_community',
  cachedComments: 'iluvpen_cached_comments',
  cachedSite: 'iluvpen_cached_site',
  testCommentsSeeded: 'iluvpen_test_comments_seeded',
  admin: 'iluvpen_admin_auth',
  adminToken: 'iluvpen_admin_token',
  resetVersion: 'iluvpen_reset_version',
  likeMarks: 'iluvpen_like_marks',
  notificationPromptSeen: 'iluvpen_notification_prompt_seen',
  notificationOptIn: 'iluvpen_notification_opt_in',
  notificationNewsSeenAt: 'iluvpen_notification_news_seen_at',
  notificationMentionSeenIds: 'iluvpen_notification_mention_seen_ids',
}

const DATA_RESET_VERSION = '2026-07-11-clean-all-test-content'

const state = {
  pens: [],
  news: [],
  community: [],
  site: null,
  comments: {},
  commentsVersion: 0,
  commentActionBusy: {},
  commentSorts: {},
  lang: 'en',
  currentRoute: { page: 'home', param: '' },
  accountMenuOpen: false,
  authModalOpen: false,
  authMode: 'login',
  accountManageMode: '',
  notificationConsentModalOpen: false,
  userProfileImage: '',
}

const SUPPORTED_LANGS = ['ko', 'en', 'zh', 'ja']

const I18N = {
  en: {
    Home: 'Home',
    Collection: 'Collection',
    News: 'News',
    Community: 'Community',
    About: 'About',
    Search: 'Search',
    Admin: 'Admin',
  },
  zh: {
    Home: '首页',
    Collection: '收藏',
    News: '新闻',
    Community: '社区',
    About: '关于',
    Search: '搜索',
    Admin: '管理',
  },
  ja: {
    Home: 'ホーム',
    Collection: 'コレクション',
    News: 'ニュース',
    Community: 'コミュニティ',
    About: '概要',
    Search: '検索',
    Admin: '管理',
  },
}

const getPreferredLanguage = () => {
  return 'en'
}

const t = (text) => {
  if (state.lang === 'ko') return text
  return I18N[state.lang]?.[text] || text
}

const localizeHtml = (html) => {
  if (state.lang === 'ko') return html
  const dict = I18N[state.lang] || {}
  let localized = html
  for (const [source, target] of Object.entries(dict)) {
    localized = localized.split(source).join(target)
  }
  return localized
}

const isCommunityEnabled = () => Boolean(state.site?.communityEnabled)

const formatDate = (dateValue) => {
  const d = new Date(dateValue)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const parsePenPriceNumber = (priceValue) => {
  const raw = String(priceValue || '').trim()
  if (!raw) return null
  const digitsOnly = raw.replace(/\D/g, '')
  if (!digitsOnly) return null
  const amount = Number(digitsOnly)
  return Number.isFinite(amount) ? amount : null
}

const formatPenPriceInput = (priceValue) => {
  const amount = parsePenPriceNumber(priceValue)
  if (amount === null) return ''
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)
}

const normalizePenPriceForStorage = (priceValue) => {
  const amount = parsePenPriceNumber(priceValue)
  if (amount === null) return ''
  return String(Math.trunc(amount))
}

const normalizeReleaseMonth = (monthValue) => {
  const parsed = Number(monthValue)
  if (!Number.isInteger(parsed)) return null
  if (parsed < 1 || parsed > 12) return null
  return parsed
}

const getReleaseSortKey = (pen = {}) => {
  const year = Number(pen.year || 0)
  const month = normalizeReleaseMonth(pen.releaseMonth) || 0
  return year * 100 + month
}

const formatReleaseLabel = (pen = {}) => {
  const year = Number(pen.year || 0)
  const month = normalizeReleaseMonth(pen.releaseMonth)
  if (!month) return String(year)
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${year} ${monthShort[month - 1]}`
}

const formatPenPrice = (priceValue) => {
  const amount = parsePenPriceNumber(priceValue)
  if (amount === null) return ''
  return `€ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`
}

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const escapeHtml = (value = '') =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const renderMentionedText = (value = '') => {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/(^|\s)@([a-zA-Z0-9_\-.]+)/g, '$1<span class="mention">@$2</span>')
    .replace(/\n/g, '<br />')
}

const extractMentionNicknames = (value = '') => {
  const matches = String(value || '').matchAll(/(^|\s)@([a-zA-Z0-9_\-.]+)/g)
  const result = []
  for (const match of matches) {
    result.push(String(match[2] || '').trim().toLowerCase())
  }
  return [...new Set(result.filter(Boolean))]
}

const renderInlineMarkdown = (value = '') => {
  let escaped = escapeHtml(String(value || ''))
  const codeTokens = []

  escaped = escaped.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODE_${codeTokens.length}@@`
    codeTokens.push(`<code>${code}</code>`)
    return token
  })

  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  escaped = escaped.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
  escaped = escaped.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  codeTokens.forEach((snippet, idx) => {
    escaped = escaped.split(`@@CODE_${idx}@@`).join(snippet)
  })

  return escaped
}

const renderUserAvatar = (nickname = '', size = 'md', profileImage = '') => {
  const safeImage = String(profileImage || '').trim()
  if (safeImage) {
    return `<img class="social-avatar ${size}" src="${escapeHtml(safeImage)}" alt="${escapeHtml(nickname)} profile" loading="lazy" />`
  }
  const initial = (nickname.trim().charAt(0) || '?').toUpperCase()
  return `<span class="social-avatar ${size}" aria-hidden="true">${escapeHtml(initial)}</span>`
}

const getReplyToggleLabel = (count, expanded = false) => {
  const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0
  return expanded ? 'Hide replies' : `View all ${safeCount} replies`
}

const markdownToHtml = (markdown = '') => {
  const lines = markdown.split('\n')
  const blocks = []
  let inCode = false
  let codeLang = ''
  let codeBuffer = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true
        codeLang = line.replace('```', '').trim()
        codeBuffer = []
      } else {
        // Intentionally hide code fences in public journal rendering.
        inCode = false
        codeLang = ''
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(raw)
      continue
    }

    if (!line) {
      blocks.push('')
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push(`<h3>${renderInlineMarkdown(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(`<h2>${renderInlineMarkdown(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push(`<h1>${renderInlineMarkdown(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('- ')) {
      const prev = blocks[blocks.length - 1]
      if (!prev || !prev.endsWith('</ul>')) {
        blocks.push('<ul>')
      }
      blocks.push(`<li>${renderInlineMarkdown(line.slice(2))}</li>`)
      continue
    }
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`)
  }

  // normalize list wrappers
  const normalized = []
  let listOpen = false
  for (const block of blocks) {
    if (block === '<ul>') {
      if (!listOpen) {
        normalized.push('<ul>')
        listOpen = true
      }
      continue
    }
    if (block.startsWith('<li>')) {
      normalized.push(block)
      continue
    }
    if (listOpen) {
      normalized.push('</ul>')
      listOpen = false
    }
    if (block) {
      normalized.push(block)
    }
  }
  if (listOpen) normalized.push('</ul>')

  return normalized.join('')
}

const getNickname = () => localStorage.getItem(STORAGE_KEYS.nickname) || ''
const isProtectedAdminNickname = (nickname = '') => nickname.toLowerCase() === 'i_luv_pen'
const isCurrentProtectedAdmin = () => isProtectedAdminNickname(getNickname())
const getCurrentUserAvatar = () => state.userProfileImage || DEFAULT_USER_AVATAR
const isSameNickname = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase()
const canManageOwnedContent = (ownerNickname = '') => isAdmin() || isSameNickname(getNickname(), ownerNickname)

const getLocalUsers = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveLocalUsers = (users) => {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users))
}

const getLikeMarks = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.likeMarks) || '{}')
    return {
      community: parsed?.community && typeof parsed.community === 'object' ? parsed.community : {},
      comments: parsed?.comments && typeof parsed.comments === 'object' ? parsed.comments : {},
    }
  } catch {
    return { community: {}, comments: {} }
  }
}

const saveLikeMarks = (marks) => {
  localStorage.setItem(STORAGE_KEYS.likeMarks, JSON.stringify(marks))
}

const getLikeBucket = (type) => {
  const nickname = getNickname().trim().toLowerCase()
  if (!nickname) return []
  const marks = getLikeMarks()
  const scope = type === 'community' ? marks.community : marks.comments
  return Array.isArray(scope[nickname]) ? scope[nickname] : []
}

const hasLiked = (type, id) => getLikeBucket(type).includes(id)

const toggleLikeMark = (type, id) => {
  const nickname = getNickname().trim().toLowerCase()
  if (!nickname) return false

  const marks = getLikeMarks()
  const scope = type === 'community' ? marks.community : marks.comments
  const bucket = new Set(Array.isArray(scope[nickname]) ? scope[nickname] : [])

  let nowLiked = false
  if (bucket.has(id)) {
    bucket.delete(id)
  } else {
    bucket.add(id)
    nowLiked = true
  }

  scope[nickname] = [...bucket]
  if (type === 'community') {
    marks.community = scope
  } else {
    marks.comments = scope
  }
  saveLikeMarks(marks)
  return nowLiked
}

const applyOneTimeDataReset = () => {
  const applied = localStorage.getItem(STORAGE_KEYS.resetVersion)
  if (applied === DATA_RESET_VERSION) return

  localStorage.removeItem(STORAGE_KEYS.users)
  localStorage.removeItem(STORAGE_KEYS.nickname)
  localStorage.removeItem(STORAGE_KEYS.community)
  localStorage.removeItem(STORAGE_KEYS.comments)
  localStorage.removeItem(STORAGE_KEYS.likeMarks)
  localStorage.removeItem(STORAGE_KEYS.testCommentsSeeded)
  localStorage.removeItem(STORAGE_KEYS.admin)
  localStorage.removeItem(STORAGE_KEYS.adminToken)
  localStorage.setItem(STORAGE_KEYS.resetVersion, DATA_RESET_VERSION)
}

const findLocalUserNickname = (nickname) => {
  const users = getLocalUsers()
  const key = Object.keys(users).find((name) => name.toLowerCase() === nickname.toLowerCase())
  return key || ''
}

const getLocalUserProfileImage = (nickname) => {
  const found = findLocalUserNickname(nickname)
  if (!found) return ''
  const users = getLocalUsers()
  return users[found]?.profileImage || ''
}

const getProfileImageByNickname = (nickname = '') => {
  if (!nickname) return ''
  if (isProtectedAdminNickname(nickname)) return PROFILE_AVATAR_URL
  if (isSameNickname(nickname, getNickname())) return getCurrentUserAvatar()
  return getLocalUserProfileImage(nickname)
}

const getUserProfile = async (nickname) => {
  if (!nickname) return { nickname: '', profileImage: '' }
  if (USE_REMOTE_DB) {
    return apiRequest(`/api/auth/profile/${encodeURIComponent(nickname)}`)
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)
  const found = findLocalUserNickname(nickname)
  if (!found) throw new Error('User not found.')
  return { ok: true, nickname: found, profileImage: getLocalUserProfileImage(found) }
}

const updateUserProfileImage = async ({ nickname, password, profileImage }) => {
  if (USE_REMOTE_DB) {
    return apiRequest('/api/auth/profile-image', {
      method: 'PATCH',
      body: JSON.stringify({ nickname, password, profileImage }),
    })
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)

  const found = findLocalUserNickname(nickname)
  if (!found) throw new Error('User not found.')
  const users = getLocalUsers()
  if (users[found]?.password !== password) {
    throw new Error('Invalid nickname or password.')
  }
  users[found] = { ...users[found], profileImage: profileImage || '' }
  saveLocalUsers(users)
  return { ok: true, nickname: found, profileImage: users[found].profileImage || '' }
}

const updateUserPassword = async ({ nickname, password, newPassword }) => {
  if (USE_REMOTE_DB) {
    return apiRequest('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ nickname, password, newPassword }),
    })
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)

  const found = findLocalUserNickname(nickname)
  if (!found) throw new Error('User not found.')
  const users = getLocalUsers()
  if (users[found]?.password !== password) {
    throw new Error('Invalid nickname or password.')
  }
  users[found] = { ...users[found], password: newPassword }
  saveLocalUsers(users)
  return { ok: true, nickname: found }
}

const deleteUserAccount = async ({ nickname, password }) => {
  if (USE_REMOTE_DB) {
    return apiRequest('/api/auth/user', {
      method: 'DELETE',
      body: JSON.stringify({ nickname, password }),
    })
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)

  const found = findLocalUserNickname(nickname)
  if (!found) throw new Error('User not found.')
  const users = getLocalUsers()
  if (users[found]?.password !== password) {
    throw new Error('Invalid nickname or password.')
  }
  delete users[found]
  saveLocalUsers(users)
  return { ok: true }
}

const registerNickname = async (nickname, password, profileImage = '') => {
  if (isProtectedAdminNickname(nickname)) {
    throw new Error('This nickname is reserved.')
  }

  if (USE_REMOTE_DB) {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nickname, password, profileImage }),
    })
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)

  const users = getLocalUsers()
  const exists = Object.keys(users).some((name) => name.toLowerCase() === nickname.toLowerCase())
  if (exists) {
    throw new Error('Nickname already exists.')
  }
  users[nickname] = { password, profileImage: profileImage || '' }
  saveLocalUsers(users)
  return { ok: true, nickname, profileImage: users[nickname].profileImage }
}

const loginNickname = async (nickname, password) => {
  if (USE_REMOTE_DB) {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nickname, password }),
    })
  }
  if (isBlockedLocalMode()) throw new Error(REMOTE_DB_REQUIRED_MESSAGE)

  const foundNickname = findLocalUserNickname(nickname)
  if (!foundNickname) throw new Error('Invalid nickname or password.')
  const users = getLocalUsers()
  if (users[foundNickname]?.password !== password) {
    throw new Error('Invalid nickname or password.')
  }
  return {
    ok: true,
    nickname: foundNickname,
    profileImage: users[foundNickname]?.profileImage || '',
  }
}

const ensureNickname = () => {
  const current = getNickname()
  if (current) return current
  state.authModalOpen = true
  state.authMode = 'login'
  render()
  return ''
}

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Unable to read the image file.'))
    reader.readAsDataURL(file)
  })

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Unable to convert optimized image.'))
    reader.readAsDataURL(blob)
  })

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to decode the selected image.'))
    }
    image.src = objectUrl
  })

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Image optimization failed.'))
        return
      }
      resolve(blob)
    }, mimeType, quality)
  })

const optimizeImageFileToDataUrl = async (file) => {
  if (file.size > IMAGE_UPLOAD_MAX_SOURCE_BYTES) {
    alert('Image file is too large. Please use a file under 40MB.')
    return ''
  }

  if (file.type === 'image/gif') {
    return fileToDataUrl(file)
  }

  if (file.size <= IMAGE_UPLOAD_TARGET_BYTES) {
    return fileToDataUrl(file)
  }

  const source = await loadImageFromFile(file)
  const startRatio = Math.min(1, IMAGE_UPLOAD_MAX_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return fileToDataUrl(file)
  }

  const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42]
  let ratio = startRatio
  let best = null

  for (let pass = 0; pass < 5; pass += 1) {
    const width = Math.max(1, Math.round(source.width * ratio))
    const height = Math.max(1, Math.round(source.height * ratio))
    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)

    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (!best || blob.size < best.size) {
        best = blob
      }
      if (blob.size <= IMAGE_UPLOAD_TARGET_BYTES) {
        return blobToDataUrl(blob)
      }
    }

    ratio *= 0.85
  }

  if (best) {
    return blobToDataUrl(best)
  }

  return fileToDataUrl(file)
}

const parseImageValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }

  const text = String(value || '').trim()
  if (!text) return []

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean)
      }
    } catch {
      // fall back to line-based parsing
    }
  }

  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const getFirstImageValue = (value) => parseImageValues(value)[0] || ''

const getSelectedFileLabel = (fileInput) => {
  const count = fileInput?.files?.length || 0
  if (!count) return 'No file chosen'
  if (count === 1) return fileInput.files?.[0]?.name || 'No file chosen'
  return `${count} files chosen`
}

const resolveImageInputs = async (urlValue, fileInput) => {
  const urls = parseImageValues(urlValue)
  const files = Array.from(fileInput?.files || [])
  if (!files.length) return urls
  if (files.some((file) => !file.type.startsWith('image/'))) {
    alert('Only image files can be uploaded.')
    return []
  }

  const optimized = await Promise.all(files.map((file) => optimizeImageFileToDataUrl(file)))
  return [...optimized.filter(Boolean), ...urls]
}

const resolveImageInput = async (urlValue, fileInput) => {
  const images = await resolveImageInputs(urlValue, fileInput)
  return images[0] || ''
}

const getFirstImageLine = (value) =>
  (value || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || ''

const getFormImagePreviewSource = async (form) => {
  if (!form) return ''
  const fileInput = form.querySelector('input[name="imageFile"]')
  const file = fileInput?.files?.[0]
  if (file) {
    if (!file.type.startsWith('image/')) return ''
    return fileToDataUrl(file)
  }

  const urlInput = form.querySelector('input[name="imageUrl"], input[name="image"], input[name="coverImage"], textarea[name="coverImage"]')
  const byUrl = getFirstImageValue(urlInput?.value || '')
  if (byUrl) return byUrl

  const imagesArea = form.querySelector('textarea[name="images"]')
  if (imagesArea) {
    return getFirstImageLine(imagesArea.value)
  }

  return ''
}

const ensureImagePreviewElement = (form) => {
  if (!form) return null
  const hasImageControls =
    form.querySelector('input[name="imageFile"]') ||
    form.querySelector('input[name="imageUrl"], input[name="image"], input[name="coverImage"], textarea[name="coverImage"]') ||
    form.querySelector('textarea[name="images"]')
  if (!hasImageControls) return null

  let preview = form.querySelector('[data-image-preview]')
  if (!preview) {
    preview = document.createElement('div')
    preview.className = 'image-preview'
    preview.dataset.imagePreview = 'true'
    preview.hidden = true
    preview.innerHTML = '<p class="muted">Thumbnail preview</p><img alt="Image preview" loading="lazy" />'
  }

  const firstImageControl = form.querySelector(
    'textarea[name="images"], input[name="imageUrl"], input[name="image"], input[name="coverImage"], textarea[name="coverImage"], input[name="imageFile"]',
  )

  if (firstImageControl) {
    const imageFieldsContainer = firstImageControl.closest('.image-fields')
    if (imageFieldsContainer && form.contains(imageFieldsContainer)) {
      const anchor = imageFieldsContainer.firstElementChild || imageFieldsContainer
      if (preview !== anchor || preview.parentElement !== imageFieldsContainer) {
        imageFieldsContainer.insertBefore(preview, anchor)
      }
      return preview
    }

    const anchorLabel = firstImageControl.closest('label')
    const anchor = anchorLabel && form.contains(anchorLabel) ? anchorLabel : firstImageControl
    if (preview !== anchor || preview.parentElement !== form) {
      form.insertBefore(preview, anchor)
    }
    return preview
  }

  const submitActions = form.querySelector('.editor-actions:last-of-type')
  if (!submitActions) {
    form.append(preview)
    return preview
  }

  if (submitActions.parentElement === form) {
    form.insertBefore(preview, submitActions)
  } else {
    form.append(preview)
  }

  return preview
}

const syncImagePreviewForForm = async (form) => {
  const preview = ensureImagePreviewElement(form)
  if (!preview) return

  const src = await getFormImagePreviewSource(form)
  const image = preview.querySelector('img')
  if (!image || !src) {
    preview.hidden = true
    if (image) image.removeAttribute('src')
    return
  }

  image.src = src
  image.onerror = () => {
    preview.hidden = true
    image.removeAttribute('src')
  }
  image.onload = () => {
    preview.hidden = false
  }
}

const apiRequest = async (path, options = {}) => {
  const url = `${API_BASE_URL}${path}`
  const { headers: extraHeaders = {}, ...restOptions } = options
  const response = await fetch(url, {
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })

  if (!response.ok) {
    const reasonText = await response.text()
    let reason = reasonText
    try {
      const parsed = JSON.parse(reasonText)
      if (parsed && typeof parsed.message === 'string') {
        reason = parsed.message
      }
    } catch {
      // keep raw text when response is not JSON
    }
    throw new Error(`API error: ${response.status} ${reason}`)
  }

  if (response.status === 204) return null
  return response.json()
}

let keyboardInsetFrame = 0
let lastKeyboardOffset = ''

const shouldTrackKeyboardInset = () => {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (!active.matches('input, textarea, select, [contenteditable="true"]')) return false
  if (active.matches('input[type="file"], input[type="hidden"]')) return false
  return true
}

const updateKeyboardInset = () => {
  const viewport = window.visualViewport
  const root = document.documentElement

  if (!viewport) {
    if (lastKeyboardOffset !== '0px') {
      root.style.setProperty('--keyboard-offset', '0px')
      lastKeyboardOffset = '0px'
    }
    return
  }

  const keyboardHeight = shouldTrackKeyboardInset()
    ? Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
    : 0
  const nextOffset = `${Math.round(keyboardHeight)}px`

  if (nextOffset === lastKeyboardOffset) return
  root.style.setProperty('--keyboard-offset', nextOffset)
  lastKeyboardOffset = nextOffset
}

const scheduleKeyboardInsetUpdate = () => {
  if (keyboardInsetFrame) return
  keyboardInsetFrame = window.requestAnimationFrame(() => {
    keyboardInsetFrame = 0
    updateKeyboardInset()
  })
}

const keepFocusedFieldVisible = (target) => {
  if (!(target instanceof HTMLElement)) return
  if (!(target.matches('input, textarea, select'))) return
  if (target.matches('input[type="file"], input[type="hidden"]')) return

  const run = () => {
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
  }

  window.setTimeout(run, 120)
}

const loadJson = async (path) => {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}`)
  return res.json()
}

const readCachedJson = (key, fallbackValue) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallbackValue
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

const writeCachedJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore cache write failures.
  }
}

const resolveArrayState = ({ apiValue, cachedKey, fileValue }) => {
  if (Array.isArray(apiValue)) {
    writeCachedJson(cachedKey, apiValue)
    return apiValue
  }

  const cached = readCachedJson(cachedKey, null)
  if (Array.isArray(cached)) return cached
  return Array.isArray(fileValue) ? fileValue : []
}

const resolveObjectState = ({ apiValue, cachedKey, fileValue }) => {
  if (apiValue && typeof apiValue === 'object' && !Array.isArray(apiValue)) {
    writeCachedJson(cachedKey, apiValue)
    return apiValue
  }

  const cached = readCachedJson(cachedKey, null)
  if (cached && typeof cached === 'object' && !Array.isArray(cached)) return cached
  return fileValue && typeof fileValue === 'object' && !Array.isArray(fileValue) ? fileValue : {}
}

const parseCommentsVersion = (value) => {
  const version = Number(value)
  return Number.isFinite(version) && version >= 0 ? Math.floor(version) : 0
}

const isWrappedCommentsResponse = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && ('comments' in value || 'version' in value)
}

const resolveCommentsState = ({ apiValue, cachedCommentsKey, cachedVersionKey, fileValue }) => {
  if (isWrappedCommentsResponse(apiValue)) {
    const comments = apiValue.comments && typeof apiValue.comments === 'object' && !Array.isArray(apiValue.comments) ? apiValue.comments : {}
    const version = parseCommentsVersion(apiValue.version)
    writeCachedJson(cachedCommentsKey, comments)
    localStorage.setItem(cachedVersionKey, String(version))
    return { comments, version }
  }

  if (apiValue && typeof apiValue === 'object' && !Array.isArray(apiValue)) {
    const comments = apiValue
    const version = parseCommentsVersion(localStorage.getItem(cachedVersionKey))
    writeCachedJson(cachedCommentsKey, comments)
    return { comments, version }
  }

  const cachedComments = readCachedJson(cachedCommentsKey, null)
  if (cachedComments && typeof cachedComments === 'object' && !Array.isArray(cachedComments)) {
    return {
      comments: cachedComments,
      version: parseCommentsVersion(localStorage.getItem(cachedVersionKey)),
    }
  }

  if (fileValue && typeof fileValue === 'object' && !Array.isArray(fileValue)) {
    return { comments: fileValue, version: 0 }
  }

  return { comments: {}, version: 0 }
}

const parseHashRoute = () => {
  const value = location.hash.replace(/^#\/?/, '')
  if (!value) return { page: 'home', param: '' }
  const [page, ...rest] = value.split('/')
  return { page, param: rest.join('/') }
}

const applyTheme = () => {
  document.documentElement.dataset.theme = 'light'
  localStorage.removeItem(STORAGE_KEYS.theme)
}

const getComments = (targetId) => state.comments[targetId] || []

const getCommentThreadCount = (targetId) => {
  const comments = getComments(targetId)
  return comments.reduce((total, comment) => total + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0), 0)
}

const findCommentEntityById = (commentId) => {
  for (const [targetId, list] of Object.entries(state.comments || {})) {
    for (const comment of list || []) {
      if (comment.id === commentId) {
        return { targetId, entity: comment, kind: 'comment' }
      }
      for (const reply of comment.replies || []) {
        if (reply.id === commentId) {
          return { targetId, entity: reply, kind: 'reply' }
        }
      }
    }
  }
  return null
}

const getAdminToken = () => localStorage.getItem(STORAGE_KEYS.adminToken) || ''

const getAdminRequestHeaders = () => {
  const token = getAdminToken().trim()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const isAdmin = () => {
  const adminFlag = localStorage.getItem(STORAGE_KEYS.admin) === 'true'
  return adminFlag && isCurrentProtectedAdmin() && Boolean(getAdminToken().trim())
}

const saveAdminCommentsSnapshot = () => {
  if (!USE_REMOTE_DB || !isAdmin()) return Promise.resolve()
  return apiRequest('/api/admin/comments-map', {
    method: 'PUT',
    headers: getAdminRequestHeaders(),
    body: JSON.stringify({ comments: state.comments, version: state.commentsVersion }),
  }).then((result) => {
    if (result && typeof result.version !== 'undefined') {
      state.commentsVersion = parseCommentsVersion(result.version)
      localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
    }
    writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
    return result
  })
}

const adminDeleteCommentEntry = (commentId) => {
  if (!USE_REMOTE_DB || !isAdmin()) return Promise.resolve()
  return apiRequest(`/api/admin/comment/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: getAdminRequestHeaders(),
  })
}

const adminUpdateCommunityPost = (id, payload) => {
  if (!USE_REMOTE_DB || !isAdmin()) return Promise.resolve(null)
  return apiRequest(`/api/admin/community/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getAdminRequestHeaders(),
    body: JSON.stringify(payload),
  })
}

const adminDeleteCommunityPost = (id) => {
  if (!USE_REMOTE_DB || !isAdmin()) return Promise.resolve(null)
  return apiRequest(`/api/admin/community/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAdminRequestHeaders(),
  })
}

const getPersistFailureMessage = (error, fallbackMessage) => {
  const message = String(error?.message || '')
  if (message.includes('413') || /too large/i.test(message)) {
    return 'Image is still too large after optimization. Try fewer photos or lower-resolution files.'
  }
  return fallbackMessage
}

const setCommentsSnapshot = ({ comments, version }) => {
  state.comments = comments && typeof comments === 'object' && !Array.isArray(comments) ? comments : {}
  state.commentsVersion = parseCommentsVersion(version)
  writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
  localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
}

const reloadCommentsFromServer = async () => {
  if (!USE_REMOTE_DB) return null
  const response = await apiRequest('/api/state/comments-map')
  const snapshot = isWrappedCommentsResponse(response)
    ? {
        comments: response.comments,
        version: response.version,
      }
    : { comments: response, version: parseCommentsVersion(localStorage.getItem(STORAGE_KEYS.commentsVersion)) }
  setCommentsSnapshot(snapshot)
  return snapshot
}

const saveComments = () => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return Promise.resolve()
  }
  if (!USE_REMOTE_DB) {
    localStorage.setItem(STORAGE_KEYS.comments, JSON.stringify(state.comments))
    return Promise.resolve()
  }
  return apiRequest('/api/state/comments-map', {
    method: 'PUT',
    body: JSON.stringify({ comments: state.comments, version: state.commentsVersion }),
  }).then((result) => {
    if (result && typeof result.version !== 'undefined') {
      state.commentsVersion = parseCommentsVersion(result.version)
      localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
    }
    writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
  }).catch((error) => {
    if (String(error?.message || '').includes('API error: 409')) {
      return reloadCommentsFromServer().then(() => {
        alert('Comments were updated elsewhere. The latest version has been reloaded. Please try again.')
      })
    }
    console.error('Failed to save comments to DB:', error)
    alert(getPersistFailureMessage(error, 'Failed to save comments to DB. Please check API/DB status.'))
  })
}

const saveCommentLike = (commentId, likes) => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return Promise.resolve()
  }
  if (!USE_REMOTE_DB) {
    localStorage.setItem(STORAGE_KEYS.comments, JSON.stringify(state.comments))
    return Promise.resolve()
  }

  return apiRequest('/api/state/comment-like', {
    method: 'PATCH',
    body: JSON.stringify({ commentId, likes }),
  }).then((result) => {
    if (result && typeof result.version !== 'undefined') {
      state.commentsVersion = parseCommentsVersion(result.version)
      localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
    }
    writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
  }).catch((error) => {
    console.error('Failed to save comment like to DB:', error)
    alert('Failed to save like to DB. Please check API/DB status.')
  })
}

const canUseNotificationApi = () => typeof window !== 'undefined' && 'Notification' in window

const isNotificationOptedIn = () => localStorage.getItem(STORAGE_KEYS.notificationOptIn) === 'true'

const requestNotificationPermissionSafe = async () => {
  if (!canUseNotificationApi()) return 'denied'
  try {
    const result = Notification.requestPermission()
    return await Promise.resolve(result)
  } catch {
    return 'denied'
  }
}

const notifyUser = async (title, options = {}) => {
  if (!canUseNotificationApi()) return
  if (Notification.permission !== 'granted') return

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration(`${BASE_URL}`)
      if (registration) {
        await registration.showNotification(title, {
          icon: `${BASE_URL}images/profile.jpg`,
          badge: `${BASE_URL}images/profile.jpg`,
          ...options,
        })
        return
      }
    }
  } catch {
    // Fallback to Notification constructor below.
  }

  new Notification(title, options)
}

const getSeenMentionIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.notificationMentionSeenIds) || '[]')
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : []
  } catch {
    return []
  }
}

const setSeenMentionIds = (ids) => {
  const trimmed = [...new Set(ids.map((v) => String(v)).filter(Boolean))].slice(-500)
  localStorage.setItem(STORAGE_KEYS.notificationMentionSeenIds, JSON.stringify(trimmed))
}

const maybeNotifyNewsUpdates = async () => {
  const latest = [...state.news]
    .map((item) => ({ slug: item.slug, title: item.title, publishedAt: Number(new Date(item.publishedAt) || 0) }))
    .filter((item) => item.publishedAt > 0)
    .sort((a, b) => a.publishedAt - b.publishedAt)

  if (!latest.length) return

  const stored = Number(localStorage.getItem(STORAGE_KEYS.notificationNewsSeenAt) || 0)
  if (!stored) {
    localStorage.setItem(STORAGE_KEYS.notificationNewsSeenAt, String(latest[latest.length - 1].publishedAt))
    return
  }

  const newsToNotify = latest.filter((item) => item.publishedAt > stored)
  if (!newsToNotify.length) return

  for (const item of newsToNotify.slice(-3)) {
    await notifyUser('New article published', {
      body: item.title,
      data: { url: `${location.origin}${location.pathname}#/news/${item.slug}` },
    })
  }

  localStorage.setItem(STORAGE_KEYS.notificationNewsSeenAt, String(newsToNotify[newsToNotify.length - 1].publishedAt))
}

const maybeNotifyMentions = async () => {
  const myNickname = getNickname().trim().toLowerCase()
  if (!myNickname) return

  const seenIds = new Set(getSeenMentionIds())
  const allMentionIds = new Set(seenIds)
  const freshMentions = []

  for (const [targetId, comments] of Object.entries(state.comments || {})) {
    for (const comment of comments || []) {
      const sourceId = String(comment.id || '')
      const mentions = extractMentionNicknames(comment.content || '')
      if (sourceId) allMentionIds.add(sourceId)
      if (sourceId && !seenIds.has(sourceId) && mentions.includes(myNickname) && !isSameNickname(comment.nickname, myNickname)) {
        freshMentions.push({ sourceId, targetId, author: comment.nickname || 'Someone', content: comment.content || '' })
      }

      for (const reply of comment.replies || []) {
        const replyId = String(reply.id || '')
        const replyMentions = extractMentionNicknames(reply.content || '')
        if (replyId) allMentionIds.add(replyId)
        if (replyId && !seenIds.has(replyId) && replyMentions.includes(myNickname) && !isSameNickname(reply.nickname, myNickname)) {
          freshMentions.push({ sourceId: replyId, targetId, author: reply.nickname || 'Someone', content: reply.content || '' })
        }
      }
    }
  }

  if (freshMentions.length) {
    for (const mention of freshMentions.slice(-3)) {
      await notifyUser('Activity update', {
        body: `${mention.author}: ${String(mention.content).slice(0, 80)}`,
        data: { url: `${location.origin}${location.pathname}#/${mention.targetId.startsWith('news:') ? 'news/' + mention.targetId.replace('news:', '') : 'community/' + mention.targetId.replace('community:', '')}` },
      })
    }
  }

  setSeenMentionIds([...allMentionIds])
}

const maybeRunNotificationChecks = async () => {
  if (!canUseNotificationApi()) return
  if (!isNotificationOptedIn()) return
  if (Notification.permission !== 'granted') return
  await maybeNotifyNewsUpdates()
  await maybeNotifyMentions()
}

const initNotificationConsent = async ({ justLoggedIn = false } = {}) => {
  if (!canUseNotificationApi()) return
  if (!justLoggedIn) return
  if (!getNickname()) return
  if (isNotificationOptedIn()) return
  state.notificationConsentModalOpen = true
}

const saveCommunity = () => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return
  }
  if (!USE_REMOTE_DB) {
    localStorage.setItem(STORAGE_KEYS.community, JSON.stringify(state.community))
    return
  }
  apiRequest('/api/state/community', {
    method: 'PUT',
    body: JSON.stringify({ community: state.community }),
  }).then(() => {
    writeCachedJson(STORAGE_KEYS.cachedCommunity, state.community)
  }).catch((error) => {
    console.error('Failed to save community to DB:', error)
    alert(getPersistFailureMessage(error, 'Failed to save community to DB. Please check API/DB status.'))
  })
}

const savePen = () => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return
  }
  if (!USE_REMOTE_DB) return

  apiRequest('/api/state/pen', {
    method: 'PUT',
    headers: getAdminRequestHeaders(),
    body: JSON.stringify({ pen: state.pens }),
  }).then(() => {
    writeCachedJson(STORAGE_KEYS.cachedPens, state.pens)
  }).catch((error) => {
    console.error('Failed to save collection to DB:', error)
    alert(getPersistFailureMessage(error, 'Failed to save collection to DB. Please check API/DB status.'))
  })
}

const saveNews = () => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return
  }
  if (!USE_REMOTE_DB) return

  apiRequest('/api/state/news', {
    method: 'PUT',
    headers: getAdminRequestHeaders(),
    body: JSON.stringify({ news: state.news }),
  }).then(() => {
    writeCachedJson(STORAGE_KEYS.cachedNews, state.news)
  }).catch((error) => {
    console.error('Failed to save news to DB:', error)
    alert(getPersistFailureMessage(error, 'Failed to save news to DB. Please check API/DB status.'))
  })
}

const saveSite = () => {
  if (isBlockedLocalMode()) {
    warnRemoteDbRequired()
    return
  }
  if (!USE_REMOTE_DB) return

  apiRequest('/api/state/site', {
    method: 'PUT',
    headers: getAdminRequestHeaders(),
    body: JSON.stringify({ site: state.site || {} }),
  }).then(() => {
    writeCachedJson(STORAGE_KEYS.cachedSite, state.site || {})
  }).catch((error) => {
    console.error('Failed to save site config to DB:', error)
    alert(getPersistFailureMessage(error, 'Failed to save site config to DB. Please check API/DB status.'))
  })
}

const getSortedCommunity = (sort) => {
  const arr = [...state.community]
  if (sort === 'popular') return arr.sort((a, b) => b.likes - a.likes)
  if (sort === 'comments') {
    return arr.sort((a, b) => getCommentThreadCount(`community:${b.id}`) - getCommentThreadCount(`community:${a.id}`))
  }
  return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

const getCommentSort = (targetId) => state.commentSorts[targetId] || 'latest'

const getSortedComments = (targetId) => {
  const arr = [...getComments(targetId)]
  const sort = getCommentSort(targetId)

  if (sort === 'oldest') {
    return arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  }

  if (sort === 'likes') {
    return arr.sort((a, b) => {
      const likeGap = Number(b.likes || 0) - Number(a.likes || 0)
      if (likeGap !== 0) return likeGap
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  }

  return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

const getCommentActionKey = (type, id) => `${type}:${id}`

const isCommentActionBusy = (key) => Boolean(state.commentActionBusy?.[key])

const setCommentActionBusy = (key, busy) => {
  state.commentActionBusy ||= {}
  if (busy) {
    state.commentActionBusy[key] = true
    return
  }
  delete state.commentActionBusy[key]
}

const renderBusyLabel = (label, busy) => {
  if (!busy) return escapeHtml(label)
  return `<span class="action-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`
}

const renderBusyIconButton = (label, busy, extraClass = '') => {
  const classes = `text-btn${extraClass ? ` ${extraClass}` : ''}${busy ? ' is-busy' : ''}`
  return busy
    ? `<button type="button" class="${classes}" disabled aria-busy="true"><span class="action-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`
    : `<button type="button" class="${classes}">${escapeHtml(label)}</button>`
}

const renderCommentList = (targetId) => {
  const comments = getSortedComments(targetId)
  if (!comments.length) return '<p class="muted">Be the first to leave a comment.</p>'

  return `<ul class="comment-list">${comments
    .map(
      (comment) => {
        const commentLikeBusy = isCommentActionBusy(getCommentActionKey('like', comment.id))
        const commentDeleteBusy = isCommentActionBusy(getCommentActionKey('delete', comment.id))
        const replyPostBusy = isCommentActionBusy(getCommentActionKey('reply', comment.id))
        return `<li class="comment-item">
          <div class="comment-head">
            <div class="comment-head-main">
              ${renderUserAvatar(comment.nickname, 'sm', comment.profileImage || getProfileImageByNickname(comment.nickname))}
              <div class="comment-meta"><strong>${escapeHtml(comment.nickname)}</strong><span>${formatDate(comment.createdAt)}</span></div>
            </div>
            <button data-like-comment="${comment.id}" type="button" class="text-btn comment-like-btn${commentLikeBusy ? ' is-busy' : ''}" aria-label="Like comment" ${commentLikeBusy ? 'disabled aria-busy="true"' : ''}>
              ${commentLikeBusy ? '<span class="action-spinner" aria-hidden="true"></span>' : `<span class="comment-like-icon ${hasLiked('comments', comment.id) ? 'liked' : ''}" aria-hidden="true">${
                hasLiked('comments', comment.id) ? '&#9829;' : '&#9825;'
              }</span>`}
            </button>
          </div>
          <p class="comment-text">${renderMentionedText(comment.content)}</p>
          ${parseImageValues(comment.image)
            .map(
              (image, index) =>
                `<img src="${escapeHtml(image)}" alt="Attached image ${index + 1}" class="comment-image" loading="lazy" />`,
            )
            .join('')}
          <div class="comment-actions">
            <span class="comment-like-count">Likes ${comment.likes}</span>
            <button data-reply-comment="${comment.id}" data-target-id="${targetId}" type="button" class="text-btn${replyPostBusy ? ' is-busy' : ''}" ${replyPostBusy ? 'disabled aria-busy="true"' : ''}>${renderBusyLabel('Reply', replyPostBusy)}</button>
            ${
              canManageOwnedContent(comment.nickname)
                ? `<button data-delete-comment="${comment.id}" data-target-id="${targetId}" type="button" class="text-btn danger${commentDeleteBusy ? ' is-busy' : ''}" ${commentDeleteBusy ? 'disabled aria-busy="true"' : ''}>${commentDeleteBusy ? '<span class="action-spinner" aria-hidden="true"></span><span>Delete</span>' : 'Delete'}</button>`
                : ''
            }
          </div>
          <form class="comment-form reply-form" data-reply-form="${targetId}:${comment.id}">
            <label>
              Write a reply
              <textarea name="reply" rows="2" required placeholder="Use @nickname to mention someone"></textarea>
            </label>
            <button type="submit" class="btn ghost${replyPostBusy ? ' is-busy' : ''}" ${replyPostBusy ? 'disabled aria-busy="true"' : ''}>${renderBusyLabel('Post reply', replyPostBusy)}</button>
          </form>
          ${
            comment.replies?.length
              ? `<button type="button" class="text-btn reply-expand" data-toggle-replies="${targetId}:${comment.id}" data-reply-count="${comment.replies.length}">${getReplyToggleLabel(comment.replies.length, false)}</button>
              <ul class="reply-list" data-replies-list="${targetId}:${comment.id}" hidden>${comment.replies
                  .map(
                    (reply) => {
                      const replyLikeBusy = isCommentActionBusy(getCommentActionKey('like', reply.id))
                      const replyDeleteBusy = isCommentActionBusy(getCommentActionKey('reply-delete', reply.id))
                      return `<li>
                      <div class="comment-head"><div class="comment-head-main">${renderUserAvatar(reply.nickname, 'xs', reply.profileImage || getProfileImageByNickname(reply.nickname))}<div class="comment-meta"><strong>${escapeHtml(reply.nickname)}</strong><span>${formatDate(reply.createdAt)}</span></div></div><button data-like-comment="${reply.id}" type="button" class="text-btn comment-like-btn${replyLikeBusy ? ' is-busy' : ''}" aria-label="Like reply" ${replyLikeBusy ? 'disabled aria-busy="true"' : ''}>${replyLikeBusy ? '<span class="action-spinner" aria-hidden="true"></span>' : `<span class="comment-like-icon ${hasLiked('comments', reply.id) ? 'liked' : ''}" aria-hidden="true">${
                        hasLiked('comments', reply.id) ? '&#9829;' : '&#9825;'
                      }</span>`}</button></div>
                      <p class="comment-text">${renderMentionedText(reply.content)}</p>
                      ${
                        canManageOwnedContent(reply.nickname)
                          ? `<div class="comment-actions"><span class="comment-like-count">Likes ${Number(reply.likes || 0)}</span><button data-delete-reply="${reply.id}" data-parent-comment-id="${comment.id}" data-target-id="${targetId}" type="button" class="text-btn danger${replyDeleteBusy ? ' is-busy' : ''}" ${replyDeleteBusy ? 'disabled aria-busy="true"' : ''}>${replyDeleteBusy ? '<span class="action-spinner" aria-hidden="true"></span><span>Delete</span>' : 'Delete'}</button></div>`
                          : `<div class="comment-actions"><span class="comment-like-count">Likes ${Number(reply.likes || 0)}</span></div>`
                      }
                    </li>`;
                    },
                  )
                  .join('')}</ul>`
              : ''
          }
        </li>`;
      },
    )
    .join('')}</ul>`
}

const syncCommentLikeUi = (button, liked, likes) => {
  if (!(button instanceof HTMLElement)) return
  const icon = button.querySelector('.comment-like-icon')
  if (icon) {
    icon.classList.toggle('liked', liked)
    icon.innerHTML = liked ? '&#9829;' : '&#9825;'
  }
  const item = button.closest('li')
  const counter = item?.querySelector('.comment-like-count')
  if (counter) {
    counter.textContent = `Likes ${likes}`
  }
}

const renderCommentComposer = (targetId) => `
  <form class="comment-form comment-composer" data-comment-form="${targetId}">
    <div class="comment-composer-head">${renderUserAvatar(getNickname(), 'sm', getCurrentUserAvatar())}<span>${escapeHtml(getNickname() || 'Guest')}</span></div>
    <textarea name="comment" rows="2" required placeholder="Write a comment"></textarea>
    <div class="composer-actions">
      <button type="button" class="btn ghost" data-toggle-image-fields>Add image</button>
          <button type="submit" class="btn${isCommentActionBusy(getCommentActionKey('post', targetId)) ? ' is-busy' : ''}" ${isCommentActionBusy(getCommentActionKey('post', targetId)) ? 'disabled aria-busy="true"' : ''}>${renderBusyLabel('Post', isCommentActionBusy(getCommentActionKey('post', targetId)))}</button>
    </div>
    <div class="image-fields" data-image-fields hidden>
      <label>
        Image URL (optional)
        <input name="imageUrl" type="url" placeholder="https://..." />
      </label>
      <label>
        Image file (optional)
        <input name="imageFile" type="file" accept="image/*" multiple hidden />
        <div class="editor-actions file-picker">
          <button type="button" class="btn ghost" data-pick-file>Choose file</button>
          <span class="muted" data-file-name>No file chosen</span>
        </div>
      </label>
    </div>
  </form>
`

const renderCommunityComposer = () => `
  <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Write community post">
    <div class="compose-sheet">
      <div class="section-head">
        <h3>Write community post</h3>
        <button type="button" class="icon-btn" data-close-compose>Close</button>
      </div>
      <form class="comment-form" data-community-create-form>
        <label>
          Title
          <input name="title" required maxlength="120" />
        </label>
        <label>
          Content
          <textarea name="content" rows="5" required></textarea>
        </label>
        <button type="button" class="btn ghost" data-toggle-image-fields>Add image</button>
        <div class="image-fields" data-image-fields hidden>
          <label>
            Image URL (optional)
            <input name="imageUrl" type="url" placeholder="https://..." />
          </label>
          <label>
            Image file (optional)
            <input name="imageFile" type="file" accept="image/*" multiple hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
        </div>
        <div class="editor-actions">
          <button type="submit" class="btn">Submit</button>
          <button type="button" class="btn ghost" data-close-compose>Cancel</button>
        </div>
      </form>
    </div>
  </div>
`

const askAdminFields = (title, fields) =>
  new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'compose-modal'
    modal.innerHTML = `
      <div class="compose-sheet">
        <div class="section-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="icon-btn" data-close-admin-modal>Close</button>
        </div>
        <form class="comment-form" data-admin-modal-form>
          ${fields
            .map(
              (field) => `<label>
                ${escapeHtml(field.label)}
                ${
                  field.multiline
                    ? `<textarea name="${escapeHtml(field.name)}" rows="${field.rows || 4}" required>${escapeHtml(field.value || '')}</textarea>`
                    : `<input name="${escapeHtml(field.name)}" value="${escapeHtml(field.value || '')}" required />`
                }
              </label>`,
            )
            .join('')}
          <div class="editor-actions">
            <button type="submit" class="btn">Save</button>
            <button type="button" class="btn ghost" data-close-admin-modal>Cancel</button>
          </div>
        </form>
      </div>
    `

    const close = (value = null) => {
      modal.remove()
      resolve(value)
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-admin-modal]')) {
        close(null)
      }
    })

    modal.querySelector('[data-admin-modal-form]').addEventListener('submit', (event) => {
      event.preventDefault()
      const data = Object.fromEntries(new FormData(event.currentTarget).entries())
      close(data)
    })

    document.body.append(modal)
  })

const askAdminImageSource = (title, initialUrl = '') =>
  new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'compose-modal'
    modal.innerHTML = `
      <div class="compose-sheet">
        <div class="section-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="icon-btn" data-close-admin-image-modal>Close</button>
        </div>
        <form class="comment-form" data-admin-image-form>
          <label>
            Image URL (optional)
            <input name="imageUrl" type="url" value="${escapeHtml(initialUrl)}" placeholder="https://..." />
          </label>
          <label>
            Image file (optional)
            <input name="imageFile" type="file" accept="image/*" hidden />
            <div class="editor-actions">
              <button type="button" class="btn ghost" data-pick-admin-file>Choose file</button>
              <span class="muted" data-admin-file-name>No file chosen</span>
            </div>
          </label>
          <div class="editor-actions">
            <button type="submit" class="btn">Save</button>
            <button type="button" class="btn ghost" data-close-admin-image-modal>Cancel</button>
          </div>
        </form>
      </div>
    `

    const close = (value = null) => {
      modal.remove()
      resolve(value)
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-admin-image-modal]')) {
        close(null)
      }
    })

    const fileInput = modal.querySelector('input[name="imageFile"]')
    const fileName = modal.querySelector('[data-admin-file-name]')
    const picker = modal.querySelector('[data-pick-admin-file]')
    const adminImageForm = modal.querySelector('[data-admin-image-form]')

    picker.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      fileName.textContent = getSelectedFileLabel(fileInput)
      syncImagePreviewForForm(adminImageForm)
    })
    adminImageForm.imageUrl.addEventListener('input', () => {
      syncImagePreviewForForm(adminImageForm)
    })

    adminImageForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const image = await resolveImageInput(form.imageUrl.value, form.imageFile)
      if (!image) return
      close(image)
    })

    document.body.append(modal)
    syncImagePreviewForForm(adminImageForm)
  })

const askAdminImagesSource = (title, initialValue = '') =>
  new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'compose-modal'
    modal.innerHTML = `
      <div class="compose-sheet">
        <div class="section-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="icon-btn" data-close-admin-images-modal>Close</button>
        </div>
        <form class="comment-form" data-admin-images-form>
          <label>
            Cover image URLs (optional, one per line)
            <textarea name="images" rows="5" placeholder="https://...">${escapeHtml(initialValue)}</textarea>
          </label>
          <div>
            <p class="muted">Current cover images (select and delete specific items)</p>
            <ul class="admin-photo-list" data-admin-current-images-list></ul>
            <div class="editor-actions">
              <button type="button" class="btn ghost" data-admin-select-all-images>Select all</button>
              <button type="button" class="btn ghost" data-admin-delete-selected-images>Delete selected</button>
            </div>
          </div>
          <label>
            Cover image files (optional)
            <input name="imageFile" type="file" accept="image/*" multiple hidden />
            <div class="editor-actions">
              <button type="button" class="btn ghost" data-pick-admin-images-file>Choose files</button>
              <span class="muted" data-admin-images-file-name>No file chosen</span>
            </div>
          </label>
          <div class="editor-actions">
            <button type="submit" class="btn">Save</button>
            <button type="button" class="btn ghost" data-close-admin-images-modal>Cancel</button>
          </div>
        </form>
      </div>
    `

    const close = (value = null) => {
      modal.remove()
      resolve(value)
    }

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-admin-images-modal]')) {
        close(null)
      }
    })

    const fileInput = modal.querySelector('input[name="imageFile"]')
    const fileName = modal.querySelector('[data-admin-images-file-name]')
    const picker = modal.querySelector('[data-pick-admin-images-file]')
    const form = modal.querySelector('[data-admin-images-form]')
    const currentList = modal.querySelector('[data-admin-current-images-list]')
    const selectAllButton = modal.querySelector('[data-admin-select-all-images]')
    const deleteSelectedButton = modal.querySelector('[data-admin-delete-selected-images]')
    const selectedIndexes = new Set()

    const getCurrentImages = () => parseImageValues(form.images.value)

    const getImageLabel = (value, index) => {
      if (value.startsWith('data:image/')) {
        return `Image ${index + 1} (data URL)`
      }
      return `Image ${index + 1}: ${value}`
    }

    const renderCurrentImageList = () => {
      const images = getCurrentImages()
      for (const idx of [...selectedIndexes]) {
        if (idx >= images.length) selectedIndexes.delete(idx)
      }

      if (!images.length) {
        currentList.innerHTML = '<li><p class="muted">No cover images currently listed.</p></li>'
        selectAllButton.disabled = true
        deleteSelectedButton.disabled = true
        return
      }

      currentList.innerHTML = images
        .map(
          (image, idx) => `<li>
            <label class="admin-image-select-row"><input type="checkbox" data-admin-image-select="${idx}" ${selectedIndexes.has(idx) ? 'checked' : ''} /> Select image ${idx + 1}</label>
            <img src="${escapeHtml(image)}" alt="Selected cover image ${idx + 1}" loading="lazy" />
            <p class="muted admin-image-source">${escapeHtml(getImageLabel(image, idx))}</p>
            <div class="admin-inline-actions">
              <button type="button" class="text-btn" data-admin-move-current-image="${idx}:up">Move up</button>
              <button type="button" class="text-btn" data-admin-move-current-image="${idx}:down">Move down</button>
            </div>
          </li>`,
        )
        .join('')

      selectAllButton.disabled = false
      deleteSelectedButton.disabled = selectedIndexes.size === 0
      selectAllButton.textContent = selectedIndexes.size === images.length ? 'Clear selection' : 'Select all'
    }

    picker.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      fileName.textContent = getSelectedFileLabel(fileInput)
      syncImagePreviewForForm(form)
    })
    form.images.addEventListener('input', () => {
      selectedIndexes.clear()
      renderCurrentImageList()
      syncImagePreviewForForm(form)
    })

    currentList.addEventListener('change', (event) => {
      const input = event.target.closest('input[data-admin-image-select]')
      if (!input) return
      const idx = Number(input.dataset.adminImageSelect)
      if (!Number.isInteger(idx) || idx < 0) return
      if (input.checked) selectedIndexes.add(idx)
      else selectedIndexes.delete(idx)
      renderCurrentImageList()
    })

    currentList.addEventListener('click', (event) => {
      const moveButton = event.target.closest('[data-admin-move-current-image]')
      if (!moveButton) return
      const [idxRaw, direction] = moveButton.dataset.adminMoveCurrentImage.split(':')
      const idx = Number(idxRaw)
      if (!Number.isInteger(idx) || idx < 0) return
      const images = getCurrentImages()
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (!moveArrayItem(images, idx, targetIdx)) return
      form.images.value = images.join('\n')
      selectedIndexes.clear()
      renderCurrentImageList()
      syncImagePreviewForForm(form)
    })

    selectAllButton.addEventListener('click', () => {
      const images = getCurrentImages()
      if (!images.length) return
      if (selectedIndexes.size === images.length) {
        selectedIndexes.clear()
      } else {
        selectedIndexes.clear()
        for (let idx = 0; idx < images.length; idx += 1) {
          selectedIndexes.add(idx)
        }
      }
      renderCurrentImageList()
    })

    deleteSelectedButton.addEventListener('click', () => {
      const images = getCurrentImages()
      if (!images.length || !selectedIndexes.size) return
      const next = images.filter((_image, idx) => !selectedIndexes.has(idx))
      form.images.value = next.join('\n')
      selectedIndexes.clear()
      renderCurrentImageList()
      syncImagePreviewForForm(form)
    })

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const values = await resolveImageInputs(form.images.value, form.imageFile)
      if (!values.length) return
      close(values)
    })

    document.body.append(modal)
    renderCurrentImageList()
    syncImagePreviewForForm(form)
  })

const renderImageCarousel = ({ id, images = [], alt = 'Image' }) => {
  const validImages = images.filter(Boolean)
  if (!validImages.length) {
    return `<div class="carousel"><img src="" alt="${escapeHtml(alt)}" class="carousel-image" loading="lazy" /></div>`
  }

  const hasMultiple = validImages.length > 1

  return `
  <div class="carousel" data-carousel-id="${id}" data-carousel-images="${escapeHtml(validImages.join('\n'))}">
    ${
      hasMultiple
        ? `<button type="button" aria-label="Previous image" class="carousel-nav prev" data-carousel-prev="${id}">‹</button>`
        : ''
    }
    <img src="${escapeHtml(validImages[0])}" alt="${escapeHtml(alt)}" class="carousel-image" loading="lazy" data-carousel-image="${id}" />
    ${
      hasMultiple
        ? `<button type="button" aria-label="Next image" class="carousel-nav next" data-carousel-next="${id}">›</button>`
        : ''
    }
    ${
      hasMultiple
        ? `<div class="dots">${validImages
            .map(
              (_, idx) =>
                `<button type="button" class="dot ${idx === 0 ? 'active' : ''}" data-carousel-dot="${id}:${idx}" aria-label="Image ${idx + 1}"></button>`,
            )
            .join('')}</div>`
        : ''
    }
  </div>`
}

const renderPenCarousel = (pen) =>
  renderImageCarousel({
    id: pen.id,
    images: pen.images,
    alt: pen.name,
  })

const renderNewsThumbnailCarousel = (post, prefix = 'news-thumb') =>
  renderImageCarousel({
    id: `${prefix}-${post.slug}`,
    images: parseImageValues(post.coverImage),
    alt: post.title,
  })

const renderHashtagLine = (tags = []) =>
  (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => `#${escapeHtml(tag.replace(/^#/, ''))}`)
    .join(' ')

const sortByReleaseThenCreatedAtDesc = (a, b) => {
  const releaseGap = getReleaseSortKey(b) - getReleaseSortKey(a)
  if (releaseGap !== 0) return releaseGap
  return new Date(b.createdAt) - new Date(a.createdAt)
}

const renderHome = () => {
  const latestPens = [...state.pens].sort(sortByReleaseThenCreatedAtDesc).slice(0, 4)
  const newestCollectionPen = [...state.pens].sort(sortByReleaseThenCreatedAtDesc)[0]
  const heroImage = PROFILE_AVATAR_URL
  const latestNews = [...state.news].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 4)
  const hotCommunity = [...state.community].sort((a, b) => b.likes - a.likes).slice(0, 3)
  const communityEnabled = isCommunityEnabled()

  const fillQuadSlots = (items) => {
    if (items.length >= 4) return items
    const placeholders = Array.from({ length: 4 - items.length }, (_, idx) => ({ __placeholder: true, __key: `placeholder-${idx}` }))
    return [...items, ...placeholders]
  }

  const latestPensQuad = fillQuadSlots(latestPens)
  const latestNewsQuad = fillQuadSlots(latestNews)

  return `
  <section class="hero-shell reveal">
    <section class="hero hero-feature home-profile-hero" ${heroImage ? `style="--hero-image: url('${escapeHtml(heroImage)}')"` : ''}>
      <div class="hero-content">
        <p class="eyebrow">Premium Archive</p>
        <h1>i_luv_pen</h1>
        <div class="hero-actions">
          <a class="btn home-white-btn" href="#/collection">View Collection</a>
          <a class="btn home-white-btn" href="#/news">Latest News</a>
          ${communityEnabled ? '<a class="btn home-white-btn" href="#/community">Community</a>' : ''}
        </div>
      </div>
    </section>
  </section>

  <section class="section reveal">
    <div class="section-head"><h2>Latest Collection</h2><a href="#/collection">View all</a></div>
    <div class="grid home-quad-grid">${latestPensQuad
      .map((pen) => {
        if (pen.__placeholder) {
          return `<article class="card pen-card home-placeholder"><div class="card-body"><h3>Coming Soon</h3><p class="meta">Collection update in progress</p></div></article>`
        }
        return `<article class="card pen-card" data-open-pen="${pen.id}">
          ${renderPenCarousel(pen)}
          <div class="card-body">
            <h3>${escapeHtml(pen.name)}</h3>
            <p class="meta">${escapeHtml(pen.series)} · ${formatReleaseLabel(pen)}</p>
            ${formatPenPrice(pen.price) ? `<p class="muted purchase-price-line">Purchase Price ${escapeHtml(formatPenPrice(pen.price))}</p>` : ''}
          </div>
        </article>`
      })
      .join('')}</div>
  </section>

  <section class="section reveal">
    <div class="section-head">
      <h2>Latest News</h2>
      <div class="home-news-actions">
        <a class="btn home-white-btn" href="#/news">News</a>
        ${communityEnabled ? '<a class="btn home-white-btn" href="#/community">Community</a>' : ''}
      </div>
    </div>
    <div class="grid home-quad-grid">${latestNewsQuad
      .map((post) => {
        if (post.__placeholder) {
          return `<article class="card news-card home-placeholder"><div class="card-body"><h3>Coming Soon</h3><p class="meta">News update in progress</p></div></article>`
        }
        return `<article class="card news-card" data-open-news="${post.slug}">
          ${renderNewsThumbnailCarousel(post, 'home-news')}
          <div class="card-body">
            <p class="meta">${formatDate(post.publishedAt)}</p>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.subtitle)}</p>
            <a class="text-link" href="#/news/${post.slug}">Read</a>
          </div>
        </article>`
      })
      .join('')}</div>
  </section>

  ${
    communityEnabled
      ? `<section class="section reveal">
    <div class="section-head"><h2>Community Highlights</h2><a href="#/community">Community</a></div>
    <div class="list">${hotCommunity
      .map(
        (post) => `<a class="list-item" href="#/community/${post.id}">
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.content.slice(0, 130))}...</p>
          <p class="meta">${escapeHtml(post.nickname)} · Likes ${post.likes} · Comments ${getCommentThreadCount(`community:${post.id}`)}</p>
        </a>`,
      )
      .join('')}</div>
  </section>`
      : ''
  }
  `
}

const renderCollection = (params) => {
  const search = (params.get('q') || '').toLowerCase()
  const sort = params.get('sort') || 'latest'

  let filtered = [...state.pens].filter((pen) => {
    if (!search) return true
    const target = [pen.name, pen.series, String(pen.year), String(pen.releaseMonth || ''), pen.price || '', ...(pen.keywords || [])]
      .join(' ')
      .toLowerCase()
    return target.includes(search)
  })

  if (sort === 'latest') {
    filtered.sort((a, b) => {
      const byRelease = getReleaseSortKey(b) - getReleaseSortKey(a)
      if (byRelease !== 0) return byRelease
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  }
  if (sort === 'oldest') {
    filtered.sort((a, b) => {
      const byRelease = getReleaseSortKey(a) - getReleaseSortKey(b)
      if (byRelease !== 0) return byRelease
      return new Date(a.createdAt) - new Date(b.createdAt)
    })
  }
  if (sort === 'price-high') {
    filtered.sort((a, b) => {
      return (parsePenPriceNumber(b.price) || 0) - (parsePenPriceNumber(a.price) || 0)
    })
  }
  if (sort === 'price-low') {
    filtered.sort((a, b) => {
      return (parsePenPriceNumber(a.price) || 0) - (parsePenPriceNumber(b.price) || 0)
    })
  }

  return `
  <section class="section reveal">
    <div class="section-head">
      <h2>Collection of i_luv_pen</h2>
      <p class="muted">Total ${filtered.length}</p>
    </div>
    <form class="filter-bar" data-collection-filter>
      <label>
        Search
        <input type="search" name="q" value="${escapeHtml(search)}" placeholder="Name, series, year, price, keyword" />
      </label>
      <label>
        Sort
        <select name="sort">
          <option value="latest" ${sort === 'latest' ? 'selected' : ''}>Newest</option>
          <option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Oldest</option>
          <option value="price-high" ${sort === 'price-high' ? 'selected' : ''}>Price High to Low</option>
          <option value="price-low" ${sort === 'price-low' ? 'selected' : ''}>Price Low to High</option>
        </select>
      </label>
    </form>
    <div class="grid home-quad-grid">${filtered
      .map(
        (pen) => `<article class="card pen-card" data-open-pen="${pen.id}">
          ${renderPenCarousel(pen)}
          <div class="card-body">
            <h3>${escapeHtml(pen.name)}</h3>
            <p class="meta">${escapeHtml(pen.series)} · ${formatReleaseLabel(pen)}</p>
            ${formatPenPrice(pen.price) ? `<p class="muted purchase-price-line">Purchase Price ${escapeHtml(formatPenPrice(pen.price))}</p>` : ''}
            ${
              isAdmin()
                ? `<div class="admin-inline-actions"><button type="button" class="text-btn" data-admin-edit-pen-title-inline="${pen.id}">Edit title</button><button type="button" class="text-btn" data-admin-edit-pen-text-inline="${pen.id}">Edit text</button><button type="button" class="text-btn" data-admin-edit-pen-release-inline="${pen.id}">Edit release</button><button type="button" class="text-btn" data-admin-edit-pen-keywords-inline="${pen.id}">Edit keywords</button><button type="button" class="text-btn" data-admin-edit-pen-price-inline="${pen.id}">Edit price</button><button type="button" class="text-btn danger" data-admin-delete-pen-inline="${pen.id}">Delete</button></div>`
                : ''
            }
          </div>
        </article>`,
      )
      .join('')}</div>
  </section>`
}

const renderPenDetail = (id) => {
  const pen = state.pens.find((item) => item.id === id)
  if (!pen) return '<section class="section"><h2>Pen not found.</h2></section>'

  const related = state.pens.filter((item) => item.id !== pen.id && item.series === pen.series).slice(0, 3)

  return `
    <section class="section reveal">
      <a href="#/collection" class="text-link">← Back to Collection</a>
      <div class="detail-layout">
        <div>
          ${renderPenCarousel(pen)}
          <button type="button" class="btn ghost" data-open-lightbox="${pen.id}">Open fullscreen</button>
        </div>
        <article class="detail-panel">
          <h2>${escapeHtml(pen.name)}</h2>
          <p class="meta">${escapeHtml(pen.series)} · ${formatReleaseLabel(pen)}</p>
          ${formatPenPrice(pen.price) ? `<p class="eyebrow purchase-price-line">Purchase Price ${escapeHtml(formatPenPrice(pen.price))}</p>` : ''}
          <p class="muted">${escapeHtml(pen.description || '')}</p>
          ${pen.descriptionLong ? `<p>${escapeHtml(pen.descriptionLong)}</p>` : ''}
          <ul class="tag-list">${(pen.keywords || []).map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>
          ${
            isAdmin()
              ? `<div class="admin-inline-actions"><button type="button" class="text-btn" data-admin-edit-pen-title-inline="${pen.id}">Edit title</button><button type="button" class="text-btn" data-admin-edit-pen-text-inline="${pen.id}">Edit text</button><button type="button" class="text-btn" data-admin-edit-pen-release-inline="${pen.id}">Edit release</button><button type="button" class="text-btn" data-admin-edit-pen-keywords-inline="${pen.id}">Edit keywords</button><button type="button" class="text-btn" data-admin-edit-pen-price-inline="${pen.id}">Edit price</button><button type="button" class="text-btn" data-admin-add-pen-image="${pen.id}">Add photo</button><button type="button" class="text-btn danger" data-admin-delete-pen-inline="${pen.id}">Delete pen</button></div>
          <ul class="admin-photo-list">${pen.images
            .map(
              (img, idx) => `<li><img src="${escapeHtml(img)}" alt="Managed image ${idx + 1}" loading="lazy" /><div class="admin-inline-actions"><button type="button" class="text-btn" data-admin-move-pen-image="${pen.id}:${idx}:up">Move up</button><button type="button" class="text-btn" data-admin-move-pen-image="${pen.id}:${idx}:down">Move down</button><button type="button" class="text-btn danger" data-admin-delete-pen-image="${pen.id}:${idx}">Delete photo</button></div></li>`,
            )
            .join('')}</ul>`
              : ''
          }
        </article>
      </div>
    </section>
    <section class="section reveal">
      <h2>Related Pens</h2>
      <div class="grid cards-3">${related
        .map(
          (item) => `<article class="card" data-open-pen="${item.id}">
            <img src="${item.images[0]}" alt="${escapeHtml(item.name)}" loading="lazy" />
            <div class="card-body"><h3>${escapeHtml(item.name)}</h3><p class="meta">${item.year}</p></div>
          </article>`,
        )
        .join('')}</div>
    </section>
  `
}

const renderNewsList = () => {
  const posts = [...state.news].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  return `
  <section class="section reveal">
    <div class="section-head"><h2>News</h2><p class="muted">Admin-managed publishing system</p>${isAdmin() ? '<a href="#/admin" class="btn ghost">Add</a>' : ''}</div>
    <div class="grid home-quad-grid">${posts
      .map(
        (post) => `<article class="card news-card" data-open-news="${post.slug}">
          ${renderNewsThumbnailCarousel(post, 'news-list')}
          <div class="card-body">
            <p class="meta">${formatDate(post.publishedAt)} · ${post.category}</p>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.subtitle)}</p>
            <p class="muted">${renderHashtagLine(post.tags)}</p>
            <a href="#/news/${post.slug}" class="text-link">Open article</a>
            ${
              isAdmin()
                ? `<div class="admin-inline-actions"><button type="button" class="text-btn" data-admin-edit-news-title-inline="${post.slug}">Edit title</button><button type="button" class="text-btn" data-admin-edit-news-text-inline="${post.slug}">Edit text</button><button type="button" class="text-btn" data-admin-edit-news-cover-inline="${post.slug}">Edit cover photo</button><button type="button" class="text-btn danger" data-admin-delete-news-inline="${post.slug}">Delete</button></div>`
                : ''
            }
          </div>
        </article>`,
      )
      .join('')}</div>
  </section>`
}

const renderNewsDetail = (slug) => {
  const post = state.news.find((item) => item.slug === slug)
  if (!post) return '<section class="section"><h2>Post not found.</h2></section>'

  const related = state.news.filter((item) => item.slug !== slug && item.category === post.category).slice(0, 2)

  return `
  <section class="section reveal">
    <a href="#/news" class="text-link">← Back to News</a>
    <article class="article">
      <p class="eyebrow">${escapeHtml(post.category)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="lead">${escapeHtml(post.subtitle)}</p>
      <p class="meta">${formatDate(post.publishedAt)}</p>
      <div class="article-cover-carousel">
        ${renderNewsThumbnailCarousel(post, 'news-detail')}
      </div>
      <div class="article-content">${markdownToHtml(post.content)}</div>
      <p class="muted">${renderHashtagLine(post.tags)}</p>
      ${
        isAdmin()
              ? `<div class="admin-inline-actions"><button type="button" class="text-btn" data-admin-edit-news-title-inline="${post.slug}">Edit title</button><button type="button" class="text-btn" data-admin-edit-news-text-inline="${post.slug}">Edit text</button><button type="button" class="text-btn" data-admin-edit-news-cover-inline="${post.slug}">Edit cover photo</button><button type="button" class="text-btn danger" data-admin-delete-news-inline="${post.slug}">Delete</button></div>`
          : ''
      }
    </article>
  </section>
  <section class="section reveal">
    <h2>Related Articles</h2>
    <div class="grid cards-2">${related
      .map(
        (item) => `<article class="card" data-open-news="${item.slug}"><div class="card-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p><a href="#/news/${item.slug}" class="text-link">Read</a></div></article>`,
      )
      .join('')}</div>
  </section>
  <section class="section reveal">
    <h2>Comments</h2>
    ${renderCommentList(`news:${post.slug}`)}
    ${renderCommentComposer(`news:${post.slug}`)}
  </section>`
}

const renderCommunityBoard = (params) => {
  const sort = params.get('sort') || 'latest'
  const q = (params.get('q') || '').trim().toLowerCase()
  const period = params.get('period') || 'all'
  const cutoffMs =
    period === '7d' ? Date.now() - 7 * 24 * 60 * 60 * 1000 : period === '30d' ? Date.now() - 30 * 24 * 60 * 60 * 1000 : 0

  const posts = getSortedCommunity(sort).filter((post) => {
    if (cutoffMs && new Date(post.createdAt).getTime() < cutoffMs) return false
    if (!q) return true
    const target = [post.title, post.content, post.nickname].join(' ').toLowerCase()
    return target.includes(q)
  })

  return `
  <section class="section reveal">
    <div class="section-head">
      <h2>Community</h2>
      <button type="button" class="btn" data-create-community>Write post</button>
    </div>
    <form class="filter-bar" data-community-sort>
      <label>
        Search
        <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Title, content, author" />
      </label>
      <label>
        Sort
        <select name="sort">
          <option value="latest" ${sort === 'latest' ? 'selected' : ''}>Newest</option>
          <option value="popular" ${sort === 'popular' ? 'selected' : ''}>Most liked</option>
          <option value="comments" ${sort === 'comments' ? 'selected' : ''}>Most commented</option>
        </select>
      </label>
      <label>
        Period
        <select name="period">
          <option value="all" ${period === 'all' ? 'selected' : ''}>All time</option>
          <option value="7d" ${period === '7d' ? 'selected' : ''}>Last 7 days</option>
          <option value="30d" ${period === '30d' ? 'selected' : ''}>Last 30 days</option>
        </select>
      </label>
    </form>
    <div class="board-list">${posts
      .map(
        (post) => `<a class="board-row ${post.pinned ? 'pinned' : ''}" href="#/community/${post.id}">
          <span class="board-title-wrap">
            ${
              getFirstImageValue(post.image)
                ? `<img src="${escapeHtml(getFirstImageValue(post.image))}" alt="Post thumbnail" class="board-thumb" loading="lazy" />`
                : ''
            }
            <span class="board-title">${escapeHtml(post.title)} <em class="board-count">[${getCommentThreadCount(`community:${post.id}`)}]</em></span>
          </span>
          <span class="board-author">${renderUserAvatar(post.nickname, 'xs', post.profileImage || getProfileImageByNickname(post.nickname))}${escapeHtml(post.nickname)}</span>
          <span class="board-time">${formatDate(post.createdAt)}</span>
        </a>`,
      )
      .join('')}</div>
  </section>`
}

const renderCommunityDetail = (postId) => {
  const post = state.community.find((item) => item.id === postId)
  if (!post) {
    return '<section class="section"><h2>Post not found.</h2><a href="#/community" class="text-link">← Back to Community</a></section>'
  }

  return `
  <section class="section reveal">
    <a href="#/community" class="text-link">← Back to Community</a>
    <article class="list-item social-post ${post.pinned ? 'pinned' : ''}" data-community-id="${post.id}">
      <div class="social-head">
        ${renderUserAvatar(post.nickname, 'md', post.profileImage || getProfileImageByNickname(post.nickname))}
        <div class="social-meta"><strong>${escapeHtml(post.nickname)}</strong><span>${post.pinned ? 'Pinned by admin · ' : ''}${formatDate(post.createdAt)}</span></div>
      </div>
      <h3 class="social-title">${escapeHtml(post.title)}</h3>
      <p class="social-text">${escapeHtml(post.content)}</p>
      ${parseImageValues(post.image)
        .map(
          (image, index) =>
            `<img src="${escapeHtml(image)}" alt="Attached image ${index + 1}" class="community-image" loading="lazy" />`,
        )
        .join('')}
      <div class="post-actions">
        <button type="button" class="text-btn community-like-btn ${hasLiked('community', post.id) ? 'liked' : ''}" data-like-community="${post.id}">${
          hasLiked('community', post.id) ? '&#9829;' : '&#9825;'
        } Likes ${post.likes}</button>
        ${
          canManageOwnedContent(post.nickname)
            ? `<button type="button" class="text-btn" data-edit-community="${post.id}">Edit title/content</button><button type="button" class="text-btn danger" data-delete-community="${post.id}">Delete</button>`
            : ''
        }
        ${
          isAdmin()
            ? `<button type="button" class="text-btn" data-admin-toggle-pin-community="${post.id}">${post.pinned ? 'Unpin' : 'Pin'}</button>`
            : ''
        }
      </div>
      <div class="comment-block">
        <div class="comment-block-head">
          <h4>Comments ${getCommentThreadCount(`community:${post.id}`)}</h4>
          <label class="comment-sort-label">
            Sort
            <select data-comment-sort="community:${post.id}">
              <option value="oldest" ${getCommentSort(`community:${post.id}`) === 'oldest' ? 'selected' : ''}>Oldest</option>
              <option value="latest" ${getCommentSort(`community:${post.id}`) === 'latest' ? 'selected' : ''}>Newest</option>
              <option value="likes" ${getCommentSort(`community:${post.id}`) === 'likes' ? 'selected' : ''}>Most liked</option>
            </select>
          </label>
        </div>
        ${renderCommentList(`community:${post.id}`)}
        ${renderCommentComposer(`community:${post.id}`)}
      </div>
    </article>
  </section>`
}

const renderCommunity = (params, postId = '') => {
  if (postId) return renderCommunityDetail(postId)
  return renderCommunityBoard(params)
}

const renderSearch = () => {
  const searchPlaceholder = isCommunityEnabled()
    ? 'Collection, news, community keyword'
    : 'Collection, news keyword'

  return `
  <section class="section reveal">
    <h2>Search Archive</h2>
    <label>
      Live search
      <input type="search" data-global-search placeholder="${searchPlaceholder}" />
    </label>
    <div id="search-results" class="list"></div>
  </section>
  `
}

const renderAbout = () => `
  <section class="section reveal">
    <h2>About i_luv_pen</h2>
    <p class="lead">i_luv_pen preserves and expands premium fountain pen culture through a carefully curated digital archive.</p>
    <div class="grid cards-2">
      <article class="card"><div class="card-body"><h3>Archive</h3><p>JSON-driven architecture designed to scale to thousands of pen entries.</p></div></article>
      <article class="card"><div class="card-body"><h3>News</h3><p>Long-form markdown articles with code blocks, captions, categories, and tags.</p></div></article>
      ${
        isCommunityEnabled()
          ? '<article class="card"><div class="card-body"><h3>Community</h3><p>Nickname-based participation without mandatory sign-up.</p></div></article>'
          : ''
      }
      <article class="card"><div class="card-body"><h3>Open & Free</h3><p>Near-zero-cost hosting via GitHub Pages and GitHub Actions.</p></div></article>
    </div>
  </section>
`

const renderAdmin = () => {
  const authed = isAdmin()
  if (!authed) {
    return `
      <section class="section reveal">
        <h2>Admin Login</h2>
        <p class="muted">Static sites cannot fully protect secrets. For production, move to GitHub App or OIDC-based authentication.</p>
        <form class="admin-login" data-admin-login>
          <label>Admin nickname<input name="nickname" required placeholder="i_luv_pen" /></label>
          <label>Admin password<input name="password" type="password" required /></label>
          <button class="btn" type="submit">Sign in</button>
        </form>
      </section>
    `
  }

  return `
  <section class="section reveal">
    <div class="section-head"><h2>Admin Panel</h2><button type="button" class="btn ghost" data-admin-logout>Sign out</button></div>

    <div class="grid cards-2">
      <article class="card"><details class="admin-panel-fold">
        <summary class="admin-panel-toggle">Collection Management (DB)</summary>
        <div class="card-body">
          <form class="admin-editor" data-admin-pens>
          <label>Select existing ID
            <select name="pick"><option value="">New item</option>${state.pens.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)}</option>`).join('')}</select>
          </label>
          <label>ID<input name="id" required /></label>
          <label>Name<input name="name" required /></label>
          <label>Series<input name="series" required /></label>
          <label>Release year<input name="year" type="number" required /></label>
          <label>Release month (optional)<input name="releaseMonth" type="number" min="1" max="12" placeholder="1-12" /></label>
          <label>Purchase Price<input name="price" inputmode="numeric" placeholder="1,250,000" /></label>
          <label>Description<textarea name="description" rows="2" required></textarea></label>
          <label>Detailed description<textarea name="descriptionLong" rows="3"></textarea></label>
          <label>Image URLs (one per line)<textarea name="images" rows="4"></textarea></label>
          <label>
            Upload image file (optional, added to first position)
            <input name="imageFile" type="file" accept="image/*" multiple hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
          <label>Keywords (comma-separated)<input name="keywords" /></label>
          <div class="editor-actions">
            <button type="submit" class="btn">Add/Update + Save</button>
            <button type="button" class="btn ghost" data-admin-delete-pen>Delete + Save</button>
          </div>
          </form>
        </div>
      </details></article>

      <article class="card"><details class="admin-panel-fold">
        <summary class="admin-panel-toggle">News Management (DB)</summary>
        <div class="card-body">
          <form class="admin-editor" data-admin-news>
          <label>Select existing slug
            <select name="pick"><option value="">New post</option>${state.news.map((b) => `<option value="${escapeHtml(b.slug)}">${escapeHtml(b.slug)}</option>`).join('')}</select>
          </label>
          <label>Slug<input name="slug" required /></label>
          <label>Title<input name="title" required /></label>
          <label>Subtitle<input name="subtitle" required /></label>
          <label>Category<input name="category" required /></label>
          <label>Tags (comma-separated)<input name="tags" /></label>
          <label>Cover image URLs (optional, one per line)<textarea name="coverImage" rows="4" placeholder="https://..."></textarea></label>
          <label>
            Cover image file (optional)
            <input name="imageFile" type="file" accept="image/*" multiple hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
          <label>Published at (ISO)<input name="publishedAt" placeholder="2026-07-11T09:00:00.000Z" /></label>
          <label>Content (Markdown)<textarea name="content" rows="6" required></textarea></label>
          <div class="editor-actions">
            <button type="submit" class="btn">Add/Update + Save</button>
            <button type="button" class="btn ghost" data-admin-delete-news>Delete + Save</button>
          </div>
          </form>
        </div>
      </details></article>

      <article class="card"><details class="admin-panel-fold">
        <summary class="admin-panel-toggle">Site Settings (DB)</summary>
        <div class="card-body">
          <form class="admin-editor" data-admin-site>
          <label>
            <span>Enable Community</span>
            <input name="communityEnabled" type="checkbox" ${isCommunityEnabled() ? 'checked' : ''} />
          </label>
          <div class="editor-actions">
            <button type="submit" class="btn">Save settings</button>
          </div>
          </form>
        </div>
      </details></article>

      <article class="card"><details class="admin-panel-fold">
        <summary class="admin-panel-toggle">Comment Management (DB)</summary>
        <div class="card-body">
          <form class="admin-editor" data-admin-comments>
          <label>Target ID (e.g. news:slug, community:id)<input name="targetId" required /></label>
          <label>Comment ID<input name="id" required /></label>
          <label>Nickname<input name="nickname" required /></label>
          <label>Content<textarea name="content" rows="3" required></textarea></label>
          <label>Image URL<input name="image" type="url" /></label>
          <label>
            Image file (optional)
            <input name="imageFile" type="file" accept="image/*" multiple hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
          <label>Likes<input name="likes" type="number" value="0" /></label>
          <label>Created at (ISO)<input name="createdAt" placeholder="2026-07-11T09:00:00.000Z" /></label>
          <div class="editor-actions">
            <button type="submit" class="btn">Add/Update + Save</button>
            <button type="button" class="btn ghost" data-admin-delete-comment>Delete + Save</button>
          </div>
          </form>
        </div>
      </details></article>
    </div>
  </section>
  `
}

const renderHeader = () => `
<header class="site-header">
  <a href="#/home" class="brand" aria-label="i_luv_pen home">
    <img class="brand-avatar" src="${PROFILE_AVATAR_URL}" alt="i_luv_pen profile" />
    <span>i_luv_pen</span>
  </a>
  <nav aria-label="Main menu">
    <a href="#/home">Home</a>
    <a href="#/collection">Collection</a>
    <a href="#/news">News</a>
    ${isCommunityEnabled() ? '<a href="#/community">Community</a>' : ''}
    <a href="#/about">About</a>
    <a href="#/search">Search</a>
  </nav>
  <div class="header-controls">
    ${
      getNickname()
        ? `<div class="account-menu"><button type="button" class="btn ghost account-trigger" data-toggle-account-menu><img class="account-avatar" src="${escapeHtml(getCurrentUserAvatar())}" alt="${escapeHtml(getNickname())} profile" /><span>${escapeHtml(getNickname())}</span></button>${
            state.accountMenuOpen
              ? `<div class="account-popover">
                  ${
                    !isCurrentProtectedAdmin()
                      ? '<button type="button" class="text-btn danger" data-open-account-manage="delete">Delete account</button>'
                      : ''
                  }
                  <button type="button" class="text-btn danger" data-user-logout>Log out</button>
                  ${
                    !isCurrentProtectedAdmin()
                      ? '<button type="button" class="text-btn" data-open-account-manage="settings">Settings</button>'
                      : ''
                  }
                </div>`
              : ''
          }</div>`
        : '<button type="button" class="btn ghost" data-pick-nickname>Login</button>'
    }
  </div>
</header>
`

const renderQuickLinks = () => `
<section class="quick-links" aria-label="Social links">
  <a href="https://www.instagram.com/i_luv_pen/" target="_blank" rel="noreferrer">instagram</a>
  <a href="https://www.instagram.com/i_luv_pen_highartistry/" target="_blank" rel="noreferrer">instagram ( highartistry )</a>
  <a href="https://www.threads.com/@i_luv_pen" target="_blank" rel="noreferrer">threads</a>
  <a href="https://m.youtube.com/@i_luv_pen" target="_blank" rel="noreferrer">youtube</a>
</section>
`

const renderFooter = () => `
<footer class="site-footer">
  <p>&copy; ${new Date().getFullYear()} i_luv_pen. Premium Fountain Pen Archive.</p>
  ${isAdmin() ? '<a href="#/admin">Admin</a>' : ''}
</footer>
`

const renderAuthModal = () => {
  if (!state.authModalOpen) return ''

  if (state.authMode === 'register') {
    return `
    <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Create nickname account">
      <div class="compose-sheet">
        <div class="section-head">
          <h3>Create nickname account</h3>
          <button type="button" class="icon-btn" data-close-auth-modal>Close</button>
        </div>
        <form class="comment-form" data-auth-register>
          <label>
            Nickname
            <input name="nickname" maxlength="24" required placeholder="Your nickname" />
          </label>
          <label>
            Password
            <input name="password" type="password" minlength="4" required placeholder="At least 4 characters" />
          </label>
          <label>
            Confirm password
            <input name="passwordConfirm" type="password" minlength="4" required placeholder="Re-enter password" />
          </label>
          <label>
            Profile image URL (optional)
            <input name="imageUrl" type="url" placeholder="https://..." />
          </label>
          <label>
            Profile image file (optional)
            <input name="imageFile" type="file" accept="image/*" hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
          <div class="editor-actions">
            <button type="submit" class="btn">Create account</button>
            <button type="button" class="btn ghost" data-switch-auth-mode="login">Go to login</button>
          </div>
        </form>
      </div>
    </div>
    `
  }

  return `
  <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Login">
    <div class="compose-sheet">
      <div class="section-head">
        <h3>Login</h3>
        <button type="button" class="icon-btn" data-close-auth-modal>Close</button>
      </div>
      <form class="comment-form" data-auth-login>
        <label>
          Nickname
          <input name="nickname" maxlength="24" required placeholder="Your nickname" />
        </label>
        <label>
          Password
          <input name="password" type="password" minlength="4" required placeholder="Your password" />
        </label>
        <div class="editor-actions">
          <button type="submit" class="btn">Login</button>
          <button type="button" class="btn ghost" data-switch-auth-mode="register">Create account</button>
        </div>
      </form>
    </div>
  </div>
  `
}

const renderAccountManageModal = () => {
  if (!state.accountManageMode || !getNickname() || isCurrentProtectedAdmin()) return ''

  if (state.accountManageMode === 'settings') {
    const notificationSupported = canUseNotificationApi()
    const notificationEnabled = isNotificationOptedIn() && (!notificationSupported || Notification.permission === 'granted')
    const notificationStatus = notificationSupported
      ? Notification.permission === 'denied'
        ? 'Browser notification permission is blocked. Enable it in browser settings to turn notifications on.'
        : 'Receive notifications for new articles and activity updates.'
      : 'This browser does not support notifications.'

    return `
    <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Account settings">
      <div class="compose-sheet">
        <div class="section-head">
          <h3>Account settings</h3>
          <button type="button" class="icon-btn" data-close-account-manage>Close</button>
        </div>
        <form class="comment-form" data-account-settings-form>
          <label>
            Nickname (read-only)
            <input value="${escapeHtml(getNickname())}" readonly disabled />
          </label>
          <label>
            Enable notifications
            <input name="notificationEnabled" type="checkbox" ${notificationEnabled ? 'checked' : ''} ${notificationSupported ? '' : 'disabled'} />
          </label>
          <p class="muted">${escapeHtml(notificationStatus)}</p>
          <label>
            Image URL (optional)
            <input name="imageUrl" type="url" placeholder="https://..." />
          </label>
          <label>
            Image file (optional)
            <input name="imageFile" type="file" accept="image/*" hidden />
            <div class="editor-actions file-picker">
              <button type="button" class="btn ghost" data-pick-file>Choose file</button>
              <span class="muted" data-file-name>No file chosen</span>
            </div>
          </label>
          <label>
            Account password
            <input name="password" type="password" minlength="4" required placeholder="Enter your password" />
          </label>
          <label>
            New password (optional)
            <input name="newPassword" type="password" minlength="4" placeholder="Leave empty to keep current password" />
          </label>
          <label>
            Confirm new password
            <input name="newPasswordConfirm" type="password" minlength="4" placeholder="Re-enter new password" />
          </label>
          <div class="editor-actions">
            <button type="submit" class="btn">Save settings</button>
            <button type="button" class="btn ghost" data-close-account-manage>Cancel</button>
          </div>
        </form>
      </div>
    </div>
    `
  }

  return `
  <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Delete account">
    <div class="compose-sheet">
      <div class="section-head">
        <h3>Delete account</h3>
        <button type="button" class="icon-btn" data-close-account-manage>Close</button>
      </div>
      <form class="comment-form" data-account-delete-form>
        <p class="muted">This action deletes your account and logs you out.</p>
        <label>
          Type DELETE to confirm
          <input name="confirm" required placeholder="DELETE" />
        </label>
        <label>
          Account password
          <input name="password" type="password" minlength="4" required placeholder="Enter your password" />
        </label>
        <div class="editor-actions">
          <button type="submit" class="btn ghost">Delete account</button>
          <button type="button" class="btn" data-close-account-manage>Cancel</button>
        </div>
      </form>
    </div>
  </div>
  `
}

const renderNotificationConsentModal = () => {
  if (!state.notificationConsentModalOpen) return ''

  return `
  <div class="compose-modal" role="dialog" aria-modal="true" aria-label="Notification consent">
    <div class="compose-sheet consent-sheet">
      <div class="section-head">
        <h3>Notification settings</h3>
      </div>
      <p class="muted consent-copy">Would you like to receive new article and activity update notifications?</p>
      <div class="editor-actions">
        <button type="button" class="btn" data-notification-consent="accept">Enable notifications</button>
        <button type="button" class="btn ghost" data-notification-consent="decline">Not now</button>
      </div>
    </div>
  </div>
  `
}

const renderLayout = () => {
  const app = document.querySelector('#app')
  const params = new URLSearchParams(location.search)
  const communityEnabled = isCommunityEnabled()

  let pageHtml = ''
  if (state.currentRoute.page === 'home') pageHtml = renderHome()
  if (state.currentRoute.page === 'collection') pageHtml = renderCollection(params)
  if (state.currentRoute.page === 'pen') pageHtml = renderPenDetail(state.currentRoute.param)
  if (state.currentRoute.page === 'news' && !state.currentRoute.param) pageHtml = renderNewsList()
  if (state.currentRoute.page === 'news' && state.currentRoute.param) pageHtml = renderNewsDetail(state.currentRoute.param)
  if (state.currentRoute.page === 'community') {
    pageHtml = communityEnabled
      ? renderCommunity(params, state.currentRoute.param)
      : renderHome()
  }
  if (state.currentRoute.page === 'about') pageHtml = renderAbout()
  if (state.currentRoute.page === 'search') pageHtml = renderSearch()
  if (state.currentRoute.page === 'admin') pageHtml = renderAdmin()
  if (!pageHtml) pageHtml = renderHome()

  const showQuickLinks = state.currentRoute.page === 'home'

  app.innerHTML = localizeHtml(`
    <div class="shell">
      ${renderHeader()}
      ${showQuickLinks ? renderQuickLinks() : ''}
      <main id="main-content">${pageHtml}</main>
      ${renderFooter()}
    </div>
    ${renderAuthModal()}
    ${renderAccountManageModal()}
    ${renderNotificationConsentModal()}
  `)
}

const bindCarousel = () => {
  const indexes = new Map()
  const pendingTransitions = new WeakMap()
  const animateImageSwap = (img, direction, applySwap) => {
    if (!img || typeof img.animate !== 'function') {
      applySwap()
      return
    }

    if (img.dataset.animating === 'true') {
      pendingTransitions.set(img, { direction, applySwap })
      return
    }

    img.dataset.animating = 'true'
    const offset = direction >= 0 ? 34 : -34

    const finish = () => {
      img.dataset.animating = 'false'
      const pending = pendingTransitions.get(img)
      if (!pending) return
      pendingTransitions.delete(img)
      animateImageSwap(img, pending.direction, pending.applySwap)
    }

    const fadeOut = img.animate(
      [
        { transform: 'translateX(0) scale(1)', opacity: 1 },
        { transform: `translateX(${-offset}px) scale(0.98)`, opacity: 0.35 },
      ],
      { duration: 150, easing: 'ease-in' },
    )

    fadeOut.onfinish = () => {
      applySwap()
      const fadeIn = img.animate(
        [
          { transform: `translateX(${offset}px) scale(0.98)`, opacity: 0.35 },
          { transform: 'translateX(0) scale(1)', opacity: 1 },
        ],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
      fadeIn.onfinish = finish
      fadeIn.oncancel = finish
    }
    fadeOut.oncancel = finish
  }

  const getCarouselImages = (id) => {
    const root = document.querySelector(`[data-carousel-id="${id}"]`)
    if (root?.dataset?.carouselImages) {
      const parsed = parseImageValues(root.dataset.carouselImages)
      if (parsed.length) return parsed
    }

    const pen = state.pens.find((item) => item.id === id)
    return pen?.images || []
  }

  const update = (id, nextIndex, direction = 1) => {
    const images = getCarouselImages(id)
    if (!images.length) return
    const current = indexes.get(id) || 0
    const safe = ((nextIndex % images.length) + images.length) % images.length
    if (safe === current) return
    indexes.set(id, safe)

    const img = document.querySelector(`[data-carousel-image="${id}"]`)
    if (img) {
      animateImageSwap(img, direction, () => {
        img.src = images[safe]
      })
    }

    document.querySelectorAll(`[data-carousel-dot^="${id}:"]`).forEach((dot, idx) => {
      dot.classList.toggle('active', idx === safe)
    })
  }

  document.addEventListener('click', async (event) => {
    const prev = event.target.closest('[data-carousel-prev]')
    const next = event.target.closest('[data-carousel-next]')
    const dot = event.target.closest('[data-carousel-dot]')

    if (prev) {
      const id = prev.dataset.carouselPrev
      update(id, (indexes.get(id) || 0) - 1, -1)
    }
    if (next) {
      const id = next.dataset.carouselNext
      update(id, (indexes.get(id) || 0) + 1, 1)
    }
    if (dot) {
      const [id, idx] = dot.dataset.carouselDot.split(':')
      const target = Number(idx)
      const current = indexes.get(id) || 0
      update(id, target, target >= current ? 1 : -1)
    }
  })

  let swipeState = null

  document.addEventListener(
    'touchstart',
    (event) => {
      const carousel = event.target.closest('[data-carousel-id]')
      if (!carousel) return
      const touch = event.touches?.[0]
      if (!touch) return
      swipeState = {
        id: carousel.dataset.carouselId,
        x: touch.clientX,
        y: touch.clientY,
      }
    },
    { passive: true },
  )

  document.addEventListener(
    'touchend',
    (event) => {
      if (!swipeState) return
      const touch = event.changedTouches?.[0]
      if (!touch) {
        swipeState = null
        return
      }

      const deltaX = touch.clientX - swipeState.x
      const deltaY = touch.clientY - swipeState.y
      const id = swipeState.id
      swipeState = null

      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return

      if (deltaX < 0) {
        update(id, (indexes.get(id) || 0) + 1, 1)
      } else {
        update(id, (indexes.get(id) || 0) - 1, -1)
      }
    },
    { passive: true },
  )
}

const bindInteractions = () => {
  document.addEventListener('click', async (event) => {
    const openPen = event.target.closest('[data-open-pen]')
    const openNews = event.target.closest('[data-open-news]')
    const createPost = event.target.closest('[data-create-community]')
    const likeCommunity = event.target.closest('[data-like-community]')
    const deleteCommunity = event.target.closest('[data-delete-community]')
    const editCommunity = event.target.closest('[data-edit-community]')
    const likeComment = event.target.closest('[data-like-comment]')
    const deleteComment = event.target.closest('[data-delete-comment]')
    const deleteReply = event.target.closest('[data-delete-reply]')
    const replyComment = event.target.closest('[data-reply-comment]')
    const toggleReplies = event.target.closest('[data-toggle-replies]')
    const openLightbox = event.target.closest('[data-open-lightbox]')
    const adminPreview = event.target.closest('[data-admin-preview]')
    const adminLogout = event.target.closest('[data-admin-logout]')
    const closeCompose = event.target.closest('[data-close-compose]')
    const deletePen = event.target.closest('[data-admin-delete-pen]')
    const deleteNews = event.target.closest('[data-admin-delete-news]')
    const deleteCommentByAdmin = event.target.closest('[data-admin-delete-comment]')
    const deletePenInline = event.target.closest('[data-admin-delete-pen-inline]')
    const deleteNewsInline = event.target.closest('[data-admin-delete-news-inline]')
    const editPenTitleInline = event.target.closest('[data-admin-edit-pen-title-inline]')
    const editPenTextInline = event.target.closest('[data-admin-edit-pen-text-inline]')
    const editPenReleaseInline = event.target.closest('[data-admin-edit-pen-release-inline]')
    const editPenKeywordsInline = event.target.closest('[data-admin-edit-pen-keywords-inline]')
    const editPenPriceInline = event.target.closest('[data-admin-edit-pen-price-inline]')
    const editNewsTitleInline = event.target.closest('[data-admin-edit-news-title-inline]')
    const editNewsTextInline = event.target.closest('[data-admin-edit-news-text-inline]')
    const editNewsCoverInline = event.target.closest('[data-admin-edit-news-cover-inline]')
    const addPenImage = event.target.closest('[data-admin-add-pen-image]')
    const deletePenImage = event.target.closest('[data-admin-delete-pen-image]')
    const movePenImage = event.target.closest('[data-admin-move-pen-image]')
    const adminOpen = event.target.closest('[data-admin-open]')
    const toggleCommunityPin = event.target.closest('[data-admin-toggle-pin-community]')
    const pickFile = event.target.closest('[data-pick-file]')
    const toggleImageFields = event.target.closest('[data-toggle-image-fields]')
    const toggleAccountMenu = event.target.closest('[data-toggle-account-menu]')
    const userLogout = event.target.closest('[data-user-logout]')
    const pickNickname = event.target.closest('[data-pick-nickname]')
    const closeAuthModal = event.target.closest('[data-close-auth-modal]')
    const switchAuthMode = event.target.closest('[data-switch-auth-mode]')
    const openAccountManage = event.target.closest('[data-open-account-manage]')
    const closeAccountManage = event.target.closest('[data-close-account-manage]')
    const notificationConsent = event.target.closest('[data-notification-consent]')

    if (notificationConsent) {
      const action = notificationConsent.dataset.notificationConsent
      localStorage.setItem(STORAGE_KEYS.notificationPromptSeen, '1')

      if (action === 'accept') {
        ;(async () => {
          const permission = Notification.permission === 'granted' ? 'granted' : await requestNotificationPermissionSafe()
          localStorage.setItem(STORAGE_KEYS.notificationOptIn, permission === 'granted' ? 'true' : 'false')
          state.notificationConsentModalOpen = false
          if (permission === 'granted') {
            await maybeRunNotificationChecks()
          }
          render()
        })()
      } else {
        localStorage.setItem(STORAGE_KEYS.notificationOptIn, 'false')
        state.notificationConsentModalOpen = false
        render()
      }
      return
    }

    if (state.accountMenuOpen && !event.target.closest('.account-menu')) {
      state.accountMenuOpen = false
      render()
      return
    }

    const clickedAdminControl = event.target.closest(
      '[data-admin-edit-pen-title-inline],[data-admin-edit-pen-text-inline],[data-admin-edit-pen-release-inline],[data-admin-edit-pen-keywords-inline],[data-admin-edit-pen-price-inline],[data-admin-delete-pen-inline],[data-admin-add-pen-image],[data-admin-delete-pen-image],[data-admin-move-pen-image],[data-admin-edit-news-title-inline],[data-admin-edit-news-text-inline],[data-admin-edit-news-cover-inline],[data-admin-delete-news-inline]',
    )

    const clickedLinkOrButton = event.target.closest('a, button, input, textarea, select, label')

    if (openPen && !clickedAdminControl && !clickedLinkOrButton) {
      location.hash = `#/pen/${openPen.dataset.openPen}`
    }

    if (openNews && !clickedAdminControl && !clickedLinkOrButton) {
      location.hash = `#/news/${openNews.dataset.openNews}`
    }

    if (adminOpen) {
      location.hash = adminOpen.dataset.adminOpen
    }

    if (toggleAccountMenu) {
      state.accountMenuOpen = !state.accountMenuOpen
      render()
      return
    }

    if (userLogout) {
      localStorage.removeItem(STORAGE_KEYS.nickname)
      localStorage.removeItem(STORAGE_KEYS.admin)
      localStorage.removeItem(STORAGE_KEYS.adminToken)
      state.accountMenuOpen = false
      state.accountManageMode = ''
      state.userProfileImage = ''
      render()
      return
    }

    if (pickNickname) {
      state.authMode = 'login'
      state.authModalOpen = true
      state.accountMenuOpen = false
      render()
      return
    }

    if (closeAuthModal) {
      state.authModalOpen = false
      render()
      return
    }

    if (switchAuthMode) {
      state.authMode = switchAuthMode.dataset.switchAuthMode === 'register' ? 'register' : 'login'
      render()
      return
    }

    if (openAccountManage) {
      if (isCurrentProtectedAdmin()) return
      state.accountManageMode = openAccountManage.dataset.openAccountManage === 'delete' ? 'delete' : 'settings'
      state.accountMenuOpen = false
      render()
      return
    }

    if (closeAccountManage) {
      state.accountManageMode = ''
      render()
      return
    }

    if (createPost) {
      const nickname = ensureNickname()
      if (!nickname) return
      if (document.querySelector('.compose-modal')) return
      document.body.insertAdjacentHTML('beforeend', renderCommunityComposer())
    }

    if (pickFile) {
      const container = pickFile.closest('label') || pickFile.closest('form')
      const input = container?.querySelector('input[name="imageFile"]')
      input?.click()
      return
    }

    if (toggleImageFields) {
      const form = toggleImageFields.closest('form')
      const fields = form?.querySelector('[data-image-fields]')
      if (!fields) return
      fields.hidden = !fields.hidden
      toggleImageFields.textContent = fields.hidden ? 'Add image' : 'Hide image inputs'
      return
    }

    if (closeCompose) {
      closeCompose.closest('.compose-modal')?.remove()
    }

    if (likeCommunity) {
      const nickname = ensureNickname()
      if (!nickname) return
      const post = state.community.find((item) => item.id === likeCommunity.dataset.likeCommunity)
      if (!post) return
      const nowLiked = toggleLikeMark('community', post.id)
      post.likes = Math.max(0, Number(post.likes || 0) + (nowLiked ? 1 : -1))
      saveCommunity()
      render()
      return
    }

    if (deleteCommunity) {
      const post = state.community.find((item) => item.id === deleteCommunity.dataset.deleteCommunity)
      if (!post || !canManageOwnedContent(post.nickname)) return
      if (USE_REMOTE_DB && isAdmin()) {
        try {
          await adminDeleteCommunityPost(post.id)
          state.community = state.community.filter((item) => item.id !== post.id)
          writeCachedJson(STORAGE_KEYS.cachedCommunity, state.community)
          render()
        } catch (error) {
          alert(error.message || 'Failed to delete community post.')
        }
        return
      }
      state.community = state.community.filter((item) => item.id !== post.id)
      saveCommunity()
      render()
    }

    if (editCommunity) {
      const post = state.community.find((item) => item.id === editCommunity.dataset.editCommunity)
      if (!post || !canManageOwnedContent(post.nickname)) return
      const nextTitle = prompt('Edit title', post.title)
      if (!nextTitle) return
      const next = prompt('Edit content', post.content)
      if (!next) return
      if (USE_REMOTE_DB && isAdmin()) {
        try {
          await adminUpdateCommunityPost(post.id, { title: nextTitle, content: next })
          post.title = nextTitle
          post.content = next
          writeCachedJson(STORAGE_KEYS.cachedCommunity, state.community)
          render()
        } catch (error) {
          alert(error.message || 'Failed to update community post.')
        }
        return
      }
      post.title = nextTitle
      post.content = next
      saveCommunity()
      render()
    }

    if (likeComment) {
      const nickname = ensureNickname()
      if (!nickname) return
      const target = findCommentEntityById(likeComment.dataset.likeComment)
      if (!target) return
      const actionKey = getCommentActionKey('like', target.entity.id)
      const nowLiked = toggleLikeMark('comments', target.entity.id)
      target.entity.likes = Math.max(0, Number(target.entity.likes || 0) + (nowLiked ? 1 : -1))
      setCommentActionBusy(actionKey, true)
      syncCommentLikeUi(likeComment, nowLiked, target.entity.likes)
      render()
      await saveCommentLike(target.entity.id, target.entity.likes)
      setCommentActionBusy(actionKey, false)
      render()
    }

    if (deleteComment) {
      const targetId = deleteComment.dataset.targetId
      const commentId = deleteComment.dataset.deleteComment
      const list = state.comments[targetId] || []
      const target = list.find((item) => item.id === commentId)
      if (!target || !canManageOwnedContent(target.nickname)) return
      const actionKey = getCommentActionKey('delete', commentId)
      setCommentActionBusy(actionKey, true)
      if (USE_REMOTE_DB && isAdmin()) {
        try {
          render()
          const result = await adminDeleteCommentEntry(commentId)
          if (result && typeof result.version !== 'undefined') {
            state.commentsVersion = parseCommentsVersion(result.version)
            localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
          }
          state.comments[targetId] = list.filter((item) => item.id !== commentId)
          writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
          render()
        } catch (error) {
          alert(error.message || 'Failed to delete comment.')
        } finally {
          setCommentActionBusy(actionKey, false)
          render()
        }
        return
      }
      state.comments[targetId] = list.filter((item) => item.id !== commentId)
      render()
      await saveComments()
      setCommentActionBusy(actionKey, false)
      render()
    }

    if (deleteReply) {
      const targetId = deleteReply.dataset.targetId
      const parentId = deleteReply.dataset.parentCommentId
      const replyId = deleteReply.dataset.deleteReply
      const list = state.comments[targetId] || []
      const parent = list.find((item) => item.id === parentId)
      if (!parent || !Array.isArray(parent.replies)) return
      const targetReply = parent.replies.find((item) => item.id === replyId)
      if (!targetReply || !canManageOwnedContent(targetReply.nickname)) return
      const actionKey = getCommentActionKey('reply-delete', replyId)
      setCommentActionBusy(actionKey, true)
      if (USE_REMOTE_DB && isAdmin()) {
        try {
          render()
          const result = await adminDeleteCommentEntry(replyId)
          if (result && typeof result.version !== 'undefined') {
            state.commentsVersion = parseCommentsVersion(result.version)
            localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
          }
          parent.replies = parent.replies.filter((item) => item.id !== replyId)
          writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
          render()
        } catch (error) {
          alert(error.message || 'Failed to delete reply.')
        } finally {
          setCommentActionBusy(actionKey, false)
          render()
        }
        return
      }
      parent.replies = parent.replies.filter((item) => item.id !== replyId)
      render()
      await saveComments()
      setCommentActionBusy(actionKey, false)
      render()
    }

    if (replyComment) {
      const targetId = replyComment.dataset.targetId
      const commentId = replyComment.dataset.replyComment
      const form = document.querySelector(`[data-reply-form="${targetId}:${commentId}"]`)
      if (!form) return
      form.classList.add('open')
      const textarea = form.querySelector('textarea[name="reply"]')
      if (textarea) {
        textarea.focus()
      }
    }

    if (toggleReplies) {
      const key = toggleReplies.dataset.toggleReplies
      const count = Number(toggleReplies.dataset.replyCount || 0)
      const parentComment = toggleReplies.closest('.comment-item')
      const nearbyList =
        toggleReplies.nextElementSibling?.matches('[data-replies-list]')
          ? toggleReplies.nextElementSibling
          : null
      const list = parentComment?.querySelector(`[data-replies-list="${key}"]`) || nearbyList
      if (!list) return
      list.hidden = !list.hidden
      toggleReplies.textContent = getReplyToggleLabel(count || list.querySelectorAll('li').length, !list.hidden)
    }

    if (openLightbox) {
      const pen = state.pens.find((item) => item.id === openLightbox.dataset.openLightbox)
      if (!pen) return
      const modal = document.createElement('div')
      modal.className = 'lightbox'
      modal.innerHTML = `<div class="lightbox-inner"><button class="icon-btn" data-close-lightbox>Close</button><img src="${pen.images[0]}" alt="${escapeHtml(pen.name)}" /></div>`
      document.body.append(modal)
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-lightbox]')) {
          modal.remove()
        }
      })
    }

    if (adminPreview) {
      const form = document.querySelector('[data-admin-editor]')
      if (!form) return
      const title = form.title.value
      const summary = form.summary.value
      const content = form.content.value
      const target = document.querySelector('#admin-preview')
      target.innerHTML = `<div class="card-body"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary)}</p><div class="article-content">${markdownToHtml(content)}</div></div>`
    }

    if (adminLogout) {
      localStorage.removeItem(STORAGE_KEYS.admin)
      localStorage.removeItem(STORAGE_KEYS.adminToken)
      render()
    }

    if (deletePen) {
      const form = deletePen.closest('[data-admin-pens]')
      const id = form?.id?.value?.trim()
      if (!id) return
      state.pens = state.pens.filter((p) => p.id !== id)
      savePen()
      alert('Collection item deleted from DB.')
      render()
    }

    if (deleteNews) {
      const form = deleteNews.closest('[data-admin-news]')
      const slug = form?.slug?.value?.trim()
      if (!slug) return
      state.news = state.news.filter((b) => b.slug !== slug)
      saveNews()
      alert('News post deleted from DB.')
      render()
    }

    if (deletePenInline) {
      if (!isAdmin()) return
      const id = deletePenInline.dataset.adminDeletePenInline
      state.pens = state.pens.filter((p) => p.id !== id)
      savePen()
      alert('Collection item deleted.')
      location.hash = '#/collection'
      render()
    }

    if (deleteNewsInline) {
      if (!isAdmin()) return
      const slug = deleteNewsInline.dataset.adminDeleteNewsInline
      state.news = state.news.filter((b) => b.slug !== slug)
      saveNews()
      alert('News post deleted.')
      location.hash = '#/news'
      render()
    }

    if (editPenTitleInline) {
      if (!isAdmin()) return
      const id = editPenTitleInline.dataset.adminEditPenTitleInline
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminFields('Edit pen title', [{ name: 'name', label: 'Title', value: pen.name }]).then((values) => {
        if (!values?.name) return
        pen.name = values.name.trim()
        savePen()
        alert('Pen title updated.')
        render()
      })
      return
    }

    if (editPenTextInline) {
      if (!isAdmin()) return
      const id = editPenTextInline.dataset.adminEditPenTextInline
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminFields('Edit pen text', [
        { name: 'description', label: 'Short description', value: pen.description || '', multiline: true, rows: 3 },
        {
          name: 'descriptionLong',
          label: 'Long description',
          value: pen.descriptionLong || pen.description || '',
          multiline: true,
          rows: 5,
        },
      ]).then((values) => {
        if (!values) return
        pen.description = (values.description || '').trim()
        pen.descriptionLong = (values.descriptionLong || '').trim()
        savePen()
        alert('Pen text updated.')
        render()
      })
      return
    }

    if (editPenReleaseInline) {
      if (!isAdmin()) return
      const id = editPenReleaseInline.dataset.adminEditPenReleaseInline
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminFields('Edit pen release', [
        { name: 'year', label: 'Release year', value: String(Number(pen.year || 0) || '') },
        {
          name: 'releaseMonth',
          label: 'Release month (optional, 1-12)',
          value: String(normalizeReleaseMonth(pen.releaseMonth) || ''),
        },
      ]).then((values) => {
        if (!values) return
        const year = Number(values.year)
        if (!Number.isInteger(year) || year < 1) {
          alert('Release year must be a positive number.')
          return
        }
        const normalizedMonth = normalizeReleaseMonth(values.releaseMonth)
        if (String(values.releaseMonth || '').trim() && normalizedMonth === null) {
          alert('Release month must be 1-12.')
          return
        }
        pen.year = year
        pen.releaseMonth = normalizedMonth
        savePen()
        alert('Pen release updated.')
        render()
      })
      return
    }

    if (editPenKeywordsInline) {
      if (!isAdmin()) return
      const id = editPenKeywordsInline.dataset.adminEditPenKeywordsInline
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminFields('Edit collection related words', [
        {
          name: 'keywords',
          label: 'Related words (comma-separated)',
          value: (pen.keywords || []).join(', '),
        },
      ]).then((values) => {
        if (!values) return
        pen.keywords = parseCsv(values.keywords || '')
        savePen()
        alert('Collection related words updated.')
        render()
      })
      return
    }

    if (editPenPriceInline) {
      if (!isAdmin()) return
      const id = editPenPriceInline.dataset.adminEditPenPriceInline
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminFields('Edit pen price', [
        {
          name: 'price',
          label: 'Purchase Price',
          value: formatPenPriceInput(pen.price),
        },
      ]).then((values) => {
        if (!values) return
        pen.price = normalizePenPriceForStorage(values.price)
        savePen()
        alert('Pen price updated.')
        render()
      })
      return
    }

    if (editNewsTitleInline) {
      if (!isAdmin()) return
      const slug = editNewsTitleInline.dataset.adminEditNewsTitleInline
      const post = state.news.find((b) => b.slug === slug)
      if (!post) return
      askAdminFields('Edit news title', [
        { name: 'title', label: 'Title', value: post.title || '' },
        { name: 'subtitle', label: 'Subtitle', value: post.subtitle || '' },
      ]).then((values) => {
        if (!values) return
        post.title = (values.title || '').trim()
        post.subtitle = (values.subtitle || '').trim()
        saveNews()
        alert('News title/subtitle updated.')
        render()
      })
      return
    }

    if (editNewsTextInline) {
      if (!isAdmin()) return
      const slug = editNewsTextInline.dataset.adminEditNewsTextInline
      const post = state.news.find((b) => b.slug === slug)
      if (!post) return
      askAdminFields('Edit news text', [
        { name: 'content', label: 'Content (Markdown)', value: post.content || '', multiline: true, rows: 10 },
      ]).then((values) => {
        if (!values?.content) return
        post.content = values.content
        saveNews()
        alert('News text updated.')
        render()
      })
      return
    }

    if (editNewsCoverInline) {
      if (!isAdmin()) return
      const slug = editNewsCoverInline.dataset.adminEditNewsCoverInline
      const post = state.news.find((b) => b.slug === slug)
      if (!post) return
      askAdminImagesSource('Edit cover photos', post.coverImage || '').then((images) => {
        if (!images.length) return
        post.coverImage = images.join('\n')
        saveNews()
        alert('News cover photos updated.')
        render()
      })
      return
    }

    if (addPenImage) {
      if (!isAdmin()) return
      const id = addPenImage.dataset.adminAddPenImage
      const pen = state.pens.find((p) => p.id === id)
      if (!pen) return
      askAdminImagesSource('Add photos').then((images) => {
        if (!images?.length) return
        pen.images ||= []
        pen.images.push(...images)
        savePen()
        alert(images.length > 1 ? `${images.length} photos added.` : 'Photo added.')
        render()
      })
      return
    }

    if (deletePenImage) {
      if (!isAdmin()) return
      const [id, idxRaw] = deletePenImage.dataset.adminDeletePenImage.split(':')
      const idx = Number(idxRaw)
      const pen = state.pens.find((p) => p.id === id)
      if (!pen || !pen.images?.[idx]) return
      if (pen.images.length <= 1) {
        alert('At least one image must remain.')
        return
      }
      pen.images.splice(idx, 1)
      savePen()
      alert('Photo deleted.')
      render()
    }

    if (movePenImage) {
      if (!isAdmin()) return
      const [id, idxRaw, direction] = movePenImage.dataset.adminMovePenImage.split(':')
      const idx = Number(idxRaw)
      const pen = state.pens.find((p) => p.id === id)
      if (!pen || !Array.isArray(pen.images) || !pen.images[idx]) return
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (!moveArrayItem(pen.images, idx, targetIdx)) return
      savePen()
      render()
      return
    }

    if (toggleCommunityPin) {
      if (!isAdmin()) return
      const id = toggleCommunityPin.dataset.adminTogglePinCommunity
      const post = state.community.find((c) => c.id === id)
      if (!post) return
      try {
        if (USE_REMOTE_DB) {
          await adminUpdateCommunityPost(post.id, { pinned: !post.pinned })
        }
        post.pinned = !post.pinned
        writeCachedJson(STORAGE_KEYS.cachedCommunity, state.community)
        if (!USE_REMOTE_DB) saveCommunity()
        alert('Community pin state updated.')
        render()
      } catch (error) {
        alert(error.message || 'Failed to update community pin state.')
      }
    }

    if (deleteCommentByAdmin) {
      const form = deleteCommentByAdmin.closest('[data-admin-comments]')
      const targetId = form?.targetId?.value?.trim()
      const id = form?.id?.value?.trim()
      if (!targetId || !id) return
      try {
        if (USE_REMOTE_DB) {
          await adminDeleteCommentEntry(id)
        }
        state.comments[targetId] = (state.comments[targetId] || []).filter((c) => c.id !== id)
        writeCachedJson(STORAGE_KEYS.cachedComments, state.comments)
        if (!USE_REMOTE_DB) saveComments()
        alert('Comment deleted from DB.')
        render()
      } catch (error) {
        alert(error.message || 'Failed to delete comment from DB.')
      }
    }
  })

  document.addEventListener('submit', async (event) => {
    const commentForm = event.target.closest('[data-comment-form]')
    const replyForm = event.target.closest('[data-reply-form]')
    const communityForm = event.target.closest('[data-community-create-form]')
    const authRegisterForm = event.target.closest('[data-auth-register]')
    const authLoginForm = event.target.closest('[data-auth-login]')
    const accountSettingsForm = event.target.closest('[data-account-settings-form]')
    const accountDeleteForm = event.target.closest('[data-account-delete-form]')
        if (replyForm) {
          event.preventDefault()
          const nickname = ensureNickname()
          if (!nickname) return
          const replyKey = replyForm.dataset.replyForm || ''
          const splitIndex = replyKey.lastIndexOf(':')
          if (splitIndex <= 0 || splitIndex >= replyKey.length - 1) return
          const targetId = replyKey.slice(0, splitIndex)
          const commentId = replyKey.slice(splitIndex + 1)
          const content = replyForm.reply.value.trim()
          if (!content) return
          const list = state.comments[targetId] || []
          const parent = list.find((item) => item.id === commentId)
          if (!parent) return
          const actionKey = getCommentActionKey('reply', commentId)
          setCommentActionBusy(actionKey, true)
          parent.replies ||= []
          parent.replies.push({
            id: uid(),
            nickname,
            profileImage: getCurrentUserAvatar(),
            content,
            likes: 0,
            createdAt: new Date().toISOString(),
          })
          render()
          await saveComments()
          setCommentActionBusy(actionKey, false)
          render()
          return
        }

    if (authRegisterForm) {
      event.preventDefault()
      const nickname = authRegisterForm.nickname.value.trim().slice(0, 24)
      const password = authRegisterForm.password.value
      const passwordConfirm = authRegisterForm.passwordConfirm.value
      const profileImage = await resolveImageInput(authRegisterForm.imageUrl.value, authRegisterForm.imageFile)

      if (!nickname) {
        alert('Please enter a nickname.')
        return
      }
      if (password.length < 4) {
        alert('Password must be at least 4 characters.')
        return
      }
      if (password !== passwordConfirm) {
        alert('Passwords do not match.')
        return
      }

      try {
        const result = await registerNickname(nickname, password, profileImage)
        localStorage.setItem(STORAGE_KEYS.nickname, result.nickname || nickname)
        localStorage.removeItem(STORAGE_KEYS.admin)
        localStorage.removeItem(STORAGE_KEYS.adminToken)
        state.userProfileImage = result.profileImage || ''
        state.authModalOpen = false
        state.authMode = 'login'
        await initNotificationConsent({ justLoggedIn: true })
        alert('Account created and logged in.')
        render()
      } catch (error) {
        alert(error.message || 'Failed to create account.')
      }
      return
    }

    if (authLoginForm) {
      event.preventDefault()
      const nickname = authLoginForm.nickname.value.trim()
      const password = authLoginForm.password.value
      if (!nickname || !password) {
        alert('Please enter nickname and password.')
        return
      }

      try {
        const result = await loginNickname(nickname, password)
        localStorage.setItem(STORAGE_KEYS.nickname, result.nickname || nickname)
        if (result.isAdmin) {
          localStorage.setItem(STORAGE_KEYS.admin, 'true')
          localStorage.setItem(STORAGE_KEYS.adminToken, result.adminToken || '')
        } else {
          localStorage.removeItem(STORAGE_KEYS.admin)
          localStorage.removeItem(STORAGE_KEYS.adminToken)
        }
        state.userProfileImage = result.profileImage || (result.isAdmin ? PROFILE_AVATAR_URL : '')
        state.authModalOpen = false
        state.authMode = 'login'
        await initNotificationConsent({ justLoggedIn: true })
        alert('Logged in.')
        render()
      } catch (error) {
        alert(error.message || 'Login failed.')
      }
      return
    }

    if (accountSettingsForm) {
      event.preventDefault()
      const nickname = getNickname()
      if (!nickname || isProtectedAdminNickname(nickname)) return

      const password = accountSettingsForm.password.value
      const newPassword = accountSettingsForm.newPassword.value
      const newPasswordConfirm = accountSettingsForm.newPasswordConfirm.value
      const requestedNotificationEnabled = Boolean(accountSettingsForm.notificationEnabled?.checked)
      const profileImage = await resolveImageInput(
        accountSettingsForm.imageUrl.value,
        accountSettingsForm.imageFile,
      )

      if (newPassword || newPasswordConfirm) {
        if (newPassword.length < 4) {
          alert('New password must be at least 4 characters.')
          return
        }
        if (newPassword !== newPasswordConfirm) {
          alert('New passwords do not match.')
          return
        }
      }

      try {
        const result = await updateUserProfileImage({ nickname, password, profileImage })
        if (newPassword) {
          await updateUserPassword({ nickname, password, newPassword })
        }

        let notificationMessage = ''
        if (canUseNotificationApi()) {
          localStorage.setItem(STORAGE_KEYS.notificationPromptSeen, '1')
          if (requestedNotificationEnabled) {
            const permission = Notification.permission === 'granted' ? 'granted' : await requestNotificationPermissionSafe()
            const enabled = permission === 'granted'
            localStorage.setItem(STORAGE_KEYS.notificationOptIn, enabled ? 'true' : 'false')
            if (!enabled) {
              notificationMessage = ' Notifications could not be enabled because browser permission is not granted.'
            }
          } else {
            localStorage.setItem(STORAGE_KEYS.notificationOptIn, 'false')
          }
        }

        state.userProfileImage = result.profileImage || ''
        state.accountManageMode = ''
        const baseMessage = newPassword ? 'Profile photo and password updated.' : 'Profile photo updated.'
        alert(`${baseMessage} Notification setting saved.${notificationMessage}`)
        render()
      } catch (error) {
        alert(error.message || 'Failed to update account settings.')
      }
      return
    }

    if (accountDeleteForm) {
      event.preventDefault()
      const nickname = getNickname()
      if (!nickname || isProtectedAdminNickname(nickname)) return

      const confirmText = accountDeleteForm.confirm.value.trim()
      const password = accountDeleteForm.password.value
      if (confirmText !== 'DELETE') {
        alert('Please type DELETE to confirm.')
        return
      }

      try {
        await deleteUserAccount({ nickname, password })
        localStorage.removeItem(STORAGE_KEYS.nickname)
        state.userProfileImage = ''
        state.accountMenuOpen = false
        state.accountManageMode = ''
        alert('Account deleted.')
        render()
      } catch (error) {
        alert(error.message || 'Failed to delete account.')
      }
      return
    }

    const adminLogin = event.target.closest('[data-admin-login]')
    const adminEditor = event.target.closest('[data-admin-editor]')
    const pensForm = event.target.closest('[data-admin-pens]')
    const siteForm = event.target.closest('[data-admin-site]')
    const newsForm = event.target.closest('[data-admin-news]')
    const adminCommentsForm = event.target.closest('[data-admin-comments]')

    if (siteForm) {
      event.preventDefault()
      state.site = {
        ...(state.site && typeof state.site === 'object' ? state.site : {}),
        communityEnabled: Boolean(siteForm.communityEnabled?.checked),
      }
      saveSite()
      alert('Site settings saved.')
      render()
      return
    }

    if (pensForm) {
      event.preventDefault()
      const uploadedImages = await resolveImageInputs('', pensForm.imageFile)
      const images = parseLines(pensForm.images.value)
      const mergedImages = [...uploadedImages, ...images]
      const payload = {
        id: pensForm.id.value.trim(),
        name: pensForm.name.value.trim(),
        series: pensForm.series.value.trim(),
        year: Number(pensForm.year.value),
        releaseMonth: normalizeReleaseMonth(pensForm.releaseMonth.value),
        price: normalizePenPriceForStorage(pensForm.price.value),
        createdAt: new Date().toISOString(),
        description: pensForm.description.value.trim(),
        descriptionLong: pensForm.descriptionLong.value.trim(),
        keywords: parseCsv(pensForm.keywords.value),
        images: mergedImages,
      }
      upsertBy(state.pens, 'id', payload)
      savePen()
      alert('Collection item saved to DB.')
      render()
      return
    }

    if (newsForm) {
      event.preventDefault()
      const coverImages = await resolveImageInputs(newsForm.coverImage.value, newsForm.imageFile)
      const coverImage = coverImages.join('\n')
      const payload = {
        slug: newsForm.slug.value.trim(),
        title: newsForm.title.value.trim(),
        subtitle: newsForm.subtitle.value.trim(),
        coverImage,
        category: newsForm.category.value.trim(),
        tags: parseCsv(newsForm.tags.value),
        publishedAt: newsForm.publishedAt.value.trim() || new Date().toISOString(),
        content: newsForm.content.value,
      }
      upsertBy(state.news, 'slug', payload)
      saveNews()
      alert('News post saved to DB.')
      render()
      return
    }

    if (adminCommentsForm) {
      event.preventDefault()
      const targetId = adminCommentsForm.targetId.value.trim()
      const images = await resolveImageInputs(adminCommentsForm.image.value, adminCommentsForm.imageFile)
      const payload = {
        id: adminCommentsForm.id.value.trim(),
        nickname: adminCommentsForm.nickname.value.trim(),
        content: adminCommentsForm.content.value.trim(),
        image: images.join('\n'),
        likes: Number(adminCommentsForm.likes.value || 0),
        createdAt: adminCommentsForm.createdAt.value.trim() || new Date().toISOString(),
        replies: [],
      }
      state.comments[targetId] ||= []
      upsertBy(state.comments[targetId], 'id', payload)
      try {
        if (USE_REMOTE_DB) {
          const result = await saveAdminCommentsSnapshot()
          if (result && typeof result.version !== 'undefined') {
            state.commentsVersion = parseCommentsVersion(result.version)
            localStorage.setItem(STORAGE_KEYS.commentsVersion, String(state.commentsVersion))
          }
        } else {
          saveComments()
        }
        alert('Comment saved to DB.')
        render()
      } catch (error) {
        alert(error.message || 'Failed to save comment to DB.')
      }
      return
    }

    if (communityForm) {
      event.preventDefault()
      const nickname = ensureNickname()
      if (!nickname) return
      const title = communityForm.title.value.trim()
      const content = communityForm.content.value.trim()
      if (!title || !content) return
      const images = await resolveImageInputs(communityForm.imageUrl.value, communityForm.imageFile)

      state.community.unshift({
        id: uid(),
        nickname,
        profileImage: getCurrentUserAvatar(),
        title,
        content,
        image: images.join('\n'),
        likes: 0,
        pinned: false,
        createdAt: new Date().toISOString(),
      })
      saveCommunity()
      document.querySelector('.compose-modal')?.remove()
      render()
      return
    }

    if (commentForm) {
      event.preventDefault()
      const targetId = commentForm.dataset.commentForm
      const nickname = ensureNickname()
      if (!nickname) return
      const content = commentForm.comment.value.trim()
      if (!content) return
      const images = await resolveImageInputs(commentForm.imageUrl.value, commentForm.imageFile)
      const actionKey = getCommentActionKey('post', targetId)
      setCommentActionBusy(actionKey, true)
      state.comments[targetId] ||= []
      state.comments[targetId].unshift({
        id: uid(),
        nickname,
        profileImage: getCurrentUserAvatar(),
        content,
        image: images.join('\n'),
        likes: 0,
        createdAt: new Date().toISOString(),
        replies: [],
      })
      render()
      await saveComments()
      setCommentActionBusy(actionKey, false)
      render()
      return
    }

    if (adminLogin) {
      event.preventDefault()
      const nickname = adminLogin.nickname.value.trim()
      const value = adminLogin.password.value
      try {
        const result = await loginNickname(nickname, value)
        if (!result.isAdmin) {
          throw new Error('Admin account is required.')
        }

        localStorage.setItem(STORAGE_KEYS.nickname, result.nickname || ADMIN_NICKNAME)
        localStorage.setItem(STORAGE_KEYS.admin, 'true')
        localStorage.setItem(STORAGE_KEYS.adminToken, result.adminToken || '')
        state.userProfileImage = result.profileImage || PROFILE_AVATAR_URL
        render()
      } catch (error) {
        alert(error.message || 'Incorrect admin nickname or password.')
      }
    }

    if (adminEditor) {
      event.preventDefault()
      const payload = {
        id: uid(),
        type: adminEditor.type.value,
        title: adminEditor.title.value,
        summary: adminEditor.summary.value,
        content: adminEditor.content.value,
        image: adminEditor.image.value,
        savedAt: new Date().toISOString(),
      }
      const key = payload.type === 'pen' ? 'iluvpen_draft_pen' : 'iluvpen_draft_news'
      localStorage.setItem(key, JSON.stringify(payload))
      alert('Draft saved.')
    }
  })

  document.addEventListener('change', (event) => {
    const collectionFilter = event.target.closest('[data-collection-filter]')
    const communitySort = event.target.closest('[data-community-sort]')
    const commentSortSelect = event.target.matches('[data-comment-sort]') ? event.target : null
    const languageSelect = event.target.closest('[data-language-select]')
    const imageFileInput = event.target.matches('input[name="imageFile"]') ? event.target : null

    if (imageFileInput) {
      const container = imageFileInput.closest('label') || imageFileInput.closest('form')
      const fileNameEl = container?.querySelector('[data-file-name]')
      if (fileNameEl) {
        fileNameEl.textContent = getSelectedFileLabel(imageFileInput)
      }
      syncImagePreviewForForm(imageFileInput.closest('form'))
      return
    }

    if (languageSelect) {
      state.lang = languageSelect.value
      localStorage.setItem(STORAGE_KEYS.lang, state.lang)
      render()
      return
    }

    if (collectionFilter) {
      const q = collectionFilter.q.value
      const sort = collectionFilter.sort.value
      const qs = new URLSearchParams()
      if (q) qs.set('q', q)
      if (sort) qs.set('sort', sort)
      history.replaceState({}, '', `${location.pathname}?${qs.toString()}${location.hash}`)
      render()
    }

    if (communitySort) {
      const sort = communitySort.sort.value
      const q = communitySort.q?.value?.trim() || ''
      const period = communitySort.period?.value || 'all'
      const qs = new URLSearchParams(location.search)
      qs.set('sort', sort)
      if (q) qs.set('q', q)
      else qs.delete('q')
      if (period && period !== 'all') qs.set('period', period)
      else qs.delete('period')
      history.replaceState({}, '', `${location.pathname}?${qs.toString()}${location.hash}`)
      render()
    }

    if (commentSortSelect) {
      const targetId = commentSortSelect.dataset.commentSort
      if (targetId) {
        state.commentSorts[targetId] = commentSortSelect.value
        render()
      }
    }
  })

  document.addEventListener('input', (event) => {
    const communityFilterQuery = event.target.matches('[data-community-sort] input[name="q"]')
      ? event.target
      : null
    if (communityFilterQuery) {
      const form = communityFilterQuery.closest('[data-community-sort]')
      const sort = form?.sort?.value || 'latest'
      const q = communityFilterQuery.value.trim()
      const period = form?.period?.value || 'all'
      const qs = new URLSearchParams(location.search)
      qs.set('sort', sort)
      if (q) qs.set('q', q)
      else qs.delete('q')
      if (period && period !== 'all') qs.set('period', period)
      else qs.delete('period')
      history.replaceState({}, '', `${location.pathname}?${qs.toString()}${location.hash}`)
      render()
      return
    }

    const priceInput = event.target.matches('[data-admin-pens] input[name="price"]')
      ? event.target
      : event.target.closest?.('[data-admin-pens]')?.querySelector('input[name="price"]')
    if (priceInput && event.target === priceInput) {
      priceInput.value = formatPenPriceInput(priceInput.value)
      return
    }

    const imageInput = event.target.matches(
      'input[name="imageUrl"], input[name="image"], input[name="coverImage"], textarea[name="coverImage"], textarea[name="images"]',
    )
      ? event.target
      : null
    if (imageInput) {
      syncImagePreviewForForm(imageInput.closest('form'))
      return
    }

    const global = event.target.closest('[data-global-search]')
    if (!global) return
    const q = global.value.toLowerCase()
    const results = []

    for (const pen of state.pens) {
      const target = [pen.name, pen.series, pen.year, pen.releaseMonth || '', pen.price || '', pen.description, ...(pen.keywords || [])]
        .join(' ')
        .toLowerCase()
      if (!target.includes(q)) continue
      results.push({
        type: 'Collection',
        href: `#/pen/${pen.id}`,
        title: pen.name,
        meta: `${pen.series} · ${formatReleaseLabel(pen)}${formatPenPrice(pen.price) ? ` · ${formatPenPrice(pen.price)}` : ''}`,
      })
    }

    for (const post of state.news) {
      const target = [post.title, post.subtitle, post.category, post.content, ...(post.tags || [])].join(' ').toLowerCase()
      if (!target.includes(q)) continue
      results.push({
        type: 'News',
        href: `#/news/${post.slug}`,
        title: post.title,
        meta: `${post.category || 'Article'} · ${formatDate(post.publishedAt)}`,
      })
    }

    if (isCommunityEnabled()) {
      for (const post of state.community) {
        const target = [post.title, post.content, post.nickname].join(' ').toLowerCase()
        if (!target.includes(q)) continue
        results.push({
          type: 'Community',
          href: `#/community/${post.id}`,
          title: post.title,
          meta: `${post.nickname} · Likes ${Number(post.likes || 0)}`,
        })
      }
    }

    const container = document.querySelector('#search-results')
    container.innerHTML = results
      .map(
        (item) => `<a class="list-item" href="${escapeHtml(item.href)}"><p class="eyebrow">${escapeHtml(item.type)}</p><h3>${escapeHtml(item.title)}</h3><p class="meta">${escapeHtml(item.meta)}</p></a>`,
      )
      .join('')
  })

  document.addEventListener('focusin', (event) => {
    if (!window.matchMedia('(max-width: 920px)').matches) return
    keepFocusedFieldVisible(event.target)
  })
}

const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${BASE_URL}sw.js`).catch(() => {
        // no-op
      })
    })
  }
}

const render = () => {
  state.currentRoute = parseHashRoute()
  if (!isCommunityEnabled() && state.currentRoute.page === 'community') {
    state.currentRoute = { page: 'home', param: '' }
    if (location.hash.startsWith('#/community')) {
      history.replaceState({}, '', `${location.pathname}${location.search}#/home`)
    }
  }
  renderLayout()
  enhanceRenderedArticleMarkdown()
  bindAdminEntityPickers()
}

const enhanceRenderedArticleMarkdown = () => {
  const article = document.querySelector('.article-content')
  if (!(article instanceof HTMLElement)) return
  const source = article.innerHTML
  let enhanced = source
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/gm, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/gm, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')

  if (enhanced === source) return
  article.innerHTML = enhanced
}

const parseLines = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const parseCsv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const upsertBy = (list, key, item) => {
  const idx = list.findIndex((x) => x[key] === item[key])
  if (idx >= 0) list[idx] = item
  else list.unshift(item)
}

const moveArrayItem = (list, from, to) => {
  if (!Array.isArray(list) || !list.length) return false
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from < 0 || from >= list.length) return false
  if (to < 0 || to >= list.length) return false
  if (from === to) return false
  const [picked] = list.splice(from, 1)
  list.splice(to, 0, picked)
  return true
}

const ensureTestCommentsSeed = () => {
  if (USE_REMOTE_DB || isBlockedLocalMode()) return false
  if (localStorage.getItem(STORAGE_KEYS.testCommentsSeeded) === '1') return false

  const targets = [
    ...state.news.map((post) => `news:${post.slug}`),
    ...state.community.map((post) => `community:${post.id}`),
  ]
  if (!targets.length) return false

  const templates = [
    'Nice writing flow and structure.',
    'The tone feels premium and easy to read.',
    'I would love a follow-up comparison post.',
    'This tip is practical for everyday use.',
    'Great summary, thanks for sharing.',
    'The image and text balance looks clean.',
    'Helpful perspective for beginners too.',
    'I tested this and had a similar result.',
    'Could you also cover long-term maintenance?',
    'Bookmarking this for later reference.',
  ]

  const baseTime = Date.now()
  let created = 0
  for (let i = 0; i < 10; i += 1) {
    const targetId = targets[i % targets.length]
    state.comments[targetId] ||= []
    state.comments[targetId].push({
      id: `test-${uid()}`,
      nickname: `tester_${(i % 5) + 1}`,
      content: `[TEST_SEED] ${templates[i % templates.length]}`,
      image: '',
      likes: (i * 3) % 17,
      createdAt: new Date(baseTime - i * 3600000).toISOString(),
      replies: [],
    })
    created += 1
  }

  if (created > 0) {
    localStorage.setItem(STORAGE_KEYS.testCommentsSeeded, '1')
    saveComments()
    return true
  }

  return false
}

const bindAdminEntityPickers = () => {
  const penForm = document.querySelector('[data-admin-pens]')
  const newsForm = document.querySelector('[data-admin-news]')
  const siteForm = document.querySelector('[data-admin-site]')

  if (penForm) {
    penForm.pick.addEventListener('change', () => {
      const selected = state.pens.find((p) => p.id === penForm.pick.value)
      if (!selected) {
        penForm.reset()
        return
      }
      penForm.id.value = selected.id
      penForm.name.value = selected.name
      penForm.series.value = selected.series
      penForm.year.value = selected.year
      penForm.releaseMonth.value = normalizeReleaseMonth(selected.releaseMonth) || ''
      penForm.price.value = formatPenPriceInput(selected.price)
      penForm.description.value = selected.description || ''
      penForm.descriptionLong.value = selected.descriptionLong || ''
      penForm.images.value = (selected.images || []).join('\n')
      penForm.keywords.value = (selected.keywords || []).join(', ')
      syncImagePreviewForForm(penForm)
    })
  }

  if (newsForm) {
    newsForm.pick.addEventListener('change', () => {
      const selected = state.news.find((b) => b.slug === newsForm.pick.value)
      if (!selected) {
        newsForm.reset()
        return
      }
      newsForm.slug.value = selected.slug
      newsForm.title.value = selected.title
      newsForm.subtitle.value = selected.subtitle
      newsForm.category.value = selected.category
      newsForm.tags.value = (selected.tags || []).join(', ')
      newsForm.coverImage.value = selected.coverImage || ''
      newsForm.publishedAt.value = selected.publishedAt || ''
      newsForm.content.value = selected.content || ''
      syncImagePreviewForForm(newsForm)
    })
  }

  if (siteForm) {
    siteForm.communityEnabled.checked = Boolean(state.site?.communityEnabled)
  }

  document.querySelectorAll('form').forEach((form) => {
    syncImagePreviewForForm(form)
  })
}

export const bootstrapApp = async (rootEl) => {
  if (!rootEl) return
  if (!requireSyncedDbMode()) {
    localStorage.removeItem(STORAGE_KEYS.nickname)
    localStorage.removeItem(STORAGE_KEYS.users)
    localStorage.removeItem(STORAGE_KEYS.community)
    localStorage.removeItem(STORAGE_KEYS.comments)
    localStorage.removeItem(STORAGE_KEYS.admin)
    localStorage.removeItem(STORAGE_KEYS.adminToken)
    localStorage.removeItem(STORAGE_KEYS.likeMarks)
  }
  applyOneTimeDataReset()
  state.lang = getPreferredLanguage()
  applyTheme()

  const [pensFromFile, newsFromFile, community, site, commentsFromFile] = await Promise.all([
    loadJson('data/pens.json'),
    loadJson('data/news.json'),
    loadJson('data/community.json'),
    loadJson('data/site.json'),
    loadJson('data/comments.json').catch(() => ({})),
  ])
  state.site = site && typeof site === 'object' && !Array.isArray(site) ? site : {}

  const currentNickname = getNickname()
  if (currentNickname) {
    if (isProtectedAdminNickname(currentNickname)) {
      state.userProfileImage = PROFILE_AVATAR_URL
    } else {
    try {
      const profile = await getUserProfile(currentNickname)
      state.userProfileImage = profile.profileImage || ''
    } catch {
      state.userProfileImage = isBlockedLocalMode() ? '' : getLocalUserProfileImage(currentNickname)
    }
    }
  } else {
    state.userProfileImage = ''
  }

  let apiCommunity = null
  let apiComments = null
  let apiPens = null
  let apiNews = null
  let apiSite = null
  if (USE_REMOTE_DB) {
    const [communityResult, commentsResult, pensResult, newsResult, siteResult] = await Promise.allSettled([
      apiRequest('/api/state/community'),
      apiRequest('/api/state/comments-map'),
      apiRequest('/api/state/pen'),
      apiRequest('/api/state/news'),
      apiRequest('/api/state/site'),
    ])

    if (communityResult.status === 'fulfilled') apiCommunity = communityResult.value
    else console.error('Failed to load remote community state.', communityResult.reason)

    if (commentsResult.status === 'fulfilled') apiComments = commentsResult.value
    else console.error('Failed to load remote comments state.', commentsResult.reason)

    if (pensResult.status === 'fulfilled') apiPens = pensResult.value
    else console.error('Failed to load remote collection state.', pensResult.reason)

    if (newsResult.status === 'fulfilled') apiNews = newsResult.value
    else console.error('Failed to load remote news state.', newsResult.reason)

    if (siteResult.status === 'fulfilled') apiSite = siteResult.value
    else console.error('Failed to load remote site config.', siteResult.reason)

    if (
      communityResult.status !== 'fulfilled' ||
      commentsResult.status !== 'fulfilled' ||
      pensResult.status !== 'fulfilled' ||
      newsResult.status !== 'fulfilled' ||
      siteResult.status !== 'fulfilled'
    ) {
      console.warn('Remote state partially unavailable. Falling back to cached or bundled data for failed slices.')
    }
  }

  if (USE_REMOTE_DB) {
    state.site = resolveObjectState({ apiValue: apiSite, cachedKey: STORAGE_KEYS.cachedSite, fileValue: state.site })
  }

  if (USE_REMOTE_DB) {
    state.pens = resolveArrayState({ apiValue: apiPens, cachedKey: STORAGE_KEYS.cachedPens, fileValue: pensFromFile })
    state.news = resolveArrayState({ apiValue: apiNews, cachedKey: STORAGE_KEYS.cachedNews, fileValue: newsFromFile })
  } else {
    state.pens = Array.isArray(pensFromFile) ? pensFromFile : []
    state.news = Array.isArray(newsFromFile) ? newsFromFile : []
  }

  if (USE_REMOTE_DB) {
    state.community = resolveArrayState({ apiValue: apiCommunity, cachedKey: STORAGE_KEYS.cachedCommunity, fileValue: community })
  } else if (isBlockedLocalMode()) {
    state.community = Array.isArray(community) ? community : []
  } else {
    const cachedCommunity = localStorage.getItem(STORAGE_KEYS.community)
    state.community = cachedCommunity ? JSON.parse(cachedCommunity) : community
  }
  if (USE_REMOTE_DB) {
    const commentsState = resolveCommentsState({
      apiValue: apiComments,
      cachedCommentsKey: STORAGE_KEYS.cachedComments,
      cachedVersionKey: STORAGE_KEYS.commentsVersion,
      fileValue: commentsFromFile,
    })
    state.comments = commentsState.comments
    state.commentsVersion = commentsState.version
  } else if (isBlockedLocalMode()) {
    state.comments = commentsFromFile && typeof commentsFromFile === 'object' && !Array.isArray(commentsFromFile) ? commentsFromFile : {}
  } else {
    const cachedComments = localStorage.getItem(STORAGE_KEYS.comments)
    state.comments = cachedComments ? JSON.parse(cachedComments) : commentsFromFile
  }

  bindCarousel()
  bindInteractions()
  scheduleKeyboardInsetUpdate()

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleKeyboardInsetUpdate)
    window.visualViewport.addEventListener('scroll', () => {
      if (!shouldTrackKeyboardInset()) return
      scheduleKeyboardInsetUpdate()
    })
  }
  window.addEventListener('orientationchange', scheduleKeyboardInsetUpdate)
  document.addEventListener('focusin', scheduleKeyboardInsetUpdate, true)
  document.addEventListener('focusout', scheduleKeyboardInsetUpdate, true)

  window.addEventListener('hashchange', render)
  window.addEventListener('popstate', render)

  if (!location.hash) location.hash = '#/home'
  await maybeRunNotificationChecks()

  if (USE_REMOTE_DB) {
    window.setInterval(async () => {
      if (!isNotificationOptedIn()) return
      if (!canUseNotificationApi() || Notification.permission !== 'granted') return
      try {
        const [news, comments] = await Promise.all([
          apiRequest('/api/state/news'),
          apiRequest('/api/state/comments-map'),
        ])
        if (Array.isArray(news)) state.news = news
        if (comments && typeof comments === 'object' && !Array.isArray(comments)) {
          const commentsState = resolveCommentsState({
            apiValue: comments,
            cachedCommentsKey: STORAGE_KEYS.cachedComments,
            cachedVersionKey: STORAGE_KEYS.commentsVersion,
            fileValue: commentsFromFile,
          })
          state.comments = commentsState.comments
          state.commentsVersion = commentsState.version
        }
        await maybeRunNotificationChecks()
      } catch {
        // ignore transient polling failures
      }
    }, 90000)
  }

  render()
  registerServiceWorker()
}

