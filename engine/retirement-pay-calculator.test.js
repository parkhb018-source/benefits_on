// 퇴직금 실수령액 계산기 — 계산/자격조건 테스트
// 실행: node engine/retirement-pay-calculator.test.js
// 외부 의존성 없음(Node 내장 assert만 사용), 실제 data/retirement-pay-net-calculator-policy.json을 그대로 로드한다.
// 기대값은 docs/tools/retirement-pay-net-calc/04_QA_Test_Cases.md 의 10개 시나리오(+08b 경계값)를 그대로 따른다.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  calculateServicePeriod,
  checkEligibility,
  calculateAverageWage,
  calculateSeverancePay,
  calculateRetirementTax,
  isIrpMandatoryTransferTarget,
  calculate,
} from './retirement-pay-calculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'retirement-pay-net-calculator-policy.json'), 'utf-8')
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS: ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL: ' + name);
    console.error('  ' + err.message);
  }
}

function makeInput(hireDate, resignDate, monthlyWage, annualExtra, age) {
  return { hireDate, resignDate, monthlyWage, annualExtra: annualExtra || 0, age };
}

// 04_QA_Test_Cases.md 표 그대로
const cases = [
  { name: '01_1년(경계)', input: makeInput('2025-01-02', '2026-01-02', 2_500_000, 0), serviceDays: 365, taxServiceYears: 1, severancePay: 2_445_652, retirementIncomeTax: 18_695, localIncomeTax: 1_869, netPay: 2_425_088 },
  { name: '02_3년', input: makeInput('2023-03-01', '2026-03-01', 3_000_000, 0), serviceDays: 1096, taxServiceYears: 3, severancePay: 9_008_219, retirementIncomeTax: 96_197, localIncomeTax: 9_619, netPay: 8_902_403 },
  { name: '03_5년(구간경계)', input: makeInput('2021-03-15', '2026-03-15', 3_500_000, 0), serviceDays: 1826, taxServiceYears: 5, severancePay: 17_509_589, retirementIncomeTax: 220_230, localIncomeTax: 22_023, netPay: 17_267_336 },
  { name: '04_12년(장기근속)', input: makeInput('2014-05-01', '2026-05-01', 5_000_000, 0), serviceDays: 4383, taxServiceYears: 12, severancePay: 60_715_714, retirementIncomeTax: 785_177, localIncomeTax: 78_517, netPay: 59_852_020 },
  { name: '05_급여변동(3개월평균입력)', input: makeInput('2022-01-10', '2026-01-10', 3_000_000, 0), serviceDays: 1461, taxServiceYears: 4, severancePay: 11_747_170, retirementIncomeTax: 121_932, localIncomeTax: 12_193, netPay: 11_613_045 },
  { name: '06_상여금있음', input: makeInput('2020-02-01', '2026-02-01', 3_000_000, 6_000_000), serviceDays: 2192, taxServiceYears: 6, severancePay: 20_562_239, retirementIncomeTax: 229_493, localIncomeTax: 22_949, netPay: 20_309_797 },
  { name: '07_기타수당있음', input: makeInput('2022-06-01', '2026-06-01', 3_200_000, 1_200_000), serviceDays: 1461, taxServiceYears: 4, severancePay: 12_921_888, retirementIncomeTax: 150_125, localIncomeTax: 15_012, netPay: 12_756_751 },
  { name: '08_근속연수공제구간경계(정확히10년)', input: makeInput('2016-06-01', '2026-06-01', 4_000_000, 0), serviceDays: 3652, taxServiceYears: 10, severancePay: 39_151_876, retirementIncomeTax: 419_645, localIncomeTax: 41_964, netPay: 38_690_267 },
  { name: '08b_근속연수공제구간경계(정확히20년)', input: makeInput('2006-06-01', '2026-06-01', 6_000_000, 0), serviceDays: 7305, taxServiceYears: 20, severancePay: 117_471_709, retirementIncomeTax: 1_748_302, localIncomeTax: 174_830, netPay: 115_548_577 },
  { name: '09_세율구간경계(고액)', input: makeInput('2011-04-01', '2026-04-01', 8_000_000, 20_000_000), serviceDays: 5479, taxServiceYears: 15, severancePay: 145_105_936, retirementIncomeTax: 5_107_150, localIncomeTax: 510_715, netPay: 139_488_071 },
];

for (const c of cases) {
  test(c.name + ' — 근속기간', () => {
    const { serviceDays, taxServiceYears } = calculateServicePeriod(c.input);
    assert.equal(serviceDays, c.serviceDays);
    assert.equal(taxServiceYears, c.taxServiceYears);
  });

  test(c.name + ' — 전체 계산 파이프라인', () => {
    const result = calculate(c.input, policy);
    assert.equal(result.eligibility.eligible, true);
    assert.equal(result.severancePay, c.severancePay);
    assert.equal(result.tax.retirementIncomeTax, c.retirementIncomeTax);
    assert.equal(result.tax.localIncomeTax, c.localIncomeTax);
    assert.equal(result.netPay, c.netPay);
  });
}

// Case 10 — 잘못된 입력 / 예외 처리
test('10_1년미만은 지급대상 아님(LAW-RET-01)', () => {
  const input = makeInput('2025-06-01', '2026-01-02', 2_500_000, 0);
  const result = checkEligibility(input, policy);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.length > 0);
});

test('10_정확히 365일은 지급대상(경계)', () => {
  const input = makeInput('2025-01-02', '2026-01-02', 2_500_000, 0);
  const result = checkEligibility(input, policy);
  assert.equal(result.eligible, true);
});

test('10_퇴사일이 입사일보다 빠르면 재직일수 음수', () => {
  const input = makeInput('2026-01-02', '2025-01-02', 2_500_000, 0);
  const { serviceDays } = calculateServicePeriod(input);
  assert.ok(serviceDays < 0); // 호출측(UI)에서 별도로 "퇴사일은 입사일 이후여야 합니다" 검증 필요
});

// IRP 고지 조건 테스트
test('IRP고지_55세미만+300만원초과 → true', () => {
  const input = makeInput('2023-03-01', '2026-03-01', 3_000_000, 0, 40);
  const notice = isIrpMandatoryTransferTarget(input, 9_008_219, policy);
  assert.equal(notice, true);
});

test('IRP고지_55세이상 → false(예외)', () => {
  const input = makeInput('2023-03-01', '2026-03-01', 3_000_000, 0, 60);
  const notice = isIrpMandatoryTransferTarget(input, 9_008_219, policy);
  assert.equal(notice, false);
});

test('IRP고지_300만원이하 → false(예외)', () => {
  const input = makeInput('2025-01-02', '2026-01-02', 250_000, 0, 30);
  const severance = calculateSeverancePay(input, policy).severancePay;
  const notice = isIrpMandatoryTransferTarget(input, severance, policy);
  assert.equal(notice, false);
});

test('IRP고지_나이 미입력 → false(고지 생략)', () => {
  const input = makeInput('2023-03-01', '2026-03-01', 3_000_000, 0);
  const notice = isIrpMandatoryTransferTarget(input, 9_008_219, policy);
  assert.equal(notice, false);
});

// 평균임금 계산 단독 검증
test('평균임금_3개월 총일수와 일평균임금 산출', () => {
  const input = makeInput('2023-03-01', '2026-03-01', 3_000_000, 0);
  const { periodDays, dailyAverageWage } = calculateAverageWage(input, policy);
  assert.equal(periodDays, 90);
  assert.ok(Math.abs(dailyAverageWage - 100_000) < 0.01);
});

// 근속연수공제/환산급여공제 구간 경계 값 자체 검증(TAX-RET-02~04)
test('근속연수공제_정확히10년은 5<n≤10 구간(1500만원 아님)', () => {
  const tax = calculateRetirementTax(39_151_876, 10, policy);
  assert.equal(tax.serviceYearDeduction, 15_000_000); // 5,000,000+(10-5)*2,000,000
});

test('근속연수공제_정확히20년은 10<n≤20 구간(4000만원 아님)', () => {
  const tax = calculateRetirementTax(117_471_709, 20, policy);
  assert.equal(tax.serviceYearDeduction, 40_000_000); // 15,000,000+(20-10)*2,500,000
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
