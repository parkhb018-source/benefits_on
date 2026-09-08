#!/usr/bin/env node
/*
 * scripts/update-sitemap.js
 *
 * sitemap.xml 의 각 <url> 에 대해 <lastmod> 를 해당 페이지 파일의
 * 실제 마지막 수정일로 갱신한다.
 *
 *   - 커밋된 파일: git 마지막 커밋 날짜(%cs, YYYY-MM-DD)
 *   - 아직 커밋되지 않은(작업 트리에서 수정된) 파일: 오늘 날짜
 *   - git 이력이 없으면(신규 파일 등): 오늘 날짜
 *
 * <loc> → 파일 경로 규칙:
 *   https://<도메인>/                       → index.html
 *   https://<도메인>/pages/foo               → pages/foo.html
 *   https://<도메인>/pages/tools/foo/        → pages/tools/foo/index.html
 *
 * changefreq / priority 는 건드리지 않는다. Node.js 표준 라이브러리만 사용.
 * 로컬에서 수동 실행: node scripts/update-sitemap.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* <loc> 경로(도메인 제거 후)를 저장소 내 파일 경로로 변환. 없으면 null. */
function resolveFile(locPath) {
  let rel;
  if (locPath === '/' || locPath === '') {
    rel = 'index.html';
  } else {
    const trimmed = locPath.replace(/^\/+/, '').replace(/\/+$/, '');
    rel = trimmed + '.html';
    if (!fs.existsSync(path.join(ROOT, rel))) {
      rel = trimmed + '/index.html';
    }
  }
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? rel : null;
}

function isDirty(relFile) {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', relFile], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return out.trim().length > 0;
  } catch (e) {
    return false;
  }
}

function gitLastDate(relFile) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relFile], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch (e) {
    return null;
  }
}

function lastmodFor(relFile) {
  if (isDirty(relFile)) return today();
  return gitLastDate(relFile) || today();
}

function main() {
  let xml = fs.readFileSync(SITEMAP, 'utf8');
  const eol = /\r\n/.test(xml) ? '\r\n' : '\n';
  let count = 0;
  const missing = [];

  xml = xml.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const locMatch = block.match(/<loc>([^<]*)<\/loc>/);
    if (!locMatch) return block;
    const locPath = locMatch[1].replace(/^https?:\/\/[^/]+/, '');
    const relFile = resolveFile(locPath);
    if (!relFile) {
      missing.push(locMatch[1]);
      return block;
    }
    const date = lastmodFor(relFile);
    count += 1;
    return block.replace(
      /<lastmod>[^<]*<\/lastmod>/,
      '<lastmod>' + date + '</lastmod>'
    );
  });

  if (!xml.endsWith(eol)) xml += eol;
  fs.writeFileSync(SITEMAP, xml);

  console.log('[update-sitemap] 완료 — ' + count + '건 검사, sitemap.xml 재작성');
  if (missing.length) {
    console.warn('[update-sitemap] 경고: 파일을 못 찾은 <loc> (그대로 둠):');
    missing.forEach((m) => console.warn('  - ' + m));
  }
}

main();
