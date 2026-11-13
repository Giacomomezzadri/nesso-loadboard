/**
 * Minimal, dependency-free .xlsx reader: enough to pull the cell values out of a
 * plain data sheet. An .xlsx is a zip of XML files, so this reads the zip's
 * central directory, inflates entries with the browser's DecompressionStream and
 * parses the XML with DOMParser. Formulas yield their cached value (as Excel
 * last saved it); styles, merged cells and number formats are ignored, so a
 * date comes back as its serial number (see excelSerialToIso).
 */

export interface XlsxSheet {
  name: string
  /** Dense grid of cell values as text, row-major; empty cells are ''. */
  rows: string[][]
}

export class XlsxReadError extends Error {}

const SIG_END_OF_CENTRAL_DIR = 0x06054b50
const SIG_CENTRAL_DIR_ENTRY = 0x02014b50
const SIG_LOCAL_HEADER = 0x04034b50

interface ZipEntry {
  method: number
  compressedSize: number
  localHeaderOffset: number
}

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end-of-central-directory record sits in the last 22 bytes + an optional comment (≤ 64 KiB).
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === SIG_END_OF_CENTRAL_DIR) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxReadError('il file non è un Excel .xlsx valido')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL_DIR_ENTRY) throw new XlsxReadError('file .xlsx danneggiato')
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength))
    entries.set(name, {
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      localHeaderOffset: view.getUint32(p + 42, true),
    })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readZipText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const h = entry.localHeaderOffset
  if (view.getUint32(h, true) !== SIG_LOCAL_HEADER) throw new XlsxReadError('file .xlsx danneggiato')
  const start = h + 30 + view.getUint16(h + 26, true) + view.getUint16(h + 28, true)
  const data = bytes.slice(start, start + entry.compressedSize)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) throw new XlsxReadError('compressione .xlsx non supportata')
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new XlsxReadError('file .xlsx danneggiato')
  return doc
}

/** Elements by local name, whatever namespace prefix the producing app used. */
function byTag(node: Document | Element, localName: string): Element[] {
  return Array.from(node.getElementsByTagNameNS('*', localName))
}

function childByTag(node: Element, localName: string): Element | undefined {
  return Array.from(node.children).find((c) => c.localName === localName)
}

/** Text of a shared string or inline string: plain <t>, or rich-text runs <r><t>; phonetic hints skipped. */
function stringItemText(si: Element): string {
  return byTag(si, 't')
    .filter((t) => t.parentElement === si || t.parentElement?.localName === 'r')
    .map((t) => t.textContent ?? '')
    .join('')
}

/** "AB12" → 27 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function sheetRows(doc: Document, sharedStrings: string[]): string[][] {
  const rows: string[][] = []
  for (const row of byTag(doc, 'row')) {
    const rowNumber = Number(row.getAttribute('r'))
    const index = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length
    const cells: string[] = []
    for (const c of Array.from(row.children).filter((el) => el.localName === 'c')) {
      const ref = c.getAttribute('r')
      const col = ref ? columnIndex(ref) : cells.length
      const type = c.getAttribute('t')
      let value: string
      if (type === 'inlineStr') {
        const is = childByTag(c, 'is')
        value = is ? stringItemText(is) : ''
      } else {
        const raw = childByTag(c, 'v')?.textContent ?? ''
        value = type === 's' && raw !== '' ? (sharedStrings[Number(raw)] ?? '') : raw
      }
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    while (rows.length < index) rows.push([])
    rows[index] = cells
  }
  return rows
}

/** Every worksheet in workbook order. */
export async function readXlsx(file: Blob): Promise<XlsxSheet[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const entries = readZipDirectory(bytes)
  const text = async (path: string) => {
    const entry = entries.get(path)
    return entry ? readZipText(bytes, entry) : undefined
  }

  const workbookXml = await text('xl/workbook.xml')
  const relsXml = await text('xl/_rels/workbook.xml.rels')
  if (!workbookXml || !relsXml) throw new XlsxReadError('il file non è un Excel .xlsx valido')

  const sharedXml = await text('xl/sharedStrings.xml')
  const sharedStrings = sharedXml ? byTag(parseXml(sharedXml), 'si').map(stringItemText) : []

  const targets = new Map(byTag(parseXml(relsXml), 'Relationship').map((r) => [r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '']))
  const sheets: XlsxSheet[] = []
  for (const sheet of byTag(parseXml(workbookXml), 'sheet')) {
    // The r:id attribute — matched by local name, the prefix varies between producers.
    const relId = Array.from(sheet.attributes).find((a) => a.localName === 'id' && a.namespaceURI?.includes('relationships'))?.value
    const target = relId ? targets.get(relId) : undefined
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    const xml = await text(path)
    if (xml) sheets.push({ name: sheet.getAttribute('name') ?? '', rows: sheetRows(parseXml(xml), sharedStrings) })
  }
  return sheets
}

/** Excel date serial (1900 date system) → "YYYY-MM-DD". */
export function excelSerialToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10)
}
