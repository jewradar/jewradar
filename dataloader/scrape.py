#!/usr/bin/env python3
"""
Scrape face images of Jewish / Israeli people from Wikidata + Wikimedia Commons.
Filters out non-face images using OpenCV's Haar cascade.
"""

import os
import sys
import time
import json
import hashlib
import requests
import cv2
import numpy as np
from pathlib import Path
from urllib.parse import unquote, quote
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).parent / "dataset"
CROP_SIZE = (256, 256)
MIN_FACE_SIZE = (60, 60)
REQUEST_DELAY = 0.1
USER_AGENT = "JewRadarBot/1.0 (academic research; face dataset)"

# Oxylabs residential proxy — rotates IP each request
PROXY_URL = "http://customer-manual_v7L00:asdf7e2hlAk13+@pr.oxylabs.io:7777"
PROXIES = {
    "http": PROXY_URL,
    "https": PROXY_URL,
}

# Queries: label -> SPARQL WHERE clause fragment
# We combine multiple sources to get enough images
QUERIES = {
    "ashkenazi": {
        "sparql": """
            ?person wdt:P31 wd:Q5 .
            ?person wdt:P172 wd:Q34069 .
            ?person wdt:P18 ?image .
        """,
        "limit": 500,
    },
    "jewish": {
        # Jewish people by ethnic group OR religion, excluding Ashkenazi (already covered)
        "sparql": """
            ?person wdt:P31 wd:Q5 .
            { ?person wdt:P172 wd:Q7325 . } UNION { ?person wdt:P140 wd:Q9268 . }
            ?person wdt:P18 ?image .
            FILTER NOT EXISTS { ?person wdt:P172 wd:Q34069 . }
        """,
        "limit": 1500,
    },
    "israeli": {
        # Israeli citizens (not already tagged Jewish/Ashkenazi) - likely Jewish but also Arab/Druze
        "sparql": """
            ?person wdt:P31 wd:Q5 .
            ?person wdt:P27 wd:Q801 .
            ?person wdt:P18 ?image .
            FILTER NOT EXISTS { ?person wdt:P172 wd:Q34069 . }
            FILTER NOT EXISTS { ?person wdt:P172 wd:Q7325 . }
            FILTER NOT EXISTS { ?person wdt:P140 wd:Q9268 . }
        """,
        "limit": 1500,
    },
}

# Load OpenCV face detector
CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
face_cascade = cv2.CascadeClassifier(CASCADE_PATH)
face_detect_lock = threading.Lock()  # Haar cascade is not thread-safe

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def query_wikidata(where_clause: str, limit: int) -> list[dict]:
    """Query Wikidata for people with images."""
    sparql = f"""
    SELECT DISTINCT ?person ?personLabel ?image WHERE {{
      {where_clause}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT {limit}
    """
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": USER_AGENT,
    }
    resp = requests.get(WIKIDATA_SPARQL, params={"query": sparql}, headers=headers, timeout=120)
    resp.raise_for_status()
    results = resp.json()["results"]["bindings"]
    out = []
    for r in results:
        out.append({
            "qid": r["person"]["value"].split("/")[-1],
            "name": r["personLabel"]["value"],
            "image_url": r["image"]["value"],
        })
    return out


def download_image(url: str, retries: int = 3) -> np.ndarray | None:
    """Download image via proxy. Rotates IP each request so no rate limits."""
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, proxies=PROXIES,
                                timeout=30, allow_redirects=True)
            if resp.status_code == 429:
                time.sleep(2)
                continue
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "")
            if "image" not in ct and "octet" not in ct:
                return None
            arr = np.frombuffer(resp.content, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            return img
        except requests.exceptions.HTTPError:
            return None
        except Exception:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return None
    return None


def detect_and_crop_face(img: np.ndarray) -> np.ndarray | None:
    """Detect largest face, crop with margin, resize."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    with face_detect_lock:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=MIN_FACE_SIZE,
        )
    if len(faces) == 0:
        return None

    # Take the largest face
    areas = [w * h for (x, y, w, h) in faces]
    idx = np.argmax(areas)
    x, y, w, h = faces[idx]

    # Add margin (25%)
    margin = 0.25
    img_h, img_w = img.shape[:2]
    x1 = max(0, int(x - w * margin))
    y1 = max(0, int(y - h * margin))
    x2 = min(img_w, int(x + w * (1 + margin)))
    y2 = min(img_h, int(y + h * (1 + margin)))

    crop = img[y1:y2, x1:x2]
    resized = cv2.resize(crop, CROP_SIZE, interpolation=cv2.INTER_AREA)
    return resized


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    total_saved = 0
    seen_qids = set()
    stats = {}

    for label, cfg in QUERIES.items():
        group_dir = DATA_DIR / label
        group_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n{'='*60}")
        print(f"Querying Wikidata for: {label}")
        print(f"{'='*60}")

        people = query_wikidata(cfg["sparql"], cfg["limit"])
        # Deduplicate across groups
        people = [p for p in people if p["qid"] not in seen_qids]
        for p in people:
            seen_qids.add(p["qid"])

        print(f"  Found {len(people)} people with images")

        saved = 0
        skipped_no_face = 0
        skipped_download = 0
        lock = threading.Lock()

        def process_person(person):
            """Download, detect face, save. Returns (status, person)."""
            out_path = group_dir / f"{person['qid']}.jpg"
            if out_path.exists():
                return "exists", person

            img = download_image(person["image_url"])
            if img is None:
                return "dl_fail", person

            face = detect_and_crop_face(img)
            if face is None:
                return "no_face", person

            cv2.imwrite(str(out_path), face)
            return "saved", person

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(process_person, p): p for p in people}
            done_count = 0
            for future in as_completed(futures):
                status, person = future.result()
                done_count += 1
                with lock:
                    if status == "exists" or status == "saved":
                        saved += 1
                        total_saved += 1
                    elif status == "no_face":
                        skipped_no_face += 1
                    elif status == "dl_fail":
                        skipped_download += 1

                    if done_count % 50 == 0:
                        print(f"  [{done_count}/{len(people)}] saved={saved}, no_face={skipped_no_face}, dl_fail={skipped_download}")

        stats[label] = {"saved": saved, "no_face": skipped_no_face, "dl_fail": skipped_download, "total": len(people)}
        print(f"  Done: {saved} faces saved for {label}")

    print(f"\n{'='*60}")
    print(f"TOTAL: {total_saved} face images saved to {DATA_DIR}")
    print(f"{'='*60}")
    for label, s in stats.items():
        print(f"  {label}: {s['saved']} saved / {s['total']} queried  (no_face={s['no_face']}, dl_fail={s['dl_fail']})")


if __name__ == "__main__":
    main()
