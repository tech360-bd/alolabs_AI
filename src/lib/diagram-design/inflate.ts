/**
 * Minimal raw-DEFLATE decompressor (RFC 1951), dependency-free and sync.
 *
 * draw.io stores compressed pages as base64(deflateRaw(urlencode(xml))).
 * This decoder runs in the browser and in Node with no native or third-party
 * dependency: stored blocks, fixed Huffman and dynamic Huffman, plus the
 * length/distance tables. It throws `InflateError` on malformed input rather
 * than guessing — imported files are untrusted data.
 */

export class InflateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InflateError'
  }
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]
/** Order in which the code-length code lengths appear in a dynamic block. */
const CLCL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

class BitReader {
  private pos = 0
  private bit = 0
  private readonly data: Uint8Array

  constructor(data: Uint8Array) {
    this.data = data
  }

  bits(n: number): number {
    let out = 0
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.data.length) throw new InflateError('unexpected end of deflate stream')
      const b = (this.data[this.pos] >> this.bit) & 1
      out |= b << i
      this.bit++
      if (this.bit === 8) {
        this.bit = 0
        this.pos++
      }
    }
    return out
  }

  align(): void {
    if (this.bit) {
      this.bit = 0
      this.pos++
    }
  }

  bytes(n: number): Uint8Array {
    this.align()
    if (this.pos + n > this.data.length) throw new InflateError('unexpected end of deflate stream')
    const out = this.data.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
}

/** Canonical Huffman decode table: one entry per (length, code) pair. */
interface HuffTable {
  counts: number[]
  symbols: number[]
}

function buildHuff(lengths: number[]): HuffTable {
  const counts = new Array<number>(16).fill(0)
  for (const l of lengths) counts[l]++
  counts[0] = 0
  const offsets = new Array<number>(16).fill(0)
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1]
  const symbols = new Array<number>(lengths.length).fill(0)
  for (let s = 0; s < lengths.length; s++) {
    const l = lengths[s]
    if (l) symbols[offsets[l]++] = s
  }
  return { counts, symbols }
}

function decodeSymbol(br: BitReader, table: HuffTable): number {
  let code = 0
  let first = 0
  let index = 0
  for (let len = 1; len < 16; len++) {
    code |= br.bits(1)
    const count = table.counts[len]
    if (code - first < count) return table.symbols[index + (code - first)]
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  throw new InflateError('invalid Huffman code in deflate stream')
}

function fixedTables(): { lit: HuffTable; dist: HuffTable } {
  const litLengths = new Array<number>(288)
  for (let i = 0; i < 288; i++) litLengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8
  return { lit: buildHuff(litLengths), dist: buildHuff(new Array<number>(30).fill(5)) }
}

/**
 * Inflate a raw DEFLATE stream (no zlib/gzip wrapper) to bytes.
 */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const br = new BitReader(data)
  const out: number[] = []

  for (;;) {
    const final = br.bits(1)
    const type = br.bits(2)

    if (type === 0) {
      br.align()
      const lenBytes = br.bytes(4)
      const len = lenBytes[0] | (lenBytes[1] << 8)
      const nlen = lenBytes[2] | (lenBytes[3] << 8)
      if ((len ^ 0xffff) !== nlen) throw new InflateError('stored block length check failed')
      const chunk = br.bytes(len)
      for (let i = 0; i < chunk.length; i++) out.push(chunk[i])
    } else if (type === 1 || type === 2) {
      let lit: HuffTable
      let dist: HuffTable
      if (type === 1) {
        ;({ lit, dist } = fixedTables())
      } else {
        const hlit = br.bits(5) + 257
        const hdist = br.bits(5) + 1
        const hclen = br.bits(4) + 4
        const clcl = new Array<number>(19).fill(0)
        for (let i = 0; i < hclen; i++) clcl[CLCL_ORDER[i]] = br.bits(3)
        const clTable = buildHuff(clcl)
        const lengths = new Array<number>(hlit + hdist).fill(0)
        let i = 0
        while (i < lengths.length) {
          const sym = decodeSymbol(br, clTable)
          if (sym < 16) {
            lengths[i++] = sym
          } else if (sym === 16) {
            if (i === 0) throw new InflateError('invalid repeat in deflate code lengths')
            const prev = lengths[i - 1]
            let n = 3 + br.bits(2)
            while (n-- && i < lengths.length) lengths[i++] = prev
          } else if (sym === 17) {
            let n = 3 + br.bits(3)
            while (n-- && i < lengths.length) lengths[i++] = 0
          } else {
            let n = 11 + br.bits(7)
            while (n-- && i < lengths.length) lengths[i++] = 0
          }
        }
        lit = buildHuff(lengths.slice(0, hlit))
        dist = buildHuff(lengths.slice(hlit))
      }

      for (;;) {
        const sym = decodeSymbol(br, lit)
        if (sym < 256) {
          out.push(sym)
        } else if (sym === 256) {
          break
        } else {
          const li = sym - 257
          if (li >= LENGTH_BASE.length) throw new InflateError('invalid length symbol in deflate stream')
          const length = LENGTH_BASE[li] + br.bits(LENGTH_EXTRA[li])
          const dsym = decodeSymbol(br, dist)
          if (dsym >= DIST_BASE.length) throw new InflateError('invalid distance symbol in deflate stream')
          const distance = DIST_BASE[dsym] + br.bits(DIST_EXTRA[dsym])
          if (distance > out.length) throw new InflateError('deflate distance exceeds output length')
          for (let k = 0; k < length; k++) out.push(out[out.length - distance])
        }
      }
    } else {
      throw new InflateError('invalid deflate block type')
    }

    if (final) break
  }

  return Uint8Array.from(out)
}
