import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import { useTranslation } from 'react-i18next';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet-groupedlayercontrol';

const TITILER_ADDRESS = import.meta.env.TITILER_ADDRESS || 'https://czgrids.dyn.cloud.e-infra.cz';
const SOURCE_MAP_CRS = 'EPSG:4326';
const OUTPUT_DOWNLOAD_CRS = 'EPSG:32633';
const MAX_DOWNLOAD_MEGAPIXELS = 120;
const PROJ_WGS84 = 'WGS84';
const PROJ_UTM33N = '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs +type=crs';

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
  const [x, y] = proj4(PROJ_WGS84, PROJ_UTM33N, [lon, lat]);
  return { x, y };
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

const MapView = forwardRef(function MapView({ onUiStateChange }, ref) {
  const { t, i18n } = useTranslation();
  const tRef = useRef(t);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerControlRef = useRef(null);
  const currentLeafletLayerRef = useRef(null);
  const currentSelectionBoundsRef = useRef(null);
  const currentSelectionLayerRef = useRef(null);
  const selectedLeafletLayersRef = useRef(new Set());

  const [error, setError] = useState(null);
  const [activeLayerName, setActiveLayerName] = useState(t('common.none'));
  const [opacity, setOpacity] = useState(0.8);
  const [downloadLabel, setDownloadLabel] = useState(t('download.default'));
  const [downloadDisabled, setDownloadDisabled] = useState(true);
  const [downloadVariant, setDownloadVariant] = useState('btn-primary');

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const tr = (key, options) => tRef.current(key, options);

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
      setActiveLayerName(tr('common.none'));
      setOpacity(0.8);
      return;
    }

    setActiveLayerName(`${layerConfig.groupName || tr('common.none')} ${layerConfig.name || tr('common.none')}`);
    setOpacity(leafletLayer.options.opacity ?? 0.8);
  };

  const updateDownloadState = () => {
    const selectedConfigs = getSelectedLayerConfigs();
    const currentSelectionBounds = currentSelectionBoundsRef.current;

    if (!currentSelectionBounds || !selectedConfigs.length) {
      setDownloadDisabled(true);
      setDownloadVariant('btn-primary');
      setDownloadLabel(tr('download.default'));
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
    const summarySuffix = summary ? tr('download.multiSuffix', { summary }) : '';
    const label =
      selectedConfigs.length === 1
        ? tr('download.single', { filename: buildDownloadFilename(selectedConfigs[0]), summary: summary || '?' })
        : tr('download.multi', { count: selectedConfigs.length, summarySuffix });

    if (exceedsDownloadLimit) {
      setDownloadDisabled(true);
      setDownloadVariant('btn-danger');
      setDownloadLabel(`${label}${tr('download.maxSuffix')}`);
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

  const setLayerOpacity = (value) => {
    const nextValue = Number(value);

    if (!Number.isFinite(nextValue)) {
      return;
    }

    setOpacity(nextValue);

    if (currentLeafletLayerRef.current) {
      currentLeafletLayerRef.current.setOpacity(nextValue);
    }
  };

  const runDownload = async () => {
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
      showErrorMessage(tr('errors.tooLargeTitle'), tr('errors.tooLargeMessage'));
      return;
    }

    const originalLabel = downloadLabel;

    try {
      setDownloadDisabled(true);

      for (let i = 0; i < selectedConfigs.length; i += 1) {
        const layerConfig = selectedConfigs[i];
        const downloadUrl = buildDownloadUrl(layerConfig, currentSelectionBounds);
        const downloadFilename = buildDownloadFilename(layerConfig);

        setDownloadLabel(tr('download.progress', { current: i + 1, total: selectedConfigs.length }));

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
          showErrorMessage(
            tr('errors.downloadFailedTitle'),
            tr('errors.downloadFailedMessage', { filename: downloadFilename, error: errorMsg })
          );
        }

        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    } catch (errorValue) {
      const errorMsg = errorValue && errorValue.message ? errorValue.message : String(errorValue);
      console.error('Nepodařilo se dokončit dávkové stahování GeoTIFF:', errorValue);
      showErrorMessage(tr('errors.downloadBatchTitle'), tr('errors.downloadBatchMessage', { error: errorMsg }));
    } finally {
      setDownloadLabel(originalLabel);
      updateDownloadState();
    }
  };

  useImperativeHandle(ref, () => ({
    setOpacity: (value) => {
      setLayerOpacity(value);
    },
    download: async () => {
      await runDownload();
    },
    clearError: () => {
      setError(null);
    }
  }));

  useEffect(() => {
    if (!onUiStateChange) {
      return;
    }

    onUiStateChange({
      error,
      activeLayerName,
      opacity,
      downloadLabel,
      downloadDisabled,
      downloadVariant
    });
  }, [onUiStateChange, error, activeLayerName, opacity, downloadLabel, downloadDisabled, downloadVariant]);

  useEffect(() => {
    if (!currentLeafletLayerRef.current) {
      setActiveLayerName(tr('common.none'));
    }

    updateDownloadState();
    // React to language changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

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
          throw new Error(tr('errors.noLayersDefined'));
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
        showErrorMessage(tr('errors.loadLayersTitle'), tr('errors.loadLayersMessage', { error: errorMsg }));
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

  return (
    <main className="map-shell">
      <div ref={mapRef} className="map"></div>
    </main>
  );
});

export default MapView;
