import type { Metadata } from "next";
import Link from "next/link";

import { CONTACTO_EMAIL, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos trata MMA STATUS y cuáles no: sin cuentas, sin cookies y sin publicidad. Qué se guarda en tu navegador y cómo borrarlo.",
  alternates: { canonical: "/privacidad" },
};

// AVISO PARA QUIEN TOQUE ESTA PÁGINA: cada afirmación de aquí se comprobó
// contra el código y contra producción el 2-ago-2026 (respuestas sin
// `set-cookie`, `rate-limit.ts`, `use-favorites.ts`, `use-live-now.ts`,
// `api/maestro/route.ts`, `api/predict/route.ts`). Si cambias lo que la web
// recoge, ESTA PÁGINA ES PARTE DEL CAMBIO. Una política de privacidad
// desactualizada es peor que no tenerla: aquí sí se está afirmando algo.

export default function PrivacidadPage() {
  return (
    <LegalPage
      titulo="Privacidad"
      actualizado="2 de agosto de 2026"
      entradilla={
        <>
          Resumen en una línea: <strong>no hay cuentas, no hay cookies y no se
          vende nada a nadie</strong>. Abajo está el detalle, sin letra pequeña.
        </>
      }
    >
      <LegalSection numero={1} titulo="Lo que esta web NO hace">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>No pide registro ni contraseña: no hay cuentas de usuario.</li>
          <li>
            <strong>No usa cookies</strong>, ni propias ni de terceros. Por eso no
            verás ningún banner pidiéndote permiso: no hay nada que consentir.
          </li>
          <li>No hay publicidad ni redes de rastreo publicitario.</li>
          <li>No se venden, ceden ni comparten datos con fines comerciales.</li>
          <li>No se elabora ningún perfil tuyo ni se te sigue entre sitios web.</li>
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
          Para borrarlo todo basta con limpiar los datos del sitio desde tu
          navegador. No hace falta pedírnoslo: nosotros no tenemos copia.
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
        </ul>
        <p>
          Algunos están fuera del Espacio Económico Europeo. En ese caso la
          transferencia se ampara en las cláusulas contractuales tipo de la Comisión
          Europea o en el marco de adecuación aplicable.
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
          Aviso honesto sobre esto: como <strong>no hay cuentas ni cookies</strong>,
          en la práctica no existe nada asociado a ti que podamos localizar. Los
          contadores por IP caducan en menos de un minuto y las estadísticas de
          visita son agregadas y no identificables. Lo único «tuyo» que existe
          vive en tu navegador, y lo borras tú (punto 3).
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
          La web no está dirigida a menores de 14 años ni les pide dato alguno,
          porque no pide datos a nadie.
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
