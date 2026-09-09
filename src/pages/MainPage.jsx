import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MapView from '../components/MapView';

export default function MainPage() {
  const { t, i18n } = useTranslation();
  const mapViewRef = useRef(null);
  const [identifyEnabled, setIdentifyEnabled] = useState(false);
  const [isCitationOpen, setIsCitationOpen] = useState(false);
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

  const handleToggleIdentify = () => {
    const nextValue = !identifyEnabled;
    setIdentifyEnabled(nextValue);

    if (mapViewRef.current) {
      mapViewRef.current.setIdentifyEnabled(nextValue);
    }
  };

  const handleOpenCitation = (event) => {
    event.preventDefault();
    setIsCitationOpen(true);
  };

  const handleCloseCitation = () => {
    setIsCitationOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="page-header-inner">
          <div className="page-brand">
            <div className="page-brand-logo-block">
              <img
                src={i18n.language.startsWith('cs') ? '/logo_cs.png' : '/logo_en.png'}
                alt="Logo"
                className="page-logo"
              />
              <p className="page-citation">
                <Trans i18nKey="citation.prefix" components={{ strong: <strong /> }} />{' '}
                <a href="#" onClick={handleOpenCitation} className="citation-link">
                  {t('citation.linkLabel')}
                </a>
                .
              </p>
            </div>
            <div className="page-brand-text">
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
          </div>
          <div className="page-controls">
            <div className="page-actions">
              <div className="layer-opacity-panel">
                <p className="active-layer-name">{uiState.activeLayerName}</p>
                <button
                  type="button"
                  className={`btn btn-sm d-block ${identifyEnabled ? 'btn-info' : 'btn-outline-light'} mb-2`}
                  onClick={handleToggleIdentify}
                >
                  {identifyEnabled ? t('identify.on') : t('identify.off')}
                </button>
                <label htmlFor="opacitySlider" className="form-label mb-1" style={{ fontSize: '0.85rem', color: '#cfd8e3' }}>
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
                  className={`btn btn-sm ${i18n.language.startsWith('cs') ? 'btn-light' : 'btn-outline-light'}`}
                  onClick={() => changeLanguage('cs')}
                >
                  CS
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${i18n.language.startsWith('en') ? 'btn-light' : 'btn-outline-light'}`}
                  onClick={() => changeLanguage('en')}
                >
                  EN
                </button>
              </div>
              <a
                  href="/help"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link">
                <i className="bi bi-question-circle" aria-hidden="true"></i>{' '}{t('app.helpLink')}
              </a>
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

      {isCitationOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="citationModalTitle">
            <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id="citationModalTitle">{t('citation.modalTitle')}</h5>
                  <button type="button" className="btn-close" aria-label={t('app.close')} onClick={handleCloseCitation}></button>
                </div>
                <div className="modal-body">
                  <p>
                    <Trans i18nKey="citation.modalBodyIntro" components={{ strong: <strong /> }} />
                  </p>
                  <p className="mb-1"><strong>{t('citation.methodologyHeading')}</strong></p>
                  <p>
                    <Trans i18nKey="citation.methodologyCitation" components={{ em: <em /> }} />
                  </p>
                  <p>{t('citation.methodologyDescription')}</p>
                  <p className="mb-1"><strong>{t('citation.datasetHeading')}</strong></p>
                  <p className="mb-1">{t('citation.datasetIntro')}</p>
                  <p className="mb-0">
                    <Trans i18nKey="citation.datasetCitation" components={{ em: <em /> }} />
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleCloseCitation}>{t('app.close')}</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <MapView ref={mapViewRef} onUiStateChange={setUiState} />
    </div>
  );
}