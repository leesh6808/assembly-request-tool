"""요구서 PDF를 문항으로 나누고 원문과 대조한다. 외부 패키지는 pypdf만 사용한다."""

import csv
import hashlib
import json
import re
from datetime import date
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
FIELDS = ['파일명', '위원회', '의원', '제출기한', '문항번호', '요구내용', '세부항목', '비고']


def parse_pdf(path):
    """페이지 사이에도 현재 문항과 항목을 유지한다."""
    lines = [line.strip() for page in PdfReader(path).pages
             for line in (page.extract_text() or '').splitlines() if line.strip()]
    header = re.fullmatch(r'(.+위원회)\s+(.+?)\s+의원실\s+자료요구서', lines[0])
    if not header:
        raise ValueError(f'{path.name}: 첫 줄의 위원회·의원을 확인할 수 없습니다.')
    deadlines = [re.search(r'제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.', line)
                 for line in lines if line.startswith('수신:')]
    deadlines = [m for m in deadlines if m]
    if len(deadlines) != 1:
        raise ValueError(f'{path.name}: 제출기한을 확인할 수 없습니다.')
    deadline = date(*map(int, deadlines[0].groups())).isoformat()
    metadata = dict(zip(FIELDS[:4], [path.name, *header.groups(), deadline]))
    rows, source_blocks = [], []
    current, field = None, None
    for line in lines[1:]:
        if line.startswith(('수신:', '담당 보좌관:', '끝.')):
            continue
        number = re.match(r'^(\d+)\.\s*(.*)$', line)
        if number:
            current = {**metadata, '문항번호': number[1], '요구내용': number[2],
                       '세부항목': '', '비고': ''}
            rows.append(current)
            source_blocks.append([line])
            field = '요구내용'
        elif current is None:
            raise ValueError(f'{path.name}: 첫 문항 앞에 분류되지 않은 줄이 있습니다.')
        else:
            source_blocks[-1].append(line)
            if re.match(r'^[가-힣]\.\s*', line):
                field = '세부항목'
                current[field] += ('\n' if current[field] else '') + line
            elif line.startswith('※'):
                field = '비고'
                current[field] += ('\n' if current[field] else '') + line
            else:
                current[field] += (' ' if current[field] else '') + line
    return rows, source_blocks


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def format_row(row):
    """교체된 문항목록의 세부항목 구분자와 비고 표기를 적용한다."""
    return {**row,
            '세부항목': ' / '.join(row['세부항목'].splitlines()),
            '비고': ' / '.join(line.removeprefix('※').strip()
                            for line in row['비고'].splitlines())}


def main():
    output = ROOT / 'data' / '문항목록.csv'
    if output.exists():
        raise FileExistsError('기존 문항목록.csv는 덮어쓰지 않습니다. 별도로 보관한 뒤 실행하세요.')
    pdfs = sorted((ROOT / '원문').glob('*.pdf'))
    if not pdfs:
        raise ValueError('원문 폴더에 PDF가 없습니다.')
    protected = pdfs + [p for p in (ROOT / 'data').iterdir() if p.is_file()]
    before = {p: digest(p) for p in protected}
    all_rows, checks, examples = [], [], []
    for path in pdfs:
        rows, blocks = parse_pdf(path)
        expected_match = re.search(r'_(\d+)문항\.pdf$', path.name)
        if not expected_match:
            raise ValueError(f'{path.name}: 파일명에 문항 수가 없습니다.')
        expected = int(expected_match[1])
        numbers = [int(row['문항번호']) for row in rows]
        continuous = numbers == list(range(1, len(rows) + 1))
        last = numbers[-1] if numbers else None
        matched = continuous and len(rows) == expected and last == expected
        checks.append([path.name, expected, len(rows), last,
                       'O' if continuous else 'X', 'O' if matched else 'X'])
        # 원문 문항 블록과 저장 필드를 공백 차이만 제외하고 전수 대조한다.
        for row, block in zip(rows, blocks):
            rebuilt = f"{row['문항번호']}. {row['요구내용']} {row['세부항목']} {row['비고']}"
            if re.sub(r'\s+', '', rebuilt) != re.sub(r'\s+', '', '\n'.join(block)):
                raise ValueError(f"{path.name} {row['문항번호']}번: 원문과 필드 내용이 다릅니다.")
        if not matched:
            raise ValueError(f'{path.name}: 문항 수·마지막 번호·연속성 불일치: {checks[-1]}')
        # 원문 대조를 마친 뒤 표시 형식만 바꾼다.
        rows = [format_row(row) for row in rows]
        example = next(((r, b) for r, b in zip(rows, blocks)
                        if r['세부항목'] and r['비고']), None)
        if example:
            examples.append({'원문': '\n'.join(example[1]), '추출': example[0]})
        all_rows.extend(rows)
    with output.open('x', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)
    with output.open(encoding='utf-8-sig', newline='') as stream:
        if list(csv.DictReader(stream)) != all_rows:
            raise ValueError('CSV 재읽기 검증에 실패했습니다.')
    if not output.read_bytes().startswith(b'\xef\xbb\xbf'):
        raise ValueError('CSV 인코딩 검증에 실패했습니다.')
    if any(digest(p) != original for p, original in before.items()):
        raise ValueError('원본 파일 변경이 감지됐습니다.')
    print('파일명 | 파일명의 문항 수 | 뽑은 문항 수 | 마지막 번호 | 번호 연속 | 일치(O/X)')
    for check in checks:
        print(' | '.join(map(str, check)))
    print(f'총 {len(all_rows)}문항. 원문 전수 대조·CSV 재읽기·원본 보존 검증 통과.')
    print(json.dumps(examples, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
