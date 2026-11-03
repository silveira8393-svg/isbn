import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/contexts/UserContext.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'identity-boundary', setup(b) {
  b.onResolve({ filter: /^react$|^react\/jsx-runtime$|\/lib\/supabase$|\/components\/(Login|ResetPassword)$/ }, a => ({ path: a.path, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ loader: 'js', contents: a.path === 'react' ? 'module.exports=deps.react' : a.path === 'react/jsx-runtime' ? 'exports.jsx=exports.jsxs=(type,props,key)=>({type,props,key})' : a.path.endsWith('supabase') ? 'exports.supabase=deps.sdk' : 'module.exports="Login"' }));
} }] });
const uid = 'c551813b-236c-4d24-8778-b748fa6a02cc';
const commercial = '6058abd1-96e5-465b-a1df-292e5cf76de3', lab = '492af2ad-905c-42f8-90f4-aa6c1dc142f3';
const stores = [{ id: commercial, name: 'Sebo Livraria Sul', slug: 'sebo', active: true }, { id: lab, name: 'Laboratório', slug: 'lab', active: true }];
function harness(t, memberships) {
  const previous = globalThis.window; globalThis.window = { location: { href: 'https://isbn.example/' } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  let slots = [], cursor = 0, effects = [], tree, authCallback;
  const data = { memberships, stores, profile: { id: uid, display_name: 'Pessoa', active: true } }, calls = [];
  const deps = { react: {
    createContext: () => ({ Provider: 'Provider' }),
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(callback, dependencies) { const i = cursor++, old = slots[i]; if (!old || dependencies.some((v, j) => !Object.is(v, old.dependencies[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { dependencies, cleanup: callback() }; }); },
  }, sdk: {
    auth: { onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { user: { id: uid }, access_token: 'initial' } } }), signOut: async () => ({ error: null }) },
    from(table) { const filters = []; calls.push({ table, filters }); const result = () => ({ error: null, data: table === 'profiles' ? data.profile : table === 'stores' ? data.stores.find(s => s.id === filters.find(([k]) => k === 'id')?.[1]) ?? null : data.memberships.filter(m => filters.every(([k, v]) => m[k] === v)) });
      return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, maybeSingle: async () => result(), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } }; },
  } };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', bundled.outputFiles[0].text)(deps, module, module.exports);
  const api = module.exports;
  const render = () => { cursor = 0; effects = []; tree = api.UserProvider({ children: 'Protected application' }); effects.forEach(e => e()); };
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  render();
  return { data, calls, async settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); await Promise.resolve(); render(); } },
    tree: () => tree, text: () => text(tree), user: () => tree?.props?.value?.currentUser,
    choose(name) { nodes(tree).find(n => n.type === 'button' && text(n).includes(name)).props.onClick(); render(); },
    refresh() { authCallback('TOKEN_REFRESHED', { user: { id: uid }, access_token: crypto.randomUUID() }); render(); },
    signOut() { authCallback('SIGNED_OUT', null); render(); }, api };
}
const member = (store_id, role = 'developer') => ({ user_id: uid, store_id, role, active: true });

test('Two stores always require explicit selection regardless of UUID order; selection is revalidated and retained on token refresh', async t => {
  const h = harness(t, [member(lab), member(commercial)]); await h.settle();
  assert.equal(h.user(), undefined); assert.match(h.text(), /Selecione a loja operacional/);
  h.data.memberships.reverse(); h.choose('Sebo Livraria Sul'); await h.settle();
  assert.equal(h.user().storeId, commercial); assert.equal(h.user().role, 'developer');
  assert.equal(h.tree().props.value.canViewDeveloperTools, true);
  h.refresh(); await h.settle(); assert.equal(h.user().storeId, commercial);
  h.data.memberships = [member(lab)]; h.refresh(); await h.settle();
  assert.equal(h.user(), undefined, 'revocation cannot silently switch to the other store');
  h.choose('Laboratório'); await h.settle(); assert.equal(h.user().storeId, lab);
  h.signOut(); await h.settle(); assert.equal(h.user(), undefined);
});
for (const role of ['admin', 'operator']) test(`Single-store ${role} enters directly and retains commercial permissions`, async t => {
  const h = harness(t, [member(commercial, role)]); await h.settle();
  assert.equal(h.user().storeId, commercial); assert.equal(h.user().role, role);
  assert.equal(h.tree().props.value.canViewDeveloperTools, false);
  assert.equal(h.tree().props.value.operationEnvironment, 'production');
});
test('An inactive or mismatched profile/store is never offered as an authorized operational identity', async t => {
  const h = harness(t, [member(commercial)]); h.data.profile.active = false; await h.settle(); assert.equal(h.user(), undefined);
});
