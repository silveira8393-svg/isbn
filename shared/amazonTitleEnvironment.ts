// Deployment rollout only; catalog session, active store and credentials remain mandatory.
export function amazonTitleEnvironmentEnabled(env: {
  NODE_ENV?: string; VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string;
}) {
  if (env.VERCEL_ENV === 'production') return env.NODE_ENV === 'production';
  if (env.VERCEL_ENV === 'preview') return ['feature/isbn-amazon-titulo-etapa2', 'feature/isbn-etapa3-bibliografia-referencias', 'feature/isbn-melhorias-pos-demo'].includes(env.VERCEL_GIT_COMMIT_REF || '');
  return (!env.VERCEL_ENV || env.VERCEL_ENV === 'development') && env.NODE_ENV === 'development';
}
