// 이익 변동 진단 — 수수료 계산 보조 엔진 (카드수수료·배달수수료)
// DOM·localStorage 의존 없음. 순수 함수. 동일 입력 → 동일 출력.
//
// 배달 수수료율(DELIVERY_RATES)은 pages/tools/delivery-fee-calc/script.js 의 PLATFORM_RATES 와
// 일치해야 한다. 다르면 scripts/build-pages.js 가 빌드를 실패시킨다.

export const CARD_RATE_TIERS = [
  { id: 'under3', label: '3억 이하', credit: 0.40, check: 0.15 },
  { id: '3to5', label: '3~5억', credit: 1.00, check: 0.75 },
  { id: '5to10', label: '5~10억', credit: 1.15, check: 0.90 },
  { id: '10to30', label: '10~30억', credit: 1.45, check: 1.15 },
  { id: 'over30', label: '30억 초과', credit: null, check: null },
];

export const CARD_OVER30_NOTE =
  '우대수수료율 대상이 아니라 카드사와 협의한 요율이 적용됩니다.\n카드사 정산내역에서 실제 수수료를 확인하세요.';

/** 연매출 구간·월 카드매출액 → 카드수수료(신용카드 요율 기준). 30억 초과는 계산하지 않고 안내만 반환. */
export function calcCardFee({ tier, cardSales }) {
  const t = CARD_RATE_TIERS.find((x) => x.id === tier);
  if (!t) throw new RangeError(`unknown tier: ${tier}`);
  if (t.credit === null) return { rate: null, fee: null, note: CARD_OVER30_NOTE };
  const sales = Number(cardSales) || 0;
  const fee = Math.round(sales * (t.credit / 100));
  return { rate: t.credit, fee, note: null };
}

// 이 값은 pages/tools/delivery-fee-calc/script.js 의 PLATFORM_RATES 와 일치해야 한다.
// 다르면 build-pages.js 가 빌드를 실패시킨다.
export const DELIVERY_RATES = {
  baemin: { name: '배민', brokerage: 7.8, payment: 3.0 },
  coupangeats: { name: '쿠팡이츠', brokerage: 7.8, payment: 3.0 },
  yogiyo: { name: '요기요', brokerage: 9.7, payment: 3.0 },
};

/** 선택한 배달앱별 매출액 → 앱별 중개·결제 수수료와 합계. */
export function calcDeliveryFee(selections = []) {
  const perPlatform = selections.map(({ platform, sales }) => {
    const rates = DELIVERY_RATES[platform];
    if (!rates) throw new RangeError(`unknown platform: ${platform}`);
    const s = Number(sales) || 0;
    const brokerage = Math.round(s * (rates.brokerage / 100));
    const payment = Math.round(s * (rates.payment / 100));
    return { platform, name: rates.name, brokerage, payment, fee: brokerage + payment };
  });
  const total = perPlatform.reduce((sum, p) => sum + p.fee, 0);
  return { perPlatform, total };
}

/** 카드수수료 결과 + 배달수수료 결과 → 합계. 한쪽이 없거나 계산 불가(30억 초과)면 0으로 취급. */
export function sumFees({ card, delivery } = {}) {
  const cardFee = card && typeof card.fee === 'number' ? card.fee : 0;
  const deliveryTotal = delivery && typeof delivery.total === 'number' ? delivery.total : 0;
  return cardFee + deliveryTotal;
}
