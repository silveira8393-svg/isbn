// Preview rollout is deliberately limited to the homologation branch, on both build and server.
export function amazonTitleEnvironmentEnabled(env: {
  NODE_ENV?: string; VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string;
}) {
  if (env.VERCEL_ENV === 'preview') return ['feature/isbn-amazon-titulo-etapa2', 'feature/isbn-etapa3-bibliografia-referencias', 'feature/isbn-melhorias-pos-demo'].includes(env.VERCEL_GIT_COMMIT_REF || '');
  return (!env.VERCEL_ENV || env.VERCEL_ENV === 'development') && env.NODE_ENV === 'development';
}
