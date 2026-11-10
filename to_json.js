// 조직도 CSV를 읽어 실국·과·대표키워드만 JSON 배열로 저장한다.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      row.push(field);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV의 닫히지 않은 따옴표를 확인하세요.');
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

async function main() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = path.dirname(path.resolve(process.argv[1]));
  const input = path.join(root, 'data', 'A부_조직도_26개과.csv');
  const output = path.join(root, 'org.json');
  const [header, ...rows] = parseCsv(await fs.readFile(input, 'utf8'));
  const keys = ['실국', '과', '대표키워드'];
  const indexes = keys.map(key => header?.indexOf(key) ?? -1);
  if (indexes.includes(-1)) throw new Error('필수 열(실국, 과, 대표키워드)이 없습니다.');
  const org = rows.map((row, index) => {
    if (row.length !== header.length) {
      throw new Error(`CSV ${index + 2}번째 행의 열 수가 맞지 않습니다.`);
    }
    return {
      실국: row[indexes[0]].trim(),
      과: row[indexes[1]].trim(),
      대표키워드: row[indexes[2]].split('|').map(value => value.trim()).filter(Boolean),
    };
  });
  await fs.writeFile(output, JSON.stringify(org, null, 2) + '\n', 'utf8');
  console.log(`원소 수: ${org.length}`);
  console.log('첫 원소:');
  console.log(JSON.stringify(org[0] ?? null, null, 2));
}

main().catch(error => {
  console.error(`변환 실패: ${error.message}`);
  process.exitCode = 1;
});
