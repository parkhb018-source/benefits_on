/**
 * fetch.js — 공공데이터포털 목록 API 수집 (설정 주도)
 * ─────────────────────────────────────────────────────────
 * Node 20+ 내장 fetch 사용 (외부 의존성 없음).
 * 두 방식 지원 (config.style):
 *   - "classic"  : apis.data.go.kr/...  (pageNo/numOfRows/type=json, response.body.items.item)
 *   - "odcloud"  : api.odcloud.kr/...   (page/perPage/returnType=JSON, data)
 * 파라미터명·응답경로는 config로 덮어쓸 수 있어, 데이터셋이 달라도 코드 수정이 필요 없다.
 */

'use strict';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function getDeep(obj, path) {
  return String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
}

async function fetchWithRetry(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`  ↻ 재시도 ${i}/${tries} (${err.message})`);
      await delay(500 * i);
    }
  }
  throw lastErr;
}

/**
 * @param {object} config
 * @returns {Promise<object[]>} 원시 정책 항목 배열
 */
async function fetchPolicies(config) {
  const style = config.style || 'classic';
  const pn = config.paramNames || {};
  const pageKey = pn.page || (style === 'odcloud' ? 'page' : 'pageNo');
  const sizeKey = pn.size || (style === 'odcloud' ? 'perPage' : 'numOfRows');
  const typeKey = pn.type || (style === 'odcloud' ? 'returnType' : 'type');
  const typeVal = pn.typeValue || (style === 'odcloud' ? 'JSON' : 'json');
  const respPath = config.responsePath || (style === 'odcloud' ? 'data' : 'response.body.items.item');

  const all = [];
  const maxPages = config.maxPages > 0 ? config.maxPages : Infinity; // 0/미지정 = 전체 수집
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(config.endpoint);
    url.searchParams.set('serviceKey', config.serviceKey);
    url.searchParams.set(pageKey, String(page));
    url.searchParams.set(sizeKey, String(config.perPage));
    url.searchParams.set(typeKey, typeVal);
    if (config.keyword && config.keywordParam) url.searchParams.set(config.keywordParam, config.keyword);

    process.stdout.write(`  · ${page}페이지 요청… `);
    const res = await fetchWithRetry(url);

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(
        'JSON 파싱 실패 — 응답이 XML/에러일 수 있습니다. type 파라미터나 인증키를 확인하세요.\n  응답 앞부분: ' +
          text.slice(0, 200)
      );
    }

    let data = getDeep(json, respPath);
    if (data == null) data = [];
    if (!Array.isArray(data)) data = [data]; // 결과가 1건이면 객체로 올 수 있음
    console.log(`${data.length}건`);
    for (const d of data) all.push(d); // spread-as-args 회피(대량 페이지 안전)

    if (data.length < config.perPage) break; // 마지막 페이지
    await delay(config.requestDelayMs);
  }
  return all;
}

module.exports = { fetchPolicies };
