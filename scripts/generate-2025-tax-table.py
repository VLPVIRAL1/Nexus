#!/usr/bin/env python3
"""Generate the 2025 tax-table registry from the archived IRS 1040 instructions.

This developer tool is intentionally not part of runtime calculation. The generated
JSON is reviewed and committed so calculations never fetch mutable IRS content.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


EXPECTED_BANDS = [(0, 5), (5, 15), (15, 25)]
EXPECTED_BANDS += [(value, value + 25) for value in range(25, 3000, 25)]
EXPECTED_BANDS += [(value, value + 50) for value in range(3000, 100000, 50)]


def extract_rows(pdf_path: Path) -> list[list[int]]:
    text = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    start = text.index("2025                                             See the instructions")
    end = text.index("2025 Tax Computation Worksheet")
    rows: dict[tuple[int, int], list[int]] = {}

    for line in text[start:end].splitlines():
        numbers = [int(value.replace(",", "")) for value in re.findall(r"(?<![A-Za-z])\d[\d,]*", line)]
        for offset in range(0, len(numbers) - 5, 6):
            lower, upper, *taxes = numbers[offset : offset + 6]
            if 0 <= lower < 100000 and upper - lower in {5, 10, 25, 50} and all(tax >= 0 for tax in taxes):
                rows[(lower, upper)] = taxes

    # pdftotext splits these two narrow bands over several visual lines.
    rows[(5, 15)] = [1, 1, 1, 1]
    rows[(15, 25)] = [2, 2, 2, 2]

    missing = [band for band in EXPECTED_BANDS if band not in rows]
    extras = [band for band in rows if band not in EXPECTED_BANDS]
    if missing or extras:
        raise RuntimeError(f"tax table is not contiguous; missing={missing}, extras={extras}")

    return [[lower, upper, *rows[(lower, upper)]] for lower, upper in EXPECTED_BANDS]


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate-2025-tax-table.py IRS_1040_INSTRUCTIONS.pdf OUTPUT.json")
    source, output = map(Path, sys.argv[1:])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(extract_rows(source), separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
