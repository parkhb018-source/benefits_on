// 데이터 JSON 5개를 한 번에 읽어 메모리에 둔다 (PRD §5). 실패하면 null 을 돌려주고 화면은 막지 않는다.
import { DATA_BASE, DATA_FILES } from './config.js?v=20261004c';

export async function loadData() {
  try {
    const keys = Object.keys(DATA_FILES);
    const jsons = await Promise.all(keys.map(async (k) => {
      const r = await fetch(DATA_BASE + DATA_FILES[k].file, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${DATA_FILES[k].file} HTTP ${r.status}`);
      return r.json();
    }));
    const data = {};
    keys.forEach((k, i) => {
      data[k] = jsons[i];
      if (jsons[i].schemaVersion !== DATA_FILES[k].schema) {
        console.warn(`[review-helper] ${DATA_FILES[k].file} schemaVersion ${jsons[i].schemaVersion} (예상 ${DATA_FILES[k].schema})`);
      }
    });
    return data;
  } catch (e) {
    console.warn('[review-helper] 데이터 로드 실패:', e);
    return null;
  }
}
