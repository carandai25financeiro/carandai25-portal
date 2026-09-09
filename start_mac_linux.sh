#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 ou superior nao encontrado."
  exit 1
fi
echo "Carandai 25 - Portal da Marca: http://localhost:3000"
node server.js
