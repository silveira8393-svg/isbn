import { getMagazordModeLabel, magazordModeOptions, useMagazordTestMode } from './useMagazordTestMode';

export default function MagazordTestMode() {
  const { isDeveloper, showConfig, setShowConfig, currentMode, selectedMode,
    hasPendingChange, selectMode, applyMode } = useMagazordTestMode();

  if (!isDeveloper) return null;

  return (
    <div className="space-y-3">
      <p role="status" className="text-xs font-semibold text-slate-700">
        Modo ativo: {getMagazordModeLabel(currentMode)}
      </p>
      <button type="button" title="Configurar modo de teste da simulação" aria-expanded={showConfig}
        onClick={() => setShowConfig(!showConfig)} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-xs cursor-pointer">
        Modo Teste
      </button>
      {showConfig && <div className="flex flex-wrap gap-2" aria-label="Modos de simulação Magazord">
        {magazordModeOptions.map(({ mode, label }) => {
          const isActive = selectedMode === mode;
          return (
            <button key={mode} type="button" aria-pressed={isActive}
              onClick={() => selectMode(mode)}
              className={`px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}>
              {label}
            </button>
          );
        })}
        <button type="button" onClick={applyMode} disabled={!hasPendingChange}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
          Aplicar
        </button>
      </div>}
    </div>
  );
}
