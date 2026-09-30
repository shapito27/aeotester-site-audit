#!/usr/bin/env bash
# Copies the sample fixture site into the eval workspace (the current directory)
set -euo pipefail
cp -R "$(cd "$(dirname "$0")/../../tests/fixtures/sample-site" && pwd)/." .
