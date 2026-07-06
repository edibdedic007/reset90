#!/usr/bin/env bash
set -euo pipefail

echo "Running pre-commit checks"
make check

echo "Pre-commit checks passed"
