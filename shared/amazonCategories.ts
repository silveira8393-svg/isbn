/** Public browse metadata only; bounded independently of the bibliographic result. */
export type AmazonBrowseNode = { classificationId: string; displayName: string; parent?: AmazonBrowseNode };
export function amazonBrowseNode(value: unknown, depth = 0): AmazonBrowseNode | undefined {
  if (!value || typeof value !== 'object' || depth >= 12) return;
  const node = value as Record<string, unknown>;
  const valid = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 500 && !/[<>\x00-\x1f]/.test(v);
  if (!valid(node.classificationId) || !valid(node.displayName)) return;
  const parent = node.parent == null ? undefined : amazonBrowseNode(node.parent, depth + 1);
  if (node.parent != null && !parent) return;
  return { classificationId: node.classificationId.trim(), displayName: node.displayName.trim(), ...(parent ? { parent } : {}) };
}
export function amazonCategoryPath(node: AmazonBrowseNode): string {
  return node.parent ? `${amazonCategoryPath(node.parent)} > ${node.displayName}` : node.displayName;
}
export function amazonBrowseNodes(value: unknown): AmazonBrowseNode[] {
  const nodes = (Array.isArray(value) ? value.slice(0, 100) : []).map(v => amazonBrowseNode(v)).filter((v): v is AmazonBrowseNode => !!v);
  const unique = new Map<string, AmazonBrowseNode>();
  for (const node of nodes) {
    const prior = unique.get(node.classificationId);
    if (!prior || amazonCategoryPath(node).split(' > ').length > amazonCategoryPath(prior).split(' > ').length) unique.set(node.classificationId, node);
  }
  return [...unique.values()];
}
