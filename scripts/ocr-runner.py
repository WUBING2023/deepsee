#!/usr/bin/env python3
"""Normalize supported OCR engines to one small stdout protocol."""

import json
import os
import sys


MARKER = "__DEEPSEE_OCR__"


def nested_texts(value):
    if isinstance(value, str):
        try:
            return nested_texts(json.loads(value))
        except Exception:
            return []
    if isinstance(value, dict):
        for key in ("rec_texts", "texts", "txts"):
            texts = value.get(key)
            if isinstance(texts, (list, tuple)):
                return [str(item).strip() for item in texts if str(item).strip()]
        for item in value.values():
            texts = nested_texts(item)
            if texts:
                return texts
    if isinstance(value, (list, tuple)):
        for item in value:
            texts = nested_texts(item)
            if texts:
                return texts
    return []


def paddle_texts(path):
    from paddleocr import PaddleOCR

    engine = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
        engine="paddle",
    )
    if path is None:
        return []
    texts = []
    for result in engine.predict(path):
        candidates = [result]
        for attribute in ("json", "res"):
            candidate = getattr(result, attribute, None)
            if callable(candidate):
                try:
                    candidate = candidate()
                except TypeError:
                    candidate = None
            if candidate is not None:
                candidates.append(candidate)
        for candidate in candidates:
            found = nested_texts(candidate)
            if found:
                texts.extend(found)
                break
    return texts


def rapid_texts(path):
    from rapidocr import RapidOCR

    engine = RapidOCR()
    if path is None:
        return []
    result = engine(path)
    return [str(item).strip() for item in (getattr(result, "txts", None) or []) if str(item).strip()]


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: ocr-runner.py <paddleocr|rapidocr> <image|--probe>")
    tool = sys.argv[1].strip().lower()
    input_path = None if sys.argv[2] == "--probe" else os.path.abspath(sys.argv[2])
    if input_path is not None and not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)
    if tool == "paddleocr":
        texts = paddle_texts(input_path)
    elif tool == "rapidocr":
        texts = rapid_texts(input_path)
    else:
        raise ValueError(f"unsupported OCR tool: {tool}")
    print(MARKER + json.dumps({"texts": texts}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
