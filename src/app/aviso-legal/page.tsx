import type { Metadata } from "next";
import Link from "next/link";

import { CONTACTO_EMAIL, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Aviso legal",
  description:
    "Titularidad, condiciones de uso, origen de los datos y limitación de responsabilidad de MMA STATUS.",
  alternates: { canonical: "/aviso-legal" },
};

export default function AvisoLegalPage() {
  return (
    <LegalPage
      titulo="Aviso legal"
      actualizado="2 de agosto de 2026"
      entradilla={
        <>
          Condiciones de uso de <strong>mmastatus.app</strong>. Al navegar por esta
          web aceptas lo que se explica aquí. Está escrito para entenderse, no para
          cubrirse las espaldas.
        </>
      }
    >
      <LegalSection numero={1} titulo="Quién está detrás">
        <p>
          MMA STATUS es un <strong>proyecto personal e independiente</strong>,
          mantenido por afición a las artes marciales mixtas y sin ninguna
          relación con las promotoras del deporte.{" "}
          <strong>Hoy todo el contenido es de acceso gratuito.</strong>
        </p>
        <p>
          Si en el futuro se incorporan publicidad, patrocinios, contenido
          patrocinado o servicios de pago, se{" "}
          <strong>identificarán claramente como tales</strong> —como exige la ley
          para cualquier comunicación comercial— y se actualizarán este aviso y la{" "}
          <Link
            href="/privacidad"
            className="text-primary underline-offset-2 hover:underline"
          >
            política de privacidad
          </Link>{" "}
          <em>antes</em> de ponerlo en marcha, no después.
        </p>
        <p>
          Canal de contacto para cualquier asunto, incluidos los legales:{" "}
          <a
            href={`mailto:${CONTACTO_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACTO_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection numero={2} titulo="Esta web NO es de la UFC">
        <p>
          MMA STATUS <strong>no está afiliada, asociada, autorizada ni respaldada</strong>{" "}
          por Ultimate Fighting Championship, Zuffa LLC, TKO Group Holdings ni
          ninguna otra promotora, ni por ninguno de los deportistas que aparecen.
        </p>
        <p>
          «UFC» y los demás nombres, marcas y logotipos citados pertenecen a sus
          respectivos titulares y se usan únicamente con fines{" "}
          <strong>informativos y de identificación</strong>, para describir a qué
          evento o competición se refiere cada dato.
        </p>
      </LegalSection>

      <LegalSection numero={3} titulo="De dónde salen los datos">
        <p>
          Los resultados, carteleras, horarios, récords y estadísticas proceden de
          fuentes públicas de terceros —principalmente <em>ufc.com</em>,{" "}
          <em>ESPN</em> y <em>ufcstats.com</em>— recopiladas de forma automática, y
          algunas fotografías proceden de Wikimedia Commons con la atribución que
          exige su licencia (ver{" "}
          <Link href="/creditos" className="text-primary underline-offset-2 hover:underline">
            créditos de imágenes
          </Link>
          ).
        </p>
        <p>
          Se pone cuidado en que los datos sean correctos y se actualicen solos
          varias veces al día, pero <strong>no se garantiza</strong> que estén
          completos, actualizados ni libres de errores: dependen de terceros que
          pueden cambiar, retrasarse o equivocarse. Esta web{" "}
          <strong>no es una fuente oficial</strong>. Si detectas un dato mal,
          escríbenos y lo corregimos.
        </p>
      </LegalSection>

      <LegalSection numero={4} titulo="Las predicciones no son un consejo de apuestas">
        <p>
          La sección de enfrentamiento incluye una probabilidad calculada por un{" "}
          <strong>modelo estadístico</strong> a partir del historial de cada
          luchador. Es un ejercicio informativo y de curiosidad deportiva, con un
          acierto limitado y expresamente reconocido en la propia página.
        </p>
        <p>
          <strong>No es una recomendación de apuesta ni un consejo financiero de
          ningún tipo.</strong> Quien decida apostar lo hace bajo su exclusiva
          responsabilidad. Si el juego te preocupa, en España existe la línea de
          atención al jugador del Ministerio de Consumo (900 200 225), gratuita y
          confidencial.
        </p>
      </LegalSection>

      <LegalSection numero={5} titulo="Uso de la web y de su contenido">
        <p>
          Puedes consultar, enlazar y citar libremente esta web. Lo que{" "}
          <strong>no</strong> está permitido es el volcado masivo automatizado del
          contenido, el uso comercial de las bases de datos, ni presentar la
          información como si fuera oficial o propia.
        </p>
        <p>
          El diseño, los textos y el código del sitio son de su autor. El código
          fuente publicado se ofrece para{" "}
          <strong>consulta pública, no para uso libre</strong>: consúltalo en la
          licencia que acompaña a cada repositorio.
        </p>
      </LegalSection>

      <LegalSection numero={6} titulo="Disponibilidad y responsabilidad">
        <p>
          El servicio se ofrece <em>tal cual</em> y sin garantía de disponibilidad:
          puede interrumpirse, cambiar o desaparecer sin aviso previo. En la medida
          que permite la ley, no se asume responsabilidad por los daños derivados
          del uso de la web, de la imposibilidad de usarla, ni de decisiones
          tomadas a partir de sus datos.
        </p>
        <p>
          Los enlaces a sitios de terceros (fuentes, vídeos, retransmisiones) se
          ofrecen por comodidad. No se controla su contenido ni sus políticas, y su
          inclusión no implica ninguna relación con ellos.
        </p>
      </LegalSection>

      <LegalSection numero={7} titulo="Propiedad intelectual de terceros">
        <p>
          Si eres titular de derechos sobre algún contenido de esta web y crees que
          se está usando indebidamente o mal atribuido, escríbenos a{" "}
          <a
            href={`mailto:${CONTACTO_EMAIL}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {CONTACTO_EMAIL}
          </a>{" "}
          indicando el contenido concreto. Se revisa y, si procede, se retira o se
          corrige la atribución <strong>sin discutir</strong>.
        </p>
      </LegalSection>

      <LegalSection numero={8} titulo="Ley aplicable">
        <p>
          Estas condiciones se rigen por la legislación española. Para cualquier
          controversia, y salvo que una norma imperativa diga otra cosa, se acude a
          los juzgados y tribunales que correspondan conforme a derecho.
        </p>
        <p>
          Este aviso puede actualizarse; la fecha de arriba indica la última
          versión. La privacidad se trata aparte, en la{" "}
          <Link
            href="/privacidad"
            className="text-primary underline-offset-2 hover:underline"
          >
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
