import { contentImageUrl } from '@/components/ContentImageInput';
import { isYouTube, youTubeEmbed } from '@/lib/youtube';

export const textNodes = el => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
export const directText = el => textNodes(el).map(n => n.textContent.trim()).join('\n');
export function cssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  for (let node = el; node && node.tagName !== 'BODY'; node = node.parentElement) {
    if (node.dataset.cms) { parts.unshift(`[data-cms=${JSON.stringify(node.dataset.cms)}]`); break; }
    if (node.dataset.testid) { parts.unshift(`[data-testid=${JSON.stringify(node.dataset.testid)}]`); break; }
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const siblings = [...(node.parentElement?.children || [])].filter(n => n.tagName === node.tagName);
    parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''));
  }
  return parts.join(' > ');
}

export function readElement(el) {
  const style = el.ownerDocument.defaultView.getComputedStyle(el);
  const background = style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
  const image = el.tagName === 'IMG' || el.dataset.editorImage || background;
  const video = ['VIDEO', 'IFRAME'].includes(el.tagName);
  const kind = video ? 'video' : image ? 'image' : el.tagName === 'A' ? 'link' : 'text';
  const props = {};
  const text = directText(el);
  if (!image && !video && (text || (!el.children.length && el.dataset.cms) || (el.matches('a,button') && [...el.childNodes].some(n => n.nodeType === 3)))) props.text = text;
  if (el.tagName === 'A') props.href = el.getAttribute('href') || '';
  if (image || video) props.src = el.dataset.videoSource || el.getAttribute('src') || background || '';
  if (el.tagName === 'IMG') props.alt = el.getAttribute('alt') || '';
  if (el.tagName === 'VIDEO') props.poster = el.getAttribute('poster') || '';
  return { selector: cssPath(el), kind, props, tag: el.tagName, hasChildren: el.children.length > 0 && props.text == null };
}

export function applyOne(el, kind, props) {
  if (props.text != null && !['image', 'video'].includes(kind)) {
    const nonempty = textNodes(el), nodes = nonempty.length ? nonempty : [...el.childNodes].filter(n => n.nodeType === 3), parts = props.text.split('\n');
    if (nodes.length) nodes.forEach((node, i) => { const value = i === nodes.length - 1 ? parts.slice(i).join('\n') : parts[i] || ''; if (node.textContent !== value) node.textContent = value; });
    else if (!el.children.length && el.textContent !== props.text) el.textContent = props.text;
  }
  for (const key of ['href', 'alt', 'poster']) if (props[key] != null && el.getAttribute(key) !== props[key]) el.setAttribute(key, key === 'poster' ? contentImageUrl(props[key]) : props[key]);
  if (props.href != null) el.dataset.editorHref = props.href;
  for (const key of ['color', 'backgroundColor']) if (props[key] != null) el.style[key] = props[key];
  if (props.src != null) {
    let src = contentImageUrl(props.src);
    if (el.tagName === 'IFRAME' && isYouTube(src)) src = youTubeEmbed(src);
    if (['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName)) { if (el.getAttribute('src') !== src) el.setAttribute('src', src); if (el.tagName === 'IMG') el.removeAttribute('srcset'); }
    else el.style.backgroundImage = src ? `url("${src}")` : '';
  }
}

export function collectContentFields(doc) {
  const root = doc.querySelector('[data-testid="marketing-site"]') || doc.querySelector('main') || doc.querySelector('#root');
  if (!root) return [];
  return [...root.querySelectorAll('*')].filter(el => !el.closest('svg,script,style,[data-ty-editor],input,textarea,select') && (directText(el) || el.matches('img,video,iframe,[data-cms],[data-editor-image]'))).map(el => {
    const field = readElement(el);
    const section = el.closest('section,header,footer');
    return { ...field, section: section?.id || section?.dataset.testid || section?.tagName.toLowerCase() || 'Page', label: el.getAttribute('alt') || field.props.text?.slice(0, 90) || el.dataset.cms || el.tagName.toLowerCase() };
  }).filter(field => Object.keys(field.props).length && field.selector).slice(0, 600);
}