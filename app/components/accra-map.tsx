"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Incident } from "@/lib/demo";
import {
  reportStatus,
  type OrganizationReport,
} from "@/lib/organization-reports";
import { demoNetwork, demoRisk } from "@/lib/demo-map";
export default function AccraMap({
  incidents,
  selected,
  onSelect,
  center,
  showIncidents,
  organizationReports,
  selectedOrganizationReport,
  onSelectOrganizationReport,
}: {
  incidents: Incident[];
  selected: string;
  onSelect: (id: string) => void;
  center: [number, number];
  showIncidents: boolean;
  organizationReports: OrganizationReport[];
  selectedOrganizationReport: string;
  onSelectOrganizationReport: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState("");
  const [is3D, setIs3D] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageryKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    let resizeObserver: ResizeObserver | undefined;
    try {
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: container.current,
        center: [-0.214, 5.587],
        zoom: 11.7,
        attributionControl: { compact: false },
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: imageryKey
                ? [
                    `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(imageryKey)}`,
                  ]
                : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: imageryKey
                ? "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics and the GIS User Community"
                : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
      });
      map.current = instance;
      resizeObserver = new ResizeObserver(() => instance.resize());
      resizeObserver.observe(container.current);
      instance.addControl(new maplibregl.NavigationControl(), "bottom-right");
      instance.addControl(
        new maplibregl.FullscreenControl({
          container: container.current.parentElement ?? undefined,
        }),
        "top-right",
      );
      instance.addControl(new maplibregl.ScaleControl(), "bottom-left");
      instance.on("load", () => {
        instance.addSource("demo-risk", { type: "geojson", data: demoRisk });
        instance.addLayer({
          id: "demo-risk-fill",
          type: "fill",
          source: "demo-risk",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 },
        });
        instance.addLayer({
          id: "demo-risk-outline",
          type: "line",
          source: "demo-risk",
          paint: {
            "line-color": ["get", "color"],
            "line-opacity": 0.7,
            "line-width": 1,
          },
        });
        instance.addSource("demo-network", {
          type: "geojson",
          data: demoNetwork,
        });
        instance.addLayer({
          id: "demo-network-glow",
          type: "line",
          source: "demo-network",
          paint: {
            "line-color": "#00c7ff",
            "line-width": 7,
            "line-opacity": 0.2,
            "line-blur": 3,
          },
        });
        instance.addLayer({
          id: "demo-network-line",
          type: "line",
          source: "demo-network",
          paint: {
            "line-color": "#00cfff",
            "line-width": 2.3,
            "line-opacity": 0.9,
          },
        });
      });
      instance.on("error", () =>
        setError(
          "Map tiles could not load. Check your connection; demo reports remain available below.",
        ),
      );
      instance.on("idle", () => {
        setLoaded(true);
        setError("");
      });
    } catch {
      // A WebGL initialization failure comes from the external map constructor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "Interactive map is unavailable. Your browser must support WebGL.",
      );
    }
    return () => {
      resizeObserver?.disconnect();
      map.current = null;
      instance?.remove();
    };
  }, [imageryKey]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const sync = () => {
      for (const id of [
        "demo-risk-fill",
        "demo-risk-outline",
        "demo-network-glow",
        "demo-network-line",
      ]) {
        if (instance.getLayer(id))
          instance.setLayoutProperty(
            id,
            "visibility",
            showIncidents ? "visible" : "none",
          );
      }
    };
    if (instance.isStyleLoaded()) sync();
    instance.on("load", sync);
    return () => {
      instance.off("load", sync);
    };
  }, [showIncidents]);
  useEffect(() => {
    map.current?.flyTo({ center, zoom: 11.7, duration: 1000 });
  }, [center]);
  useEffect(() => {
    if (!map.current) return;
    const labels: Array<[string, [number, number]]> = [
      ["Achimota", [-0.232, 5.622]],
      ["Nima", [-0.195, 5.592]],
      ["Kaneshie", [-0.255, 5.568]],
      ["Circle", [-0.218, 5.573]],
      ["Accra", [-0.193, 5.551]],
    ];
    const markers = labels.map(([name, coordinate]) => {
      const element = document.createElement("span");
      element.className = "map-place-label";
      element.textContent = name;
      return new maplibregl.Marker({ element })
        .setLngLat(coordinate)
        .addTo(map.current!);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, []);
  useEffect(() => {
    if (!map.current || !showIncidents) return;
    const markers = incidents.map((incident) => {
      const button = document.createElement("button");
      button.className = `map-pin ${incident.status === "Resolved" ? "low" : incident.priority.toLowerCase()} ${selected === incident.id ? "chosen" : ""}`;
      button.setAttribute(
        "aria-label",
        `DEMO: ${incident.title}, ${incident.area}`,
      );
      button.textContent = incident.status === "Resolved" ? "✓" : "!";
      button.onclick = () => onSelect(incident.id);
      const marker = new maplibregl.Marker({ element: button })
        .setLngLat(incident.coordinates)
        .addTo(map.current!);
      if (incident.id === selected) {
        const content = document.createElement("div");
        content.className = "demo-popup-content";
        const label = document.createElement("strong");
        label.textContent = incident.title;
        const area = document.createElement("span");
        area.textContent = `${incident.area} · SYNTHETIC DEMO`;
        content.append(label, area);
        marker.setPopup(
          new maplibregl.Popup({
            offset: 22,
            closeButton: false,
            closeOnClick: false,
          }).setDOMContent(content),
        );
        marker.togglePopup();
      }
      return marker;
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [incidents, selected, onSelect, showIncidents]);
  useEffect(() => {
    if (!map.current) return;
    const markers = organizationReports
      .filter((report) => !["rejected", "withdrawn"].includes(report.status))
      .map((report) => {
        const button = document.createElement("button");
        button.className = `organization-map-pin ${selectedOrganizationReport === report.id ? "chosen" : ""}`;
        button.setAttribute(
          "aria-label",
          `Organization report: ${report.title}, ${reportStatus(report.status)}`,
        );
        button.textContent = "●";
        button.onclick = () => onSelectOrganizationReport(report.id);
        const marker = new maplibregl.Marker({ element: button })
          .setLngLat([report.longitude, report.latitude])
          .addTo(map.current!);
        if (report.id === selectedOrganizationReport) {
          const content = document.createElement("div");
          content.className = "demo-popup-content";
          const title = document.createElement("strong");
          title.textContent = report.title;
          const status = document.createElement("span");
          status.textContent = `Organization report · ${reportStatus(report.status)}`;
          content.append(title, status);
          marker.setPopup(
            new maplibregl.Popup({
              offset: 22,
              closeButton: false,
              closeOnClick: false,
            }).setDOMContent(content),
          );
          marker.togglePopup();
        }
        return marker;
      });
    return () => markers.forEach((marker) => marker.remove());
  }, [
    organizationReports,
    selectedOrganizationReport,
    onSelectOrganizationReport,
  ]);
  return (
    <div className="map-canvas">
      <div
        ref={container}
        className="map-inner"
        data-ready={loaded}
        aria-label={
          organizationReports.length
            ? "Interactive Accra basemap with organization reports"
            : showIncidents
              ? "Interactive Accra basemap with synthetic demo incident markers"
              : "Interactive Accra basemap"
        }
      />
      {!loaded && !error && (
        <div className="map-loading" role="status">
          Loading Accra basemap…
        </div>
      )}
      {error && (
        <div className="map-error" role="status">
          {error}
        </div>
      )}
      <div className="map-view-mode" aria-label="Map view">
        <button
          type="button"
          aria-pressed={!is3D}
          onClick={() => {
            setIs3D(false);
            map.current?.easeTo({ pitch: 0, bearing: 0 });
          }}
        >
          2D
        </button>
        <button
          type="button"
          aria-pressed={is3D}
          onClick={() => {
            setIs3D(true);
            map.current?.easeTo({ pitch: 55 });
          }}
        >
          3D
        </button>
      </div>
      {showIncidents && (
        <>
          <div className="map-label">
            <span className="demo">
              SYNTHETIC DEMO · NOT REAL DRAINAGE OR FLOOD RISK
            </span>
          </div>
          <div className="map-legend">
            <strong>ILLUSTRATIVE LAYERS · DEMO</strong>
            <span>
              <i className="legend-line" /> Synthetic drainage lines
            </span>
            <span>
              <i className="risk-red" /> Example high-risk color
            </span>
            <span>
              <i className="risk-orange" /> Example medium-risk color
            </span>
            <span>
              <i className="risk-yellow" /> Example low-risk color
            </span>
            <span>
              <i className="orange" /> Open demo report
            </span>
            <span>
              <i className="green" /> Resolved demo report
            </span>
            <small>Colors do not represent actual flood risk.</small>
          </div>
        </>
      )}
    </div>
  );
}
