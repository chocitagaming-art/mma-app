#!/usr/bin/env bash
#
# Opt-in helper: crea un commit usando la identidad del dueño del repo
# (chocitagaming-art) para que Vercel Hobby acepte el deploy.
#
# Vercel Hobby rechaza el deploy si el autor del commit no es el dueño del repo.
# Este script solo añade el flag --author; tu config global de git no se toca.
#
# Uso:
#   ./scripts/commit.sh -m "tu mensaje"
#   ./scripts/commit.sh -m "tu mensaje" path/al/archivo.ts
#
# Ver CONTRIBUTING.md para más detalles.
set -euo pipefail

DEPLOY_AUTHOR="chocitagaming-art <285652576+chocitagaming-art@users.noreply.github.com>"

git commit --author="$DEPLOY_AUTHOR" "$@"
