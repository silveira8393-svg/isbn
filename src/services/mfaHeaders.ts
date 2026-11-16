/** Resolve lazily so pure bibliography transforms remain independent of the browser Auth client. */
export async function mfaHeaders(): Promise<Record<string, string>> {
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('authentication_required');
  return { Accept: 'application/json', Authorization: `Bearer ${data.session.access_token}` };
}
