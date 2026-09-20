#!/usr/bin/env bash
#
# Banco de pruebas del paso de espera de .github/workflows/smoke-prod.yml.
#
# POR QUÉ EXISTE (20-sep-2026). Ese paso decide, en cada push, si producción
# está rota o si el despliegue solo va lento. Se equivoca de dos formas y las
# dos son caras:
#
#   - Gritar de más: cada Issue de "Producción rota" amordaza el canal de
#     correo hasta el siguiente verde, porque GitHub manda email al ABRIR y no
#     al comentar. El #21 estuvo 56 horas abierto y DOS roturas reales llegaron
#     como comentarios mudos.
#   - Callarse de más: un despliegue que falla de verdad (15-ago, `74d6f48`)
#     deja el dominio sirviendo el commit ANTERIOR, sano y mintiendo.
#
# Y no se puede probar en producción: haría falta tirar la web para ver si
# avisa. Así que se prueba aquí, con `curl`, `gh`, `sleep` y `date` simulados.
#
# LO QUE CAZÓ ESTE BANCO, y por eso no es decorativo:
#   - Que decidir con `/api/health` superficial dejaba una portada caída 8
#     minutos en VERDE (esa rama devuelve ok:true sin tocar nada). Escenarios
#     3, 4 y 13.
#   - Que tratar igual "no hay despliegues" y "no he podido preguntar"
#     convertía un hipo de la API de GitHub en un aviso de producción rota.
#     Escenario 14.
#
# CÓMO SE USA:
#   bash scripts/pruebas-smoke.sh          # los 15 escenarios
#   VERBOSE=1 bash scripts/pruebas-smoke.sh # además, el veredicto de cada uno
#
# Sale con 0 si los 15 dan el color que deben, y con 1 en cuanto uno falle
# diciendo cuál y qué esperaba. NO toca la red, NO toca el repo y NO necesita
# credenciales: los stubs interceptan todo.
#
# 🪤 No lo engancha el megatest. Es una decisión, no un olvido: el megatest
# corre en Windows desde npm y esto es bash. Si algún día se engancha, que sea
# como puerta contada, no como un `|| true` al final de otro script.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YML="$AQUI/.github/workflows/smoke-prod.yml"
BOX="$(mktemp -d)"
trap 'rm -rf "$BOX"' EXIT

[ -f "$YML" ] || { echo "No encuentro $YML"; exit 1; }

# ── Sacar el script del paso, tal cual está en el workflow ──────────────────
#
# Se extrae del YAML y NO se copia aquí a mano, a propósito: una copia se
# desincroniza del original sin que nadie lo note y el banco pasaría a probar
# un código que ya no se ejecuta. Es el mismo razonamiento por el que
# src/lib/smoke-prod-workflow.test.ts lee el fichero en vez de fijar literales.
awk '
  /^      - name: Esperar a que producción sirva ESTE commit$/ { dentro = 1; next }
  dentro && /^        run: \|$/ { copiando = 1; next }
  copiando {
    if ($0 == "") { print ""; next }
    if (substr($0, 1, 10) == "          ") { print substr($0, 11); next }
    exit
  }
' "$YML" > "$BOX/paso.sh"

# Que la extracción no se haya quedado a medias sin decirlo.
LINEAS=$(wc -l < "$BOX/paso.sh")
if [ "$LINEAS" -lt 40 ] || ! grep -q 'verificado=true' "$BOX/paso.sh"; then
  echo "❌ La extracción del paso ha salido mal ($LINEAS líneas)."
  echo "   Si el workflow ha cambiado de forma, hay que ajustar el awk de aquí arriba."
  exit 1
fi
bash -n "$BOX/paso.sh" || { echo "❌ El paso extraído no es bash válido."; exit 1; }

# ── Los dobles ─────────────────────────────────────────────────────────────
mkdir -p "$BOX/bin"

cat > "$BOX/bin/curl" <<'STUB'
#!/usr/bin/env bash
url="${@: -1}"
case "$url" in
  */api/health\?deep=1) echo "$HEALTH_DEEP" ;;
  */api/health)         echo "$HEALTH" ;;
  *)
    # La portada. Con $PORTADA_TRAS, los primeros $PORTADA_N intentos dan
    # $PORTADA y el resto $PORTADA_TRAS: así se simula una web que se cae a
    # mitad del bucle.
    if [ -n "${PORTADA_TRAS:-}" ]; then
      n=$(cat "$CONT" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$CONT"
      if [ "$n" -le "${PORTADA_N:-3}" ]; then printf '%s' "$PORTADA"
      else printf '%s' "$PORTADA_TRAS"; fi
    else
      printf '%s' "$PORTADA"
    fi
    ;;
esac
STUB

cat > "$BOX/bin/gh" <<'STUB'
#!/usr/bin/env bash
# Imita el detalle que importa: cuando gh falla, escribe el cuerpo del error
# por STDOUT (no por stderr). Ese detalle es el que hacía que
# `x=$(gh ... || echo "")` no limpiara nada.
todo="$*"
case "$todo" in
  *"environment=Production&per_page=1"*)
    [ -n "$ULTIMO_DEPLOY" ] && echo "$ULTIMO_DEPLOY"; exit "${GH_RC_ULT:-0}" ;;
  *"/statuses"*)
    [ -n "$STATUS" ] && echo "$STATUS"; exit "${GH_RC:-0}" ;;
  *"deployments?sha="*)
    [ -n "$DEPLOY_ID" ] && echo "$DEPLOY_ID"; exit "${GH_RC:-0}" ;;
esac
exit 0
STUB

printf '#!/usr/bin/env bash\nexit 0\n' > "$BOX/bin/sleep"
chmod +x "$BOX/bin/"*
export PATH="$BOX/bin:$PATH"

# ── El arnés ───────────────────────────────────────────────────────────────
FALLOS=0
TOTAL=0

base() {
  export PLAYWRIGHT_BASE_URL="https://mmastatus.app"
  export SHA_ESPERADO="45ca7b7f3a4b5c6d7e8f90123456789abcdef012"
  export GITHUB_EVENT_NAME="push" REPO="chocitagaming-art/mma-app"
  export PORTADA="200" PORTADA_TRAS="" PORTADA_N=3
  export HEALTH='{"ok":true,"db":"skipped","version":"viejo00"}'
  export HEALTH_DEEP='{"ok":true,"db":"up","version":"viejo00"}'
  export DEPLOY_ID="" STATUS="" ULTIMO_DEPLOY="2026-09-20T10:00:00Z"
  export GH_RC=0 GH_RC_ULT=0
  export CONT="$BOX/cont.txt"; : > "$CONT"
}

# correr <color esperado: rojo|ambar|verde> <nombre>
correr() {
  local esperado="$1" nombre="$2"
  TOTAL=$((TOTAL + 1))
  export GITHUB_OUTPUT="$BOX/out.txt" GITHUB_STEP_SUMMARY="$BOX/sum.md"
  : > "$GITHUB_OUTPUT"; : > "$GITHUB_STEP_SUMMARY"

  local salida rc obtenido
  salida=$(bash "$BOX/paso.sh" 2>&1); rc=$?

  # El color se deduce de lo que el paso PUBLICA, no de lo que imprime: es lo
  # mismo que miran los `if:` de los pasos siguientes.
  if [ "$rc" -ne 0 ]; then
    obtenido="rojo"
  elif grep -q '^verificado=true$' "$GITHUB_OUTPUT"; then
    obtenido="verde"
  else
    obtenido="ambar"
  fi

  if [ "$obtenido" = "$esperado" ]; then
    printf '  ✓ %-44s %s\n' "$nombre" "$obtenido"
  else
    printf '  ✗ %-44s esperaba %s y ha salido %s\n' "$nombre" "$esperado" "$obtenido"
    echo "$salida" | sed 's/^/        /'
    FALLOS=$((FALLOS + 1))
  fi
  if [ "${VERBOSE:-0}" = "1" ]; then
    echo "$salida" | grep -E '::(error|warning|notice)|últimos códigos|salud profunda|estado del deployment' | sed 's/^/        /'
  fi
}

echo "Banco de pruebas del paso de espera de smoke-prod.yml"
echo "($LINEAS líneas extraídas del workflow)"
echo

echo "VERDE — el commit está servido y las pruebas deben correr"
base; HEALTH='{"ok":true,"db":"skipped","version":"45ca7b7"}'
correr verde "el commit llega (caso normal)"
base; SHA_ESPERADO="" GITHUB_EVENT_NAME="schedule"
correr verde "cron, sin SHA que esperar"

echo
echo "ROJO — producción está rota de verdad, hay que abrir Issue"
base; PORTADA="500"
correr rojo "la portada da 500 en los 45 intentos"
base; PORTADA="503" SHA_ESPERADO="" GITHUB_EVENT_NAME="schedule"
correr rojo "la portada da 503 y es el CRON"
base; PORTADA="000" HEALTH="" HEALTH_DEEP=""
correr rojo "caída total"
base; HEALTH_DEEP='{"ok":false,"db":"down","version":"viejo00"}'
correr rojo "Neon caído con la app en pie"
base; DEPLOY_ID="5920573980" STATUS="failure 2026-08-15T12:47:37Z"
correr rojo "el deployment FALLÓ (el caso del 15-ago)"
base; ULTIMO_DEPLOY="2026-09-01T10:00:00Z"
correr rojo "sin despliegues en 48 h (integración muerta)"
base; ULTIMO_DEPLOY=""
correr rojo "el repo no tiene ningún deployment"
base; PORTADA="200" PORTADA_TRAS="500" PORTADA_N=3
correr rojo "la portada se cae a mitad del bucle"

echo
echo "ÁMBAR — no se ha podido verificar, pero nada dice que esté roto"
base; DEPLOY_ID="1" STATUS="success 2026-09-20T11:00:00Z"
correr ambar "el deploy terminó y el dominio va por detrás"
base
correr ambar "sin deployment aún (el caso del 18-sep, 41 min)"
base; GH_RC=1 DEPLOY_ID='{"message":"Not Found"}' STATUS='{"message":"Not Found"}'
correr ambar "gh api devuelve 403/404"
base; GH_RC=1 GH_RC_ULT=1 DEPLOY_ID='{"message":"Bad gateway"}' ULTIMO_DEPLOY='{"message":"Bad gateway"}'
correr ambar "la API de GitHub está caída entera"
base; DEPLOY_ID="1" STATUS=""
correr ambar "el deployment existe pero no tiene status"

echo
if [ "$FALLOS" -eq 0 ]; then
  echo "✅ $TOTAL/$TOTAL escenarios dan el color que deben."
  exit 0
fi
echo "❌ $FALLOS de $TOTAL escenarios fallan."
exit 1
