// 테스트 공용 비교: 값을 JSON 으로 비교해 PASS / FAIL 한 줄씩 출력 (run.mjs 가 이 줄을 셈)
//  하나라도 틀리면 프로세스 종료 코드 1
export function check(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(got));
  if (!ok) {
    console.log('     기대', JSON.stringify(exp));
    process.exitCode = 1;
  }
}
