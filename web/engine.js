// Node: const { classify } = require('./web/engine.js');
// 브라우저: <script src="web/engine.js"></script> 로 불러온 뒤
// await RequestEngine.ready; RequestEngine.classify('요구내용');
// 브라우저에서는 프로젝트 루트를 제공하는 웹 서버를 사용한다.
(function () {
  'use strict';

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(field); field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        row.push(field);
        if (row.some(value => value.trim())) rows.push(row);
        row = []; field = '';
        if (char === '\r' && text[i + 1] === '\n') i++;
      } else field += char;
    }
    if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
    if (field || row.length) { row.push(field); rows.push(row); }
    const header = rows.shift();
    if (!header) throw new Error('CSV 머리글이 없습니다.');
    return rows.map((values, index) => {
      if (values.length !== header.length) throw new Error(`CSV ${index + 2}행의 열 수가 다릅니다.`);
      return Object.fromEntries(header.map((key, i) => [key.trim(), values[i].trim()]));
    });
  }

  let rules;
  function initialize(ruleText, orgText) {
    const org = parseCsv(orgText);
    if (!org.length || org.some(row => !row['과'])) throw new Error('조직도의 과 열을 확인하세요.');
    const departments = new Set(org.map(row => row['과']));
    const parsed = parseCsv(ruleText);
    rules = parsed.map(row => {
      if (!['과', '키워드', '제외어', '우선순위'].every(key => key in row)
          || !row['키워드'] || row['우선순위'] === '' || !Number.isFinite(Number(row['우선순위']))) {
        throw new Error('배분기준표의 필수 열과 우선순위를 확인하세요.');
      }
      return { department: row['과'], keyword: row['키워드'],
        exclusions: row['제외어'].split('|').map(value => value.trim()).filter(Boolean),
        priority: Number(row['우선순위']) };
    }).filter(rule => departments.has(rule.department));
  }

  function classify(text) {
    if (!rules) throw new Error('먼저 RequestEngine.ready 완료를 기다려 주세요.');
    if (typeof text !== 'string') throw new TypeError('요구내용은 문자열이어야 합니다.');
    const candidates = new Map();
    for (const rule of rules) {
      if (!text.includes(rule.keyword) || rule.exclusions.some(word => text.includes(word))) continue;
      const score = rule.priority + Array.from(rule.keyword).length / 10;
      const candidate = candidates.get(rule.department) || { 과: rule.department, 점수: -Infinity, 근거키워드: [] };
      // 같은 과의 점수는 합산하지 않고 가장 높은 규칙 점수를 사용한다.
      candidate['점수'] = Math.max(candidate['점수'], score);
      if (!candidate['근거키워드'].includes(rule.keyword)) candidate['근거키워드'].push(rule.keyword);
      candidates.set(rule.department, candidate);
    }
    // 동점은 CSV에서 먼저 일치한 과 순서로 표시한다. 최종 배분은 사람이 판단한다.
    return [...candidates.values()].sort((a, b) => b['점수'] - a['점수']).slice(0, 3);
  }

  if (typeof module !== 'undefined' && module.exports) {
    const fs = require('node:fs');
    const path = require('node:path');
    const read = name => fs.readFileSync(path.join(__dirname, 'data', name), 'utf8');
    initialize(read('rules_보강.csv'), read('A부_조직도_26개과.csv'));
    module.exports = { classify, parseCsv, ready: Promise.resolve() };
  } else {
    const script = document.currentScript;
    const base = new URL(script.dataset?.dataBase || './data/', script.src);
    const read = async name => {
      const response = await fetch(new URL(name, base));
      if (!response.ok) throw new Error(`CSV 읽기 실패: ${name} (${response.status})`);
      return response.text();
    };
    const ready = Promise.all([read(script.dataset?.rules || 'rules_보강.csv'), read('A부_조직도_26개과.csv')])
      .then(([ruleText, orgText]) => initialize(ruleText, orgText));
    globalThis.RequestEngine = { classify, ready };
  }
})();

