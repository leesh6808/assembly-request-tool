// split.py와 같은 문항 분해 및 교체 CSV 표시 규칙.
(function (root) {
  'use strict';
  const fields = ['파일명','위원회','의원','제출기한','문항번호','요구내용','세부항목','비고'];
  function validate(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (fields.some(key => !(key in row)) || !row['요구내용'] || !row['파일명'] || !row['위원회'] || !row['의원']) throw Error('필수 문항 정보가 없습니다.');
      const day = row['제출기한'];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) throw Error('제출기한 날짜를 확인하세요.');
      if (!groups.has(row['파일명'])) groups.set(row['파일명'], []);
      groups.get(row['파일명']).push(row);
    }
    if (!rows.length) throw Error('읽을 수 있는 문항이 없습니다.');
    return [...groups].map(([name, items]) => {
      const numbers = items.map(row => Number(row['문항번호']));
      const expected = name.match(/_(\d+)문항\.pdf$/i)?.[1];
      const continuous = numbers.every((n, i) => n === i + 1);
      const matched = continuous && (expected === undefined || Number(expected) === items.length);
      if (!matched) throw Error(`${name}: 문항 개수 또는 번호 연속성이 맞지 않습니다.`);
      return { 파일명: name, 예상: expected ?? '표기 없음', 추출: items.length, 마지막번호: numbers.at(-1), 번호연속: 'O', 일치: expected ? 'O' : '개수 직접 확인' };
    });
  }
  function splitText(text, filename) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const header = lines[0]?.match(/^(.+위원회)\s+(.+?)\s+의원실\s+자료요구서$/);
    if (!header) throw Error(`${filename}: 첫 줄에서 위원회·의원을 찾지 못했습니다.`);
    const deadlines = lines.filter(line => line.startsWith('수신:')).map(line => line.match(/제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./)).filter(Boolean);
    if (deadlines.length !== 1) throw Error(`${filename}: 제출기한을 확인하세요.`);
    const d = deadlines[0];
    const deadline = `${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`;
    const rows = []; let current, field;
    for (const line of lines.slice(1)) {
      if (/^(수신:|담당 보좌관:|끝\.)/.test(line)) continue;
      const number = line.match(/^(\d+)\.\s*(.*)$/);
      if (number) {
        current = { 파일명: filename, 위원회: header[1], 의원: header[2], 제출기한: deadline, 문항번호: number[1], 요구내용: number[2], 세부항목: '', 비고: '' };
        rows.push(current); field = '요구내용';
      } else {
        if (!current) throw Error(`${filename}: 첫 문항 앞의 내용을 확인하세요.`);
        if (/^[가-힣]\.\s*/.test(line)) { field = '세부항목'; current[field] += (current[field] ? ' / ' : '') + line; }
        else if (line.startsWith('※')) { field = '비고'; current[field] += (current[field] ? ' / ' : '') + line.slice(1).trim(); }
        else current[field] += (current[field] ? ' ' : '') + line;
      }
    }
    validate(rows); return rows;
  }
  async function readPdf(file, progress = () => {}) {
    const pdfjs = await import('./lib/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.mjs', document.baseURI).href;
    const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), cMapUrl: new URL('./lib/cmaps/',document.baseURI).href, cMapPacked:true, standardFontDataUrl:new URL('./lib/standard_fonts/',document.baseURI).href, wasmUrl:new URL('./lib/wasm/',document.baseURI).href});
    const pdf = await task.promise;
    const pages = [];
    try {
      for (let i=1;i<=pdf.numPages;i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        const lines=[]; let line='', y=null;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const nextY=item.transform[5];
          if (y!==null && Math.abs(nextY-y)>2 && line) {lines.push(line);line='';}
          line+=item.str; y=nextY;
          if(item.hasEOL){lines.push(line);line='';y=null;}
        }
        if(line)lines.push(line);
        pages.push(lines.join('\n')); progress(i,pdf.numPages);
      }
      return splitText(pages.join('\n'),file.name);
    } finally {await task.destroy();}
  }
  const api={fields,validate,splitText,readPdf};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RequestSplit=api;
})(globalThis);
