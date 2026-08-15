import { Radio } from "lucide-react";

// El directo que la UFC emite EN ABIERTO la noche de la velada, incrustado.
//
// ⚠️ ESTA WEB NO RETRANSMITE NADA. Lo que hay aquí es el reproductor del canal
// oficial de la UFC en YouTube, servido por YouTube. Si el vídeo desaparece o
// deja de estar disponible, se ve el aviso del propio YouTube dentro del marco,
// que es más honesto que cualquier cosa que pudiéramos escribir nosotros.
//
// 🪤 EL RÓTULO NO SE INVENTA: sale del TÍTULO REAL DEL VÍDEO.
//
// La tentación era poner «EN DIRECTO» o «Ver la velada en directo», y las dos
// serían falsas. La UFC NO emite los combates gratis en YouTube —el estelar es
// de pago, Paramount+ o DAZN según el mercado— y lo que sí publica en abierto es
// la PREVIA del evento, a veces las preliminares iniciales. Un rótulo escrito a
// mano haría que alguien se siente a esperar el combate delante de una tertulia.
// El título del vídeo lo dice solo: «UFC 330 | Previa del Evento ¡EN VIVO!».
//
// Y por eso tampoco pone la hora ni «empieza en X minutos»: el vídeo puede estar
// programado, en directo o acabado, y la única fuente que sabe cuál de las tres
// es en este segundo es el propio reproductor. Lo dice él dentro del marco.
//
// Es un componente de SERVIDOR: no lleva estado ni "use client". El iframe va
// con `loading="lazy"` —el usuario pidió verlo abierto, no que pese en cada
// visita— y sin `autoplay`, porque un vídeo que arranca solo con sonido es de
// las pocas cosas que un navegador bloquea por su cuenta.

export function EventLiveEmbed({
  videoId,
  videoTitle,
  eventName,
  eventOver = false,
  className,
}: {
  videoId: string;
  videoTitle: string | null;
  eventName: string;
  // El estelar ya cayó. Solo la ficha del evento lo pasa: en la portada y en
  // /en-vivo el evento nunca está terminado, porque en cuanto lo está esas dos
  // páginas apuntan a otro.
  eventOver?: boolean;
  className?: string;
}) {
  // 🪤 DOS MOTIVOS PARA NO PINTAR NADA, y los dos son el mismo: no afirmar algo
  // que ha dejado de ser cierto.
  //
  //   · Sin título no se puede decir QUÉ es el vídeo, y un rótulo escrito a mano
  //     haría creer que ahí se ve el combate. Ver la cabecera del fichero.
  //   · Con el evento ya terminado, «Retransmisión oficial» es falso —y el
  //     título de YouTube suele llevar un «¡EN VIVO!» dentro, así que la ficha
  //     de una velada de hace meses estaría anunciando un directo que acabó.
  //
  // Se probó a cambiar el rótulo en pasado («Vídeo previo del evento») y se
  // descartó por decisión del dueño: si no está, no puede mentir. Es también lo
  // que ya hacía la portada, donde la franja desaparece sola en cuanto el
  // estelar cae y `getNextEventHero` pasa al siguiente evento.
  //
  // La diferencia con el careo, que SÍ se queda para siempre: «Careo oficial»
  // sigue siendo cierto dentro de un año. «Retransmisión» no.
  if (!videoTitle || eventOver) {
    return null;
  }

  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold tracking-[0.12em] text-muted-foreground uppercase">
        <Radio className="size-4" aria-hidden />
        Retransmisión oficial
      </h2>

      {/* El título real, y la fuente al lado. «Canal oficial de la UFC» importa:
          deja claro de quién es la señal y que esta web solo la enmarca. */}
      <p className="mb-2 text-sm font-medium text-balance">{videoTitle}</p>
      <p className="mb-3 font-mono text-[0.7rem] text-muted-foreground">
        En abierto en el canal oficial de la UFC (fuente YouTube)
      </p>

      {/* 🪤 EL MARCO NO SE TOCA sin mirar los TRES sitios donde vive: /en-vivo,
          la ficha del evento y la portada. Al arreglar la portada estuvo a punto
          de cambiarse aquí el tamaño y las esquinas, y eso habría movido las
          otras dos, que ya estaban bien. Lo que fallaba era la franja que lo
          envolvía en la portada, no el reproductor. */}
      <div className="w-full max-w-3xl">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={`${videoTitle} · ${eventName}`}
          loading="lazy"
          allow="accelerated-rotation; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-lg border border-border bg-muted"
        />
      </div>
    </section>
  );
}
