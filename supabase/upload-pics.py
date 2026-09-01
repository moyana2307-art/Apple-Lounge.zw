#!/usr/bin/env python3
"""Upload frontend/public/Pics into the Supabase product-images bucket."""
from __future__ import annotations

import json
import mimetypes
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_REF = "zirftywinscopzuuwdlg"
BUCKET = "product-images"
PICS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "Pics"


def api_keys():
    raw = subprocess.check_output(
        ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json"],
        stderr=subprocess.DEVNULL,
        text=True,
    )
    items = json.loads(raw)
    anon = next((k["api_key"] for k in items if k.get("id") == "anon"), None)
    service = next((k["api_key"] for k in items if k.get("id") == "service_role"), None)
    if not anon:
        anon = next((k["api_key"] for k in items if k.get("type") == "publishable"), None)
    if not service:
        service = next((k["api_key"] for k in items if k.get("type") == "secret"), None)
    if not anon or not service:
        raise RuntimeError("Could not find Supabase API keys for this project")
    return anon, service


def request(method, url, headers, data=None):
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    if not PICS.is_dir():
        print(f"Missing image folder: {PICS}", file=sys.stderr)
        sys.exit(1)

    anon, service = api_keys()
    base = f"https://{PROJECT_REF}.supabase.co"
    auth = {
        "apikey": service,
        "Authorization": f"Bearer {service}",
    }

    status, body = request(
        "POST",
        f"{base}/storage/v1/bucket",
        {**auth, "Content-Type": "application/json"},
        json.dumps({"id": BUCKET, "name": BUCKET, "public": True, "fileSizeLimit": 10485760}).encode(),
    )
    if status in (200, 201):
        print("Created public bucket product-images")
    elif status == 409 or (status == 400 and b"already exists" in body.lower()):
        print("Bucket product-images already exists")
        request(
            "PUT",
            f"{base}/storage/v1/bucket/{BUCKET}",
            {**auth, "Content-Type": "application/json"},
            json.dumps({"public": True}).encode(),
        )
    else:
        print(f"Bucket create status {status}: {body[:300]!r}")

    files = sorted(p for p in PICS.iterdir() if p.is_file() and not p.name.startswith("."))
    uploaded = 0
    failed = []
    for path in files:
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        object_url = f"{base}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path.name)}"
        status, body = request(
            "POST",
            object_url,
            {
                **auth,
                "Content-Type": mime,
                "x-upsert": "true",
            },
            path.read_bytes(),
        )
        if status in (200, 201):
            uploaded += 1
            print(f"OK  {path.name}")
        else:
            failed.append(path.name)
            print(f"FAIL {path.name} ({status}) {body[:120]!r}")

    print(f"\nUploaded {uploaded}/{len(files)} images to {BUCKET}")
    if failed:
        sys.exit(1)

    print(f"Public base: {base}/storage/v1/object/public/{BUCKET}/")


if __name__ == "__main__":
    main()
