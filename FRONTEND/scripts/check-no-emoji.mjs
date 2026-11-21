#!/usr/bin/env node
/**
 * Fails when emoji or other pictographic characters appear in the repository's text files (source,
 * tests, translations, docs, configuration, native Android files). Icons come from lucide-react.
 *
 * Checks every file git knows about (tracked, and new files that are not ignored), from the
 * repository root. Lock files and binary files are skipped.
 *
 *   node scripts/check-no-emoji.mjs           list findings, exit 1 when there are any
 *   node scripts/check-no-emoji.mjs --json    the same as JSON (file, line, column, code points)
 *
 * What counts: Unicode Extended_Pictographic characters, regional indicators (flags), skin tone
 * modifiers, the keycap mark, and the emoji variation selector (U+FE0F). Plain typographic symbols
 * outside those sets (for example the arrow U+2192 or the check mark U+2713) are allowed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]|\u{20E3}|\u{FE0F}/gu

const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|packages\.lock\.json)$/
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.jar',
  '.aar',
  '.keystore',
  '.jks',
  '.zip',
  '.gz',
  '.pdf',
  '.mp3',
  '.mp4',
  '.webm',
])

function repositoryRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

/** Findings for one file's text: line, column (1-based) and the code points found. */
export function findEmoji(text) {
  const findings = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(EMOJI)) {
      findings.push({
        line: index + 1,
        column: [...line.slice(0, match.index)].length + 1,
        codePoint: `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      })
    }
  })
  return findings
}

function main() {
  const root = repositoryRoot()
  const results = []
  for (const file of listFiles(root)) {
    if (SKIP_FILES.test(file) || BINARY_EXTENSIONS.has(extname(file).toLowerCase())) continue
    let buffer
    try {
      buffer = readFileSync(join(root, file))
    } catch {
      continue // listed but deleted in the working tree
    }
    if (buffer.includes(0)) continue // binary
    for (const finding of findEmoji(buffer.toString('utf8'))) results.push({ file, ...finding })
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2))
  } else if (results.length > 0) {
    for (const r of results) console.error(`${r.file}:${r.line}:${r.column} ${r.codePoint}`)
    console.error(
      `\n${results.length} emoji or pictographic character(s) found. Use an icon from lucide-react instead.`,
    )
  } else {
    console.log('No emoji found.')
  }
  process.exitCode = results.length > 0 ? 1 : 0
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) main()
