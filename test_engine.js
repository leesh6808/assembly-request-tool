// 시험 원본을 읽어 후보 정확도와 1순위 오답을 출력한다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { classify, parseCsv } = require('./web/engine.js');
const read = name => fs.readFileSync(path.join(__dirname, 'data', name), 'utf8');
const webRead = name => fs.readFileSync(path.join(__dirname, 'web', 'data', name), 'utf8');
const tests = parseCsv(read('시험_요구문항_40건.csv'));
const departments = new Set(parseCsv(read('A부_조직도_26개과.csv')).map(row => row['과']));

async function main() {
  // 브라우저 분기의 CSV 요청 경로와 초기화·분류를 같은 자료로 확인한다.
  const browser = { URL, document: { currentScript: { src: 'http://localhost/web/engine.js', dataset: { dataBase: './data/', rules: '배분기준표_소관키워드_보강본.csv' } } },
    fetch: async url => {
      assert.equal(url.pathname.split('/').slice(-2, -1)[0], 'data');
      return { ok: true, text: async () => webRead(decodeURIComponent(url.pathname.split('/').pop())) };
    } };
  vm.createContext(browser);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'web/engine.js'), 'utf8'), browser);
  await browser.RequestEngine.ready;
  let first = 0, topThree = 0;
  const errors = [];
  for (const test of tests) {
    const results = classify(test['요구내용']);
    assert.ok(results.length <= 3);
    assert.equal(new Set(results.map(row => row['과'])).size, results.length);
    assert.ok(results.every(row => departments.has(row['과'])));
    assert.equal(JSON.stringify(browser.RequestEngine.classify(test['요구내용'])), JSON.stringify(results));
    const correct = test['정답_배분과'];
    if (results[0]?.['과'] === correct) first++;
    else errors.push([test['시험번호'], test['요구내용'], correct,
      results.map(row => `${row['과']}(${row['점수']})`).join(' → ') || '후보 없음']);
    if (results.some(row => row['과'] === correct)) topThree++;
  }
  assert.deepEqual(classify(''), []);
  console.log(`1순위 정답 ${first}/${tests.length} · 3순위 안 ${topThree}/${tests.length}`);
  console.log('| 시험번호 | 요구내용 | 정답 | 엔진 결과 |');
  console.log('|---|---|---|---|');
  for (const row of errors) console.log(`| ${row.map(value => value.replaceAll('|', '\\|')).join(' | ')} |`);
  if (!errors.length) console.log('틀린 문항 없음');
  console.log('Node와 브라우저 분기 결과 일치 확인(브라우저 분기는 CSV 요청 모의 실행).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

