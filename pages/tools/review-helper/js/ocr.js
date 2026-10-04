// 캡쳐 이미지 글자 읽기 — Tesseract.js(한국어)를 필요할 때만 불러와 브라우저 안에서만 처리한다.
// 이미지·읽은 글자는 어디로도 보내지 않는다(라이브러리가 받는 것은 프로그램·언어 데이터 파일뿐).
import { TESSERACT, OCR_MAX_SIDE, OCR_TIMEOUT_MS } from './config.js?v=20261005b';
import { cleanOcrText } from './ocr-clean.js?v=20261005b';

let scriptPromise = null;
let workerPromise = null;
let onLog = null; // 진행 상황 콜백(작업마다 바뀜)

function loadScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT.script;
      s.integrity = TESSERACT.integrity;
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('load')));
      s.onerror = () => { s.remove(); reject(new Error('load')); };
      document.head.append(s);
    });
    scriptPromise.catch(() => { scriptPromise = null; });
  }
  return scriptPromise;
}

// 캡쳐 화면에 들어올 때 미리 준비(프로그램·언어 데이터 내려받기)
export function prepareOcr() {
  if (!workerPromise) {
    workerPromise = loadScript().then((T) => T.createWorker(TESSERACT.lang, 1, {
      workerPath: TESSERACT.workerPath,
      corePath: TESSERACT.corePath,
      langPath: TESSERACT.langPath,
      logger: (m) => { if (onLog) onLog(m); },
    }));
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

// 메모리 정리. 준비가 덜 끝났어도 기다리지 않는다(내려받기가 멈춰 있을 수 있으므로).
export function terminateOcr() {
  const p = workerPromise;
  workerPromise = null;
  if (p) p.then((w) => w.terminate()).catch(() => {});
}

export const isOcrBusy = () => busy;
let busy = false;

// 긴 변이 OCR_MAX_SIDE 를 넘으면 줄인 캔버스를 돌려준다
async function downscale(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, OCR_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

// 결과: { ok: true, text } 또는 { ok: false, reason: 'load' | 'timeout' | 'empty' | 'image' }
export async function recognizeImage(file, onProgress) {
  busy = true;
  onLog = onProgress;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), OCR_TIMEOUT_MS); });
  try {
    let image;
    try { image = await downscale(file); } catch (e) { return { ok: false, reason: 'image' }; }
    const worker = await Promise.race([prepareOcr(), timeout]);
    const { data } = await Promise.race([worker.recognize(image), timeout]);
    const { text, removed } = cleanOcrText(data.text);
    return text ? { ok: true, text, removed } : { ok: false, reason: 'empty' };
  } catch (e) {
    return { ok: false, reason: e && e.message === 'timeout' ? 'timeout' : 'load' };
  } finally {
    clearTimeout(timer);
    onLog = null;
    busy = false;
    terminateOcr();
  }
}
