#!/usr/bin/env bash
set -euo pipefail

BASE="https://api.wifipool.eu/native_mobile"
EMAIL="${EMAIL:-you@example.com}"
PASSWORD="${PASSWORD:-changeme}"

echo "[1] Login…"
curl -sS -X POST "$BASE/users/login"   -H "Content-Type: application/json"   -d "{"email":"$EMAIL","password":"$PASSWORD","namespace":"default"}"   -c cookie.txt > /dev/null

echo "[2] Get groups…"
curl -sS "$BASE/groups/accessible" -b cookie.txt > groups.json
echo "Saved groups.json"

echo "[3] (Inspect groups.json to find your domain id)"
DOMAIN="${DOMAIN:-REPLACE_WITH_YOUR_DOMAIN_UUID}"

echo "[4] Get group info…"
curl -sS -X POST "$BASE/groups/getInfo"   -H "Content-Type: application/json"   -b cookie.txt   -d "{"domainId":"$DOMAIN"}" > group_info.json
echo "Saved group_info.json"

echo "[5] Read stats for one IO…"
IO="${IO:-REPLACE_WITH_DEVICEUUID.PORT}" # e.g. 6f6a...55ab.o4
curl -sS -X POST "$BASE/harmopool/getStats"   -H "Content-Type: application/json"   -b cookie.txt   -d "{"domain":"$DOMAIN","io":"$IO","after":0}" > stats.json
echo "Saved stats.json"
