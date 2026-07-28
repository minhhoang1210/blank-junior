import { escapeXml } from "./dom.js";
import type { StoryMeta } from "./types.js";

export interface NavPoint {
  href: string;
  title: string;
}

export const EPUB_CSS = `@charset "utf-8";

body {
  margin: 5% 6%;
  line-height: 1.65;
  text-align: justify;
  font-family: Georgia, "Times New Roman", serif;
}

h1, h2 {
  text-align: center;
  line-height: 1.3;
  page-break-after: avoid;
  font-weight: normal;
}

h1 { font-size: 1.5em; margin: 1.5em 0 1.2em; }
h2 { font-size: 1.25em; margin: 1.2em 0 1em; }

p { margin: 0 0 0.85em; text-indent: 1.2em; }
p:first-of-type { text-indent: 0; }

blockquote { margin: 1em 2em; font-style: italic; }
hr { border: none; border-top: 1px solid #999; margin: 2em 20%; }
img { max-width: 100%; height: auto; }

.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; height: auto; }
.meta { text-align: center; color: #555; font-style: italic; margin-bottom: 2em; }
.source { font-size: 0.85em; color: #777; text-align: center; margin-top: 3em; }
`;

export const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/** The OPF package document: metadata, manifest and reading order. */
export function buildOpf(options: {
  meta: StoryMeta;
  uuid: string;
  modified: string;
  manifest: string[];
  spine: string[];
  hasCover: boolean;
}): string {
  const { meta, uuid, modified, manifest, spine, hasCover } = options;
  const indent = (entries: string[]) => entries.map((entry) => `    ${entry}`).join("\n");

  // dc:creator is omitted rather than left empty — an empty one shows as a blank
  // author in reader libraries.
  const creator = meta.author ? `    <dc:creator>${escapeXml(meta.author)}</dc:creator>\n` : "";
  const coverMeta = hasCover ? '    <meta name="cover" content="cover-image"/>\n' : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(meta.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(uuid)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
${creator}    <dc:language>${escapeXml(meta.language)}</dc:language>
    <dc:source>${escapeXml(meta.sourceUrl)}</dc:source>
    <dc:date>${modified}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
${coverMeta}  </metadata>
  <manifest>
${indent(manifest)}
  </manifest>
  <spine toc="ncx">
${indent(spine)}
  </spine>
</package>
`;
}

/** The EPUB 3 navigation document. */
export function buildNavBody(navPoints: NavPoint[]): string {
  const items = navPoints
    .map(
      (point) =>
        `        <li><a href="${escapeXml(point.href)}">${escapeXml(point.title)}</a></li>`,
    )
    .join("\n");

  return `    <nav epub:type="toc" id="toc">
      <h1>Mục lục</h1>
      <ol>
${items}
      </ol>
    </nav>`;
}

/** The EPUB 2 NCX, kept so older readers still get a table of contents. */
export function buildNcx(uuid: string, meta: StoryMeta, navPoints: NavPoint[]): string {
  const points = navPoints
    .map(
      (point, index) => `    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(point.title)}</text></navLabel>
      <content src="${escapeXml(point.href)}"/>
    </navPoint>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(uuid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(meta.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}
