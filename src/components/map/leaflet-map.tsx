"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  type: string;
};

// Marcador propio (divIcon con SVG) para evitar el icono por defecto de Leaflet,
// que se rompe con los bundlers (Turbopack/Next) porque no resuelve las rutas de
// sus PNG. Un SVG inline no depende de ninguna imagen y va con la marca (rojo).
const gymIcon = L.divIcon({
  className: "gym-marker",
  html:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="#f5333a" stroke="#0a0a0b" stroke-width="1.2">' +
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>' +
    '<circle cx="12" cy="9" r="2.6" fill="#fff" stroke="none"/></svg>',
  iconSize: [30, 30],
  iconAnchor: [15, 29],
  popupAnchor: [0, -27],
});

// Reencuadra el mapa cuando cambia el centro (nueva búsqueda / geolocalización).
function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function LeafletMap({
  center,
  markers,
}: {
  center: [number, number];
  markers: MapMarker[];
}) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} />
      {markers.map((marker) => (
        <Marker key={marker.id} position={[marker.lat, marker.lon]} icon={gymIcon}>
          <Popup>
            <strong className="font-display text-sm font-bold uppercase tracking-tight">{marker.name}</strong>
            <br />
            <span style={{ textTransform: "capitalize" }}>{marker.type}</span>
            <br />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lon}`}
              target="_blank"
              rel="noreferrer"
            >
              Cómo llegar
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
