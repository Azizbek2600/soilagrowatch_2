import { t } from '../../i18n'
import './DrawInstructions.css'

export default function DrawInstructions({ vertexCount, areaHa = 0, onFinish, onCancel, lang }) {
  const L   = lang ?? 'uz'
  const need  = Math.max(0, 3 - vertexCount)
  const ready = vertexCount >= 3

  return (
    <div className="di-bar">

      {/* Vertex counter */}
      <div className={`di-count${ready ? ' di-count--ready' : ''}`}>
        <span className="di-count-num">{vertexCount}</span>
        <span className="di-count-lbl">{t(L, 'pointWord')}</span>
      </div>

      {/* Area display (only when >= 3 vertices) */}
      {ready && areaHa > 0 && (
        <>
          <div className="di-sep" />
          <div className="di-area">
            <span className="di-area-val">{areaHa.toFixed(2)}</span>
            <span className="di-area-unit">ga</span>
          </div>
        </>
      )}

      <div className="di-sep" />

      {/* Instruction text */}
      <div className="di-msg-wrap">
        {vertexCount === 0 && (
          <span className="di-msg">
            <i className="ti ti-map-pin di-msg-ico" />
            {t(L, 'markFirstPoint')}
          </span>
        )}
        {vertexCount > 0 && vertexCount < 3 && (
          <span className="di-msg">
            <i className="ti ti-circle-plus di-msg-ico" />
            {L === 'en'
              ? <>Add <strong>{need}</strong> more {need === 1 ? 'point' : 'points'}</>
              : <>Yana <strong>{need}</strong> ta nuqta qo'shing</>
            }
          </span>
        )}
        {ready && (
          <span className="di-msg di-msg--ready">
            <i className="ti ti-check di-msg-ico" />
            <strong>{vertexCount}</strong> {t(L, 'pointWord')} — {t(L, 'readyContinue')}
          </span>
        )}
      </div>

      {/* Vertex dots preview */}
      <div className="di-dots">
        {Array.from({ length: Math.min(vertexCount, 8) }).map((_, i) => (
          <span key={i} className={`di-dot${i === 0 ? ' di-dot--first' : ''}`} />
        ))}
        {vertexCount > 8 && (
          <span className="di-dot-more">+{vertexCount - 8}</span>
        )}
      </div>

      <div className="di-sep" />

      {/* Finish button (enabled when >= 3 vertices) */}
      <button
        className={`di-finish${ready ? ' di-finish--ready' : ''}`}
        onClick={onFinish}
        disabled={!ready}
        title={ready ? t(L, 'polygonClose') : t(L, 'needMinPoints')}
      >
        <i className="ti ti-check" />
        {t(L, 'finishBtn')}
      </button>

      <div className="di-sep" />

      {/* Cancel */}
      <button className="di-cancel" onClick={onCancel}>
        <i className="ti ti-x" />
        {t(L, 'cancelBtn')}
      </button>
    </div>
  )
}
