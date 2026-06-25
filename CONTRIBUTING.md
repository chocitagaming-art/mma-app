# Contributing

## Commits y deploy (Vercel Hobby)

Este proyecto se despliega en **Vercel Hobby** (plan gratuito). En ese plan, Vercel
**rechaza el deploy** si el autor del commit no coincide con el dueño del repositorio.
Si haces un commit con tu identidad de git habitual, el push se sube pero el deploy
falla y la web no se actualiza.

Para evitarlo, **todos los commits de este repo** deben usar como autor al dueño del
repositorio (`chocitagaming-art`). El comando exacto es:

```bash
git commit --author="chocitagaming-art <285652576+chocitagaming-art@users.noreply.github.com>" -m "tu mensaje"
```

El autor (`--author=...`) debe escribirse **literalmente** como arriba, sin cambiar el
correo `noreply` ni el número. No hace falta tocar tu configuración global de git
(`user.name` / `user.email`): el flag `--author` solo afecta a ese commit concreto.

### Helper opcional

Para no tener que escribir el autor cada vez, hay dos atajos equivalentes (ambos
opcionales, no se ejecutan solos).

**1. Script bash** `scripts/commit.sh` — envuelve el `git commit` con el autor correcto
y reenvía el resto de argumentos:

```bash
./scripts/commit.sh -m "tu mensaje"
```

**2. Script de npm** `commit:deploy` — mismo resultado, útil si prefieres npm. Pasa tus
argumentos después de `--`:

```bash
npm run commit:deploy -- -m "tu mensaje"
```

Cualquiera de las tres formas (comando manual, `scripts/commit.sh` o
`npm run commit:deploy`) produce un commit con el autor que Vercel Hobby acepta.
