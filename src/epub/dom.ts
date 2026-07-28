import { DOMParser } from "linkedom";

/**
 * A minimal structural view of the DOM members this scraper touches.
 *
 * linkedom's own declarations are written against `globalThis.Document` and
 * friends, which only exist when TypeScript's DOM lib is loaded — and this is a
 * Node project compiled against ES2022 alone. Declaring the handful of members
 * we actually use keeps the scraper strongly typed without dragging browser
 * globals into the build.
 */
export interface DomAttr {
  readonly name: string;
  readonly value: string;
}

export interface DomNode {
  readonly nodeType: number;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<DomNode> & Iterable<DomNode>;
  remove(): void;
  replaceWith(...nodes: DomNode[]): void;
}

export interface DomElement extends DomNode {
  /** Uppercase, as in the browser: "DIV", "IMG". */
  readonly tagName: string;
  innerHTML: string;
  readonly attributes: ArrayLike<DomAttr> & Iterable<DomAttr>;
  readonly children: ArrayLike<DomElement> & Iterable<DomElement>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement> & Iterable<DomElement>;
  cloneNode(deep: boolean): DomElement;
}

export interface DomDocument {
  readonly documentElement: DomElement;
  readonly body: DomElement | null;
  querySelector(selector: string): DomElement | null;
  getElementById(id: string): DomElement | null;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Elements XHTML requires to be self-closed. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Tag names safe to emit into an XML document without escaping games. */
const SAFE_TAG_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const parser = new DOMParser();

export function parseHtml(html: string): DomDocument {
  return parser.parseFromString(html, "text/html") as unknown as DomDocument;
}

/**
 * Parses an HTML fragment and returns its wrapper element.
 *
 * linkedom does not synthesise `<html><body>` around a bare fragment the way a
 * browser does, so the explicit wrapper is what gives us a node to read the
 * parsed children back from.
 */
export function parseFragment(html: string): DomElement {
  const doc = parseHtml(`<div id="__root">${html}</div>`);
  return doc.getElementById("__root") ?? doc.documentElement;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serialises a node as XHTML.
 *
 * EPUB readers parse content documents with a strict XML parser, so the
 * unclosed `<br>`/`<img>` tags and raw `&` characters that WordPress emits
 * routinely would break the book. Writing this by hand rather than reaching for
 * `XMLSerializer` also lets us drop comments and anything with a tag name XML
 * would reject, instead of faithfully reproducing markup that fails to parse.
 */
export function serializeXhtml(node: DomNode): string {
  if (node.nodeType === TEXT_NODE) return escapeXml(node.textContent ?? "");
  if (node.nodeType !== ELEMENT_NODE) return "";

  const element = node as DomElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map(serializeXhtml).join("");

  // An exotic tag name is dropped rather than risking an unparsable document;
  // its children still carry the text, so nothing readable is lost.
  if (!SAFE_TAG_NAME.test(tag)) return children;

  const attributes = Array.from(element.attributes)
    .filter((attribute) => SAFE_TAG_NAME.test(attribute.name))
    .map((attribute) => ` ${attribute.name}="${escapeXml(attribute.value)}"`)
    .join("");

  return VOID_ELEMENTS.has(tag)
    ? `<${tag}${attributes} />`
    : `<${tag}${attributes}>${children}</${tag}>`;
}

/** Converts an HTML fragment into well-formed XHTML. */
export function toXhtmlFragment(html: string): string {
  return Array.from(parseFragment(html).childNodes).map(serializeXhtml).join("");
}

/** Wraps a fragment in a complete XHTML content document. */
export function xhtmlDocument(title: string, bodyXhtml: string, language = "en"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body>
${bodyXhtml}
  </body>
</html>
`;
}
