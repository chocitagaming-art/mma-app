import type { Metadata } from "next";
import Link from "next/link";

import { CONTACTO_EMAIL, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos trata MMA STATUS y cuáles no: sin cuentas, esta web no pone cookies y no hay publicidad. Qué se guarda en tu navegador, qué hace el reproductor de YouTube de los vídeos, qué servidores de imágenes intervienen y cómo borrarlo.",
  alternates: { canonical: "/privacidad" },
};

// AVISO PARA QUIEN TOQUE ESTA PÁGINA: cada afirmación de aquí se comprobó
// contra el código y contra producción el 2-ago-2026 (respuestas sin
// `set-cookie`, `rate-limit.ts`, `use-favorites.ts`, `use-live-now.ts`,
// `api/maestro/route.ts`, `api/predict/route.ts`, `api/contacto/route.ts`).
//
// Y ya ha pasado una vez: el formulario de /contacto entró ese mismo día y
// dejó FALSAS tres frases de aquí ("no pide datos a nadie", "no existe nada
// asociado a ti", el punto de menores). Se corrigieron en el mismo cambio. Si cambias lo que la web
// recoge, ESTA PÁGINA ES PARTE DEL CAMBIO. Una política de privacidad
// desactualizada es peor que no tenerla: aquí sí se está afirmando algo.
//
// Y volvió a pasar con YouTube. Revisado el 30-sep-2026 contra el código
// (ufc-tv.ts, home/ufc-tv-player.tsx, event-live-embed.tsx, youtube-facade.tsx,
// video-modal.tsx, security-headers.ts, next.config.ts `unoptimized`,
// country-flag.tsx, map/leaflet-map.tsx, news-image.tsx) y contra lo medido:
// maqueta-shorts/capturas/privacidad_medida.json (29-sep: 0 cookies, pero
// localStorage, IndexedDB y Cache Storage bajo youtube-nocookie.com, y
// conexiones a Google sin ningún clic) y producción el 30-sep en Chromium (8
// páginas: 0 cookies; www.ufc.com manda un Set-Cookie sin SameSite en sus
// fotos y el navegador lo rechaza). src/lib/legal-pages.test.ts vigila lo
// esencial: si la web incrusta YouTube, esta página tiene que contarlo, y
// ningún reproductor puede volver al dominio de YouTube con cookies.
//
// 🪤 Esa maqueta se midió con la partición del almacenamiento de terceros
// DESACTIVADA. En un Chrome normal, lo que guarda el iframe de
// youtube-nocookie.com queda particionado bajo el sitio que lo incrusta
// (mmastatus.app) y se borra con sus datos. Por eso el punto 3 lo cuenta así
// y no dice «medido en Chrome».
//
// Vídeos (grep de FightVideoPlayer, YtLite y YouTubeFacade): UFC TV y el
// directo arrancan solos; el careo oficial (/en-vivo y /eventos/[id]), el
// pesaje (event-weigh-ins.tsx), /videos, /tendencias, la columna de la
// portada y los combates esperan al clic. /gimnasios: api/gyms/route.ts manda
// DESDE EL SERVIDOR la ciudad escrita a nominatim.openstreetmap.org.
//
// Esas 8 páginas no incluían ninguna ficha de evento antiguo. Medido después,
// el 30-sep-2026 en Chromium: /eventos/319 y /eventos/361 (carteles de
// upload.wikimedia.org, 285 en events.image_url) dejan guardada la cookie
// WMF-Uniq (SameSite=None, caduca en un año). Por cabeceras: www.ufc.com manda
// STYXKEY_region (2 días, sin SameSite) y www1-cdn.sherdog.com, en las
// imágenes de noticias, __cf_bm (30 min). Las fotos de ESPN (a.espncdn.com)
// son solo retratos de luchadores (fighters.headshot_url), no carteles.

export default function PrivacidadPage() {
  return (
    <LegalPage
      titulo="Privacidad"
      actualizado="30 de septiembre de 2026"
      entradilla={
        <>
          Resumen: <strong>no hay cuentas, esta web no usa cookies y no se vende
          nada a nadie</strong>. Lo que hay que saber son los vídeos: se ven con
          el reproductor de YouTube, que guarda datos en tu navegador y se conecta
          con Google (puntos 3 y 4). Y algunas imágenes se descargan de otros
          servidores, y alguno manda su propia cookie con ellas (punto 4). Abajo
          está el detalle, sin letra pequeña.
        </>
      }
    >
      <LegalSection numero={1} titulo="Lo que esta web NO hace">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            No pide registro ni contraseña: no hay cuentas de usuario. Lo único
            que puedes darle voluntariamente es lo que escribas en{" "}
            <Link href="/contacto" className="text-primary underline-offset-2 hover:underline">
              /contacto
            </Link>{" "}
            (punto 2).
          </li>
          <li>
            <strong>No usa cookies</strong>: esta web no pone ninguna, y el
            reproductor de YouTube va en su versión sin cookies
            (youtube-nocookie.com; medido, cero cookies). Ese reproductor sí
            guarda otros datos en tu navegador y se conecta con Google al
            cargarse: está contado en los puntos 3 y 4. Algunos servidores de
            los que se descargan imágenes sí mandan su propia cookie; también
            está en el punto 4.
          </li>
          <li>
            <strong>Hoy esta web no pone publicidad</strong> ni usa redes de
            rastreo publicitario. Si alguna vez las hubiera, se actualizaría esta página{" "}
            <em>antes</em> y se te pediría consentimiento cuando la ley lo exija.
          </li>
          <li>No se venden tus datos. A nadie, ni ahora ni con publicidad.</li>
          <li>Esta web no elabora ningún perfil tuyo ni te sigue entre sitios web.</li>
        </ul>
      </LegalSection>

      <LegalSection numero={2} titulo="Lo que sí se trata, y para qué">
        <p>
          <strong>Tu dirección IP.</strong> Las rutas de búsqueda y el Maestro
          llevan un límite de peticiones para que nadie tumbe el servicio. Ese
          límite necesita distinguir de dónde viene cada petición, así que se
          guarda un contador asociado a tu IP en una base de datos temporal
          (Upstash). Las ventanas de conteo son de{" "}
          <strong>10 y 60 segundos</strong>, y las entradas caducan solas: no se
          construye ningún histórico ni se cruza con nada. Base legal:{" "}
          <em>interés legítimo</em> en mantener el servicio disponible y protegido
          frente al abuso.
        </p>
        <p>
          <strong>Estadísticas de visita agregadas.</strong> Se usa Vercel Web
          Analytics, que funciona <strong>sin cookies</strong> y sin identificarte:
          da páginas más vistas y de qué país llega la gente, en conjunto. No
          permite saber quién eres ni reconstruir tu navegación individual.
        </p>
        <p>
          <strong>Registros técnicos del servidor.</strong> Como cualquier web,
          el proveedor de alojamiento anota las peticiones (IP, hora, ruta,
          navegador) durante un tiempo limitado, por seguridad y diagnóstico.
        </p>
        <p>
          <strong>Si usas el Maestro.</strong> La pregunta que escribes se envía al
          modelo de lenguaje de Anthropic para poder responderte. No pidas datos
          personales tuyos ni de terceros en ese cuadro:{" "}
          <strong>no hace falta ninguno</strong> para preguntar sobre MMA. Las
          conversaciones no se guardan en la base de datos de esta web.
        </p>
        <p>
          <strong>
            Si escribes por{" "}
            <Link
              href="/contacto"
              className="text-primary underline-offset-2 hover:underline"
            >
              /contacto
            </Link>
            .
          </strong>{" "}
          Es lo único que esta web te pide, y solo si tú decides escribir. Se
          guardan <strong>tu correo, tu mensaje y el nombre si lo pones</strong>,
          en la base de datos, para poder contestarte y para tener constancia de
          lo que se ha reportado. <strong>No se guarda tu dirección IP</strong>,
          ni en claro ni con hash. Base legal: tu propio consentimiento al pulsar
          «enviar». Se conservan mientras tengan sentido como histórico de
          incidencias, y puedes pedir que se borre el tuyo cuando quieras
          (punto 6).
        </p>
      </LegalSection>

      <LegalSection numero={3} titulo="Lo que se queda en TU navegador (y no viaja)">
        <p>
          Estas cosas se guardan en tu propio dispositivo y{" "}
          <strong>no se envían a ningún servidor</strong>:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Tus luchadores favoritos</strong> (hasta 50): su identificador,
            nombre, foto y cuándo los marcaste. Se guardan en el almacenamiento
            local con la clave <code className="font-mono text-xs">mma:favorites</code>.
          </li>
          <li>
            <strong>El tema claro u oscuro</strong> que elijas.
          </li>
          <li>
            <strong>El último estado del directo</strong>, durante la sesión, para
            que el indicador no dé un salto al cargar cada página.
          </li>
          <li>
            <strong>Una copia de la página «sin conexión»</strong> y de los
            archivos estáticos, para que la web siga abriendo si te quedas sin red.
          </li>
        </ul>
        <p>
          <strong>Lo que guarda el reproductor de YouTube es aparte.</strong> Cuando
          se carga un vídeo (punto 4), el reproductor, que se sirve desde{" "}
          <code className="font-mono text-xs">youtube-nocookie.com</code>, guarda
          sus propios datos en tu navegador: en el <strong>localStorage</strong>,
          preferencias del reproductor (como los subtítulos) y una medida de la
          velocidad de tu conexión; además, una base de datos{" "}
          <strong>IndexedDB</strong> y una <strong>Cache Storage</strong> con los
          iconos del reproductor. Unos 16 KB en total y ninguna cookie, medido con
          el mismo reproductor que usa esta web. Eso no lo escribe ni lo lee esta
          web, sino el reproductor; qué hace Google con ello lo explica su Política
          de Privacidad (punto 4).
        </p>
        <p>
          Para borrarlo todo basta con limpiar los datos del sitio desde tu
          navegador. <strong>En Chrome</strong>, lo que guarda el reproductor queda
          dentro de los datos de mmastatus.app, así que se borra al borrar los
          datos de mmastatus.app. Otros navegadores pueden guardarlo aparte, bajo{" "}
          youtube-nocookie.com: ahí hay que borrar también los de ese dominio. No
          hace falta pedírnoslo: nosotros no tenemos copia.
        </p>
      </LegalSection>

      <LegalSection numero={4} titulo="Quién más interviene">
        <p>
          Para funcionar, la web se apoya en estos proveedores, que tratan datos
          por cuenta de MMA STATUS:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Vercel</strong> — alojamiento y estadísticas agregadas.
          </li>
          <li>
            <strong>Neon</strong> — base de datos, alojada en la{" "}
            <strong>Unión Europea</strong> (Fráncfort).
          </li>
          <li>
            <strong>Upstash</strong> — contadores temporales del límite de
            peticiones.
          </li>
          <li>
            <strong>Anthropic</strong> — solo si usas el Maestro, para generar la
            respuesta.
          </li>
          <li>
            <strong>Render</strong> — solo si pides una predicción; recibe
            estadísticas deportivas de los dos luchadores, nada tuyo.
          </li>
          <li>
            <strong>OpenStreetMap</strong> (Nominatim) — solo si buscas una
            ciudad en /gimnasios: el servidor de esta web le envía el nombre de la
            ciudad que escribes para situarla en el mapa. La petición sale del
            servidor, así que tu dirección IP no le llega.
          </li>
        </ul>
        <p>
          Algunos están fuera del Espacio Económico Europeo. En ese caso la
          transferencia se ampara en las cláusulas contractuales tipo de la Comisión
          Europea o en el marco de adecuación aplicable.
        </p>
        <p>
          <strong>Los vídeos: YouTube.</strong> UFC TV, el directo de la velada,
          el careo oficial y el vídeo del pesaje (en /en-vivo y en la página de
          cada evento), /videos, /tendencias, la columna de vídeos de la portada y
          los vídeos de cada combate se ven con el reproductor de{" "}
          <strong>YouTube</strong>, un servicio de <strong>Google</strong> (en la
          Unión Europea lo presta <strong>Google Ireland Limited</strong>),
          incrustado en su versión{" "}
          <code className="font-mono text-xs">youtube-nocookie.com</code>. Al
          verlos se aplican los{" "}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Términos de servicio de YouTube
          </a>{" "}
          y la{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Política de Privacidad de Google
          </a>
          .
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>Lo que se carga solo.</strong> UFC TV (en la portada) y el
            directo de la velada (en la portada, en /en-vivo y en la página del
            evento) cargan el reproductor por sí mismos cuando su bloque entra en
            pantalla, y arrancan sin sonido. Si tu sistema pide reducir el
            movimiento, UFC TV no arranca, pero el reproductor se carga igual.
          </li>
          <li>
            <strong>Lo que espera a que pulses.</strong> En el careo oficial y
            en el vídeo del pesaje (en /en-vivo y en la página de cada evento),
            en /videos, en /tendencias, en la columna de vídeos de la portada y en
            los vídeos de cada combate se ve primero una miniatura, y el
            reproductor solo se
            carga cuando pulsas «play». La miniatura sí se descarga de un servidor
            de YouTube (i.ytimg.com).
          </li>
          <li>
            <strong>Lo que hace el reproductor al cargarse</strong> (medido el 29
            y el 30 de septiembre de 2026 en Chrome, con el reproductor
            arrancando solo): no pone ninguna cookie, pero guarda datos en tu
            navegador (punto 3) y, sin que pulses nada, se conecta con servidores
            de Google: www.youtube-nocookie.com, googlevideo.com (el vídeo),
            i.ytimg.com y yt3.ggpht.com (imágenes), fonts.gstatic.com,
            www.gstatic.com, www.google.com y jnn-pa.googleapis.com. Como a
            cualquier servidor al que se conecta tu navegador, a esos les llegan
            tu dirección IP y los datos técnicos del navegador.
          </li>
        </ul>
        <p>
          <strong>Imágenes de otros servidores.</strong> Las fotos de los
          luchadores (ufc.com y ESPN), los carteles de los eventos (ufc.com y, los
          de eventos antiguos, Wikimedia desde upload.wikimedia.org), las
          miniaturas y los avatares de canal de YouTube (i.ytimg.com y
          yt3.ggpht.com), las banderas (flagcdn.com), las imágenes de las noticias
          (del medio de cada una) y el mapa de /gimnasios (OpenStreetMap) se
          descargan directamente de sus servidores. Tu navegador se conecta con
          ellos para pedirlas y, como con cualquier imagen enlazada, les llegan tu
          dirección IP y los datos técnicos del navegador.
        </p>
        <p>
          <strong>Algunos de esos servidores mandan su propia cookie</strong> junto
          con la imagen (medido el 30 de septiembre de 2026):
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong>upload.wikimedia.org</strong> (los carteles antiguos):{" "}
            <code className="font-mono text-xs">WMF-Uniq</code>, un identificador
            que dura un año. Chrome la guarda.
          </li>
          <li>
            <strong>www.ufc.com</strong> (fotos de luchadores y carteles):{" "}
            <code className="font-mono text-xs">STYXKEY_region</code>, con tu
            región, durante 2 días. Chrome la rechaza; otros navegadores pueden
            guardarla.
          </li>
          <li>
            <strong>sherdog.com</strong> (imágenes de algunas noticias):{" "}
            <code className="font-mono text-xs">__cf_bm</code>, la protección
            antibots de Cloudflare, durante 30 minutos.
          </li>
        </ul>
        <p>
          Esta web no las lee ni las pone: las gestiona cada uno de esos
          servidores según su propia política. Si quieres evitarlas, puedes
          bloquear las cookies de terceros en tu navegador.
        </p>
      </LegalSection>

      <LegalSection numero={5} titulo="Datos de los deportistas">
        <p>
          La web publica información sobre luchadores profesionales: nombre, país,
          récord, estadísticas de combate y fecha de nacimiento. Son datos{" "}
          <strong>ya públicos</strong>, difundidos por la propia promotora y por
          medios deportivos, y se tratan con fines informativos sobre la actividad{" "}
          <strong>profesional</strong> de personas con proyección pública.
        </p>
        <p>
          Si eres uno de ellos o su representante y quieres corregir o retirar
          algún dato, escribe a{" "}
          <a
            href={`mailto:${CONTACTO_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACTO_EMAIL}
          </a>{" "}
          y se atiende.
        </p>
      </LegalSection>

      <LegalSection numero={6} titulo="Tus derechos">
        <p>
          Puedes solicitar acceso, rectificación, supresión, oposición, limitación
          y portabilidad de tus datos escribiendo a{" "}
          <a
            href={`mailto:${CONTACTO_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACTO_EMAIL}
          </a>
          .
        </p>
        <p>
          Aviso honesto sobre esto: como esta web{" "}
          <strong>no tiene cuentas ni usa cookies</strong>, casi nada de lo que
          guarda se puede asociar a ti. Los contadores por IP caducan en menos de
          un minuto y las estadísticas de visita son agregadas y no
          identificables; lo que guardas en el navegador lo borras tú (punto 3).
          Lo que recoja el reproductor de YouTube lo trata Google, y se le pide a
          Google según su Política de Privacidad (punto 4). Las cookies que
          manden los servidores de imágenes (punto 4) no llegan a esta web: las
          trata cada uno de ellos.
        </p>
        <p>
          <strong>La excepción es si escribiste por /contacto</strong>: ahí sí hay
          un mensaje tuyo con tu correo, y ese sí se puede buscar y borrar. Pídelo
          desde la misma dirección con la que escribiste y se hace.
        </p>
        <p>
          Si crees que tus datos no se están tratando bien, puedes reclamar ante la{" "}
          <a
            href="https://www.aepd.es/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection numero={7} titulo="Menores y cambios">
        <p>
          La web no está dirigida a menores de 14 años. No hay registro, así que
          lo único que un menor podría enviar es un mensaje por /contacto: si nos
          damos cuenta de que quien escribe es menor de 14, se borra sin más.
        </p>
        <p>
          Si algún día cambia lo que se recoge, se actualiza esta página y su fecha.
          Las condiciones de uso están en el{" "}
          <Link
            href="/aviso-legal"
            className="text-primary underline-offset-2 hover:underline"
          >
            aviso legal
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
