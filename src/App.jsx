import { useRef, useState } from 'react';
import MapView from './components/MapView';

export default function App() {
  const mapViewRef = useRef(null);
  const [uiState, setUiState] = useState({
    error: null,
    activeLayerName: '-',
    opacity: 0.8,
    downloadLabel: 'Stáhnout GeoTIFF',
    downloadDisabled: true,
    downloadVariant: 'btn-primary'
  });

  const handleDownload = async (event) => {
    event.preventDefault();
    if (mapViewRef.current) {
      await mapViewRef.current.download();
    }
  };

  const handleOpacityChange = (event) => {
    const value = Number(event.target.value);
    if (mapViewRef.current) {
      mapViewRef.current.setOpacity(value);
    }
  };

  const handleCloseError = () => {
    if (mapViewRef.current) {
      mapViewRef.current.clearError();
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
                    className={`btn ${uiState.downloadVariant} ${uiState.downloadDisabled ? 'disabled' : ''} download-action`}
                    aria-disabled={uiState.downloadDisabled}
                  >
                    {uiState.downloadLabel}
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div className="page-actions">
            <div className="layer-opacity-panel">
              <p className="active-layer-name">{uiState.activeLayerName}</p>
              <label htmlFor="opacitySlider" className="form-label mb-1" style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                Průhlednost vrstvy: {Math.round(uiState.opacity * 100)} %
              </label>
              <input
                type="range"
                className="form-range"
                id="opacitySlider"
                min="0"
                max="1"
                step="0.05"
                value={uiState.opacity}
                onChange={handleOpacityChange}
              />
            </div>
          </div>
        </div>
      </header>

      {uiState.error && (
        <div className="alert alert-danger alert-dismissible fade show error-alert" role="alert">
          <strong>{uiState.error.title}</strong>
          <p className="mb-0 mt-2">{uiState.error.message}</p>
          <button type="button" className="btn-close" aria-label="Zavřít" onClick={handleCloseError}></button>
        </div>
      )}

      <MapView ref={mapViewRef} onUiStateChange={setUiState} />
    </div>
  );
}
