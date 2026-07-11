import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const sourceDir = resolve('data')
const targetDir = resolve('dist', 'data')

if (!existsSync(sourceDir)) {
  throw new Error('Missing source data directory: data')
}

mkdirSync(targetDir, { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })

console.log('Copied data files to dist/data')
