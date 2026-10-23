// fraction.js — BigInt exact rational arithmetic (零依赖，无浮点)
// 与原算例的 Python fractions 同口径：所有系数、求解、对偶值均为精确有理数。
// 用法: F.from("18.2") / F.from("14619/18265") / new F(3n, 4n)

const absBig = (a) => (a < 0n ? -a : a);

function gcdBig(a, b) {
  a = absBig(a); b = absBig(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export class F {
  constructor(n, d = 1n) {
    if (typeof n === 'number' && Number.isInteger(n)) n = BigInt(n);
    if (typeof d === 'number' && Number.isInteger(d)) d = BigInt(d);
    if (typeof n !== 'bigint' || typeof d !== 'bigint') throw new Error(`F: non-integer args ${n}/${d}`);
    if (d === 0n) throw new Error('F: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdBig(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  /** 精确解析十进制字符串或分数串："18.2"→91/5，"14619/18265"，"-0.75"，"12" */
  static from(s) {
    if (s instanceof F) return s;
    if (typeof s === 'number') {
      if (!Number.isFinite(s)) throw new Error(`F.from: ${s}`);
      // 仅接受可精确表示的十进制；指数形式拒绝
      const t = String(s);
      if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`F.from: non-exact number ${s}`);
      return F.from(t);
    }
    const str = String(s).trim();
    if (/^-?\d+\/-?\d+$/.test(str)) {
      const [a, b] = str.split('/');
      return new F(BigInt(a), BigInt(b));
    }
    if (/^-?(\d+)(\.\d+)?$/.test(str)) {
      const neg = str.startsWith('-');
      const body = neg ? str.slice(1) : str;
      const [int, frac = ''] = body.split('.');
      const n = BigInt(int + frac);
      const d = 10n ** BigInt(frac.length);
      return new F(neg ? -n : n, d);
    }
    throw new Error(`F.from: cannot parse "${s}"`);
  }

  static ZERO = new F(0n);
  static ONE = new F(1n);

  add(o) { o = F.from(o); return new F(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = F.from(o); return new F(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = F.from(o); return new F(this.n * o.n, this.d * o.d); }
  div(o) { o = F.from(o); if (o.n === 0n) throw new Error('F: divide by zero'); return new F(this.n * o.d, this.d * o.n); }
  neg() { return new F(-this.n, this.d); }
  abs() { return new F(absBig(this.n), this.d); }
  cmp(o) { o = F.from(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  eq(o) { return this.cmp(o) === 0; }
  lt(o) { return this.cmp(o) < 0; }
  gt(o) { return this.cmp(o) > 0; }
  isZero() { return this.n === 0n; }
  isNeg() { return this.n < 0n; }
  isPos() { return this.n > 0n; }
  sign() { return this.isZero() ? 0 : this.isNeg() ? -1 : 1; }

  toNumber() { return Number(this.n) / Number(this.d); }

  /** 四舍五入到 places 位小数，返回数字（用于展示与文档口径对账） */
  toDecimal(places = 4) {
    const scale = 10n ** BigInt(places);
    const scaled = this.abs().mul(scale);
    const q = scaled.n / scaled.d;
    const r = scaled.n % scaled.d;
    const rounded = 2n * r >= scaled.d ? q + 1n : q; // half-up
    const val = Number(rounded) / Number(scale);
    return this.isNeg() ? -val : val;
  }

  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}
