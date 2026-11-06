export interface MagazordCategory { id: number; nome: string; pai: number | null }
export interface CategoryOption extends MagazordCategory { path: string; depth: number }
export interface CategoryCatalog { source: 'magazord'; categories: CategoryOption[]; invalidCount: number; fetchedAt: string }

/** Keep commercial IDs and parent links untouched; invalid branches cannot be selected. */
export function buildCategoryTree(categories: MagazordCategory[]) {
  const byId = new Map(categories.map(category => [category.id, category]));
  if (byId.size !== categories.length) throw new Error('duplicate_category');
  const paths = new Map<number, CategoryOption | null>();
  function resolve(id: number, visiting = new Set<number>()): CategoryOption | null {
    if (paths.has(id)) return paths.get(id)!;
    const category = byId.get(id);
    if (!category || visiting.has(id)) return null;
    visiting.add(id);
    const parent = category.pai === null ? null : resolve(category.pai, visiting);
    visiting.delete(id);
    const option = category.pai !== null && !parent ? null : { ...category,
      path: parent ? `${parent.path} > ${category.nome}` : category.nome, depth: parent ? parent.depth + 1 : 0 };
    paths.set(id, option);
    return option;
  }
  const options = categories.map(category => resolve(category.id)).filter((value): value is CategoryOption => !!value)
    .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR') || a.id - b.id);
  return { options, invalidCount: categories.length - options.length };
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function searchCategories(categories: CategoryOption[], query: string) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return categories.filter(category => terms.every(term => normalize(category.path).includes(term)));
}
