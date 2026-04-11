#!/usr/bin/env python3
"""Migration: Add clip_attributes table for content tagging (v0.7.5 analytics)."""

import os, re, sys, urllib.request, urllib.error, json

# ── Load env ──────────────────────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), ".env.local")
raw = open(env_path).read()

m_url   = re.search(r'TURSO_DATABASE_URL=["\']?([^"\'\n]+)["\']?', raw)
m_token = re.search(r'TURSO_AUTH_TOKEN=["\']?([^"\'\n]+)["\']?', raw)

if not m_url or not m_token:
    sys.exit("❌  Could not find TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local")

db_url = m_url.group(1).strip().strip("\"'").replace("\\n", "").replace("libsql://", "https://").strip()
token  = m_token.group(1).strip().strip("\"'").replace("\\n", "").strip()
api    = f"{db_url}/v2/pipeline"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def run(sql: str, args=None) -> dict:
    body = json.dumps({
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": args or []}},
            {"type": "close"},
        ]
    }).encode()
    req = urllib.request.Request(api, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"❌  HTTP {e.code}: {e.read().decode()}")
    result = data["results"][0]
    if result["type"] == "error":
        sys.exit(f"❌  SQL error: {result['error']['message']}")
    return result


# ── Migration SQL ─────────────────────────────────────────────────────────────
statements = [
    # clip_attributes: one row per clip, stores structured content tags
    """
    CREATE TABLE IF NOT EXISTS clip_attributes (
      video_id            TEXT PRIMARY KEY,
      guest               TEXT,
      topic               TEXT,
      hook_type           TEXT,
      content_angle       TEXT,
      clip_length_bucket  TEXT,
      cta_type            TEXT,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by_id       TEXT,
      updated_by_name     TEXT
    )
    """,
    # Index for analytics queries grouping by attribute
    "CREATE INDEX IF NOT EXISTS idx_clip_attrs_topic       ON clip_attributes(topic)",
    "CREATE INDEX IF NOT EXISTS idx_clip_attrs_hook        ON clip_attributes(hook_type)",
    "CREATE INDEX IF NOT EXISTS idx_clip_attrs_angle       ON clip_attributes(content_angle)",
    "CREATE INDEX IF NOT EXISTS idx_clip_attrs_length      ON clip_attributes(clip_length_bucket)",
]

print("Running clip_attributes migration…")
for stmt in statements:
    s = stmt.strip()
    if not s:
        continue
    label = s.split("\n")[0][:70]
    run(s)
    print(f"  ✓  {label}")

print("\n✅  clip_attributes migration complete.")
