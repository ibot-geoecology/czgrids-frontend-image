import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MapView from './components/MapView';

export default function App() {
  const { t, i18n } = useTranslation();
  const mapViewRef = useRef(null);
  const [uiState, setUiState] = useState(() => ({
    error: null,
    activeLayerName: t('common.none'),
    opacity: 0.8,
    downloadLabel: t('download.default'),
    downloadDisabled: true,
    downloadVariant: 'btn-primary'
  }));

  const changeLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
  };

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
            <h1 className="page-title">{t('app.title')}</h1>
            <div className="page-intro">
              <div className="page-help-wrap">
                <p className="page-help">{t('app.step1')}</p>
                <p className="page-help">
                  {t('app.step2')}{' '}
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
          <div className="page-controls">
            <div className="page-actions">
              <div className="layer-opacity-panel">
                <p className="active-layer-name">{uiState.activeLayerName}</p>
                <label htmlFor="opacitySlider" className="form-label mb-1" style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                  {t('layer.opacity', { value: Math.round(uiState.opacity * 100) })}
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
            <div className="language-switcher">
              <span className="language-label">{t('app.language')}:</span>
              <div className="language-buttons">
                <button
                  type="button"
                  className={`btn btn-sm ${i18n.language.startsWith('cs') ? 'btn-dark' : 'btn-outline-dark'}`}
                  onClick={() => changeLanguage('cs')}
                >
                  CS
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${i18n.language.startsWith('en') ? 'btn-dark' : 'btn-outline-dark'}`}
                  onClick={() => changeLanguage('en')}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {uiState.error && (
        <div className="alert alert-danger alert-dismissible fade show error-alert" role="alert">
          <strong>{uiState.error.title}</strong>
          <p className="mb-0 mt-2">{uiState.error.message}</p>
          <button type="button" className="btn-close" aria-label={t('app.close')} onClick={handleCloseError}></button>
        </div>
      )}

      <MapView ref={mapViewRef} onUiStateChange={setUiState} />
    </div>
  );
}
