import { useEffect, useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import { magazordMockService, type MagazordSimulationMode } from '../../services/magazordMockService';

export const magazordModeOptions: { mode: MagazordSimulationMode; label: string }[] = [
  { mode: 'auto', label: 'Padrão (Auto)' },
  { mode: 'force_new_found', label: 'Novo Encontrado' },
  { mode: 'force_new_not_found', label: 'Novo Não Encontrado' },
  { mode: 'force_used_known', label: 'Usado / Edição Conhecida' },
  { mode: 'force_multiple_matches', label: 'Múltiplos Resultados' },
  { mode: 'force_error', label: 'Simular Erro' },
];

function normalizeMode(mode: MagazordSimulationMode): MagazordSimulationMode {
  if (mode === 'force_existing') return 'force_new_found';
  if (mode === 'force_not_found') return 'force_new_not_found';
  return mode;
}

export function getMagazordModeLabel(mode: MagazordSimulationMode): string {
  return magazordModeOptions.find(option => option.mode === normalizeMode(mode))?.label ?? mode;
}

export function useMagazordTestMode(onApplied?: () => void, syncKey?: unknown) {
  const { isDeveloper } = useUser();
  const [showConfig, setShowConfig] = useState(false);
  const [currentMode, setCurrentMode] = useState(() => magazordMockService.getSimulationConfig().mode);
  const [selectedMode, setSelectedMode] = useState(() => normalizeMode(currentMode));
  const hasPendingChange = selectedMode !== normalizeMode(currentMode);

  const resetRestrictedMode = () => {
    magazordMockService.resetModeToAuto();
    setCurrentMode('auto');
    setSelectedMode('auto');
    setShowConfig(false);
  };

  useEffect(() => {
    if (!isDeveloper) {
      resetRestrictedMode();
      return;
    }
    const mode = magazordMockService.getSimulationConfig().mode;
    setCurrentMode(mode);
    setSelectedMode(normalizeMode(mode));
  }, [isDeveloper]);

  // Preserve a pending choice when a catalog result refreshes the effective mode.
  useEffect(() => {
    if (!isDeveloper) return;
    const mode = magazordMockService.getSimulationConfig().mode;
    setCurrentMode(mode);
    if (!hasPendingChange) setSelectedMode(normalizeMode(mode));
  }, [syncKey]);

  const selectMode = (mode: MagazordSimulationMode) => {
    if (!isDeveloper) {
      resetRestrictedMode();
      return;
    }
    setSelectedMode(normalizeMode(mode));
  };

  const applyMode = () => {
    if (!isDeveloper) {
      resetRestrictedMode();
      return;
    }
    const effectiveMode = magazordMockService.getSimulationConfig().mode;
    if (selectedMode === normalizeMode(effectiveMode)) {
      setCurrentMode(effectiveMode);
      return;
    }
    magazordMockService.setSimulationConfig({ mode: selectedMode });
    setCurrentMode(magazordMockService.getSimulationConfig().mode);
    onApplied?.();
  };

  return {
    isDeveloper, showConfig, setShowConfig, currentMode, selectedMode,
    hasPendingChange, selectMode, applyMode,
  };
}
