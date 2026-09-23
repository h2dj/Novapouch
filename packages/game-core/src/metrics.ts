/** 기여 균형: 사람별 글자 수의 지니 계수. 0이면 고르게, 1에 가까울수록 한 사람에게 몰림 */
export function gini(values: number[]): number {
  const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  const weighted = xs.reduce((acc, x, i) => acc + (i + 1) * x, 0);
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}
