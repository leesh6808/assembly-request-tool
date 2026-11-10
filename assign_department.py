import csv
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ORG_PATH = DATA_DIR / "A부_조직도_26개과.csv"
RULE_PATH = DATA_DIR / "배분기준표_소관키워드_304건.csv"
TEST_PATH = DATA_DIR / "시험_요구문항_40건.csv"
NEEDS_CHECK = "확인필요"


def _read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def _split_terms(value):
    return [term.strip() for term in (value or "").split("|") if term.strip()]


def _load_departments():
    rows = _read_csv(ORG_PATH)
    return {row["과"].strip() for row in rows if row.get("과")}


def _load_rules():
    departments = _load_departments()
    rules = []

    for row in _read_csv(RULE_PATH):
        department = row["과"].strip()
        if department not in departments:
            continue

        rules.append(
            {
                "rule_id": row["rule_id"].strip(),
                "유형": row["유형"].strip(),
                "과": department,
                "키워드": row["키워드"].strip(),
                "제외어": _split_terms(row.get("제외어", "")),
                "우선순위": int(row["우선순위"]),
            }
        )

    return rules


RULES = _load_rules()
BOILERPLATE_PHRASES = (
    "추진 실적 및 예산 집행 내역 일체",
    "관련 언론 보도에 대한 부처 입장 및 사실관계",
    "성과지표 달성도와 미달 사유",
)


def _focus_text(text):
    focused = text
    for phrase in BOILERPLATE_PHRASES:
        focused = focused.replace(phrase, " ")
    return " ".join(focused.split())


def _drop_less_specific_matches(matches):
    specific_matches = []
    keywords = [rule["키워드"] for rule in matches]

    for rule in matches:
        keyword = rule["키워드"]
        has_more_specific_keyword = any(
            keyword != other and keyword in other for other in keywords
        )
        if not has_more_specific_keyword:
            specific_matches.append(rule)

    return specific_matches


def 추천_소관과(요구내용):
    """요구 문항 1건의 소관 과 후보를 배분기준표 기준으로 추천한다."""
    text = _focus_text((요구내용 or "").strip())
    matches = []

    for rule in RULES:
        if rule["키워드"] not in text:
            continue
        if any(excluded in text for excluded in rule["제외어"]):
            continue
        matches.append(rule)

    matches = _drop_less_specific_matches(matches)

    if not matches:
        return {
            "추천과": NEEDS_CHECK,
            "후보": [],
            "상태": NEEDS_CHECK,
            "근거": "배분기준표에서 맞는 키워드를 찾지 못함",
        }

    highest = max(rule["우선순위"] for rule in matches)
    top_rules = [rule for rule in matches if rule["우선순위"] == highest]
    departments = []
    for rule in top_rules:
        if rule["과"] not in departments:
            departments.append(rule["과"])

    if len(departments) != 1:
        return {
            "추천과": NEEDS_CHECK,
            "후보": departments,
            "상태": NEEDS_CHECK,
            "근거": f"우선순위 {highest} 동순위: {', '.join(departments)}",
        }

    top_department = departments[0]
    basis = [
        f"{rule['rule_id']}:{rule['키워드']}"
        for rule in top_rules
        if rule["과"] == top_department
    ]
    candidates = _make_candidates(matches)

    return {
        "추천과": top_department,
        "후보": candidates,
        "상태": "추천",
        "근거": f"우선순위 {highest}, 키워드 {'/'.join(basis)}",
    }


def _make_candidates(matches):
    scored = {}
    for rule in matches:
        department = rule["과"]
        current = scored.get(department)
        score = (rule["우선순위"], len(rule["키워드"]))
        if current is None or score > current["score"]:
            scored[department] = {"score": score, "department": department}

    ordered = sorted(
        scored.values(),
        key=lambda item: (-item["score"][0], -item["score"][1], item["department"]),
    )
    return [item["department"] for item in ordered[:3]]


def 시험하기():
    rows = _read_csv(TEST_PATH)
    correct = 0
    results = []

    for row in rows:
        expected = row["정답_배분과"].strip()
        result = 추천_소관과(row["요구내용"])
        predicted = result["추천과"]
        is_correct = predicted == expected
        correct += int(is_correct)
        results.append(
            {
                "시험번호": row["시험번호"],
                "정답": expected,
                "추천": predicted,
                "정답여부": is_correct,
                "근거": result["근거"],
            }
        )

    return correct, len(rows), results


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    correct_count, total_count, test_results = 시험하기()
    print(f"파일: {Path(__file__).name}")
    print(f"1순위 정답 수: {correct_count}/{total_count}")
    for item in test_results:
        mark = "O" if item["정답여부"] else "X"
        print(
            f"{item['시험번호']} {mark} "
            f"추천={item['추천']} 정답={item['정답']} 근거={item['근거']}"
        )
