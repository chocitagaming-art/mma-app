<div align="center">

<img src="docs/banner.png" alt="MMA STATUS" width="720">

### Una web de estadísticas de UFC con un modelo que predice peleas

Fichas de luchadores, clasificación oficial, comparativas cara a cara, las cuotas del mercado frente al modelo, un asistente con IA y vídeos de combates, todo sobre datos reales.

[![Ver la web](https://img.shields.io/badge/ver_la_web-mmastatus.app-22c55e?style=flat-square)](https://mmastatus.app)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss)
[![CI](https://github.com/chocitagaming-art/mma-app/actions/workflows/ci.yml/badge.svg)](https://github.com/chocitagaming-art/mma-app/actions/workflows/ci.yml)

[English](./README.md) · Español

</div>

![Página de inicio de MMA STATUS](docs/screenshots/home.png)

## Qué es

**[MMA STATUS](https://mmastatus.app)** es una web de estadísticas de UFC en
español, construida sobre datos reales y con un modelo que estima quién gana un
enfrentamiento.

Este repositorio es la web. El otro,
[mma-ingesta](https://github.com/chocitagaming-art/mma-ingesta), recoge los
datos y entrena el modelo.

## Qué puedes hacer en ella

**Fichas de luchador** con récord, racha, forma en las últimas cinco, precisión
de golpeo y de derribo, victorias por método, y una silueta que muestra dónde
conecta un peleador y dónde recibe, por zona y posición.

![Ficha de luchador](docs/screenshots/fighter-profile.png)

**Predicción de cualquier enfrentamiento.** Eliges esquina roja y azul, y el
modelo devuelve una probabilidad para cada uno, las señales que hay detrás y una
explicación corta en español.

![Predicción de pelea](docs/screenshots/prediction.png)

**Mercado contra modelo** en peleas próximas: lo que dicen las cuotas, ya sin el
margen de la casa, al lado de lo que cree el modelo, con la diferencia marcada.
Ponerlos lado a lado es poco habitual, y es lo que hace la comparación honesta.

![Mercado vs modelo](docs/screenshots/market-vs-model.png)

**El Maestro**, un asistente que responde con datos de la base real y enseña de
dónde los saca, en vez de inventar de memoria.

![Asistente El Maestro](docs/screenshots/maestro.png)

**Clasificación oficial** por división y libra por libra, masculina y femenina,
con el movimiento desde el último corte.

![Clasificación UFC](docs/screenshots/rankings.png)

**Comparador cara a cara** con tabla comparativa, siluetas de golpeo e historial
directo. La URL se comparte, así que un enfrentamiento es un enlace.

![Recorrido del cara a cara](docs/screenshots/cara-a-cara.gif)

Y además: trayectoria de ranking a lo largo del tiempo, directo de eventos con
resultados al momento, feed de noticias y vídeos, funciona sin conexión y se
instala como aplicación en el móvil.

## Cómo está hecha

Next.js 16 con App Router, React 19, TypeScript y Tailwind CSS, desplegada en
Vercel. Lee de una base PostgreSQL y llama a un microservicio para las
predicciones. Las explicaciones las escribe un modelo de lenguaje.

La web **solo lee**: no escribe nada en la base de datos.

## Calidad

- Comprobación de tipos, linter y pruebas unitarias en cada push.
- **123 pruebas de extremo a extremo** sobre las rutas reales, en tres tamaños
  de pantalla y en tema claro y oscuro.
- Una sola orden ejecuta las seis puertas de calidad de los dos repositorios, y
  ningún cambio se da por bueno hasta que salen todas en verde.

## Licencia

El código es de **consulta pública, no de uso libre**: puedes leerlo y
estudiarlo, pero no desplegarlo ni usarlo con fines comerciales sin permiso.
Ver [LICENSE](./LICENSE).

Los datos que muestra la web provienen de fuentes de terceros y no son
propiedad de este proyecto.
