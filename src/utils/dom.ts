// Criação de elementos sem innerHTML: todo texto entra via textContent,
// então conteúdo vindo de listas IPTV nunca é interpretado como HTML.

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  id?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text != null) node.textContent = props.text;
  if (props.attrs) for (const k of Object.keys(props.attrs)) node.setAttribute(k, props.attrs[k]);
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
