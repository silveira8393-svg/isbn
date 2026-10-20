export type IntegrationMode = 'simulated' | 'real';

/** Presentation follows the integration adapter. Changing this does not activate any integration. */
export function getMagazordPresentation(mode: IntegrationMode) {
  const simulated = mode === 'simulated';
  return {
    mode,
    title: simulated ? 'Magazord — integração simulada' : 'Integração Magazord',
    submit: simulated ? 'CONCLUIR CADASTRO NO SIMULADOR' : 'CADASTRAR NA MAGAZORD',
    notice: simulated ? 'Magazord simulada: catálogo e estoque locais deste navegador. Nenhum produto ou estoque é publicado na Magazord ou nos marketplaces. As consultas bibliográficas continuam reais.' : 'Integração Magazord ativa.',
    message: (text: string) => simulated ? text
      .replace(/catálogo Magazord/gi, 'catálogo simulado Magazord')
      .replace(/base Magazord/gi, 'base simulada Magazord')
      .replace(/\bna Magazord\b/gi, 'no catálogo simulado Magazord')
      .replace(/\bno Magazord\b/gi, 'no simulador Magazord') : text,
  };
}

// The current application is wired exclusively to magazordMockService.
export const magazordPresentation = getMagazordPresentation('simulated');
