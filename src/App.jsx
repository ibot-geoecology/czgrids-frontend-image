import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet-groupedlayercontrol';

const TITILER_ADDRESS = 'https://czgrids.dyn.cloud.e-infra.cz';
const SOURCE_MAP_CRS = 'EPSG:4326';
const OUTPUT_DOWNLOAD_CRS = 'EPSG:32633';
const MAX_DOWNLOAD_MEGAPIXELS = 120;

function sanitizeFilenamePart(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_');
}

function buildDownloadFilename(layerConfig) {
  const groupName = sanitizeFilenamePart(layerConfig.groupName || 'layer');
  const layerName = sanitizeFilenamePart(layerConfig.name || 'data');
  return `${groupName}_${layerName}.tif`;
}

function latLonToUtm33N(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lon0 = (15 * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = ep2 * cosLat * cosLat;
  const A = cosLat * (lonRad - lon0);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latRad));

  const easting =
    k0 *
      n *
      (A + ((1 - t + c) * Math.pow(A, 3)) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * Math.pow(A, 5)) / 120) +
    500000;

  const northing =
    k0 *
    (M +
      n *
        tanLat *
        (A * A / 2 + ((5 - t + 9 * c + 4 * c * c) * Math.pow(A, 4)) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * Math.pow(A, 6)) / 720));

  return { x: easting, y: northing };
}

function calculateBBoxMegapixels(bounds, resolutionMeters) {
  const resolution = Number(resolutionMeters);

  if (!bounds || !Number.isFinite(resolution) || resolution <= 0) {
    return null;
  }

  const corners = [
    latLonToUtm33N(bounds.getSouth(), bounds.getWest()),
    latLonToUtm33N(bounds.getSouth(), bounds.getEast()),
    latLonToUtm33N(bounds.getNorth(), bounds.getWest()),
    latLonToUtm33N(bounds.getNorth(), bounds.getEast())
  ];

  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const widthMeters = Math.max(...xs) - Math.min(...xs);
  const heightMeters = Math.max(...ys) - Math.min(...ys);

  if (widthMeters <= 0 || heightMeters <= 0) {
    return null;
  }

  return ((widthMeters / resolution) * (heightMeters / resolution)) / 1_000_000;
}

function formatMegapixelLabel(megapixels) {
  if (!Number.isFinite(megapixels)) {
    return null;
  }

  return megapixels >= 10 ? `${megapixels.toFixed(1)} MP` : `${megapixels.toFixed(2)} MP`;
}

function buildDownloadUrl(layerConfig, bounds) {
  const minX = bounds.getWest().toFixed(5);
  const minY = bounds.getSouth().toFixed(5);
  const maxX = bounds.getEast().toFixed(5);
  const maxY = bounds.getNorth().toFixed(5);

  const params = new URLSearchParams({
    url: layerConfig.filename,
    coord_crs: SOURCE_MAP_CRS,
    dst_crs: OUTPUT_DOWNLOAD_CRS,
    bidx: '1',
    resampling_method: 'nearest',
    return_mask: 'false',
    nodata: 'nan'
  });

  return `${TITILER_ADDRESS}/cog/bbox/${minX},${minY},${maxX},${maxY}.tif?${params.toString()}`;
}

function buildTitilerTilesUrl(layerConfig) {
  const params = new URLSearchParams({
    url: layerConfig.filename,
    bidx: '1'
  });

  if (layerConfig.rescale) {
    params.set('rescale', layerConfig.rescale);
  }

  if (layerConfig.colormap) {
    params.set('colormap_name', layerConfig.colormap);
  }

  return `${TITILER_ADDRESS}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?${params.toString()}`;
}

function populateLayerRescale(layerConfig) {
  const minValue = Number(layerConfig.colors_min);
  const maxValue = Number(layerConfig.colors_max);

  if (Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue !== maxValue) {
    layerConfig.rescale = `${minValue},${maxValue}`;
  }

  return layerConfig;
}

function getMegapixelStats(selectedConfigs, bounds) {
  const megapixels = selectedConfigs
    .map((config) => calculateBBoxMegapixels(bounds, config.res))
    .filter((value) => Number.isFinite(value));

  if (!megapixels.length) {
    return null;
  }

  return {
    min: Math.min(...megapixels),
    max: Math.max(...megapixels)
  };
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerControlRef = useRef(null);
  const currentLeafletLayerRef = useRef(null);
  const currentSelectionBoundsRef = useRef(null);
  const currentSelectionLayerRef = useRef(null);
  const selectedLeafletLayersRef = useRef(new Set());

  const [error, setError] = useState(null);
  const [activeLayerName, setActiveLayerName] = useState('-');
  const [opacity, setOpacity] = useState(0.8);
  const [downloadLabel, setDownloadLabel] = useState('Stáhnout GeoTIFF');
  const [downloadDisabled, setDownloadDisabled] = useState(true);
  const [downloadVariant, setDownloadVariant] = useState('btn-primary');

  const showErrorMessage = (title, message, autoDismissMs = 0) => {
    setError({ title, message });

    if (autoDismissMs > 0) {
      window.setTimeout(() => {
        setError(null);
      }, autoDismissMs);
    }
  };

  const getSelectedLayerConfigs = () => {
    return Array.from(selectedLeafletLayersRef.current)
      .filter((layer) => layer && layer.layerConfig)
      .map((layer) => layer.layerConfig);
  };

  const updateLayerDisplay = (layerConfig, leafletLayer) => {
    if (!layerConfig || !leafletLayer) {
      setActiveLayerName('-');
      setOpacity(0.8);
      return;
    }

    setActiveLayerName(`${layerConfig.groupName || '-'} ${layerConfig.name || '-'}`);
    setOpacity(leafletLayer.options.opacity ?? 0.8);
  };

  const updateDownloadState = () => {
    const selectedConfigs = getSelectedLayerConfigs();
    const currentSelectionBounds = currentSelectionBoundsRef.current;

    if (!currentSelectionBounds || !selectedConfigs.length) {
      setDownloadDisabled(true);
      setDownloadVariant('btn-primary');
      setDownloadLabel('Stáhnout GeoTIFF');
      return;
    }

    const stats = getMegapixelStats(selectedConfigs, currentSelectionBounds);
    const summary =
      stats && Math.abs(stats.min - stats.max) < 0.01
        ? formatMegapixelLabel(stats.min)
        : stats
          ? `${formatMegapixelLabel(stats.min)}-${formatMegapixelLabel(stats.max)}`
          : null;
    const exceedsDownloadLimit = stats && Number.isFinite(stats.max) && stats.max > MAX_DOWNLOAD_MEGAPIXELS;
    const summarySuffix = summary ? `, ${summary}` : '';
    const label =
      selectedConfigs.length === 1
        ? `Stáhnout ${buildDownloadFilename(selectedConfigs[0])} (${summary || '?'})`
        : `Stáhnout GeoTIFF vrstvy (${selectedConfigs.length}${summarySuffix})`;

    if (exceedsDownloadLimit) {
      setDownloadDisabled(true);
      setDownloadVariant('btn-danger');
      setDownloadLabel(`${label} - max 120 MP`);
      return;
    }

    setDownloadDisabled(false);
    setDownloadVariant('btn-success');
    setDownloadLabel(label);
  };

  const updateBoundsFromLayer = (layer) => {
    const bounds = layer.getBounds();
    currentSelectionBoundsRef.current = bounds;

    const minX = bounds.getWest().toFixed(5);
    const minY = bounds.getSouth().toFixed(5);
    const maxX = bounds.getEast().toFixed(5);
    const maxY = bounds.getNorth().toFixed(5);

    console.log(`Vybran BBox: ${minX}, ${minY}, ${maxX}, ${maxY}`);
    updateDownloadState();
  };

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) {
      return undefined;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const map = L.map(mapRef.current).setView([49.8, 15.9], 8);
    leafletMapRef.current = map;

    const invalidateMapSize = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };

    const rafId = window.requestAnimationFrame(invalidateMapSize);
    const resizeTimeoutId = window.setTimeout(invalidateMapSize, 150);
    const resizeObserver = new ResizeObserver(() => {
      invalidateMapSize();
    });
    resizeObserver.observe(mapRef.current);

    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      referrerPolicy: 'origin'
    }).addTo(map);

    osmLayer.on('tileerror', (event) => {
      console.error('Chyba nacitani podkladove mapy (OSM):', event);
    });

    const baseLayers = { OpenStreetMap: osmLayer };
    layerControlRef.current = L.control.groupedLayers(baseLayers, {}, { collapsed: false }).addTo(map);

    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawPolygon: false,
      drawCircle: false,
      drawText: false,
      drawRectangle: true,
      editMode: true,
      rotateMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: true
    });

    const onOverlayAdd = (event) => {
      selectedLeafletLayersRef.current.add(event.layer);
      currentLeafletLayerRef.current = event.layer;
      updateLayerDisplay(event.layer.layerConfig || null, currentLeafletLayerRef.current);
      updateDownloadState();
    };

    const onOverlayRemove = (event) => {
      selectedLeafletLayersRef.current.delete(event.layer);

      if (currentLeafletLayerRef.current === event.layer) {
        const nextLayer = selectedLeafletLayersRef.current.values().next().value || null;
        currentLeafletLayerRef.current = nextLayer;
        updateLayerDisplay(nextLayer?.layerConfig || null, nextLayer);
      }

      updateDownloadState();
    };

    const onCreate = (event) => {
      const layer = event.layer;

      if (currentSelectionLayerRef.current && currentSelectionLayerRef.current !== layer && map.hasLayer(currentSelectionLayerRef.current)) {
        map.removeLayer(currentSelectionLayerRef.current);
      }

      currentSelectionLayerRef.current = layer;
      updateBoundsFromLayer(layer);

      layer.on('pm:edit', () => {
        updateBoundsFromLayer(layer);
      });
    };

    const onRemove = () => {
      currentSelectionLayerRef.current = null;
      currentSelectionBoundsRef.current = null;
      updateDownloadState();
    };

    map.on('overlayadd', onOverlayAdd);
    map.on('overlayremove', onOverlayRemove);
    map.on('pm:create', onCreate);
    map.on('pm:remove', onRemove);

    const loadCogLayers = async () => {
      try {
        const response = await fetch('/layers.json', { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const groups = await response.json();

        if (!isMounted || !leafletMapRef.current) {
          return;
        }

        groups.forEach((group) => {
          group.layers.forEach((layerConfig) => populateLayerRescale(layerConfig));
        });

        const overlayLayers = [];

        groups.forEach((group) => {
          const groupName = group.group_name || 'Ostatni';

          group.layers.forEach((layerConfig) => {
            layerConfig.groupName = groupName;

            const cogLayer = L.tileLayer(buildTitilerTilesUrl(layerConfig), {
              attribution: 'CZECH GRIDS 1.0',
              opacity: 0.8,
              crossOrigin: true
            });

            cogLayer.layerConfig = layerConfig;
            cogLayer.on('tileerror', (event) => {
              console.error(`Chyba nacitani raster tile pro ${layerConfig.name}:`, event);
            });

            overlayLayers.push({
              groupName,
              label: layerConfig.name,
              layer: cogLayer,
              config: layerConfig
            });
          });
        });

        if (!overlayLayers.length) {
          throw new Error('V layers.json nejsou definovane zadne vrstvy.');
        }

        if (!isMounted || !leafletMapRef.current || !map._controlCorners) {
          return;
        }

        if (layerControlRef.current) {
          map.removeControl(layerControlRef.current);
        }
        layerControlRef.current = L.control.groupedLayers(baseLayers, {}, { collapsed: false }).addTo(map);

        overlayLayers.forEach((overlayLayer) => {
          layerControlRef.current.addOverlay(overlayLayer.layer, overlayLayer.label, overlayLayer.groupName);
        });

        const defaultLayer = overlayLayers[0];
        defaultLayer.layer.addTo(map);
        selectedLeafletLayersRef.current.add(defaultLayer.layer);
        currentLeafletLayerRef.current = defaultLayer.layer;
        updateLayerDisplay(defaultLayer.config, defaultLayer.layer);
        updateDownloadState();
      } catch (loadError) {
        if (!isMounted || loadError?.name === 'AbortError') {
          return;
        }

        const errorMsg = loadError && loadError.message ? loadError.message : String(loadError);
        console.error('Nepodařilo se načíst layers.json:', loadError);
        showErrorMessage('Chyba při načítání vrstev', `Nepodařilo se načíst konfiguraci vrstev: ${errorMsg}`);
      }
    };

    loadCogLayers();

    return () => {
      isMounted = false;
      abortController.abort();
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(resizeTimeoutId);
      resizeObserver.disconnect();
      map.off('overlayadd', onOverlayAdd);
      map.off('overlayremove', onOverlayRemove);
      map.off('pm:create', onCreate);
      map.off('pm:remove', onRemove);
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  const handleOpacityChange = (event) => {
    const value = Number(event.target.value);
    setOpacity(value);

    if (currentLeafletLayerRef.current) {
      currentLeafletLayerRef.current.setOpacity(value);
    }
  };

  const handleDownload = async (event) => {
    event.preventDefault();

    if (downloadDisabled) {
      return;
    }

    const selectedConfigs = getSelectedLayerConfigs();
    const currentSelectionBounds = currentSelectionBoundsRef.current;

    if (!currentSelectionBounds || !selectedConfigs.length) {
      return;
    }

    const stats = getMegapixelStats(selectedConfigs, currentSelectionBounds);
    const exceedsDownloadLimit = stats && Number.isFinite(stats.max) && stats.max > MAX_DOWNLOAD_MEGAPIXELS;

    if (exceedsDownloadLimit) {
      showErrorMessage('Prilis velky vyrez', 'Lze stahovat pouze vyrezy do 120 MP.');
      return;
    }

    const originalLabel = downloadLabel;

    try {
      setDownloadDisabled(true);

      for (let i = 0; i < selectedConfigs.length; i += 1) {
        const layerConfig = selectedConfigs[i];
        const downloadUrl = buildDownloadUrl(layerConfig, currentSelectionBounds);
        const downloadFilename = buildDownloadFilename(layerConfig);

        setDownloadLabel(`Stahuji ${i + 1}/${selectedConfigs.length}...`);

        try {
          const response = await fetch(downloadUrl);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const blob = await response.blob();
          triggerBrowserDownload(blob, downloadFilename);
        } catch (downloadError) {
          const errorMsg = downloadError && downloadError.message ? downloadError.message : String(downloadError);
          console.error(`Nepodařilo se stáhnout GeoTIFF pro ${downloadFilename}:`, downloadError);
          showErrorMessage('Stahování selhalo', `Nepodařilo se stáhnout ${downloadFilename}: ${errorMsg}`);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    } catch (errorValue) {
      const errorMsg = errorValue && errorValue.message ? errorValue.message : String(errorValue);
      console.error('Nepodařilo se dokončit dávkové stahování GeoTIFF:', errorValue);
      showErrorMessage('Chyba při stahování', `Nepodařilo se dokončit stahování: ${errorMsg}`);
    } finally {
      setDownloadLabel(originalLabel);
      updateDownloadState();
    }
  };

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="page-header-inner">
          <div>
            <h1 className="page-title">Stahování dat</h1>
            <div className="page-intro">
              <div className="page-help-wrap">
                <p className="page-help">1. Nakreslete obdélník do mapy pomocí nástroje se symbolem čtverce.</p>
                <p className="page-help">
                  2. Stáhněte tlačítkem:{' '}
                  <a
                    href="#"
                    onClick={handleDownload}
                    className={`btn ${downloadVariant} ${downloadDisabled ? 'disabled' : ''} download-action`}
                    aria-disabled={downloadDisabled}
                  >
                    {downloadLabel}
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div className="page-actions">
            <div className="layer-opacity-panel">
              <p className="active-layer-name">{activeLayerName}</p>
              <label htmlFor="opacitySlider" className="form-label mb-1" style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                Průhlednost vrstvy: {Math.round(opacity * 100)} %
              </label>
              <input
                type="range"
                className="form-range"
                id="opacitySlider"
                min="0"
                max="1"
                step="0.05"
                value={opacity}
                onChange={handleOpacityChange}
              />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show error-alert" role="alert">
          <strong>{error.title}</strong>
          <p className="mb-0 mt-2">{error.message}</p>
          <button type="button" className="btn-close" aria-label="Zavrit" onClick={() => setError(null)}></button>
        </div>
      )}

      <main className="map-shell">
        <div ref={mapRef} className="map"></div>
      </main>
    </div>
  );
}
