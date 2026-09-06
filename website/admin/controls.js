/**
* @vue/shared v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function ya(e) {
  const t = /* @__PURE__ */ Object.create(null);
  for (const r of e.split(",")) t[r] = 1;
  return (r) => r in t;
}
const Ge = {}, _n = [], Ut = () => {
}, gl = () => !1, ji = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // uppercase letter
(e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), Wi = (e) => e.startsWith("onUpdate:"), pt = Object.assign, va = (e, t) => {
  const r = e.indexOf(t);
  r > -1 && e.splice(r, 1);
}, kc = Object.prototype.hasOwnProperty, Ve = (e, t) => kc.call(e, t), Ce = Array.isArray, wn = (e) => ai(e) === "[object Map]", yl = (e) => ai(e) === "[object Set]", Ga = (e) => ai(e) === "[object Date]", Te = (e) => typeof e == "function", rt = (e) => typeof e == "string", It = (e) => typeof e == "symbol", $e = (e) => e !== null && typeof e == "object", vl = (e) => ($e(e) || Te(e)) && Te(e.then) && Te(e.catch), bl = Object.prototype.toString, ai = (e) => bl.call(e), Mc = (e) => ai(e).slice(8, -1), _l = (e) => ai(e) === "[object Object]", Gi = (e) => rt(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, jn = /* @__PURE__ */ ya(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), Ki = (e) => {
  const t = /* @__PURE__ */ Object.create(null);
  return ((r) => t[r] || (t[r] = e(r)));
}, Ac = /-\w/g, ft = Ki(
  (e) => e.replace(Ac, (t) => t.slice(1).toUpperCase())
), Ec = /\B([A-Z])/g, Rr = Ki(
  (e) => e.replace(Ec, "-$1").toLowerCase()
), Xi = Ki((e) => e.charAt(0).toUpperCase() + e.slice(1)), Wn = Ki(
  (e) => e ? `on${Xi(e)}` : ""
), Ht = (e, t) => !Object.is(e, t), Ao = (e, ...t) => {
  for (let r = 0; r < e.length; r++)
    e[r](...t);
}, Oi = (e, t, r, n = !1) => {
  Object.defineProperty(e, t, {
    configurable: !0,
    enumerable: !1,
    writable: n,
    value: r
  });
}, xc = (e) => {
  const t = parseFloat(e);
  return isNaN(t) ? e : t;
};
let Ka;
const Yr = () => Ka || (Ka = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function at(e) {
  if (Ce(e)) {
    const t = {};
    for (let r = 0; r < e.length; r++) {
      const n = e[r], i = rt(n) ? Tc(n) : at(n);
      if (i)
        for (const o in i)
          t[o] = i[o];
    }
    return t;
  } else if (rt(e) || $e(e))
    return e;
}
const Dc = /;(?![^(]*\))/g, Cc = /:([^]+)/, Sc = /\/\*[^]*?\*\//g;
function Tc(e) {
  const t = {};
  return e.replace(Sc, "").split(Dc).forEach((r) => {
    if (r) {
      const n = r.split(Cc);
      n.length > 1 && (t[n[0].trim()] = n[1].trim());
    }
  }), t;
}
function Pr(e) {
  let t = "";
  if (rt(e))
    t = e;
  else if (Ce(e))
    for (let r = 0; r < e.length; r++) {
      const n = Pr(e[r]);
      n && (t += n + " ");
    }
  else if ($e(e))
    for (const r in e)
      e[r] && (t += r + " ");
  return t.trim();
}
function or(e) {
  if (!e) return null;
  let { class: t, style: r } = e;
  return t && !rt(t) && (e.class = Pr(t)), r && (e.style = at(r)), e;
}
const Nc = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", Oc = /* @__PURE__ */ ya(Nc);
function wl(e) {
  return !!e || e === "";
}
function Pc(e, t) {
  if (e.length !== t.length) return !1;
  let r = !0;
  for (let n = 0; r && n < e.length; n++)
    r = ba(e[n], t[n]);
  return r;
}
function ba(e, t) {
  if (e === t) return !0;
  let r = Ga(e), n = Ga(t);
  if (r || n)
    return r && n ? e.getTime() === t.getTime() : !1;
  if (r = It(e), n = It(t), r || n)
    return e === t;
  if (r = Ce(e), n = Ce(t), r || n)
    return r && n ? Pc(e, t) : !1;
  if (r = $e(e), n = $e(t), r || n) {
    if (!r || !n)
      return !1;
    const i = Object.keys(e).length, o = Object.keys(t).length;
    if (i !== o)
      return !1;
    for (const a in e) {
      const s = e.hasOwnProperty(a), l = t.hasOwnProperty(a);
      if (s && !l || !s && l || !ba(e[a], t[a]))
        return !1;
    }
  }
  return String(e) === String(t);
}
const kl = (e) => !!(e && e.__v_isRef === !0), gt = (e) => rt(e) ? e : e == null ? "" : Ce(e) || $e(e) && (e.toString === bl || !Te(e.toString)) ? kl(e) ? gt(e.value) : JSON.stringify(e, Ml, 2) : String(e), Ml = (e, t) => kl(t) ? Ml(e, t.value) : wn(t) ? {
  [`Map(${t.size})`]: [...t.entries()].reduce(
    (r, [n, i], o) => (r[Eo(n, o) + " =>"] = i, r),
    {}
  )
} : yl(t) ? {
  [`Set(${t.size})`]: [...t.values()].map((r) => Eo(r))
} : It(t) ? Eo(t) : $e(t) && !Ce(t) && !_l(t) ? String(t) : t, Eo = (e, t = "") => {
  var r;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    It(e) ? `Symbol(${(r = e.description) != null ? r : t})` : e
  );
};
/**
* @vue/reactivity v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let vt;
class Al {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t = !1) {
    this.detached = t, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this.__v_skip = !0, this.parent = vt, !t && vt && (this.index = (vt.scopes || (vt.scopes = [])).push(
      this
    ) - 1);
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = !0;
      let t, r;
      if (this.scopes)
        for (t = 0, r = this.scopes.length; t < r; t++)
          this.scopes[t].pause();
      for (t = 0, r = this.effects.length; t < r; t++)
        this.effects[t].pause();
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1;
      let t, r;
      if (this.scopes)
        for (t = 0, r = this.scopes.length; t < r; t++)
          this.scopes[t].resume();
      for (t = 0, r = this.effects.length; t < r; t++)
        this.effects[t].resume();
    }
  }
  run(t) {
    if (this._active) {
      const r = vt;
      try {
        return vt = this, t();
      } finally {
        vt = r;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = vt, vt = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    this._on > 0 && --this._on === 0 && (vt = this.prevScope, this.prevScope = void 0);
  }
  stop(t) {
    if (this._active) {
      this._active = !1;
      let r, n;
      for (r = 0, n = this.effects.length; r < n; r++)
        this.effects[r].stop();
      for (this.effects.length = 0, r = 0, n = this.cleanups.length; r < n; r++)
        this.cleanups[r]();
      if (this.cleanups.length = 0, this.scopes) {
        for (r = 0, n = this.scopes.length; r < n; r++)
          this.scopes[r].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !t) {
        const i = this.parent.scopes.pop();
        i && i !== this && (this.parent.scopes[this.index] = i, i.index = this.index);
      }
      this.parent = void 0;
    }
  }
}
function El(e) {
  return new Al(e);
}
function _a() {
  return vt;
}
function xl(e, t = !1) {
  vt && vt.cleanups.push(e);
}
let Xe;
const xo = /* @__PURE__ */ new WeakSet();
class Dl {
  constructor(t) {
    this.fn = t, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, vt && vt.active && vt.effects.push(this);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, xo.has(this) && (xo.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Sl(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, Xa(this), Tl(this);
    const t = Xe, r = Vt;
    Xe = this, Vt = !0;
    try {
      return this.fn();
    } finally {
      Nl(this), Xe = t, Vt = r, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let t = this.deps; t; t = t.nextDep)
        Ma(t);
      this.deps = this.depsTail = void 0, Xa(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? xo.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  /**
   * @internal
   */
  runIfDirty() {
    Yo(this) && this.run();
  }
  get dirty() {
    return Yo(this);
  }
}
let Cl = 0, Gn, Kn;
function Sl(e, t = !1) {
  if (e.flags |= 8, t) {
    e.next = Kn, Kn = e;
    return;
  }
  e.next = Gn, Gn = e;
}
function wa() {
  Cl++;
}
function ka() {
  if (--Cl > 0)
    return;
  if (Kn) {
    let t = Kn;
    for (Kn = void 0; t; ) {
      const r = t.next;
      t.next = void 0, t.flags &= -9, t = r;
    }
  }
  let e;
  for (; Gn; ) {
    let t = Gn;
    for (Gn = void 0; t; ) {
      const r = t.next;
      if (t.next = void 0, t.flags &= -9, t.flags & 1)
        try {
          t.trigger();
        } catch (n) {
          e || (e = n);
        }
      t = r;
    }
  }
  if (e) throw e;
}
function Tl(e) {
  for (let t = e.deps; t; t = t.nextDep)
    t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function Nl(e) {
  let t, r = e.depsTail, n = r;
  for (; n; ) {
    const i = n.prevDep;
    n.version === -1 ? (n === r && (r = i), Ma(n), Ic(n)) : t = n, n.dep.activeLink = n.prevActiveLink, n.prevActiveLink = void 0, n = i;
  }
  e.deps = t, e.depsTail = r;
}
function Yo(e) {
  for (let t = e.deps; t; t = t.nextDep)
    if (t.dep.version !== t.version || t.dep.computed && (Ol(t.dep.computed) || t.dep.version !== t.version))
      return !0;
  return !!e._dirty;
}
function Ol(e) {
  if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Qn) || (e.globalVersion = Qn, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Yo(e))))
    return;
  e.flags |= 2;
  const t = e.dep, r = Xe, n = Vt;
  Xe = e, Vt = !0;
  try {
    Tl(e);
    const i = e.fn(e._value);
    (t.version === 0 || Ht(i, e._value)) && (e.flags |= 128, e._value = i, t.version++);
  } catch (i) {
    throw t.version++, i;
  } finally {
    Xe = r, Vt = n, Nl(e), e.flags &= -3;
  }
}
function Ma(e, t = !1) {
  const { dep: r, prevSub: n, nextSub: i } = e;
  if (n && (n.nextSub = i, e.prevSub = void 0), i && (i.prevSub = n, e.nextSub = void 0), r.subs === e && (r.subs = n, !n && r.computed)) {
    r.computed.flags &= -5;
    for (let o = r.computed.deps; o; o = o.nextDep)
      Ma(o, !0);
  }
  !t && !--r.sc && r.map && r.map.delete(r.key);
}
function Ic(e) {
  const { prevDep: t, nextDep: r } = e;
  t && (t.nextDep = r, e.prevDep = void 0), r && (r.prevDep = t, e.nextDep = void 0);
}
let Vt = !0;
const Pl = [];
function wr() {
  Pl.push(Vt), Vt = !1;
}
function kr() {
  const e = Pl.pop();
  Vt = e === void 0 ? !0 : e;
}
function Xa(e) {
  const { cleanup: t } = e;
  if (e.cleanup = void 0, t) {
    const r = Xe;
    Xe = void 0;
    try {
      t();
    } finally {
      Xe = r;
    }
  }
}
let Qn = 0;
class Lc {
  constructor(t, r) {
    this.sub = t, this.dep = r, this.version = r.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Yi {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t) {
    this.computed = t, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(t) {
    if (!Xe || !Vt || Xe === this.computed)
      return;
    let r = this.activeLink;
    if (r === void 0 || r.sub !== Xe)
      r = this.activeLink = new Lc(Xe, this), Xe.deps ? (r.prevDep = Xe.depsTail, Xe.depsTail.nextDep = r, Xe.depsTail = r) : Xe.deps = Xe.depsTail = r, Il(r);
    else if (r.version === -1 && (r.version = this.version, r.nextDep)) {
      const n = r.nextDep;
      n.prevDep = r.prevDep, r.prevDep && (r.prevDep.nextDep = n), r.prevDep = Xe.depsTail, r.nextDep = void 0, Xe.depsTail.nextDep = r, Xe.depsTail = r, Xe.deps === r && (Xe.deps = n);
    }
    return r;
  }
  trigger(t) {
    this.version++, Qn++, this.notify(t);
  }
  notify(t) {
    wa();
    try {
      for (let r = this.subs; r; r = r.prevSub)
        r.sub.notify() && r.sub.dep.notify();
    } finally {
      ka();
    }
  }
}
function Il(e) {
  if (e.dep.sc++, e.sub.flags & 4) {
    const t = e.dep.computed;
    if (t && !e.dep.subs) {
      t.flags |= 20;
      for (let n = t.deps; n; n = n.nextDep)
        Il(n);
    }
    const r = e.dep.subs;
    r !== e && (e.prevSub = r, r && (r.nextSub = e)), e.dep.subs = e;
  }
}
const Pi = /* @__PURE__ */ new WeakMap(), Zr = /* @__PURE__ */ Symbol(
  ""
), Zo = /* @__PURE__ */ Symbol(
  ""
), Jn = /* @__PURE__ */ Symbol(
  ""
);
function bt(e, t, r) {
  if (Vt && Xe) {
    let n = Pi.get(e);
    n || Pi.set(e, n = /* @__PURE__ */ new Map());
    let i = n.get(r);
    i || (n.set(r, i = new Yi()), i.map = n, i.key = r), i.track();
  }
}
function yr(e, t, r, n, i, o) {
  const a = Pi.get(e);
  if (!a) {
    Qn++;
    return;
  }
  const s = (l) => {
    l && l.trigger();
  };
  if (wa(), t === "clear")
    a.forEach(s);
  else {
    const l = Ce(e), f = l && Gi(r);
    if (l && r === "length") {
      const d = Number(n);
      a.forEach((u, h) => {
        (h === "length" || h === Jn || !It(h) && h >= d) && s(u);
      });
    } else
      switch ((r !== void 0 || a.has(void 0)) && s(a.get(r)), f && s(a.get(Jn)), t) {
        case "add":
          l ? f && s(a.get("length")) : (s(a.get(Zr)), wn(e) && s(a.get(Zo)));
          break;
        case "delete":
          l || (s(a.get(Zr)), wn(e) && s(a.get(Zo)));
          break;
        case "set":
          wn(e) && s(a.get(Zr));
          break;
      }
  }
  ka();
}
function Rc(e, t) {
  const r = Pi.get(e);
  return r && r.get(t);
}
function hn(e) {
  const t = /* @__PURE__ */ Ue(e);
  return t === e ? t : (bt(t, "iterate", Jn), /* @__PURE__ */ Pt(e) ? t : t.map($t));
}
function Zi(e) {
  return bt(e = /* @__PURE__ */ Ue(e), "iterate", Jn), e;
}
function er(e, t) {
  return /* @__PURE__ */ Mr(e) ? xn(/* @__PURE__ */ Qr(e) ? $t(t) : t) : $t(t);
}
const Bc = {
  __proto__: null,
  [Symbol.iterator]() {
    return Do(this, Symbol.iterator, (e) => er(this, e));
  },
  concat(...e) {
    return hn(this).concat(
      ...e.map((t) => Ce(t) ? hn(t) : t)
    );
  },
  entries() {
    return Do(this, "entries", (e) => (e[1] = er(this, e[1]), e));
  },
  every(e, t) {
    return pr(this, "every", e, t, void 0, arguments);
  },
  filter(e, t) {
    return pr(
      this,
      "filter",
      e,
      t,
      (r) => r.map((n) => er(this, n)),
      arguments
    );
  },
  find(e, t) {
    return pr(
      this,
      "find",
      e,
      t,
      (r) => er(this, r),
      arguments
    );
  },
  findIndex(e, t) {
    return pr(this, "findIndex", e, t, void 0, arguments);
  },
  findLast(e, t) {
    return pr(
      this,
      "findLast",
      e,
      t,
      (r) => er(this, r),
      arguments
    );
  },
  findLastIndex(e, t) {
    return pr(this, "findLastIndex", e, t, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(e, t) {
    return pr(this, "forEach", e, t, void 0, arguments);
  },
  includes(...e) {
    return Co(this, "includes", e);
  },
  indexOf(...e) {
    return Co(this, "indexOf", e);
  },
  join(e) {
    return hn(this).join(e);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...e) {
    return Co(this, "lastIndexOf", e);
  },
  map(e, t) {
    return pr(this, "map", e, t, void 0, arguments);
  },
  pop() {
    return zn(this, "pop");
  },
  push(...e) {
    return zn(this, "push", e);
  },
  reduce(e, ...t) {
    return Ya(this, "reduce", e, t);
  },
  reduceRight(e, ...t) {
    return Ya(this, "reduceRight", e, t);
  },
  shift() {
    return zn(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(e, t) {
    return pr(this, "some", e, t, void 0, arguments);
  },
  splice(...e) {
    return zn(this, "splice", e);
  },
  toReversed() {
    return hn(this).toReversed();
  },
  toSorted(e) {
    return hn(this).toSorted(e);
  },
  toSpliced(...e) {
    return hn(this).toSpliced(...e);
  },
  unshift(...e) {
    return zn(this, "unshift", e);
  },
  values() {
    return Do(this, "values", (e) => er(this, e));
  }
};
function Do(e, t, r) {
  const n = Zi(e), i = n[t]();
  return n !== e && !/* @__PURE__ */ Pt(e) && (i._next = i.next, i.next = () => {
    const o = i._next();
    return o.done || (o.value = r(o.value)), o;
  }), i;
}
const Fc = Array.prototype;
function pr(e, t, r, n, i, o) {
  const a = Zi(e), s = a !== e && !/* @__PURE__ */ Pt(e), l = a[t];
  if (l !== Fc[t]) {
    const u = l.apply(e, o);
    return s ? $t(u) : u;
  }
  let f = r;
  a !== e && (s ? f = function(u, h) {
    return r.call(this, er(e, u), h, e);
  } : r.length > 2 && (f = function(u, h) {
    return r.call(this, u, h, e);
  }));
  const d = l.call(a, f, n);
  return s && i ? i(d) : d;
}
function Ya(e, t, r, n) {
  const i = Zi(e), o = i !== e && !/* @__PURE__ */ Pt(e);
  let a = r, s = !1;
  i !== e && (o ? (s = n.length === 0, a = function(f, d, u) {
    return s && (s = !1, f = er(e, f)), r.call(this, f, er(e, d), u, e);
  }) : r.length > 3 && (a = function(f, d, u) {
    return r.call(this, f, d, u, e);
  }));
  const l = i[t](a, ...n);
  return s ? er(e, l) : l;
}
function Co(e, t, r) {
  const n = /* @__PURE__ */ Ue(e);
  bt(n, "iterate", Jn);
  const i = n[t](...r);
  return (i === -1 || i === !1) && /* @__PURE__ */ eo(r[0]) ? (r[0] = /* @__PURE__ */ Ue(r[0]), n[t](...r)) : i;
}
function zn(e, t, r = []) {
  wr(), wa();
  const n = (/* @__PURE__ */ Ue(e))[t].apply(e, r);
  return ka(), kr(), n;
}
const zc = /* @__PURE__ */ ya("__proto__,__v_isRef,__isVue"), Ll = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(It)
);
function qc(e) {
  It(e) || (e = String(e));
  const t = /* @__PURE__ */ Ue(this);
  return bt(t, "has", e), t.hasOwnProperty(e);
}
class Rl {
  constructor(t = !1, r = !1) {
    this._isReadonly = t, this._isShallow = r;
  }
  get(t, r, n) {
    if (r === "__v_skip") return t.__v_skip;
    const i = this._isReadonly, o = this._isShallow;
    if (r === "__v_isReactive")
      return !i;
    if (r === "__v_isReadonly")
      return i;
    if (r === "__v_isShallow")
      return o;
    if (r === "__v_raw")
      return n === (i ? o ? Ul : Hl : o ? ql : zl).get(t) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(t) === Object.getPrototypeOf(n) ? t : void 0;
    const a = Ce(t);
    if (!i) {
      let l;
      if (a && (l = Bc[r]))
        return l;
      if (r === "hasOwnProperty")
        return qc;
    }
    const s = Reflect.get(
      t,
      r,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ ot(t) ? t : n
    );
    if ((It(r) ? Ll.has(r) : zc(r)) || (i || bt(t, "get", r), o))
      return s;
    if (/* @__PURE__ */ ot(s)) {
      const l = a && Gi(r) ? s : s.value;
      return i && $e(l) ? /* @__PURE__ */ Jo(l) : l;
    }
    return $e(s) ? i ? /* @__PURE__ */ Jo(s) : /* @__PURE__ */ Sn(s) : s;
  }
}
class Bl extends Rl {
  constructor(t = !1) {
    super(!1, t);
  }
  set(t, r, n, i) {
    let o = t[r];
    const a = Ce(t) && Gi(r);
    if (!this._isShallow) {
      const f = /* @__PURE__ */ Mr(o);
      if (!/* @__PURE__ */ Pt(n) && !/* @__PURE__ */ Mr(n) && (o = /* @__PURE__ */ Ue(o), n = /* @__PURE__ */ Ue(n)), !a && /* @__PURE__ */ ot(o) && !/* @__PURE__ */ ot(n))
        return f || (o.value = n), !0;
    }
    const s = a ? Number(r) < t.length : Ve(t, r), l = Reflect.set(
      t,
      r,
      n,
      /* @__PURE__ */ ot(t) ? t : i
    );
    return t === /* @__PURE__ */ Ue(i) && (s ? Ht(n, o) && yr(t, "set", r, n) : yr(t, "add", r, n)), l;
  }
  deleteProperty(t, r) {
    const n = Ve(t, r);
    t[r];
    const i = Reflect.deleteProperty(t, r);
    return i && n && yr(t, "delete", r, void 0), i;
  }
  has(t, r) {
    const n = Reflect.has(t, r);
    return (!It(r) || !Ll.has(r)) && bt(t, "has", r), n;
  }
  ownKeys(t) {
    return bt(
      t,
      "iterate",
      Ce(t) ? "length" : Zr
    ), Reflect.ownKeys(t);
  }
}
class Fl extends Rl {
  constructor(t = !1) {
    super(!0, t);
  }
  set(t, r) {
    return !0;
  }
  deleteProperty(t, r) {
    return !0;
  }
}
const Hc = /* @__PURE__ */ new Bl(), Uc = /* @__PURE__ */ new Fl(), Vc = /* @__PURE__ */ new Bl(!0), $c = /* @__PURE__ */ new Fl(!0), Qo = (e) => e, yi = (e) => Reflect.getPrototypeOf(e);
function jc(e, t, r) {
  return function(...n) {
    const i = this.__v_raw, o = /* @__PURE__ */ Ue(i), a = wn(o), s = e === "entries" || e === Symbol.iterator && a, l = e === "keys" && a, f = i[e](...n), d = r ? Qo : t ? xn : $t;
    return !t && bt(
      o,
      "iterate",
      l ? Zo : Zr
    ), pt(
      // inheriting all iterator properties
      Object.create(f),
      {
        // iterator protocol
        next() {
          const { value: u, done: h } = f.next();
          return h ? { value: u, done: h } : {
            value: s ? [d(u[0]), d(u[1])] : d(u),
            done: h
          };
        }
      }
    );
  };
}
function vi(e) {
  return function(...t) {
    return e === "delete" ? !1 : e === "clear" ? void 0 : this;
  };
}
function Wc(e, t) {
  const r = {
    get(i) {
      const o = this.__v_raw, a = /* @__PURE__ */ Ue(o), s = /* @__PURE__ */ Ue(i);
      e || (Ht(i, s) && bt(a, "get", i), bt(a, "get", s));
      const { has: l } = yi(a), f = t ? Qo : e ? xn : $t;
      if (l.call(a, i))
        return f(o.get(i));
      if (l.call(a, s))
        return f(o.get(s));
      o !== a && o.get(i);
    },
    get size() {
      const i = this.__v_raw;
      return !e && bt(/* @__PURE__ */ Ue(i), "iterate", Zr), i.size;
    },
    has(i) {
      const o = this.__v_raw, a = /* @__PURE__ */ Ue(o), s = /* @__PURE__ */ Ue(i);
      return e || (Ht(i, s) && bt(a, "has", i), bt(a, "has", s)), i === s ? o.has(i) : o.has(i) || o.has(s);
    },
    forEach(i, o) {
      const a = this, s = a.__v_raw, l = /* @__PURE__ */ Ue(s), f = t ? Qo : e ? xn : $t;
      return !e && bt(l, "iterate", Zr), s.forEach((d, u) => i.call(o, f(d), f(u), a));
    }
  };
  return pt(
    r,
    e ? {
      add: vi("add"),
      set: vi("set"),
      delete: vi("delete"),
      clear: vi("clear")
    } : {
      add(i) {
        const o = /* @__PURE__ */ Ue(this), a = yi(o), s = /* @__PURE__ */ Ue(i), l = !t && !/* @__PURE__ */ Pt(i) && !/* @__PURE__ */ Mr(i) ? s : i;
        return a.has.call(o, l) || Ht(i, l) && a.has.call(o, i) || Ht(s, l) && a.has.call(o, s) || (o.add(l), yr(o, "add", l, l)), this;
      },
      set(i, o) {
        !t && !/* @__PURE__ */ Pt(o) && !/* @__PURE__ */ Mr(o) && (o = /* @__PURE__ */ Ue(o));
        const a = /* @__PURE__ */ Ue(this), { has: s, get: l } = yi(a);
        let f = s.call(a, i);
        f || (i = /* @__PURE__ */ Ue(i), f = s.call(a, i));
        const d = l.call(a, i);
        return a.set(i, o), f ? Ht(o, d) && yr(a, "set", i, o) : yr(a, "add", i, o), this;
      },
      delete(i) {
        const o = /* @__PURE__ */ Ue(this), { has: a, get: s } = yi(o);
        let l = a.call(o, i);
        l || (i = /* @__PURE__ */ Ue(i), l = a.call(o, i)), s && s.call(o, i);
        const f = o.delete(i);
        return l && yr(o, "delete", i, void 0), f;
      },
      clear() {
        const i = /* @__PURE__ */ Ue(this), o = i.size !== 0, a = i.clear();
        return o && yr(
          i,
          "clear",
          void 0,
          void 0
        ), a;
      }
    }
  ), [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ].forEach((i) => {
    r[i] = jc(i, e, t);
  }), r;
}
function Qi(e, t) {
  const r = Wc(e, t);
  return (n, i, o) => i === "__v_isReactive" ? !e : i === "__v_isReadonly" ? e : i === "__v_raw" ? n : Reflect.get(
    Ve(r, i) && i in n ? r : n,
    i,
    o
  );
}
const Gc = {
  get: /* @__PURE__ */ Qi(!1, !1)
}, Kc = {
  get: /* @__PURE__ */ Qi(!1, !0)
}, Xc = {
  get: /* @__PURE__ */ Qi(!0, !1)
}, Yc = {
  get: /* @__PURE__ */ Qi(!0, !0)
}, zl = /* @__PURE__ */ new WeakMap(), ql = /* @__PURE__ */ new WeakMap(), Hl = /* @__PURE__ */ new WeakMap(), Ul = /* @__PURE__ */ new WeakMap();
function Zc(e) {
  switch (e) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
function Qc(e) {
  return e.__v_skip || !Object.isExtensible(e) ? 0 : Zc(Mc(e));
}
// @__NO_SIDE_EFFECTS__
function Sn(e) {
  return /* @__PURE__ */ Mr(e) ? e : Ji(
    e,
    !1,
    Hc,
    Gc,
    zl
  );
}
// @__NO_SIDE_EFFECTS__
function Jc(e) {
  return Ji(
    e,
    !1,
    Vc,
    Kc,
    ql
  );
}
// @__NO_SIDE_EFFECTS__
function Jo(e) {
  return Ji(
    e,
    !0,
    Uc,
    Xc,
    Hl
  );
}
// @__NO_SIDE_EFFECTS__
function Gr(e) {
  return Ji(
    e,
    !0,
    $c,
    Yc,
    Ul
  );
}
function Ji(e, t, r, n, i) {
  if (!$e(e) || e.__v_raw && !(t && e.__v_isReactive))
    return e;
  const o = Qc(e);
  if (o === 0)
    return e;
  const a = i.get(e);
  if (a)
    return a;
  const s = new Proxy(
    e,
    o === 2 ? n : r
  );
  return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Qr(e) {
  return /* @__PURE__ */ Mr(e) ? /* @__PURE__ */ Qr(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function Mr(e) {
  return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function Pt(e) {
  return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function eo(e) {
  return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function Ue(e) {
  const t = e && e.__v_raw;
  return t ? /* @__PURE__ */ Ue(t) : e;
}
function G(e) {
  return !Ve(e, "__v_skip") && Object.isExtensible(e) && Oi(e, "__v_skip", !0), e;
}
const $t = (e) => $e(e) ? /* @__PURE__ */ Sn(e) : e, xn = (e) => $e(e) ? /* @__PURE__ */ Jo(e) : e;
// @__NO_SIDE_EFFECTS__
function ot(e) {
  return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function _e(e) {
  return Vl(e, !1);
}
// @__NO_SIDE_EFFECTS__
function to(e) {
  return Vl(e, !0);
}
function Vl(e, t) {
  return /* @__PURE__ */ ot(e) ? e : new ed(e, t);
}
class ed {
  constructor(t, r) {
    this.dep = new Yi(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = r ? t : /* @__PURE__ */ Ue(t), this._value = r ? t : $t(t), this.__v_isShallow = r;
  }
  get value() {
    return this.dep.track(), this._value;
  }
  set value(t) {
    const r = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ Pt(t) || /* @__PURE__ */ Mr(t);
    t = n ? t : /* @__PURE__ */ Ue(t), Ht(t, r) && (this._rawValue = t, this._value = n ? t : $t(t), this.dep.trigger());
  }
}
function td(e) {
  e.dep && e.dep.trigger();
}
function X(e) {
  return /* @__PURE__ */ ot(e) ? e.value : e;
}
function St(e) {
  return Te(e) ? e() : X(e);
}
const rd = {
  get: (e, t, r) => t === "__v_raw" ? e : X(Reflect.get(e, t, r)),
  set: (e, t, r, n) => {
    const i = e[t];
    return /* @__PURE__ */ ot(i) && !/* @__PURE__ */ ot(r) ? (i.value = r, !0) : Reflect.set(e, t, r, n);
  }
};
function $l(e) {
  return /* @__PURE__ */ Qr(e) ? e : new Proxy(e, rd);
}
class nd {
  constructor(t) {
    this.__v_isRef = !0, this._value = void 0;
    const r = this.dep = new Yi(), { get: n, set: i } = t(r.track.bind(r), r.trigger.bind(r));
    this._get = n, this._set = i;
  }
  get value() {
    return this._value = this._get();
  }
  set value(t) {
    this._set(t);
  }
}
function id(e) {
  return new nd(e);
}
// @__NO_SIDE_EFFECTS__
function Tn(e) {
  const t = Ce(e) ? new Array(e.length) : {};
  for (const r in e)
    t[r] = jl(e, r);
  return t;
}
class od {
  constructor(t, r, n) {
    this._object = t, this._defaultValue = n, this.__v_isRef = !0, this._value = void 0, this._key = It(r) ? r : String(r), this._raw = /* @__PURE__ */ Ue(t);
    let i = !0, o = t;
    if (!Ce(t) || It(this._key) || !Gi(this._key))
      do
        i = !/* @__PURE__ */ eo(o) || /* @__PURE__ */ Pt(o);
      while (i && (o = o.__v_raw));
    this._shallow = i;
  }
  get value() {
    let t = this._object[this._key];
    return this._shallow && (t = X(t)), this._value = t === void 0 ? this._defaultValue : t;
  }
  set value(t) {
    if (this._shallow && /* @__PURE__ */ ot(this._raw[this._key])) {
      const r = this._object[this._key];
      if (/* @__PURE__ */ ot(r)) {
        r.value = t;
        return;
      }
    }
    this._object[this._key] = t;
  }
  get dep() {
    return Rc(this._raw, this._key);
  }
}
class ad {
  constructor(t) {
    this._getter = t, this.__v_isRef = !0, this.__v_isReadonly = !0, this._value = void 0;
  }
  get value() {
    return this._value = this._getter();
  }
}
// @__NO_SIDE_EFFECTS__
function sd(e, t, r) {
  return /* @__PURE__ */ ot(e) ? e : Te(e) ? new ad(e) : $e(e) && arguments.length > 1 ? jl(e, t, r) : /* @__PURE__ */ _e(e);
}
function jl(e, t, r) {
  return new od(e, t, r);
}
class ld {
  constructor(t, r, n) {
    this.fn = t, this.setter = r, this._value = void 0, this.dep = new Yi(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Qn - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !r, this.isSSR = n;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    Xe !== this)
      return Sl(this, !0), !0;
  }
  get value() {
    const t = this.dep.track();
    return Ol(this), t && (t.version = this.dep.version), this._value;
  }
  set value(t) {
    this.setter && this.setter(t);
  }
}
// @__NO_SIDE_EFFECTS__
function ud(e, t, r = !1) {
  let n, i;
  return Te(e) ? n = e : (n = e.get, i = e.set), new ld(n, i, r);
}
const bi = {}, Ii = /* @__PURE__ */ new WeakMap();
let Kr;
function cd(e, t = !1, r = Kr) {
  if (r) {
    let n = Ii.get(r);
    n || Ii.set(r, n = []), n.push(e);
  }
}
function dd(e, t, r = Ge) {
  const { immediate: n, deep: i, once: o, scheduler: a, augmentJob: s, call: l } = r, f = (D) => i ? D : /* @__PURE__ */ Pt(D) || i === !1 || i === 0 ? vr(D, 1) : vr(D);
  let d, u, h, c, y = !1, m = !1;
  if (/* @__PURE__ */ ot(e) ? (u = () => e.value, y = /* @__PURE__ */ Pt(e)) : /* @__PURE__ */ Qr(e) ? (u = () => f(e), y = !0) : Ce(e) ? (m = !0, y = e.some((D) => /* @__PURE__ */ Qr(D) || /* @__PURE__ */ Pt(D)), u = () => e.map((D) => {
    if (/* @__PURE__ */ ot(D))
      return D.value;
    if (/* @__PURE__ */ Qr(D))
      return f(D);
    if (Te(D))
      return l ? l(D, 2) : D();
  })) : Te(e) ? t ? u = l ? () => l(e, 2) : e : u = () => {
    if (h) {
      wr();
      try {
        h();
      } finally {
        kr();
      }
    }
    const D = Kr;
    Kr = d;
    try {
      return l ? l(e, 3, [c]) : e(c);
    } finally {
      Kr = D;
    }
  } : u = Ut, t && i) {
    const D = u, R = i === !0 ? 1 / 0 : i;
    u = () => vr(D(), R);
  }
  const b = _a(), g = () => {
    d.stop(), b && b.active && va(b.effects, d);
  };
  if (o && t) {
    const D = t;
    t = (...R) => {
      D(...R), g();
    };
  }
  let _ = m ? new Array(e.length).fill(bi) : bi;
  const x = (D) => {
    if (!(!(d.flags & 1) || !d.dirty && !D))
      if (t) {
        const R = d.run();
        if (i || y || (m ? R.some((C, P) => Ht(C, _[P])) : Ht(R, _))) {
          h && h();
          const C = Kr;
          Kr = d;
          try {
            const P = [
              R,
              // pass undefined as the old value when it's changed for the first time
              _ === bi ? void 0 : m && _[0] === bi ? [] : _,
              c
            ];
            _ = R, l ? l(t, 3, P) : (
              // @ts-expect-error
              t(...P)
            );
          } finally {
            Kr = C;
          }
        }
      } else
        d.run();
  };
  return s && s(x), d = new Dl(u), d.scheduler = a ? () => a(x, !1) : x, c = (D) => cd(D, !1, d), h = d.onStop = () => {
    const D = Ii.get(d);
    if (D) {
      if (l)
        l(D, 4);
      else
        for (const R of D) R();
      Ii.delete(d);
    }
  }, t ? n ? x(!0) : _ = d.run() : a ? a(x.bind(null, !0), !0) : d.run(), g.pause = d.pause.bind(d), g.resume = d.resume.bind(d), g.stop = g, g;
}
function vr(e, t = 1 / 0, r) {
  if (t <= 0 || !$e(e) || e.__v_skip || (r = r || /* @__PURE__ */ new Map(), (r.get(e) || 0) >= t))
    return e;
  if (r.set(e, t), t--, /* @__PURE__ */ ot(e))
    vr(e.value, t, r);
  else if (Ce(e))
    for (let n = 0; n < e.length; n++)
      vr(e[n], t, r);
  else if (yl(e) || wn(e))
    e.forEach((n) => {
      vr(n, t, r);
    });
  else if (_l(e)) {
    for (const n in e)
      vr(e[n], t, r);
    for (const n of Object.getOwnPropertySymbols(e))
      Object.prototype.propertyIsEnumerable.call(e, n) && vr(e[n], t, r);
  }
  return e;
}
/**
* @vue/runtime-core v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
function si(e, t, r, n) {
  try {
    return n ? e(...n) : e();
  } catch (i) {
    ro(i, t, r);
  }
}
function ar(e, t, r, n) {
  if (Te(e)) {
    const i = si(e, t, r, n);
    return i && vl(i) && i.catch((o) => {
      ro(o, t, r);
    }), i;
  }
  if (Ce(e)) {
    const i = [];
    for (let o = 0; o < e.length; o++)
      i.push(ar(e[o], t, r, n));
    return i;
  }
}
function ro(e, t, r, n = !0) {
  const i = t ? t.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: a } = t && t.appContext.config || Ge;
  if (t) {
    let s = t.parent;
    const l = t.proxy, f = `https://vuejs.org/error-reference/#runtime-${r}`;
    for (; s; ) {
      const d = s.ec;
      if (d) {
        for (let u = 0; u < d.length; u++)
          if (d[u](e, l, f) === !1)
            return;
      }
      s = s.parent;
    }
    if (o) {
      wr(), si(o, null, 10, [
        e,
        l,
        f
      ]), kr();
      return;
    }
  }
  fd(e, r, i, n, a);
}
function fd(e, t, r, n = !0, i = !1) {
  if (i)
    throw e;
  console.error(e);
}
const Et = [];
let Jt = -1;
const kn = [];
let Or = null, yn = 0;
const Wl = /* @__PURE__ */ Promise.resolve();
let Li = null;
function ht(e) {
  const t = Li || Wl;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function hd(e) {
  let t = Jt + 1, r = Et.length;
  for (; t < r; ) {
    const n = t + r >>> 1, i = Et[n], o = ei(i);
    o < e || o === e && i.flags & 2 ? t = n + 1 : r = n;
  }
  return t;
}
function Aa(e) {
  if (!(e.flags & 1)) {
    const t = ei(e), r = Et[Et.length - 1];
    !r || // fast path when the job id is larger than the tail
    !(e.flags & 2) && t >= ei(r) ? Et.push(e) : Et.splice(hd(t), 0, e), e.flags |= 1, Gl();
  }
}
function Gl() {
  Li || (Li = Wl.then(Xl));
}
function pd(e) {
  Ce(e) ? kn.push(...e) : Or && e.id === -1 ? Or.splice(yn + 1, 0, e) : e.flags & 1 || (kn.push(e), e.flags |= 1), Gl();
}
function Za(e, t, r = Jt + 1) {
  for (; r < Et.length; r++) {
    const n = Et[r];
    if (n && n.flags & 2) {
      if (e && n.id !== e.uid)
        continue;
      Et.splice(r, 1), r--, n.flags & 4 && (n.flags &= -2), n(), n.flags & 4 || (n.flags &= -2);
    }
  }
}
function Kl(e) {
  if (kn.length) {
    const t = [...new Set(kn)].sort(
      (r, n) => ei(r) - ei(n)
    );
    if (kn.length = 0, Or) {
      Or.push(...t);
      return;
    }
    for (Or = t, yn = 0; yn < Or.length; yn++) {
      const r = Or[yn];
      r.flags & 4 && (r.flags &= -2), r.flags & 8 || r(), r.flags &= -2;
    }
    Or = null, yn = 0;
  }
}
const ei = (e) => e.id == null ? e.flags & 2 ? -1 : 1 / 0 : e.id;
function Xl(e) {
  try {
    for (Jt = 0; Jt < Et.length; Jt++) {
      const t = Et[Jt];
      t && !(t.flags & 8) && (t.flags & 4 && (t.flags &= -2), si(
        t,
        t.i,
        t.i ? 15 : 14
      ), t.flags & 4 || (t.flags &= -2));
    }
  } finally {
    for (; Jt < Et.length; Jt++) {
      const t = Et[Jt];
      t && (t.flags &= -2);
    }
    Jt = -1, Et.length = 0, Kl(), Li = null, (Et.length || kn.length) && Xl();
  }
}
let rr, Un = [], ea = !1;
function no(e, ...t) {
  rr ? rr.emit(e, ...t) : ea || Un.push({ event: e, args: t });
}
function Yl(e, t) {
  var r, n;
  rr = e, rr ? (rr.enabled = !0, Un.forEach(({ event: i, args: o }) => rr.emit(i, ...o)), Un = []) : /* handle late devtools injection - only do this if we are in an actual */ /* browser environment to avoid the timer handle stalling test runner exit */ /* (#4815) */ typeof window < "u" && // some envs mock window but not fully
  window.HTMLElement && // also exclude jsdom
  // eslint-disable-next-line no-restricted-syntax
  !((n = (r = window.navigator) == null ? void 0 : r.userAgent) != null && n.includes("jsdom")) ? ((t.__VUE_DEVTOOLS_HOOK_REPLAY__ = t.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((o) => {
    Yl(o, t);
  }), setTimeout(() => {
    rr || (t.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, ea = !0, Un = []);
  }, 3e3)) : (ea = !0, Un = []);
}
function md(e, t) {
  no("app:init", e, t, {
    Fragment: et,
    Text: li,
    Comment: Wt,
    Static: Si
  });
}
function gd(e) {
  no("app:unmount", e);
}
const yd = /* @__PURE__ */ Ea(
  "component:added"
  /* COMPONENT_ADDED */
), Zl = /* @__PURE__ */ Ea(
  "component:updated"
  /* COMPONENT_UPDATED */
), vd = /* @__PURE__ */ Ea(
  "component:removed"
  /* COMPONENT_REMOVED */
), bd = (e) => {
  rr && typeof rr.cleanupBuffer == "function" && // remove the component if it wasn't buffered
  !rr.cleanupBuffer(e) && vd(e);
};
// @__NO_SIDE_EFFECTS__
function Ea(e) {
  return (t) => {
    no(
      e,
      t.appContext.app,
      t.uid,
      t.parent ? t.parent.uid : void 0,
      t
    );
  };
}
function _d(e, t, r) {
  no(
    "component:emit",
    e.appContext.app,
    e,
    t,
    r
  );
}
let dt = null, Ql = null;
function Ri(e) {
  const t = dt;
  return dt = e, Ql = e && e.type.__scopeId || null, t;
}
function ge(e, t = dt, r) {
  if (!t || e._n)
    return e;
  const n = (...i) => {
    n._d && zi(-1);
    const o = Ri(t);
    let a;
    try {
      a = e(...i);
    } finally {
      Ri(o), n._d && zi(1);
    }
    return __VUE_PROD_DEVTOOLS__ && Zl(t), a;
  };
  return n._n = !0, n._c = !0, n._d = !0, n;
}
function wd(e, t) {
  if (dt === null)
    return e;
  const r = so(dt), n = e.dirs || (e.dirs = []);
  for (let i = 0; i < t.length; i++) {
    let [o, a, s, l = Ge] = t[i];
    o && (Te(o) && (o = {
      mounted: o,
      updated: o
    }), o.deep && vr(a), n.push({
      dir: o,
      instance: r,
      value: a,
      oldValue: void 0,
      arg: s,
      modifiers: l
    }));
  }
  return e;
}
function Ur(e, t, r, n) {
  const i = e.dirs, o = t && t.dirs;
  for (let a = 0; a < i.length; a++) {
    const s = i[a];
    o && (s.oldValue = o[a].value);
    let l = s.dir[n];
    l && (wr(), ar(l, r, 8, [
      e.el,
      s,
      e,
      t
    ]), kr());
  }
}
function xa(e, t) {
  if (_t) {
    let r = _t.provides;
    const n = _t.parent && _t.parent.provides;
    n === r && (r = _t.provides = Object.create(n)), r[e] = t;
  }
}
function Jr(e, t, r = !1) {
  const n = cr();
  if (n || An) {
    let i = An ? An._context.provides : n ? n.parent == null || n.ce ? n.vnode.appContext && n.vnode.appContext.provides : n.parent.provides : void 0;
    if (i && e in i)
      return i[e];
    if (arguments.length > 1)
      return r && Te(t) ? t.call(n && n.proxy) : t;
  }
}
const kd = /* @__PURE__ */ Symbol.for("v-scx"), Md = () => Jr(kd);
function jt(e, t) {
  return io(e, null, t);
}
function Jl(e, t) {
  return io(
    e,
    null,
    { flush: "post" }
  );
}
function tt(e, t, r) {
  return io(e, t, r);
}
function io(e, t, r = Ge) {
  const { immediate: n, deep: i, flush: o, once: a } = r, s = pt({}, r), l = t && n || !t && o !== "post";
  let f;
  if (ri) {
    if (o === "sync") {
      const c = Md();
      f = c.__watcherHandles || (c.__watcherHandles = []);
    } else if (!l) {
      const c = () => {
      };
      return c.stop = Ut, c.resume = Ut, c.pause = Ut, c;
    }
  }
  const d = _t;
  s.call = (c, y, m) => ar(c, d, y, m);
  let u = !1;
  o === "post" ? s.scheduler = (c) => {
    At(c, d && d.suspense);
  } : o !== "sync" && (u = !0, s.scheduler = (c, y) => {
    y ? c() : Aa(c);
  }), s.augmentJob = (c) => {
    t && (c.flags |= 4), u && (c.flags |= 2, d && (c.id = d.uid, c.i = d));
  };
  const h = dd(e, t, s);
  return ri && (f ? f.push(h) : l && h()), h;
}
function Ad(e, t, r) {
  const n = this.proxy, i = rt(e) ? e.includes(".") ? eu(n, e) : () => n[e] : e.bind(n, n);
  let o;
  Te(t) ? o = t : (o = t.handler, r = t);
  const a = ui(this), s = io(i, o.bind(n), r);
  return a(), s;
}
function eu(e, t) {
  const r = t.split(".");
  return () => {
    let n = e;
    for (let i = 0; i < r.length && n; i++)
      n = n[r[i]];
    return n;
  };
}
const Vr = /* @__PURE__ */ new WeakMap(), tu = /* @__PURE__ */ Symbol("_vte"), Ed = (e) => e.__isTeleport, Xr = (e) => e && (e.disabled || e.disabled === ""), xd = (e) => e && (e.defer || e.defer === ""), Qa = (e) => typeof SVGElement < "u" && e instanceof SVGElement, Ja = (e) => typeof MathMLElement == "function" && e instanceof MathMLElement, ta = (e, t) => {
  const r = e && e.to;
  return rt(r) ? t ? t(r) : null : r;
}, Dd = {
  name: "Teleport",
  __isTeleport: !0,
  process(e, t, r, n, i, o, a, s, l, f) {
    const {
      mc: d,
      pc: u,
      pbc: h,
      o: { insert: c, querySelector: y, createText: m, createComment: b }
    } = f, g = Xr(t.props);
    let { dynamicChildren: _ } = t;
    const x = (C, P, W) => {
      C.shapeFlag & 16 && d(
        C.children,
        P,
        W,
        i,
        o,
        a,
        s,
        l
      );
    }, D = (C = t) => {
      const P = Xr(C.props), W = C.target = ta(C.props, y), j = ra(W, C, m, c);
      W && (a !== "svg" && Qa(W) ? a = "svg" : a !== "mathml" && Ja(W) && (a = "mathml"), i && i.isCE && (i.ce._teleportTargets || (i.ce._teleportTargets = /* @__PURE__ */ new Set())).add(W), P || (x(C, W, j), Vn(C, !1)));
    }, R = (C) => {
      const P = () => {
        Vr.get(C) === P && (Vr.delete(C), Xr(C.props) && (x(C, r, C.anchor), Vn(C, !0)), D(C));
      };
      Vr.set(C, P), At(P, o);
    };
    if (e == null) {
      const C = t.el = m(""), P = t.anchor = m("");
      if (c(C, r, n), c(P, r, n), xd(t.props) || o && o.pendingBranch) {
        R(t);
        return;
      }
      g && (x(t, r, P), Vn(t, !0)), D();
    } else {
      t.el = e.el;
      const C = t.anchor = e.anchor, P = Vr.get(e);
      if (P) {
        P.flags |= 8, Vr.delete(e), R(t);
        return;
      }
      t.targetStart = e.targetStart;
      const W = t.target = e.target, j = t.targetAnchor = e.targetAnchor, oe = Xr(e.props), ue = oe ? r : W, B = oe ? C : j;
      if (a === "svg" || Qa(W) ? a = "svg" : (a === "mathml" || Ja(W)) && (a = "mathml"), _ ? (h(
        e.dynamicChildren,
        _,
        ue,
        i,
        o,
        a,
        s
      ), Ta(e, t, !0)) : l || u(
        e,
        t,
        ue,
        B,
        i,
        o,
        a,
        s,
        !1
      ), g)
        oe ? t.props && e.props && t.props.to !== e.props.to && (t.props.to = e.props.to) : _i(
          t,
          r,
          C,
          f,
          1
        );
      else if ((t.props && t.props.to) !== (e.props && e.props.to)) {
        const Z = t.target = ta(
          t.props,
          y
        );
        Z && _i(
          t,
          Z,
          null,
          f,
          0
        );
      } else oe && _i(
        t,
        W,
        j,
        f,
        1
      );
      Vn(t, g);
    }
  },
  remove(e, t, r, { um: n, o: { remove: i } }, o) {
    const {
      shapeFlag: a,
      children: s,
      anchor: l,
      targetStart: f,
      targetAnchor: d,
      target: u,
      props: h
    } = e;
    let c = o || !Xr(h);
    const y = Vr.get(e);
    if (y && (y.flags |= 8, Vr.delete(e), c = !1), u && (i(f), i(d)), o && i(l), a & 16)
      for (let m = 0; m < s.length; m++) {
        const b = s[m];
        n(
          b,
          t,
          r,
          c,
          !!b.dynamicChildren
        );
      }
  },
  move: _i,
  hydrate: Cd
};
function _i(e, t, r, { o: { insert: n }, m: i }, o = 2) {
  o === 0 && n(e.targetAnchor, t, r);
  const { el: a, anchor: s, shapeFlag: l, children: f, props: d } = e, u = o === 2;
  if (u && n(a, t, r), (!u || Xr(d)) && l & 16)
    for (let h = 0; h < f.length; h++)
      i(
        f[h],
        t,
        r,
        2
      );
  u && n(s, t, r);
}
function Cd(e, t, r, n, i, o, {
  o: { nextSibling: a, parentNode: s, querySelector: l, insert: f, createText: d }
}, u) {
  function h(b, g) {
    let _ = g;
    for (; _; ) {
      if (_ && _.nodeType === 8) {
        if (_.data === "teleport start anchor")
          t.targetStart = _;
        else if (_.data === "teleport anchor") {
          t.targetAnchor = _, b._lpa = t.targetAnchor && a(t.targetAnchor);
          break;
        }
      }
      _ = a(_);
    }
  }
  function c(b, g) {
    g.anchor = u(
      a(b),
      g,
      s(b),
      r,
      n,
      i,
      o
    );
  }
  const y = t.target = ta(
    t.props,
    l
  ), m = Xr(t.props);
  if (y) {
    const b = y._lpa || y.firstChild;
    t.shapeFlag & 16 && (m ? (c(e, t), h(y, b), t.targetAnchor || ra(
      y,
      t,
      d,
      f,
      // if target is the same as the main view, insert anchors before current node
      // to avoid hydrating mismatch
      s(e) === y ? e : null
    )) : (t.anchor = a(e), h(y, b), t.targetAnchor || ra(y, t, d, f), u(
      b && a(b),
      t,
      y,
      r,
      n,
      i,
      o
    ))), Vn(t, m);
  } else m && t.shapeFlag & 16 && (c(e, t), t.targetStart = e, t.targetAnchor = a(e));
  return t.anchor && a(t.anchor);
}
const Sd = Dd;
function Vn(e, t) {
  const r = e.ctx;
  if (r && r.ut) {
    let n, i;
    for (t ? (n = e.el, i = e.anchor) : (n = e.targetStart, i = e.targetAnchor); n && n !== i; )
      n.nodeType === 1 && n.setAttribute("data-v-owner", r.uid), n = n.nextSibling;
    r.ut();
  }
}
function ra(e, t, r, n, i = null) {
  const o = t.targetStart = r(""), a = t.targetAnchor = r("");
  return o[tu] = a, e && (n(o, e, i), n(a, e, i)), a;
}
const Td = /* @__PURE__ */ Symbol("_leaveCb");
function Da(e, t) {
  e.shapeFlag & 6 && e.component ? (e.transition = t, Da(e.component.subTree, t)) : e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
// @__NO_SIDE_EFFECTS__
function Ee(e, t) {
  return Te(e) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    pt({ name: e.name }, t, { setup: e })
  ) : e;
}
function So() {
  const e = cr();
  return e ? (e.appContext.config.idPrefix || "v") + "-" + e.ids[0] + e.ids[1]++ : "";
}
function ru(e) {
  e.ids = [e.ids[0] + e.ids[2]++ + "-", 0, 0];
}
function es(e, t) {
  let r;
  return !!((r = Object.getOwnPropertyDescriptor(e, t)) && !r.configurable);
}
const Bi = /* @__PURE__ */ new WeakMap();
function Xn(e, t, r, n, i = !1) {
  if (Ce(e)) {
    e.forEach(
      (m, b) => Xn(
        m,
        t && (Ce(t) ? t[b] : t),
        r,
        n,
        i
      )
    );
    return;
  }
  if (Mn(n) && !i) {
    n.shapeFlag & 512 && n.type.__asyncResolved && n.component.subTree.component && Xn(e, t, r, n.component.subTree);
    return;
  }
  const o = n.shapeFlag & 4 ? so(n.component) : n.el, a = i ? null : o, { i: s, r: l } = e, f = t && t.r, d = s.refs === Ge ? s.refs = {} : s.refs, u = s.setupState, h = /* @__PURE__ */ Ue(u), c = u === Ge ? gl : (m) => es(d, m) ? !1 : Ve(h, m), y = (m, b) => !(b && es(d, b));
  if (f != null && f !== l) {
    if (ts(t), rt(f))
      d[f] = null, c(f) && (u[f] = null);
    else if (/* @__PURE__ */ ot(f)) {
      const m = t;
      y(f, m.k) && (f.value = null), m.k && (d[m.k] = null);
    }
  }
  if (Te(l))
    si(l, s, 12, [a, d]);
  else {
    const m = rt(l), b = /* @__PURE__ */ ot(l);
    if (m || b) {
      const g = () => {
        if (e.f) {
          const _ = m ? c(l) ? u[l] : d[l] : y() || !e.k ? l.value : d[e.k];
          if (i)
            Ce(_) && va(_, o);
          else if (Ce(_))
            _.includes(o) || _.push(o);
          else if (m)
            d[l] = [o], c(l) && (u[l] = d[l]);
          else {
            const x = [o];
            y(l, e.k) && (l.value = x), e.k && (d[e.k] = x);
          }
        } else m ? (d[l] = a, c(l) && (u[l] = a)) : b && (y(l, e.k) && (l.value = a), e.k && (d[e.k] = a));
      };
      if (a) {
        const _ = () => {
          g(), Bi.delete(e);
        };
        _.id = -1, Bi.set(e, _), At(_, r);
      } else
        ts(e), g();
    }
  }
}
function ts(e) {
  const t = Bi.get(e);
  t && (t.flags |= 8, Bi.delete(e));
}
Yr().requestIdleCallback;
Yr().cancelIdleCallback;
const Mn = (e) => !!e.type.__asyncLoader, nu = (e) => e.type.__isKeepAlive;
function Nd(e, t) {
  iu(e, "a", t);
}
function Od(e, t) {
  iu(e, "da", t);
}
function iu(e, t, r = _t) {
  const n = e.__wdc || (e.__wdc = () => {
    let i = r;
    for (; i; ) {
      if (i.isDeactivated)
        return;
      i = i.parent;
    }
    return e();
  });
  if (oo(t, n, r), r) {
    let i = r.parent;
    for (; i && i.parent; )
      nu(i.parent.vnode) && Pd(n, t, r, i), i = i.parent;
  }
}
function Pd(e, t, r, n) {
  const i = oo(
    t,
    e,
    n,
    !0
    /* prepend */
  );
  on(() => {
    va(n[t], i);
  }, r);
}
function oo(e, t, r = _t, n = !1) {
  if (r) {
    const i = r[e] || (r[e] = []), o = t.__weh || (t.__weh = (...a) => {
      wr();
      const s = ui(r), l = ar(t, r, e, a);
      return s(), kr(), l;
    });
    return n ? i.unshift(o) : i.push(o), o;
  }
}
const Er = (e) => (t, r = _t) => {
  (!ri || e === "sp") && oo(e, (...n) => t(...n), r);
}, Id = Er("bm"), nn = Er("m"), Ld = Er(
  "bu"
), ou = Er("u"), au = Er(
  "bum"
), on = Er("um"), Rd = Er(
  "sp"
), Bd = Er("rtg"), Fd = Er("rtc");
function zd(e, t = _t) {
  oo("ec", e, t);
}
const qd = "components", su = /* @__PURE__ */ Symbol.for("v-ndc");
function lu(e) {
  return rt(e) ? Hd(qd, e, !1) || e : e || su;
}
function Hd(e, t, r = !0, n = !1) {
  const i = dt || _t;
  if (i) {
    const o = i.type;
    {
      const s = xf(
        o,
        !1
      );
      if (s && (s === t || s === ft(t) || s === Xi(ft(t))))
        return o;
    }
    const a = (
      // local registration
      // check instance[type] first which is resolved for options API
      rs(i[e] || o[e], t) || // global registration
      rs(i.appContext[e], t)
    );
    return !a && n ? o : a;
  }
}
function rs(e, t) {
  return e && (e[t] || e[ft(t)] || e[Xi(ft(t))]);
}
function Ci(e, t, r, n) {
  let i;
  const o = r, a = Ce(e);
  if (a || rt(e)) {
    const s = a && /* @__PURE__ */ Qr(e);
    let l = !1, f = !1;
    s && (l = !/* @__PURE__ */ Pt(e), f = /* @__PURE__ */ Mr(e), e = Zi(e)), i = new Array(e.length);
    for (let d = 0, u = e.length; d < u; d++)
      i[d] = t(
        l ? f ? xn($t(e[d])) : $t(e[d]) : e[d],
        d,
        void 0,
        o
      );
  } else if (typeof e == "number") {
    i = new Array(e);
    for (let s = 0; s < e; s++)
      i[s] = t(s + 1, s, void 0, o);
  } else if ($e(e))
    if (e[Symbol.iterator])
      i = Array.from(
        e,
        (s, l) => t(s, l, void 0, o)
      );
    else {
      const s = Object.keys(e);
      i = new Array(s.length);
      for (let l = 0, f = s.length; l < f; l++) {
        const d = s[l];
        i[l] = t(e[d], d, l, o);
      }
    }
  else
    i = [];
  return i;
}
function Pe(e, t, r = {}, n, i) {
  if (dt.ce || dt.parent && Mn(dt.parent) && dt.parent.ce) {
    const f = Object.keys(r).length > 0;
    return de(), ve(
      et,
      null,
      [Ie("slot", r, n && n())],
      f ? -2 : 64
    );
  }
  let o = e[t];
  o && o._c && (o._d = !1), de();
  const a = o && uu(o(r)), s = r.key || // slot content array of a dynamic conditional slot may have a branch
  // key attached in the `createSlots` helper, respect that
  a && a.key, l = ve(
    et,
    {
      key: (s && !It(s) ? s : `_${t}`) + // #7256 force differentiate fallback content from actual content
      (!a && n ? "_fb" : "")
    },
    a || (n ? n() : []),
    a && e._ === 1 ? 64 : -2
  );
  return l.scopeId && (l.slotScopeIds = [l.scopeId + "-s"]), o && o._c && (o._d = !0), l;
}
function uu(e) {
  return e.some((t) => ti(t) ? !(t.type === Wt || t.type === et && !uu(t.children)) : !0) ? e : null;
}
function Ud(e, t) {
  const r = {};
  for (const n in e)
    r[Wn(n)] = e[n];
  return r;
}
const na = (e) => e ? Su(e) ? so(e) : na(e.parent) : null, Yn = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ pt(/* @__PURE__ */ Object.create(null), {
    $: (e) => e,
    $el: (e) => e.vnode.el,
    $data: (e) => e.data,
    $props: (e) => e.props,
    $attrs: (e) => e.attrs,
    $slots: (e) => e.slots,
    $refs: (e) => e.refs,
    $parent: (e) => na(e.parent),
    $root: (e) => na(e.root),
    $host: (e) => e.ce,
    $emit: (e) => e.emit,
    $options: (e) => __VUE_OPTIONS_API__ ? fu(e) : e.type,
    $forceUpdate: (e) => e.f || (e.f = () => {
      Aa(e.update);
    }),
    $nextTick: (e) => e.n || (e.n = ht.bind(e.proxy)),
    $watch: (e) => __VUE_OPTIONS_API__ ? Ad.bind(e) : Ut
  })
), To = (e, t) => e !== Ge && !e.__isScriptSetup && Ve(e, t), Vd = {
  get({ _: e }, t) {
    if (t === "__v_skip")
      return !0;
    const { ctx: r, setupState: n, data: i, props: o, accessCache: a, type: s, appContext: l } = e;
    if (t[0] !== "$") {
      const h = a[t];
      if (h !== void 0)
        switch (h) {
          case 1:
            return n[t];
          case 2:
            return i[t];
          case 4:
            return r[t];
          case 3:
            return o[t];
        }
      else {
        if (To(n, t))
          return a[t] = 1, n[t];
        if (__VUE_OPTIONS_API__ && i !== Ge && Ve(i, t))
          return a[t] = 2, i[t];
        if (Ve(o, t))
          return a[t] = 3, o[t];
        if (r !== Ge && Ve(r, t))
          return a[t] = 4, r[t];
        (!__VUE_OPTIONS_API__ || oa) && (a[t] = 0);
      }
    }
    const f = Yn[t];
    let d, u;
    if (f)
      return t === "$attrs" && bt(e.attrs, "get", ""), f(e);
    if (
      // css module (injected by vue-loader)
      (d = s.__cssModules) && (d = d[t])
    )
      return d;
    if (r !== Ge && Ve(r, t))
      return a[t] = 4, r[t];
    if (
      // global properties
      u = l.config.globalProperties, Ve(u, t)
    )
      return u[t];
  },
  set({ _: e }, t, r) {
    const { data: n, setupState: i, ctx: o } = e;
    return To(i, t) ? (i[t] = r, !0) : __VUE_OPTIONS_API__ && n !== Ge && Ve(n, t) ? (n[t] = r, !0) : Ve(e.props, t) || t[0] === "$" && t.slice(1) in e ? !1 : (o[t] = r, !0);
  },
  has({
    _: { data: e, setupState: t, accessCache: r, ctx: n, appContext: i, props: o, type: a }
  }, s) {
    let l;
    return !!(r[s] || __VUE_OPTIONS_API__ && e !== Ge && s[0] !== "$" && Ve(e, s) || To(t, s) || Ve(o, s) || Ve(n, s) || Ve(Yn, s) || Ve(i.config.globalProperties, s) || (l = a.__cssModules) && l[s]);
  },
  defineProperty(e, t, r) {
    return r.get != null ? e._.accessCache[t] = 0 : Ve(r, "value") && this.set(e, t, r.value, null), Reflect.defineProperty(e, t, r);
  }
};
function ia(e) {
  return Ce(e) ? e.reduce(
    (t, r) => (t[r] = null, t),
    {}
  ) : e;
}
function cu(e, t) {
  const r = ia(e);
  for (const n in t) {
    if (n.startsWith("__skip")) continue;
    let i = r[n];
    i ? Ce(i) || Te(i) ? i = r[n] = { type: i, default: t[n] } : i.default = t[n] : i === null && (i = r[n] = { default: t[n] }), i && t[`__skip_${n}`] && (i.skipFactory = !0);
  }
  return r;
}
let oa = !0;
function $d(e) {
  const t = fu(e), r = e.proxy, n = e.ctx;
  oa = !1, t.beforeCreate && ns(t.beforeCreate, e, "bc");
  const {
    // state
    data: i,
    computed: o,
    methods: a,
    watch: s,
    provide: l,
    inject: f,
    // lifecycle
    created: d,
    beforeMount: u,
    mounted: h,
    beforeUpdate: c,
    updated: y,
    activated: m,
    deactivated: b,
    beforeDestroy: g,
    beforeUnmount: _,
    destroyed: x,
    unmounted: D,
    render: R,
    renderTracked: C,
    renderTriggered: P,
    errorCaptured: W,
    serverPrefetch: j,
    // public API
    expose: oe,
    inheritAttrs: ue,
    // assets
    components: B,
    directives: Z,
    filters: w
  } = t;
  if (f && jd(f, n, null), a)
    for (const L in a) {
      const F = a[L];
      Te(F) && (n[L] = F.bind(r));
    }
  if (i) {
    const L = i.call(r, r);
    $e(L) && (e.data = /* @__PURE__ */ Sn(L));
  }
  if (oa = !0, o)
    for (const L in o) {
      const F = o[L], Y = Te(F) ? F.bind(r, r) : Te(F.get) ? F.get.bind(r, r) : Ut, ee = !Te(F) && Te(F.set) ? F.set.bind(r) : Ut, H = be({
        get: Y,
        set: ee
      });
      Object.defineProperty(n, L, {
        enumerable: !0,
        configurable: !0,
        get: () => H.value,
        set: (K) => H.value = K
      });
    }
  if (s)
    for (const L in s)
      du(s[L], n, r, L);
  if (l) {
    const L = Te(l) ? l.call(r) : l;
    Reflect.ownKeys(L).forEach((F) => {
      xa(F, L[F]);
    });
  }
  d && ns(d, e, "c");
  function N(L, F) {
    Ce(F) ? F.forEach((Y) => L(Y.bind(r))) : F && L(F.bind(r));
  }
  if (N(Id, u), N(nn, h), N(Ld, c), N(ou, y), N(Nd, m), N(Od, b), N(zd, W), N(Fd, C), N(Bd, P), N(au, _), N(on, D), N(Rd, j), Ce(oe))
    if (oe.length) {
      const L = e.exposed || (e.exposed = {});
      oe.forEach((F) => {
        Object.defineProperty(L, F, {
          get: () => r[F],
          set: (Y) => r[F] = Y,
          enumerable: !0
        });
      });
    } else e.exposed || (e.exposed = {});
  R && e.render === Ut && (e.render = R), ue != null && (e.inheritAttrs = ue), B && (e.components = B), Z && (e.directives = Z), j && ru(e);
}
function jd(e, t, r = Ut) {
  Ce(e) && (e = aa(e));
  for (const n in e) {
    const i = e[n];
    let o;
    $e(i) ? "default" in i ? o = Jr(
      i.from || n,
      i.default,
      !0
    ) : o = Jr(i.from || n) : o = Jr(i), /* @__PURE__ */ ot(o) ? Object.defineProperty(t, n, {
      enumerable: !0,
      configurable: !0,
      get: () => o.value,
      set: (a) => o.value = a
    }) : t[n] = o;
  }
}
function ns(e, t, r) {
  ar(
    Ce(e) ? e.map((n) => n.bind(t.proxy)) : e.bind(t.proxy),
    t,
    r
  );
}
function du(e, t, r, n) {
  let i = n.includes(".") ? eu(r, n) : () => r[n];
  if (rt(e)) {
    const o = t[e];
    Te(o) && tt(i, o);
  } else if (Te(e))
    tt(i, e.bind(r));
  else if ($e(e))
    if (Ce(e))
      e.forEach((o) => du(o, t, r, n));
    else {
      const o = Te(e.handler) ? e.handler.bind(r) : t[e.handler];
      Te(o) && tt(i, o, e);
    }
}
function fu(e) {
  const t = e.type, { mixins: r, extends: n } = t, {
    mixins: i,
    optionsCache: o,
    config: { optionMergeStrategies: a }
  } = e.appContext, s = o.get(t);
  let l;
  return s ? l = s : !i.length && !r && !n ? l = t : (l = {}, i.length && i.forEach(
    (f) => Fi(l, f, a, !0)
  ), Fi(l, t, a)), $e(t) && o.set(t, l), l;
}
function Fi(e, t, r, n = !1) {
  const { mixins: i, extends: o } = t;
  o && Fi(e, o, r, !0), i && i.forEach(
    (a) => Fi(e, a, r, !0)
  );
  for (const a in t)
    if (!(n && a === "expose")) {
      const s = Wd[a] || r && r[a];
      e[a] = s ? s(e[a], t[a]) : t[a];
    }
  return e;
}
const Wd = {
  data: is,
  props: os,
  emits: os,
  // objects
  methods: $n,
  computed: $n,
  // lifecycle
  beforeCreate: Mt,
  created: Mt,
  beforeMount: Mt,
  mounted: Mt,
  beforeUpdate: Mt,
  updated: Mt,
  beforeDestroy: Mt,
  beforeUnmount: Mt,
  destroyed: Mt,
  unmounted: Mt,
  activated: Mt,
  deactivated: Mt,
  errorCaptured: Mt,
  serverPrefetch: Mt,
  // assets
  components: $n,
  directives: $n,
  // watch
  watch: Kd,
  // provide / inject
  provide: is,
  inject: Gd
};
function is(e, t) {
  return t ? e ? function() {
    return pt(
      Te(e) ? e.call(this, this) : e,
      Te(t) ? t.call(this, this) : t
    );
  } : t : e;
}
function Gd(e, t) {
  return $n(aa(e), aa(t));
}
function aa(e) {
  if (Ce(e)) {
    const t = {};
    for (let r = 0; r < e.length; r++)
      t[e[r]] = e[r];
    return t;
  }
  return e;
}
function Mt(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function $n(e, t) {
  return e ? pt(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function os(e, t) {
  return e ? Ce(e) && Ce(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : pt(
    /* @__PURE__ */ Object.create(null),
    ia(e),
    ia(t ?? {})
  ) : t;
}
function Kd(e, t) {
  if (!e) return t;
  if (!t) return e;
  const r = pt(/* @__PURE__ */ Object.create(null), e);
  for (const n in t)
    r[n] = Mt(e[n], t[n]);
  return r;
}
function hu() {
  return {
    app: null,
    config: {
      isNativeTag: gl,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let Xd = 0;
function Yd(e, t) {
  return function(n, i = null) {
    Te(n) || (n = pt({}, n)), i != null && !$e(i) && (i = null);
    const o = hu(), a = /* @__PURE__ */ new WeakSet(), s = [];
    let l = !1;
    const f = o.app = {
      _uid: Xd++,
      _component: n,
      _props: i,
      _container: null,
      _context: o,
      _instance: null,
      version: fs,
      get config() {
        return o.config;
      },
      set config(d) {
      },
      use(d, ...u) {
        return a.has(d) || (d && Te(d.install) ? (a.add(d), d.install(f, ...u)) : Te(d) && (a.add(d), d(f, ...u))), f;
      },
      mixin(d) {
        return __VUE_OPTIONS_API__ && (o.mixins.includes(d) || o.mixins.push(d)), f;
      },
      component(d, u) {
        return u ? (o.components[d] = u, f) : o.components[d];
      },
      directive(d, u) {
        return u ? (o.directives[d] = u, f) : o.directives[d];
      },
      mount(d, u, h) {
        if (!l) {
          const c = f._ceVNode || Ie(n, i);
          return c.appContext = o, h === !0 ? h = "svg" : h === !1 && (h = void 0), e(c, d, h), l = !0, f._container = d, d.__vue_app__ = f, __VUE_PROD_DEVTOOLS__ && (f._instance = c.component, md(f, fs)), so(c.component);
        }
      },
      onUnmount(d) {
        s.push(d);
      },
      unmount() {
        l && (ar(
          s,
          f._instance,
          16
        ), e(null, f._container), __VUE_PROD_DEVTOOLS__ && (f._instance = null, gd(f)), delete f._container.__vue_app__);
      },
      provide(d, u) {
        return o.provides[d] = u, f;
      },
      runWithContext(d) {
        const u = An;
        An = f;
        try {
          return d();
        } finally {
          An = u;
        }
      }
    };
    return f;
  };
}
let An = null;
const Zd = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${ft(t)}Modifiers`] || e[`${Rr(t)}Modifiers`];
function Qd(e, t, ...r) {
  if (e.isUnmounted) return;
  const n = e.vnode.props || Ge;
  let i = r;
  const o = t.startsWith("update:"), a = o && Zd(n, t.slice(7));
  a && (a.trim && (i = r.map((d) => rt(d) ? d.trim() : d)), a.number && (i = r.map(xc))), __VUE_PROD_DEVTOOLS__ && _d(e, t, i);
  let s, l = n[s = Wn(t)] || // also try camelCase event handler (#2249)
  n[s = Wn(ft(t))];
  !l && o && (l = n[s = Wn(Rr(t))]), l && ar(
    l,
    e,
    6,
    i
  );
  const f = n[s + "Once"];
  if (f) {
    if (!e.emitted)
      e.emitted = {};
    else if (e.emitted[s])
      return;
    e.emitted[s] = !0, ar(
      f,
      e,
      6,
      i
    );
  }
}
const Jd = /* @__PURE__ */ new WeakMap();
function pu(e, t, r = !1) {
  const n = __VUE_OPTIONS_API__ && r ? Jd : t.emitsCache, i = n.get(e);
  if (i !== void 0)
    return i;
  const o = e.emits;
  let a = {}, s = !1;
  if (__VUE_OPTIONS_API__ && !Te(e)) {
    const l = (f) => {
      const d = pu(f, t, !0);
      d && (s = !0, pt(a, d));
    };
    !r && t.mixins.length && t.mixins.forEach(l), e.extends && l(e.extends), e.mixins && e.mixins.forEach(l);
  }
  return !o && !s ? ($e(e) && n.set(e, null), null) : (Ce(o) ? o.forEach((l) => a[l] = null) : pt(a, o), $e(e) && n.set(e, a), a);
}
function ao(e, t) {
  return !e || !ji(t) ? !1 : (t = t.slice(2).replace(/Once$/, ""), Ve(e, t[0].toLowerCase() + t.slice(1)) || Ve(e, Rr(t)) || Ve(e, t));
}
function as(e) {
  const {
    type: t,
    vnode: r,
    proxy: n,
    withProxy: i,
    propsOptions: [o],
    slots: a,
    attrs: s,
    emit: l,
    render: f,
    renderCache: d,
    props: u,
    data: h,
    setupState: c,
    ctx: y,
    inheritAttrs: m
  } = e, b = Ri(e);
  let g, _;
  try {
    if (r.shapeFlag & 4) {
      const D = i || n, R = D;
      g = tr(
        f.call(
          R,
          D,
          d,
          u,
          c,
          h,
          y
        )
      ), _ = s;
    } else {
      const D = t;
      g = tr(
        D.length > 1 ? D(
          u,
          { attrs: s, slots: a, emit: l }
        ) : D(
          u,
          null
        )
      ), _ = t.props ? s : ef(s);
    }
  } catch (D) {
    Zn.length = 0, ro(D, e, 1), g = Ie(Wt);
  }
  let x = g;
  if (_ && m !== !1) {
    const D = Object.keys(_), { shapeFlag: R } = x;
    D.length && R & 7 && (o && D.some(Wi) && (_ = tf(
      _,
      o
    )), x = en(x, _, !1, !0));
  }
  return r.dirs && (x = en(x, null, !1, !0), x.dirs = x.dirs ? x.dirs.concat(r.dirs) : r.dirs), r.transition && Da(x, r.transition), g = x, Ri(b), g;
}
const ef = (e) => {
  let t;
  for (const r in e)
    (r === "class" || r === "style" || ji(r)) && ((t || (t = {}))[r] = e[r]);
  return t;
}, tf = (e, t) => {
  const r = {};
  for (const n in e)
    (!Wi(n) || !(n.slice(9) in t)) && (r[n] = e[n]);
  return r;
};
function rf(e, t, r) {
  const { props: n, children: i, component: o } = e, { props: a, children: s, patchFlag: l } = t, f = o.emitsOptions;
  if (t.dirs || t.transition)
    return !0;
  if (r && l >= 0) {
    if (l & 1024)
      return !0;
    if (l & 16)
      return n ? ss(n, a, f) : !!a;
    if (l & 8) {
      const d = t.dynamicProps;
      for (let u = 0; u < d.length; u++) {
        const h = d[u];
        if (mu(a, n, h) && !ao(f, h))
          return !0;
      }
    }
  } else
    return (i || s) && (!s || !s.$stable) ? !0 : n === a ? !1 : n ? a ? ss(n, a, f) : !0 : !!a;
  return !1;
}
function ss(e, t, r) {
  const n = Object.keys(t);
  if (n.length !== Object.keys(e).length)
    return !0;
  for (let i = 0; i < n.length; i++) {
    const o = n[i];
    if (mu(t, e, o) && !ao(r, o))
      return !0;
  }
  return !1;
}
function mu(e, t, r) {
  const n = e[r], i = t[r];
  return r === "style" && $e(n) && $e(i) ? !ba(n, i) : n !== i;
}
function nf({ vnode: e, parent: t, suspense: r }, n) {
  for (; t; ) {
    const i = t.subTree;
    if (i.suspense && i.suspense.activeBranch === e && (i.suspense.vnode.el = i.el = n, e = i), i === e)
      (e = t.vnode).el = n, t = t.parent;
    else
      break;
  }
  r && r.activeBranch === e && (r.vnode.el = n);
}
const gu = {}, yu = () => Object.create(gu), vu = (e) => Object.getPrototypeOf(e) === gu;
function of(e, t, r, n = !1) {
  const i = {}, o = yu();
  e.propsDefaults = /* @__PURE__ */ Object.create(null), bu(e, t, i, o);
  for (const a in e.propsOptions[0])
    a in i || (i[a] = void 0);
  r ? e.props = n ? i : /* @__PURE__ */ Jc(i) : e.type.props ? e.props = i : e.props = o, e.attrs = o;
}
function af(e, t, r, n) {
  const {
    props: i,
    attrs: o,
    vnode: { patchFlag: a }
  } = e, s = /* @__PURE__ */ Ue(i), [l] = e.propsOptions;
  let f = !1;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (n || a > 0) && !(a & 16)
  ) {
    if (a & 8) {
      const d = e.vnode.dynamicProps;
      for (let u = 0; u < d.length; u++) {
        let h = d[u];
        if (ao(e.emitsOptions, h))
          continue;
        const c = t[h];
        if (l)
          if (Ve(o, h))
            c !== o[h] && (o[h] = c, f = !0);
          else {
            const y = ft(h);
            i[y] = sa(
              l,
              s,
              y,
              c,
              e,
              !1
            );
          }
        else
          c !== o[h] && (o[h] = c, f = !0);
      }
    }
  } else {
    bu(e, t, i, o) && (f = !0);
    let d;
    for (const u in s)
      (!t || // for camelCase
      !Ve(t, u) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((d = Rr(u)) === u || !Ve(t, d))) && (l ? r && // for camelCase
      (r[u] !== void 0 || // for kebab-case
      r[d] !== void 0) && (i[u] = sa(
        l,
        s,
        u,
        void 0,
        e,
        !0
      )) : delete i[u]);
    if (o !== s)
      for (const u in o)
        (!t || !Ve(t, u)) && (delete o[u], f = !0);
  }
  f && yr(e.attrs, "set", "");
}
function bu(e, t, r, n) {
  const [i, o] = e.propsOptions;
  let a = !1, s;
  if (t)
    for (let l in t) {
      if (jn(l))
        continue;
      const f = t[l];
      let d;
      i && Ve(i, d = ft(l)) ? !o || !o.includes(d) ? r[d] = f : (s || (s = {}))[d] = f : ao(e.emitsOptions, l) || (!(l in n) || f !== n[l]) && (n[l] = f, a = !0);
    }
  if (o) {
    const l = /* @__PURE__ */ Ue(r), f = s || Ge;
    for (let d = 0; d < o.length; d++) {
      const u = o[d];
      r[u] = sa(
        i,
        l,
        u,
        f[u],
        e,
        !Ve(f, u)
      );
    }
  }
  return a;
}
function sa(e, t, r, n, i, o) {
  const a = e[r];
  if (a != null) {
    const s = Ve(a, "default");
    if (s && n === void 0) {
      const l = a.default;
      if (a.type !== Function && !a.skipFactory && Te(l)) {
        const { propsDefaults: f } = i;
        if (r in f)
          n = f[r];
        else {
          const d = ui(i);
          n = f[r] = l.call(
            null,
            t
          ), d();
        }
      } else
        n = l;
      i.ce && i.ce._setProp(r, n);
    }
    a[
      0
      /* shouldCast */
    ] && (o && !s ? n = !1 : a[
      1
      /* shouldCastTrue */
    ] && (n === "" || n === Rr(r)) && (n = !0));
  }
  return n;
}
const sf = /* @__PURE__ */ new WeakMap();
function _u(e, t, r = !1) {
  const n = __VUE_OPTIONS_API__ && r ? sf : t.propsCache, i = n.get(e);
  if (i)
    return i;
  const o = e.props, a = {}, s = [];
  let l = !1;
  if (__VUE_OPTIONS_API__ && !Te(e)) {
    const d = (u) => {
      l = !0;
      const [h, c] = _u(u, t, !0);
      pt(a, h), c && s.push(...c);
    };
    !r && t.mixins.length && t.mixins.forEach(d), e.extends && d(e.extends), e.mixins && e.mixins.forEach(d);
  }
  if (!o && !l)
    return $e(e) && n.set(e, _n), _n;
  if (Ce(o))
    for (let d = 0; d < o.length; d++) {
      const u = ft(o[d]);
      ls(u) && (a[u] = Ge);
    }
  else if (o)
    for (const d in o) {
      const u = ft(d);
      if (ls(u)) {
        const h = o[d], c = a[u] = Ce(h) || Te(h) ? { type: h } : pt({}, h), y = c.type;
        let m = !1, b = !0;
        if (Ce(y))
          for (let g = 0; g < y.length; ++g) {
            const _ = y[g], x = Te(_) && _.name;
            if (x === "Boolean") {
              m = !0;
              break;
            } else x === "String" && (b = !1);
          }
        else
          m = Te(y) && y.name === "Boolean";
        c[
          0
          /* shouldCast */
        ] = m, c[
          1
          /* shouldCastTrue */
        ] = b, (m || Ve(c, "default")) && s.push(u);
      }
    }
  const f = [a, s];
  return $e(e) && n.set(e, f), f;
}
function ls(e) {
  return e[0] !== "$" && !jn(e);
}
const Ca = (e) => e === "_" || e === "_ctx" || e === "$stable", Sa = (e) => Ce(e) ? e.map(tr) : [tr(e)], lf = (e, t, r) => {
  if (t._n)
    return t;
  const n = ge((...i) => Sa(t(...i)), r);
  return n._c = !1, n;
}, wu = (e, t, r) => {
  const n = e._ctx;
  for (const i in e) {
    if (Ca(i)) continue;
    const o = e[i];
    if (Te(o))
      t[i] = lf(i, o, n);
    else if (o != null) {
      const a = Sa(o);
      t[i] = () => a;
    }
  }
}, ku = (e, t) => {
  const r = Sa(t);
  e.slots.default = () => r;
}, Mu = (e, t, r) => {
  for (const n in t)
    (r || !Ca(n)) && (e[n] = t[n]);
}, uf = (e, t, r) => {
  const n = e.slots = yu();
  if (e.vnode.shapeFlag & 32) {
    const i = t._;
    i ? (Mu(n, t, r), r && Oi(n, "_", i, !0)) : wu(t, n);
  } else t && ku(e, t);
}, cf = (e, t, r) => {
  const { vnode: n, slots: i } = e;
  let o = !0, a = Ge;
  if (n.shapeFlag & 32) {
    const s = t._;
    s ? r && s === 1 ? o = !1 : Mu(i, t, r) : (o = !t.$stable, wu(t, i)), a = t;
  } else t && (ku(e, t), a = { default: 1 });
  if (o)
    for (const s in i)
      !Ca(s) && a[s] == null && delete i[s];
};
function df() {
  typeof __VUE_OPTIONS_API__ != "boolean" && (Yr().__VUE_OPTIONS_API__ = !0), typeof __VUE_PROD_DEVTOOLS__ != "boolean" && (Yr().__VUE_PROD_DEVTOOLS__ = !1), typeof __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ != "boolean" && (Yr().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = !1);
}
const At = gf;
function ff(e) {
  return hf(e);
}
function hf(e, t) {
  df();
  const r = Yr();
  r.__VUE__ = !0, __VUE_PROD_DEVTOOLS__ && Yl(r.__VUE_DEVTOOLS_GLOBAL_HOOK__, r);
  const {
    insert: n,
    remove: i,
    patchProp: o,
    createElement: a,
    createText: s,
    createComment: l,
    setText: f,
    setElementText: d,
    parentNode: u,
    nextSibling: h,
    setScopeId: c = Ut,
    insertStaticContent: y
  } = e, m = (O, $, p, z = null, S = null, A = null, M = void 0, T = null, U = !!$.dynamicChildren) => {
    if (O === $)
      return;
    O && !qn(O, $) && (z = we(O), K(O, S, A, !0), O = null), $.patchFlag === -2 && (U = !1, $.dynamicChildren = null);
    const { type: V, ref: q, shapeFlag: te } = $;
    switch (V) {
      case li:
        b(O, $, p, z);
        break;
      case Wt:
        g(O, $, p, z);
        break;
      case Si:
        O == null && _($, p, z, M);
        break;
      case et:
        B(
          O,
          $,
          p,
          z,
          S,
          A,
          M,
          T,
          U
        );
        break;
      default:
        te & 1 ? R(
          O,
          $,
          p,
          z,
          S,
          A,
          M,
          T,
          U
        ) : te & 6 ? Z(
          O,
          $,
          p,
          z,
          S,
          A,
          M,
          T,
          U
        ) : (te & 64 || te & 128) && V.process(
          O,
          $,
          p,
          z,
          S,
          A,
          M,
          T,
          U,
          Be
        );
    }
    q != null && S ? Xn(q, O && O.ref, A, $ || O, !$) : q == null && O && O.ref != null && Xn(O.ref, null, A, O, !0);
  }, b = (O, $, p, z) => {
    if (O == null)
      n(
        $.el = s($.children),
        p,
        z
      );
    else {
      const S = $.el = O.el;
      $.children !== O.children && f(S, $.children);
    }
  }, g = (O, $, p, z) => {
    O == null ? n(
      $.el = l($.children || ""),
      p,
      z
    ) : $.el = O.el;
  }, _ = (O, $, p, z) => {
    [O.el, O.anchor] = y(
      O.children,
      $,
      p,
      z,
      O.el,
      O.anchor
    );
  }, x = ({ el: O, anchor: $ }, p, z) => {
    let S;
    for (; O && O !== $; )
      S = h(O), n(O, p, z), O = S;
    n($, p, z);
  }, D = ({ el: O, anchor: $ }) => {
    let p;
    for (; O && O !== $; )
      p = h(O), i(O), O = p;
    i($);
  }, R = (O, $, p, z, S, A, M, T, U) => {
    if ($.type === "svg" ? M = "svg" : $.type === "math" && (M = "mathml"), O == null)
      C(
        $,
        p,
        z,
        S,
        A,
        M,
        T,
        U
      );
    else {
      const V = O.el && O.el._isVueCE ? O.el : null;
      try {
        V && V._beginPatch(), j(
          O,
          $,
          S,
          A,
          M,
          T,
          U
        );
      } finally {
        V && V._endPatch();
      }
    }
  }, C = (O, $, p, z, S, A, M, T) => {
    let U, V;
    const { props: q, shapeFlag: te, transition: se, dirs: re } = O;
    if (U = O.el = a(
      O.type,
      A,
      q && q.is,
      q
    ), te & 8 ? d(U, O.children) : te & 16 && W(
      O.children,
      U,
      null,
      z,
      S,
      No(O, A),
      M,
      T
    ), re && Ur(O, null, z, "created"), P(U, O, O.scopeId, M, z), q) {
      for (const he in q)
        he !== "value" && !jn(he) && o(U, he, null, q[he], A, z);
      "value" in q && o(U, "value", null, q.value, A), (V = q.onVnodeBeforeMount) && Zt(V, z, O);
    }
    __VUE_PROD_DEVTOOLS__ && (Oi(U, "__vnode", O, !0), Oi(U, "__vueParentComponent", z, !0)), re && Ur(O, null, z, "beforeMount");
    const fe = pf(S, se);
    fe && se.beforeEnter(U), n(U, $, p), ((V = q && q.onVnodeMounted) || fe || re) && At(() => {
      try {
        V && Zt(V, z, O), fe && se.enter(U), re && Ur(O, null, z, "mounted");
      } finally {
      }
    }, S);
  }, P = (O, $, p, z, S) => {
    if (p && c(O, p), z)
      for (let A = 0; A < z.length; A++)
        c(O, z[A]);
    if (S) {
      let A = S.subTree;
      if ($ === A || xu(A.type) && (A.ssContent === $ || A.ssFallback === $)) {
        const M = S.vnode;
        P(
          O,
          M,
          M.scopeId,
          M.slotScopeIds,
          S.parent
        );
      }
    }
  }, W = (O, $, p, z, S, A, M, T, U = 0) => {
    for (let V = U; V < O.length; V++) {
      const q = O[V] = T ? gr(O[V]) : tr(O[V]);
      m(
        null,
        q,
        $,
        p,
        z,
        S,
        A,
        M,
        T
      );
    }
  }, j = (O, $, p, z, S, A, M) => {
    const T = $.el = O.el;
    __VUE_PROD_DEVTOOLS__ && (T.__vnode = $);
    let { patchFlag: U, dynamicChildren: V, dirs: q } = $;
    U |= O.patchFlag & 16;
    const te = O.props || Ge, se = $.props || Ge;
    let re;
    if (p && $r(p, !1), (re = se.onVnodeBeforeUpdate) && Zt(re, p, $, O), q && Ur($, O, p, "beforeUpdate"), p && $r(p, !0), (te.innerHTML && se.innerHTML == null || te.textContent && se.textContent == null) && d(T, ""), V ? oe(
      O.dynamicChildren,
      V,
      T,
      p,
      z,
      No($, S),
      A
    ) : M || F(
      O,
      $,
      T,
      null,
      p,
      z,
      No($, S),
      A,
      !1
    ), U > 0) {
      if (U & 16)
        ue(T, te, se, p, S);
      else if (U & 2 && te.class !== se.class && o(T, "class", null, se.class, S), U & 4 && o(T, "style", te.style, se.style, S), U & 8) {
        const fe = $.dynamicProps;
        for (let he = 0; he < fe.length; he++) {
          const pe = fe[he], Re = te[pe], qe = se[pe];
          (qe !== Re || pe === "value") && o(T, pe, Re, qe, S, p);
        }
      }
      U & 1 && O.children !== $.children && d(T, $.children);
    } else !M && V == null && ue(T, te, se, p, S);
    ((re = se.onVnodeUpdated) || q) && At(() => {
      re && Zt(re, p, $, O), q && Ur($, O, p, "updated");
    }, z);
  }, oe = (O, $, p, z, S, A, M) => {
    for (let T = 0; T < $.length; T++) {
      const U = O[T], V = $[T], q = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        U.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (U.type === et || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !qn(U, V) || // - In the case of a component, it could contain anything.
        U.shapeFlag & 198) ? u(U.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          p
        )
      );
      m(
        U,
        V,
        q,
        null,
        z,
        S,
        A,
        M,
        !0
      );
    }
  }, ue = (O, $, p, z, S) => {
    if ($ !== p) {
      if ($ !== Ge)
        for (const A in $)
          !jn(A) && !(A in p) && o(
            O,
            A,
            $[A],
            null,
            S,
            z
          );
      for (const A in p) {
        if (jn(A)) continue;
        const M = p[A], T = $[A];
        M !== T && A !== "value" && o(O, A, T, M, S, z);
      }
      "value" in p && o(O, "value", $.value, p.value, S);
    }
  }, B = (O, $, p, z, S, A, M, T, U) => {
    const V = $.el = O ? O.el : s(""), q = $.anchor = O ? O.anchor : s("");
    let { patchFlag: te, dynamicChildren: se, slotScopeIds: re } = $;
    re && (T = T ? T.concat(re) : re), O == null ? (n(V, p, z), n(q, p, z), W(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      $.children || [],
      p,
      q,
      S,
      A,
      M,
      T,
      U
    )) : te > 0 && te & 64 && se && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    O.dynamicChildren && O.dynamicChildren.length === se.length ? (oe(
      O.dynamicChildren,
      se,
      p,
      S,
      A,
      M,
      T
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    ($.key != null || S && $ === S.subTree) && Ta(
      O,
      $,
      !0
      /* shallow */
    )) : F(
      O,
      $,
      p,
      q,
      S,
      A,
      M,
      T,
      U
    );
  }, Z = (O, $, p, z, S, A, M, T, U) => {
    $.slotScopeIds = T, O == null ? $.shapeFlag & 512 ? S.ctx.activate(
      $,
      p,
      z,
      M,
      U
    ) : w(
      $,
      p,
      z,
      S,
      A,
      M,
      U
    ) : E(O, $, U);
  }, w = (O, $, p, z, S, A, M) => {
    const T = O.component = wf(
      O,
      z,
      S
    );
    if (nu(O) && (T.ctx.renderer = Be), kf(T, !1, M), T.asyncDep) {
      if (S && S.registerDep(T, N, M), !O.el) {
        const U = T.subTree = Ie(Wt);
        g(null, U, $, p), O.placeholder = U.el;
      }
    } else
      N(
        T,
        O,
        $,
        p,
        S,
        A,
        M
      );
  }, E = (O, $, p) => {
    const z = $.component = O.component;
    if (rf(O, $, p))
      if (z.asyncDep && !z.asyncResolved) {
        L(z, $, p);
        return;
      } else
        z.next = $, z.update();
    else
      $.el = O.el, z.vnode = $;
  }, N = (O, $, p, z, S, A, M) => {
    const T = () => {
      if (O.isMounted) {
        let { next: te, bu: se, u: re, parent: fe, vnode: he } = O;
        {
          const Ae = Au(O);
          if (Ae) {
            te && (te.el = he.el, L(O, te, M)), Ae.asyncDep.then(() => {
              At(() => {
                O.isUnmounted || V();
              }, S);
            });
            return;
          }
        }
        let pe = te, Re;
        $r(O, !1), te ? (te.el = he.el, L(O, te, M)) : te = he, se && Ao(se), (Re = te.props && te.props.onVnodeBeforeUpdate) && Zt(Re, fe, te, he), $r(O, !0);
        const qe = as(O), je = O.subTree;
        O.subTree = qe, m(
          je,
          qe,
          // parent may have changed if it's in a teleport
          u(je.el),
          // anchor may have changed if it's in a fragment
          we(je),
          O,
          S,
          A
        ), te.el = qe.el, pe === null && nf(O, qe.el), re && At(re, S), (Re = te.props && te.props.onVnodeUpdated) && At(
          () => Zt(Re, fe, te, he),
          S
        ), __VUE_PROD_DEVTOOLS__ && Zl(O);
      } else {
        let te;
        const { el: se, props: re } = $, { bm: fe, m: he, parent: pe, root: Re, type: qe } = O, je = Mn($);
        $r(O, !1), fe && Ao(fe), !je && (te = re && re.onVnodeBeforeMount) && Zt(te, pe, $), $r(O, !0);
        {
          Re.ce && Re.ce._hasShadowRoot() && Re.ce._injectChildStyle(
            qe,
            O.parent ? O.parent.type : void 0
          );
          const Ae = O.subTree = as(O);
          m(
            null,
            Ae,
            p,
            z,
            O,
            S,
            A
          ), $.el = Ae.el;
        }
        if (he && At(he, S), !je && (te = re && re.onVnodeMounted)) {
          const Ae = $;
          At(
            () => Zt(te, pe, Ae),
            S
          );
        }
        ($.shapeFlag & 256 || pe && Mn(pe.vnode) && pe.vnode.shapeFlag & 256) && O.a && At(O.a, S), O.isMounted = !0, __VUE_PROD_DEVTOOLS__ && yd(O), $ = p = z = null;
      }
    };
    O.scope.on();
    const U = O.effect = new Dl(T);
    O.scope.off();
    const V = O.update = U.run.bind(U), q = O.job = U.runIfDirty.bind(U);
    q.i = O, q.id = O.uid, U.scheduler = () => Aa(q), $r(O, !0), V();
  }, L = (O, $, p) => {
    $.component = O;
    const z = O.vnode.props;
    O.vnode = $, O.next = null, af(O, $.props, z, p), cf(O, $.children, p), wr(), Za(O), kr();
  }, F = (O, $, p, z, S, A, M, T, U = !1) => {
    const V = O && O.children, q = O ? O.shapeFlag : 0, te = $.children, { patchFlag: se, shapeFlag: re } = $;
    if (se > 0) {
      if (se & 128) {
        ee(
          V,
          te,
          p,
          z,
          S,
          A,
          M,
          T,
          U
        );
        return;
      } else if (se & 256) {
        Y(
          V,
          te,
          p,
          z,
          S,
          A,
          M,
          T,
          U
        );
        return;
      }
    }
    re & 8 ? (q & 16 && me(V, S, A), te !== V && d(p, te)) : q & 16 ? re & 16 ? ee(
      V,
      te,
      p,
      z,
      S,
      A,
      M,
      T,
      U
    ) : me(V, S, A, !0) : (q & 8 && d(p, ""), re & 16 && W(
      te,
      p,
      z,
      S,
      A,
      M,
      T,
      U
    ));
  }, Y = (O, $, p, z, S, A, M, T, U) => {
    O = O || _n, $ = $ || _n;
    const V = O.length, q = $.length, te = Math.min(V, q);
    let se;
    for (se = 0; se < te; se++) {
      const re = $[se] = U ? gr($[se]) : tr($[se]);
      m(
        O[se],
        re,
        p,
        null,
        S,
        A,
        M,
        T,
        U
      );
    }
    V > q ? me(
      O,
      S,
      A,
      !0,
      !1,
      te
    ) : W(
      $,
      p,
      z,
      S,
      A,
      M,
      T,
      U,
      te
    );
  }, ee = (O, $, p, z, S, A, M, T, U) => {
    let V = 0;
    const q = $.length;
    let te = O.length - 1, se = q - 1;
    for (; V <= te && V <= se; ) {
      const re = O[V], fe = $[V] = U ? gr($[V]) : tr($[V]);
      if (qn(re, fe))
        m(
          re,
          fe,
          p,
          null,
          S,
          A,
          M,
          T,
          U
        );
      else
        break;
      V++;
    }
    for (; V <= te && V <= se; ) {
      const re = O[te], fe = $[se] = U ? gr($[se]) : tr($[se]);
      if (qn(re, fe))
        m(
          re,
          fe,
          p,
          null,
          S,
          A,
          M,
          T,
          U
        );
      else
        break;
      te--, se--;
    }
    if (V > te) {
      if (V <= se) {
        const re = se + 1, fe = re < q ? $[re].el : z;
        for (; V <= se; )
          m(
            null,
            $[V] = U ? gr($[V]) : tr($[V]),
            p,
            fe,
            S,
            A,
            M,
            T,
            U
          ), V++;
      }
    } else if (V > se)
      for (; V <= te; )
        K(O[V], S, A, !0), V++;
    else {
      const re = V, fe = V, he = /* @__PURE__ */ new Map();
      for (V = fe; V <= se; V++) {
        const He = $[V] = U ? gr($[V]) : tr($[V]);
        He.key != null && he.set(He.key, V);
      }
      let pe, Re = 0;
      const qe = se - fe + 1;
      let je = !1, Ae = 0;
      const Oe = new Array(qe);
      for (V = 0; V < qe; V++) Oe[V] = 0;
      for (V = re; V <= te; V++) {
        const He = O[V];
        if (Re >= qe) {
          K(He, S, A, !0);
          continue;
        }
        let ze;
        if (He.key != null)
          ze = he.get(He.key);
        else
          for (pe = fe; pe <= se; pe++)
            if (Oe[pe - fe] === 0 && qn(He, $[pe])) {
              ze = pe;
              break;
            }
        ze === void 0 ? K(He, S, A, !0) : (Oe[ze - fe] = V + 1, ze >= Ae ? Ae = ze : je = !0, m(
          He,
          $[ze],
          p,
          null,
          S,
          A,
          M,
          T,
          U
        ), Re++);
      }
      const ut = je ? mf(Oe) : _n;
      for (pe = ut.length - 1, V = qe - 1; V >= 0; V--) {
        const He = fe + V, ze = $[He], kt = $[He + 1], mt = He + 1 < q ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          kt.el || Eu(kt)
        ) : z;
        Oe[V] === 0 ? m(
          null,
          ze,
          p,
          mt,
          S,
          A,
          M,
          T,
          U
        ) : je && (pe < 0 || V !== ut[pe] ? H(ze, p, mt, 2) : pe--);
      }
    }
  }, H = (O, $, p, z, S = null) => {
    const { el: A, type: M, transition: T, children: U, shapeFlag: V } = O;
    if (V & 6) {
      H(O.component.subTree, $, p, z);
      return;
    }
    if (V & 128) {
      O.suspense.move($, p, z);
      return;
    }
    if (V & 64) {
      M.move(O, $, p, Be);
      return;
    }
    if (M === et) {
      n(A, $, p);
      for (let te = 0; te < U.length; te++)
        H(U[te], $, p, z);
      n(O.anchor, $, p);
      return;
    }
    if (M === Si) {
      x(O, $, p);
      return;
    }
    if (z !== 2 && V & 1 && T)
      if (z === 0)
        T.beforeEnter(A), n(A, $, p), At(() => T.enter(A), S);
      else {
        const { leave: te, delayLeave: se, afterLeave: re } = T, fe = () => {
          O.ctx.isUnmounted ? i(A) : n(A, $, p);
        }, he = () => {
          A._isLeaving && A[Td](
            !0
            /* cancelled */
          ), te(A, () => {
            fe(), re && re();
          });
        };
        se ? se(A, fe, he) : he();
      }
    else
      n(A, $, p);
  }, K = (O, $, p, z = !1, S = !1) => {
    const {
      type: A,
      props: M,
      ref: T,
      children: U,
      dynamicChildren: V,
      shapeFlag: q,
      patchFlag: te,
      dirs: se,
      cacheIndex: re,
      memo: fe
    } = O;
    if (te === -2 && (S = !1), T != null && (wr(), Xn(T, null, p, O, !0), kr()), re != null && ($.renderCache[re] = void 0), q & 256) {
      $.ctx.deactivate(O);
      return;
    }
    const he = q & 1 && se, pe = !Mn(O);
    let Re;
    if (pe && (Re = M && M.onVnodeBeforeUnmount) && Zt(Re, $, O), q & 6)
      ne(O.component, p, z);
    else {
      if (q & 128) {
        O.suspense.unmount(p, z);
        return;
      }
      he && Ur(O, null, $, "beforeUnmount"), q & 64 ? O.type.remove(
        O,
        $,
        p,
        Be,
        z
      ) : V && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !V.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (A !== et || te > 0 && te & 64) ? me(
        V,
        $,
        p,
        !1,
        !0
      ) : (A === et && te & 384 || !S && q & 16) && me(U, $, p), z && le(O);
    }
    const qe = fe != null && re == null;
    (pe && (Re = M && M.onVnodeUnmounted) || he || qe) && At(() => {
      Re && Zt(Re, $, O), he && Ur(O, null, $, "unmounted"), qe && (O.el = null);
    }, p);
  }, le = (O) => {
    const { type: $, el: p, anchor: z, transition: S } = O;
    if ($ === et) {
      ae(p, z);
      return;
    }
    if ($ === Si) {
      D(O);
      return;
    }
    const A = () => {
      i(p), S && !S.persisted && S.afterLeave && S.afterLeave();
    };
    if (O.shapeFlag & 1 && S && !S.persisted) {
      const { leave: M, delayLeave: T } = S, U = () => M(p, A);
      T ? T(O.el, A, U) : U();
    } else
      A();
  }, ae = (O, $) => {
    let p;
    for (; O !== $; )
      p = h(O), i(O), O = p;
    i($);
  }, ne = (O, $, p) => {
    const { bum: z, scope: S, job: A, subTree: M, um: T, m: U, a: V } = O;
    us(U), us(V), z && Ao(z), S.stop(), A && (A.flags |= 8, K(M, O, $, p)), T && At(T, $), At(() => {
      O.isUnmounted = !0;
    }, $), __VUE_PROD_DEVTOOLS__ && bd(O);
  }, me = (O, $, p, z = !1, S = !1, A = 0) => {
    for (let M = A; M < O.length; M++)
      K(O[M], $, p, z, S);
  }, we = (O) => {
    if (O.shapeFlag & 6)
      return we(O.component.subTree);
    if (O.shapeFlag & 128)
      return O.suspense.next();
    const $ = h(O.anchor || O.el), p = $ && $[tu];
    return p ? h(p) : $;
  };
  let ke = !1;
  const De = (O, $, p) => {
    let z;
    O == null ? $._vnode && (K($._vnode, null, null, !0), z = $._vnode.component) : m(
      $._vnode || null,
      O,
      $,
      null,
      null,
      null,
      p
    ), $._vnode = O, ke || (ke = !0, Za(z), Kl(), ke = !1);
  }, Be = {
    p: m,
    um: K,
    m: H,
    r: le,
    mt: w,
    mc: W,
    pc: F,
    pbc: oe,
    n: we,
    o: e
  };
  return {
    render: De,
    hydrate: void 0,
    createApp: Yd(De)
  };
}
function No({ type: e, props: t }, r) {
  return r === "svg" && e === "foreignObject" || r === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : r;
}
function $r({ effect: e, job: t }, r) {
  r ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function pf(e, t) {
  return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function Ta(e, t, r = !1) {
  const n = e.children, i = t.children;
  if (Ce(n) && Ce(i))
    for (let o = 0; o < n.length; o++) {
      const a = n[o];
      let s = i[o];
      s.shapeFlag & 1 && !s.dynamicChildren && ((s.patchFlag <= 0 || s.patchFlag === 32) && (s = i[o] = gr(i[o]), s.el = a.el), !r && s.patchFlag !== -2 && Ta(a, s)), s.type === li && (s.patchFlag === -1 && (s = i[o] = gr(s)), s.el = a.el), s.type === Wt && !s.el && (s.el = a.el);
    }
}
function mf(e) {
  const t = e.slice(), r = [0];
  let n, i, o, a, s;
  const l = e.length;
  for (n = 0; n < l; n++) {
    const f = e[n];
    if (f !== 0) {
      if (i = r[r.length - 1], e[i] < f) {
        t[n] = i, r.push(n);
        continue;
      }
      for (o = 0, a = r.length - 1; o < a; )
        s = o + a >> 1, e[r[s]] < f ? o = s + 1 : a = s;
      f < e[r[o]] && (o > 0 && (t[n] = r[o - 1]), r[o] = n);
    }
  }
  for (o = r.length, a = r[o - 1]; o-- > 0; )
    r[o] = a, a = t[a];
  return r;
}
function Au(e) {
  const t = e.subTree.component;
  if (t)
    return t.asyncDep && !t.asyncResolved ? t : Au(t);
}
function us(e) {
  if (e)
    for (let t = 0; t < e.length; t++)
      e[t].flags |= 8;
}
function Eu(e) {
  if (e.placeholder)
    return e.placeholder;
  const t = e.component;
  return t ? Eu(t.subTree) : null;
}
const xu = (e) => e.__isSuspense;
function gf(e, t) {
  t && t.pendingBranch ? Ce(e) ? t.effects.push(...e) : t.effects.push(e) : pd(e);
}
const et = /* @__PURE__ */ Symbol.for("v-fgt"), li = /* @__PURE__ */ Symbol.for("v-txt"), Wt = /* @__PURE__ */ Symbol.for("v-cmt"), Si = /* @__PURE__ */ Symbol.for("v-stc"), Zn = [];
let xt = null;
function de(e = !1) {
  Zn.push(xt = e ? null : []);
}
function yf() {
  Zn.pop(), xt = Zn[Zn.length - 1] || null;
}
let Dn = 1;
function zi(e, t = !1) {
  Dn += e, e < 0 && xt && t && (xt.hasOnce = !0);
}
function Du(e) {
  return e.dynamicChildren = Dn > 0 ? xt || _n : null, yf(), Dn > 0 && xt && xt.push(e), e;
}
function We(e, t, r, n, i, o) {
  return Du(
    qt(
      e,
      t,
      r,
      n,
      i,
      o,
      !0
    )
  );
}
function ve(e, t, r, n, i) {
  return Du(
    Ie(
      e,
      t,
      r,
      n,
      i,
      !0
    )
  );
}
function ti(e) {
  return e ? e.__v_isVNode === !0 : !1;
}
function qn(e, t) {
  return e.type === t.type && e.key === t.key;
}
const Cu = ({ key: e }) => e ?? null, Ti = ({
  ref: e,
  ref_key: t,
  ref_for: r
}) => (typeof e == "number" && (e = "" + e), e != null ? rt(e) || /* @__PURE__ */ ot(e) || Te(e) ? { i: dt, r: e, k: t, f: !!r } : e : null);
function qt(e, t = null, r = null, n = 0, i = null, o = e === et ? 0 : 1, a = !1, s = !1) {
  const l = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e,
    props: t,
    key: t && Cu(t),
    ref: t && Ti(t),
    scopeId: Ql,
    slotScopeIds: null,
    children: r,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag: o,
    patchFlag: n,
    dynamicProps: i,
    dynamicChildren: null,
    appContext: null,
    ctx: dt
  };
  return s ? (Oa(l, r), o & 128 && e.normalize(l)) : r && (l.shapeFlag |= rt(r) ? 8 : 16), Dn > 0 && // avoid a block node from tracking itself
  !a && // has current parent block
  xt && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (l.patchFlag > 0 || o & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  l.patchFlag !== 32 && xt.push(l), l;
}
const Ie = vf;
function vf(e, t = null, r = null, n = 0, i = null, o = !1) {
  if ((!e || e === su) && (e = Wt), ti(e)) {
    const s = en(
      e,
      t,
      !0
      /* mergeRef: true */
    );
    return r && Oa(s, r), Dn > 0 && !o && xt && (s.shapeFlag & 6 ? xt[xt.indexOf(e)] = s : xt.push(s)), s.patchFlag = -2, s;
  }
  if (Df(e) && (e = e.__vccOpts), t) {
    t = xr(t);
    let { class: s, style: l } = t;
    s && !rt(s) && (t.class = Pr(s)), $e(l) && (/* @__PURE__ */ eo(l) && !Ce(l) && (l = pt({}, l)), t.style = at(l));
  }
  const a = rt(e) ? 1 : xu(e) ? 128 : Ed(e) ? 64 : $e(e) ? 4 : Te(e) ? 2 : 0;
  return qt(
    e,
    t,
    r,
    n,
    i,
    a,
    o,
    !0
  );
}
function xr(e) {
  return e ? /* @__PURE__ */ eo(e) || vu(e) ? pt({}, e) : e : null;
}
function en(e, t, r = !1, n = !1) {
  const { props: i, ref: o, patchFlag: a, children: s, transition: l } = e, f = t ? nt(i || {}, t) : i, d = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e.type,
    props: f,
    key: f && Cu(f),
    ref: t && t.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      r && o ? Ce(o) ? o.concat(Ti(t)) : [o, Ti(t)] : Ti(t)
    ) : o,
    scopeId: e.scopeId,
    slotScopeIds: e.slotScopeIds,
    children: s,
    target: e.target,
    targetStart: e.targetStart,
    targetAnchor: e.targetAnchor,
    staticCount: e.staticCount,
    shapeFlag: e.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: t && e.type !== et ? a === -1 ? 16 : a | 16 : a,
    dynamicProps: e.dynamicProps,
    dynamicChildren: e.dynamicChildren,
    appContext: e.appContext,
    dirs: e.dirs,
    transition: l,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: e.component,
    suspense: e.suspense,
    ssContent: e.ssContent && en(e.ssContent),
    ssFallback: e.ssFallback && en(e.ssFallback),
    placeholder: e.placeholder,
    el: e.el,
    anchor: e.anchor,
    ctx: e.ctx,
    ce: e.ce
  };
  return l && n && Da(
    d,
    l.clone(d)
  ), d;
}
function Na(e = " ", t = 0) {
  return Ie(li, null, e, t);
}
function yt(e = "", t = !1) {
  return t ? (de(), ve(Wt, null, e)) : Ie(Wt, null, e);
}
function tr(e) {
  return e == null || typeof e == "boolean" ? Ie(Wt) : Ce(e) ? Ie(
    et,
    null,
    // #3666, avoid reference pollution when reusing vnode
    e.slice()
  ) : ti(e) ? gr(e) : Ie(li, null, String(e));
}
function gr(e) {
  return e.el === null && e.patchFlag !== -1 || e.memo ? e : en(e);
}
function Oa(e, t) {
  let r = 0;
  const { shapeFlag: n } = e;
  if (t == null)
    t = null;
  else if (Ce(t))
    r = 16;
  else if (typeof t == "object")
    if (n & 65) {
      const i = t.default;
      i && (i._c && (i._d = !1), Oa(e, i()), i._c && (i._d = !0));
      return;
    } else {
      r = 32;
      const i = t._;
      !i && !vu(t) ? t._ctx = dt : i === 3 && dt && (dt.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
    }
  else Te(t) ? (t = { default: t, _ctx: dt }, r = 32) : (t = String(t), n & 64 ? (r = 16, t = [Na(t)]) : r = 8);
  e.children = t, e.shapeFlag |= r;
}
function nt(...e) {
  const t = {};
  for (let r = 0; r < e.length; r++) {
    const n = e[r];
    for (const i in n)
      if (i === "class")
        t.class !== n.class && (t.class = Pr([t.class, n.class]));
      else if (i === "style")
        t.style = at([t.style, n.style]);
      else if (ji(i)) {
        const o = t[i], a = n[i];
        a && o !== a && !(Ce(o) && o.includes(a)) ? t[i] = o ? [].concat(o, a) : a : a == null && o == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !Wi(i) && (t[i] = a);
      } else i !== "" && (t[i] = n[i]);
  }
  return t;
}
function Zt(e, t, r, n = null) {
  ar(e, t, 7, [
    r,
    n
  ]);
}
const bf = hu();
let _f = 0;
function wf(e, t, r) {
  const n = e.type, i = (t ? t.appContext : e.appContext) || bf, o = {
    uid: _f++,
    vnode: e,
    type: n,
    parent: t,
    appContext: i,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new Al(
      !0
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: t ? t.provides : Object.create(i.provides),
    ids: t ? t.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: _u(n, i),
    emitsOptions: pu(n, i),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: Ge,
    // inheritAttrs
    inheritAttrs: n.inheritAttrs,
    // state
    ctx: Ge,
    data: Ge,
    props: Ge,
    attrs: Ge,
    slots: Ge,
    refs: Ge,
    setupState: Ge,
    setupContext: null,
    // suspense related
    suspense: r,
    suspenseId: r ? r.pendingId : 0,
    asyncDep: null,
    asyncResolved: !1,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: !1,
    isUnmounted: !1,
    isDeactivated: !1,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  return o.ctx = { _: o }, o.root = t ? t.root : o, o.emit = Qd.bind(null, o), e.ce && e.ce(o), o;
}
let _t = null;
const cr = () => _t || dt;
let qi, la;
{
  const e = Yr(), t = (r, n) => {
    let i;
    return (i = e[r]) || (i = e[r] = []), i.push(n), (o) => {
      i.length > 1 ? i.forEach((a) => a(o)) : i[0](o);
    };
  };
  qi = t(
    "__VUE_INSTANCE_SETTERS__",
    (r) => _t = r
  ), la = t(
    "__VUE_SSR_SETTERS__",
    (r) => ri = r
  );
}
const ui = (e) => {
  const t = _t;
  return qi(e), e.scope.on(), () => {
    e.scope.off(), qi(t);
  };
}, cs = () => {
  _t && _t.scope.off(), qi(null);
};
function Su(e) {
  return e.vnode.shapeFlag & 4;
}
let ri = !1;
function kf(e, t = !1, r = !1) {
  t && la(t);
  const { props: n, children: i } = e.vnode, o = Su(e);
  of(e, n, o, t), uf(e, i, r || t);
  const a = o ? Mf(e, t) : void 0;
  return t && la(!1), a;
}
function Mf(e, t) {
  const r = e.type;
  e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, Vd);
  const { setup: n } = r;
  if (n) {
    wr();
    const i = e.setupContext = n.length > 1 ? Ef(e) : null, o = ui(e), a = si(
      n,
      e,
      0,
      [
        e.props,
        i
      ]
    ), s = vl(a);
    if (kr(), o(), (s || e.sp) && !Mn(e) && ru(e), s) {
      if (a.then(cs, cs), t)
        return a.then((l) => {
          ds(e, l);
        }).catch((l) => {
          ro(l, e, 0);
        });
      e.asyncDep = a;
    } else
      ds(e, a);
  } else
    Tu(e);
}
function ds(e, t, r) {
  Te(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : $e(t) && (__VUE_PROD_DEVTOOLS__ && (e.devtoolsRawSetupState = t), e.setupState = $l(t)), Tu(e);
}
function Tu(e, t, r) {
  const n = e.type;
  if (e.render || (e.render = n.render || Ut), __VUE_OPTIONS_API__) {
    const i = ui(e);
    wr();
    try {
      $d(e);
    } finally {
      kr(), i();
    }
  }
}
const Af = {
  get(e, t) {
    return bt(e, "get", ""), e[t];
  }
};
function Ef(e) {
  const t = (r) => {
    e.exposed = r || {};
  };
  return {
    attrs: new Proxy(e.attrs, Af),
    slots: e.slots,
    emit: e.emit,
    expose: t
  };
}
function so(e) {
  return e.exposed ? e.exposeProxy || (e.exposeProxy = new Proxy($l(G(e.exposed)), {
    get(t, r) {
      if (r in t)
        return t[r];
      if (r in Yn)
        return Yn[r](e);
    },
    has(t, r) {
      return r in t || r in Yn;
    }
  })) : e.proxy;
}
function xf(e, t = !0) {
  return Te(e) ? e.displayName || e.name : e.name || t && e.__name;
}
function Df(e) {
  return Te(e) && "__vccOpts" in e;
}
const be = (e, t) => /* @__PURE__ */ ud(e, t, ri);
function ir(e, t, r) {
  try {
    zi(-1);
    const n = arguments.length;
    return n === 2 ? $e(t) && !Ce(t) ? ti(t) ? Ie(e, null, [t]) : Ie(e, t) : Ie(e, null, t) : (n > 3 ? r = Array.prototype.slice.call(arguments, 2) : n === 3 && ti(r) && (r = [r]), Ie(e, t, r));
  } finally {
    zi(1);
  }
}
function Cf(e, t, r, n) {
  const i = r[n];
  if (i && Sf(i, e))
    return i;
  const o = t();
  return o.memo = e.slice(), o.cacheIndex = n, r[n] = o;
}
function Sf(e, t) {
  const r = e.memo;
  if (r.length != t.length)
    return !1;
  for (let n = 0; n < r.length; n++)
    if (Ht(r[n], t[n]))
      return !1;
  return Dn > 0 && xt && xt.push(e), !0;
}
const fs = "3.5.32";
/**
* @vue/runtime-dom v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let ua;
const hs = typeof window < "u" && window.trustedTypes;
if (hs)
  try {
    ua = /* @__PURE__ */ hs.createPolicy("vue", {
      createHTML: (e) => e
    });
  } catch {
  }
const Nu = ua ? (e) => ua.createHTML(e) : (e) => e, Tf = "http://www.w3.org/2000/svg", Nf = "http://www.w3.org/1998/Math/MathML", mr = typeof document < "u" ? document : null, ps = mr && /* @__PURE__ */ mr.createElement("template"), Of = {
  insert: (e, t, r) => {
    t.insertBefore(e, r || null);
  },
  remove: (e) => {
    const t = e.parentNode;
    t && t.removeChild(e);
  },
  createElement: (e, t, r, n) => {
    const i = t === "svg" ? mr.createElementNS(Tf, e) : t === "mathml" ? mr.createElementNS(Nf, e) : r ? mr.createElement(e, { is: r }) : mr.createElement(e);
    return e === "select" && n && n.multiple != null && i.setAttribute("multiple", n.multiple), i;
  },
  createText: (e) => mr.createTextNode(e),
  createComment: (e) => mr.createComment(e),
  setText: (e, t) => {
    e.nodeValue = t;
  },
  setElementText: (e, t) => {
    e.textContent = t;
  },
  parentNode: (e) => e.parentNode,
  nextSibling: (e) => e.nextSibling,
  querySelector: (e) => mr.querySelector(e),
  setScopeId(e, t) {
    e.setAttribute(t, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(e, t, r, n, i, o) {
    const a = r ? r.previousSibling : t.lastChild;
    if (i && (i === o || i.nextSibling))
      for (; t.insertBefore(i.cloneNode(!0), r), !(i === o || !(i = i.nextSibling)); )
        ;
    else {
      ps.innerHTML = Nu(
        n === "svg" ? `<svg>${e}</svg>` : n === "mathml" ? `<math>${e}</math>` : e
      );
      const s = ps.content;
      if (n === "svg" || n === "mathml") {
        const l = s.firstChild;
        for (; l.firstChild; )
          s.appendChild(l.firstChild);
        s.removeChild(l);
      }
      t.insertBefore(s, r);
    }
    return [
      // first
      a ? a.nextSibling : t.firstChild,
      // last
      r ? r.previousSibling : t.lastChild
    ];
  }
}, Pf = /* @__PURE__ */ Symbol("_vtc");
function If(e, t, r) {
  const n = e[Pf];
  n && (t = (t ? [t, ...n] : [...n]).join(" ")), t == null ? e.removeAttribute("class") : r ? e.setAttribute("class", t) : e.className = t;
}
const ms = /* @__PURE__ */ Symbol("_vod"), Lf = /* @__PURE__ */ Symbol("_vsh"), Rf = /* @__PURE__ */ Symbol(""), Bf = /(?:^|;)\s*display\s*:/;
function Ff(e, t, r) {
  const n = e.style, i = rt(r);
  let o = !1;
  if (r && !i) {
    if (t)
      if (rt(t))
        for (const a of t.split(";")) {
          const s = a.slice(0, a.indexOf(":")).trim();
          r[s] == null && Ni(n, s, "");
        }
      else
        for (const a in t)
          r[a] == null && Ni(n, a, "");
    for (const a in r)
      a === "display" && (o = !0), Ni(n, a, r[a]);
  } else if (i) {
    if (t !== r) {
      const a = n[Rf];
      a && (r += ";" + a), n.cssText = r, o = Bf.test(r);
    }
  } else t && e.removeAttribute("style");
  ms in e && (e[ms] = o ? n.display : "", e[Lf] && (n.display = "none"));
}
const gs = /\s*!important$/;
function Ni(e, t, r) {
  if (Ce(r))
    r.forEach((n) => Ni(e, t, n));
  else if (r == null && (r = ""), t.startsWith("--"))
    e.setProperty(t, r);
  else {
    const n = zf(e, t);
    gs.test(r) ? e.setProperty(
      Rr(n),
      r.replace(gs, ""),
      "important"
    ) : e[n] = r;
  }
}
const ys = ["Webkit", "Moz", "ms"], Oo = {};
function zf(e, t) {
  const r = Oo[t];
  if (r)
    return r;
  let n = ft(t);
  if (n !== "filter" && n in e)
    return Oo[t] = n;
  n = Xi(n);
  for (let i = 0; i < ys.length; i++) {
    const o = ys[i] + n;
    if (o in e)
      return Oo[t] = o;
  }
  return t;
}
const vs = "http://www.w3.org/1999/xlink";
function bs(e, t, r, n, i, o = Oc(t)) {
  n && t.startsWith("xlink:") ? r == null ? e.removeAttributeNS(vs, t.slice(6, t.length)) : e.setAttributeNS(vs, t, r) : r == null || o && !wl(r) ? e.removeAttribute(t) : e.setAttribute(
    t,
    o ? "" : It(r) ? String(r) : r
  );
}
function _s(e, t, r, n, i) {
  if (t === "innerHTML" || t === "textContent") {
    r != null && (e[t] = t === "innerHTML" ? Nu(r) : r);
    return;
  }
  const o = e.tagName;
  if (t === "value" && o !== "PROGRESS" && // custom elements may use _value internally
  !o.includes("-")) {
    const s = o === "OPTION" ? e.getAttribute("value") || "" : e.value, l = r == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      e.type === "checkbox" ? "on" : ""
    ) : String(r);
    (s !== l || !("_value" in e)) && (e.value = l), r == null && e.removeAttribute(t), e._value = r;
    return;
  }
  let a = !1;
  if (r === "" || r == null) {
    const s = typeof e[t];
    s === "boolean" ? r = wl(r) : r == null && s === "string" ? (r = "", a = !0) : s === "number" && (r = 0, a = !0);
  }
  try {
    e[t] = r;
  } catch {
  }
  a && e.removeAttribute(i || t);
}
function qf(e, t, r, n) {
  e.addEventListener(t, r, n);
}
function Hf(e, t, r, n) {
  e.removeEventListener(t, r, n);
}
const ws = /* @__PURE__ */ Symbol("_vei");
function Uf(e, t, r, n, i = null) {
  const o = e[ws] || (e[ws] = {}), a = o[t];
  if (n && a)
    a.value = n;
  else {
    const [s, l] = Vf(t);
    if (n) {
      const f = o[t] = Wf(
        n,
        i
      );
      qf(e, s, f, l);
    } else a && (Hf(e, s, a, l), o[t] = void 0);
  }
}
const ks = /(?:Once|Passive|Capture)$/;
function Vf(e) {
  let t;
  if (ks.test(e)) {
    t = {};
    let n;
    for (; n = e.match(ks); )
      e = e.slice(0, e.length - n[0].length), t[n[0].toLowerCase()] = !0;
  }
  return [e[2] === ":" ? e.slice(3) : Rr(e.slice(2)), t];
}
let Po = 0;
const $f = /* @__PURE__ */ Promise.resolve(), jf = () => Po || ($f.then(() => Po = 0), Po = Date.now());
function Wf(e, t) {
  const r = (n) => {
    if (!n._vts)
      n._vts = Date.now();
    else if (n._vts <= r.attached)
      return;
    ar(
      Gf(n, r.value),
      t,
      5,
      [n]
    );
  };
  return r.value = e, r.attached = jf(), r;
}
function Gf(e, t) {
  if (Ce(t)) {
    const r = e.stopImmediatePropagation;
    return e.stopImmediatePropagation = () => {
      r.call(e), e._stopped = !0;
    }, t.map(
      (n) => (i) => !i._stopped && n && n(i)
    );
  } else
    return t;
}
const Ms = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // lowercase letter
e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Kf = (e, t, r, n, i, o) => {
  const a = i === "svg";
  t === "class" ? If(e, n, a) : t === "style" ? Ff(e, r, n) : ji(t) ? Wi(t) || Uf(e, t, r, n, o) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : Xf(e, t, n, a)) ? (_s(e, t, n), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && bs(e, t, n, a, o, t !== "value")) : /* #11081 force set props for possible async custom element */ e._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Yf(e, t) || // @ts-expect-error _def is private
  e._def.__asyncLoader && (/[A-Z]/.test(t) || !rt(n))) ? _s(e, ft(t), n, o, t) : (t === "true-value" ? e._trueValue = n : t === "false-value" && (e._falseValue = n), bs(e, t, n, a));
};
function Xf(e, t, r, n) {
  if (n)
    return !!(t === "innerHTML" || t === "textContent" || t in e && Ms(t) && Te(r));
  if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA")
    return !1;
  if (t === "width" || t === "height") {
    const i = e.tagName;
    if (i === "IMG" || i === "VIDEO" || i === "CANVAS" || i === "SOURCE")
      return !1;
  }
  return Ms(t) && rt(r) ? !1 : t in e;
}
function Yf(e, t) {
  const r = (
    // @ts-expect-error _def is private
    e._def.props
  );
  if (!r)
    return !1;
  const n = ft(t);
  return Array.isArray(r) ? r.some((i) => ft(i) === n) : Object.keys(r).some((i) => ft(i) === n);
}
const Zf = ["ctrl", "shift", "alt", "meta"], Qf = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, t) => Zf.some((r) => e[`${r}Key`] && !t.includes(r))
}, Hi = (e, t) => {
  if (!e) return e;
  const r = e._withMods || (e._withMods = {}), n = t.join(".");
  return r[n] || (r[n] = ((i, ...o) => {
    for (let a = 0; a < t.length; a++) {
      const s = Qf[t[a]];
      if (s && s(i, t)) return;
    }
    return e(i, ...o);
  }));
}, Jf = {
  esc: "escape",
  space: " ",
  up: "arrow-up",
  left: "arrow-left",
  right: "arrow-right",
  down: "arrow-down",
  delete: "backspace"
}, eh = (e, t) => {
  const r = e._withKeys || (e._withKeys = {}), n = t.join(".");
  return r[n] || (r[n] = ((i) => {
    if (!("key" in i))
      return;
    const o = Rr(i.key);
    if (t.some(
      (a) => a === o || Jf[a] === o
    ))
      return e(i);
  }));
}, th = /* @__PURE__ */ pt({ patchProp: Kf }, Of);
let As;
function rh() {
  return As || (As = ff(th));
}
const nh = ((...e) => {
  const t = rh().createApp(...e), { mount: r } = t;
  return t.mount = (n) => {
    const i = oh(n);
    if (!i) return;
    const o = t._component;
    !Te(o) && !o.render && !o.template && (o.template = i.innerHTML), i.nodeType === 1 && (i.textContent = "");
    const a = r(i, !1, ih(i));
    return i instanceof Element && (i.removeAttribute("v-cloak"), i.setAttribute("data-v-app", "")), a;
  }, t;
});
function ih(e) {
  if (e instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && e instanceof MathMLElement)
    return "mathml";
}
function oh(e) {
  return rt(e) ? document.querySelector(e) : e;
}
const ah = {
  equation: ["M5 7l5 5m0-5-5 5", "M14 7h5", "M16.5 4.5v5", "M14 17h6"],
  bold: ["M8 5h5a3 3 0 0 1 0 6H8z", "M8 11h6a3 3 0 0 1 0 6H8z"],
  bookmark: ["M7 4h10v16l-5-3-5 3z"],
  italic: ["M10 5h7", "M7 19h7", "M14 5 10 19"],
  keyboard: ["M4 7h16v11H4z", "M7 10h.01", "M10 10h.01", "M13 10h.01", "M16 10h.01", "M7 14h10"],
  strikethrough: ["M5 12h14", "M8 7c0-2 2-3 5-3 3 0 5 1 5 3", "M9 17c1 2 3 3 5 3 3 0 5-1 5-3"],
  underline: ["M7 4v6a5 5 0 0 0 10 0V4", "M5 20h14"],
  accessibility: ["M12 4a2 2 0 1 0 0.01 0", "M5 9h14", "M12 9v11", "M8 20l4-7 4 7"],
  anchor: ["M12 3v13", "M8 7h8", "M5 13a7 7 0 0 0 14 0", "M12 20l-3-3", "M12 20l3-3"],
  "align-center": ["M12 5v14", "M7 8h10", "M9 16h6"],
  "align-left": ["M6 5v14", "M9 8h9", "M9 16h6"],
  "align-middle": ["M5 12h14", "M8 7v10", "M16 9v6"],
  "align-right": ["M18 5v14", "M6 8h9", "M9 16h6"],
  "align-top": ["M5 6h14", "M8 9v9", "M16 9v6"],
  "align-bottom": ["M5 18h14", "M8 6v9", "M16 9v6"],
  "align-justify": ["M5 7h14", "M5 11h14", "M5 15h14", "M5 19h14"],
  "text-align-top": ["M5 4h14v16H5z", "M8 7h8", "M8 10h6"],
  "text-align-middle": ["M5 4h14v16H5z", "M8 10h8", "M8 13h6"],
  "text-align-bottom": ["M5 4h14v16H5z", "M8 14h8", "M8 17h6"],
  "text-columns-one": ["M4 4h16v16H4z", "M7 8h10", "M7 11h10", "M7 14h10", "M7 17h7"],
  "text-columns-two": [
    "M4 4h16v16H4z",
    "M7 8h3",
    "M7 11h3",
    "M7 14h3",
    "M7 17h3",
    "M14 8h3",
    "M14 11h3",
    "M14 14h3",
    "M14 17h3"
  ],
  "text-columns-three": [
    "M4 4h16v16H4z",
    "M6 8h2",
    "M6 11h2",
    "M6 14h2",
    "M11 8h2",
    "M11 11h2",
    "M11 14h2",
    "M16 8h2",
    "M16 11h2",
    "M16 14h2"
  ],
  "text-margin-normal": ["M4 4h16v16H4z", "M8 8h8", "M8 12h8", "M8 16h6"],
  "text-margin-narrow": ["M4 4h16v16H4z", "M6 7h12", "M6 12h12", "M6 17h9"],
  "text-margin-wide": ["M4 4h16v16H4z", "M10 9h4", "M10 12h4", "M10 15h3"],
  "text-margin-none": ["M4 4h16v16H4z", "M5 6h14", "M5 12h14", "M5 18h11"],
  "arrow-down": ["M12 5v13", "m7 13 5 5 5-5"],
  "arrow-up": ["M12 19V6", "m7 11 5-5 5 5"],
  "background-reset": ["M5 6h14v12H5z", "M8 9h8", "M8 13h5", "M18 6v5h-5", "M18 6l-6 6"],
  "bullet-list": ["M7 7h.01", "M7 12h.01", "M7 17h.01", "M10 7h9", "M10 12h9", "M10 17h9"],
  contrast: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 3v18"],
  "border-all": ["M5 5h14v14H5z", "M12 5v14", "M5 12h14"],
  "border-bottom": ["M5 19h14", "M5 15v4", "M19 15v4"],
  "border-inside": ["M5 8V5h3", "M16 5h3v3", "M19 16v3h-3", "M8 19H5v-3", "M12 5v14", "M5 12h14"],
  "border-inside-horizontal": ["M5 8V5h3", "M16 5h3v3", "M19 16v3h-3", "M8 19H5v-3", "M5 12h14"],
  "border-inside-vertical": ["M5 8V5h3", "M16 5h3v3", "M19 16v3h-3", "M8 19H5v-3", "M12 5v14"],
  "border-left": ["M5 5v14", "M5 5h4", "M5 19h4"],
  "border-none": ["M5 5h14v14H5z", "M5 5l14 14", "M19 5 5 19"],
  "border-outside": ["M5 5h14v14H5z"],
  "border-right": ["M19 5v14", "M15 5h4", "M15 19h4"],
  "border-top": ["M5 5h14", "M5 5v4", "M19 5v4"],
  chart: ["M5 19h14", "M7 16v-5", "M12 16V7", "M17 16v-8"],
  "chart-area": ["M5 19h14", "M6 16l4-5 4 3 4-7v12H6z", "M6 16l4-5 4 3 4-7"],
  "chart-bar": ["M5 19h14", "M7 16v-4", "M12 16V8", "M17 16v-6"],
  "chart-doughnut": ["M12 19a7 7 0 1 0-7-7", "M12 15a3 3 0 1 0-3-3", "M5 12h4"],
  "chart-line": [
    "M5 19h14",
    "M7 15l4-4 3 2 4-6",
    "M7 15h.01",
    "M11 11h.01",
    "M14 13h.01",
    "M18 7h.01"
  ],
  "chart-pie": ["M12 12V5a7 7 0 1 1-6.1 10.4z", "M12 5a7 7 0 0 1 7 7h-7z"],
  check: ["m5 12 4 4 10-9"],
  "clear-formatting": ["M5 18 10 6h2l3.5 8", "M7 14h7", "M13 18.5l4.5-4.5 2.5 2.5-4.5 4.5H13z"],
  "chevron-down": ["m7 10 5 5 5-5"],
  "chevron-left": ["m14 7-5 5 5 5"],
  "chevron-right": ["m10 7 5 5-5 5"],
  close: ["M6 6 18 18", "M18 6 6 18"],
  "comment-add": ["M4 5h16v11H8l-4 3z", "M12 8v5", "M9.5 10.5h5"],
  "comment-delete": ["M4 5h16v11H8l-4 3z", "M9.5 8.5l5 5", "M14.5 8.5l-5 5"],
  "comment-next": ["M4 5h16v11H8l-4 3z", "m10 8.5 4 3-4 3"],
  "comment-previous": ["M4 5h16v11H8l-4 3z", "m14 8.5-4 3 4 3"],
  comments: ["M5 6h14v10H8l-3 3z", "M8 10h8", "M8 13h5"],
  "content-control": [
    "M7 4H4v16h3",
    "M17 4h3v16h-3",
    "M11.25 10.25c-.45-.4-1-.6-1.55-.6-1.35 0-2.2.95-2.2 2.35s.85 2.35 2.2 2.35c.55 0 1.1-.2 1.55-.6",
    "M17 10.25c-.45-.4-1-.6-1.55-.6-1.35 0-2.2.95-2.2 2.35s.85 2.35 2.2 2.35c.55 0 1.1-.2 1.55-.6"
  ],
  color: ["M5 19h14", "M8 16l4-10 4 10", "M9.5 12h5"],
  "bring-forward": ["M5 9h9v9H5z", "M10 5h9v9h-5", "M16.5 16.5v-5", "m14 14 2.5-2.5L19 14"],
  "bring-front": ["M8 8h9v9H8z", "M5 5h9", "M5 5v9", "M11 11h3v3h-3z"],
  "column-add": ["M3 5h12v14H3z", "M7 5v14", "M11 5v14", "M19 8v8", "M16 12h6"],
  "column-delete": ["M3 5h12v14H3z", "M7 5v14", "M11 5v14", "M16 12h6"],
  copy: ["M8 8h10v11H8z", "M5 16V5h10"],
  "crop-fill": ["M5 7h14v10H5z", "m7 15 3-4 3 3 2-2 2 3", "M5 10V7h3", "M19 14v3h-3"],
  "crop-fit": ["M5 7h14v10H5z", "M8 12h8", "m8 9-3 3 3 3", "m16 9 3 3-3 3"],
  "crop-reset": ["M6 5v12h12", "M4 7h12v12", "M17 5h3v3", "M20 5l-4 4"],
  cut: ["m5 5 14 14", "m19 5-7 7", "M7 17h.01", "M7 7h.01"],
  "data-check": ["M5 6h14v12H5z", "M8 10h8", "M8 14h4", "m13 14 2 2 4-5"],
  "data-edit": ["M4 5h13v12H4z", "M4 9h13", "M8 5v12", "m20 12-5 5-3 1 1-3 5-5z"],
  "double-underline": ["M6.5 4v6.5a5.5 5.5 0 0 0 11 0V4", "M5 18h14", "M5 21h14"],
  duplicate: ["M8 8h11v10H8z", "M5 15V5h11"],
  "distribute-horizontal": ["M5 5v14", "M19 5v14", "M9 9h2v6H9z", "M13 9h2v6h-2z"],
  "distribute-vertical": ["M5 5h14", "M5 19h14", "M9 9h6v2H9z", "M9 13h6v2H9z"],
  dropdown: ["M5 7h14", "M8 12h8", "M10 17h4"],
  editor: ["M5 6h14v12H5z", "m9 15 6-6", "m13 9 2 2"],
  effects: [
    "m12 4 1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5z",
    "m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"
  ],
  endnote: ["M6 5h12v14H6z", "M9 9h6", "M9 13h6", "M9 17h3", "M3 16h2v4"],
  "export-file": ["M6 4h9l3 3v13H6z", "M15 4v4h3", "M12 17v-6", "m9 14 3 3 3-3"],
  // File-format family: the export-file sheet silhouette with one bold mark in
  // the lower half. Marks keep >=2.5 grid units between strokes — the ribbon
  // renders icons at 16px where the 24-grid stroke is only ~1px, so anything
  // denser (multi-letter marks, tight bowls) fuses into a solid blob.
  "file-csv": [
    "M6 4h9l3 3v13H6z",
    "M15 4v4h3",
    "M8.6 12.4h6.8v4.4H8.6z",
    "M8.6 14.6h6.8",
    "M12 12.4v4.4"
  ],
  "file-excel": ["M6 4h9l3 3v13H6z", "M15 4v4h3", "m9.6 12.4 4.8 4.6", "m14.4 12.4-4.8 4.6"],
  "file-html": [
    "M6 4h9l3 3v13H6z",
    "M15 4v4h3",
    "m10.1 12.2-2.3 2.3 2.3 2.3",
    "m13.9 12.2 2.3 2.3-2.3 2.3"
  ],
  "file-image": [
    "M6 4h9l3 3v13H6z",
    "M15 4v4h3",
    "M9.6 13h.01",
    "m8 17.2 2.7-3.4 2 2.4 1.4-1.7 1.9 2.7"
  ],
  "file-markdown": [
    "M6 4h9l3 3v13H6z",
    "M15 4v4h3",
    "M8.8 13.6h6.4",
    "M8.8 16h6.4",
    "m11.2 11.8-.6 6",
    "m13.4 11.8-.6 6"
  ],
  "file-pdf": ["M6 4h9l3 3v13H6z", "M15 4v4h3", "M10.2 17.2v-5.4h2.2a1.7 1.7 0 0 1 0 3.4h-2.2"],
  "file-powerpoint": [
    "M6 4h9l3 3v13H6z",
    "M15 4v4h3",
    "M8.6 12.6h6.8v4.2H8.6z",
    "M10.4 14.7h3.2"
  ],
  "file-text": ["M6 4h9l3 3v13H6z", "M15 4v4h3", "M9 12.2h6", "M9 14.6h6", "M9 17h3.5"],
  "file-word": ["M6 4h9l3 3v13H6z", "M15 4v4h3", "m8.6 12.2 1.5 5 1.9-3.8 1.9 3.8 1.5-5"],
  "format-painter": ["M5 5h10v5H5z", "M8 10v3h7", "M15 11h3v4h-3z", "M16.5 15v4"],
  font: ["M5 19h14", "M8 16l4-11 4 11", "M9.5 12h5"],
  footnote: ["M6 5h12v14H6z", "M9 9h6", "M9 13h6", "M9 17h3", "M3 4h2v4"],
  group: ["M7 7h6v6H7z", "M11 11h6v6h-6z"],
  history: ["M5 7V3", "M5 7h4", "M5.5 7.5A8 8 0 1 1 4 14", "M12 8v4l3 2"],
  eye: [
    "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6",
    "M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5"
  ],
  "eye-off": [
    "M3 3l18 18",
    "M10.6 10.6a2.5 2.5 0 0 0 2.8 2.8",
    "M7.4 7.8C4.4 9.4 2.5 12 2.5 12s3.5 6 9.5 6c1.6 0 3-.4 4.2-1",
    "M14.2 6.4A9.7 9.7 0 0 0 12 6c-6 0-9.5 6-9.5 6s.8 1.4 2.2 2.7"
  ],
  layout: ["M4 5h16v14H4z", "M4 10h16", "M11 10v9"],
  "layout-blank": ["M4.5 6h15v12h-15z"],
  "layout-comparison": [
    "M4.5 5.5h15v13h-15z",
    "M7 9h10",
    "M12 11v6",
    "M8 12h3",
    "M13 12h3",
    "M8 15h3",
    "M13 15h3"
  ],
  "layout-section": ["M4.5 5.5h15v13h-15z", "M7 11h10", "M7 14h7"],
  "layout-title": ["M4.5 5.5h15v13h-15z", "M8 10h8", "M9 14h6"],
  "layout-title-content": ["M4.5 5.5h15v13h-15z", "M7 9h10", "M7 13h10", "M7 16h7"],
  "layout-two-content": [
    "M4.5 5.5h15v13h-15z",
    "M7 9h10",
    "M8 12h3",
    "M13 12h3",
    "M8 15h3",
    "M13 15h3"
  ],
  "slide-size": ["M4 6h16v12H4z", "M8 3v3", "M16 3v3", "M8 18v3", "M16 18v3"],
  "slide-size-custom": ["M4 6h16v12H4z", "M8 14l8-8", "M12 6h4v4", "M8 14h4v4"],
  "slide-size-standard": ["M6 5h12v14H6z", "M9 8h6", "M9 16h6"],
  "slide-size-wide": ["M3 7h18v10H3z", "M6 10h12", "M6 14h8"],
  line: ["M5 18 19 6"],
  "connector-elbow": ["M5 6v6h14v6", "M3 6h4", "M17 18h4"],
  "connector-curved": ["M4 6c8 0 8 12 16 12", "M2 6h4", "M18 18h4"],
  "line-arrow-diamond": ["M4 12h12", "M16 8l4 4-4 4-4-4z"],
  "line-arrow-none": ["M4 12h16"],
  "line-arrow-open": ["M4 12h14", "m14 8 4 4-4 4"],
  "line-arrow-oval": ["M4 12h11", "M15 12a3 2.6 0 1 0 6 0 3 2.6 0 1 0-6 0"],
  "line-arrow-stealth": ["M4 12h13", "M17 7l4 5-4 5 1-5z"],
  "line-arrow-triangle": ["M4 12h13", "M17 7l5 5-5 5z"],
  "line-dash": ["M4 12h5", "M12 12h8"],
  "line-dash-dot": ["M4 12h5", "M12 12h.01", "M15 12h5"],
  "line-dot": ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  "line-spacing": ["M7 6h12", "M7 12h12", "M7 18h12", "M4 7v10", "m2 7-2 2-2-2", "m2 17-2-2-2 2"],
  "line-style": ["M4 7h16", "M4 12h8", "M15 12h5", "M4 17h4", "M11 17h4", "M18 17h2"],
  "line-solid": ["M4 12h16"],
  "line-weight": ["M4 7h16", "M4 12h16", "M4 17h16"],
  "link-action": [
    "M9 7H8a4 4 0 0 0 0 8h2",
    "M14 7h2a4 4 0 0 1 0 8h-2",
    "M9 12h6",
    "M16 9l3 3-3 3"
  ],
  image: ["M5 6h14v12H5z", "m7 16 3-4 3 3 2-2 2 3", "M15.5 9.5h.01"],
  "image-replace": [
    "M4 6h11v10H4z",
    "m6 14 3-4 2.5 3 1.5-1.5 2 2.5",
    "M17 7h3v3",
    "M20 7l-4 4",
    "M20 16h-3v-3",
    "M17 16l4-4"
  ],
  "indent-decrease": ["M10 6h9", "M10 10h9", "M10 14h9", "M10 18h9", "M5 12h5", "m7 9-3 3 3 3"],
  "indent-increase": ["M10 6h9", "M10 10h9", "M10 14h9", "M10 18h9", "M5 12h5", "m8 9 3 3-3 3"],
  "list-level-promote": ["M10 6h9", "M10 11h7", "M10 16h9", "M5 11h5", "m7 8-3 3 3 3"],
  "list-level-demote": ["M10 6h9", "M10 11h7", "M10 16h9", "M5 11h5", "m8 8 3 3-3 3"],
  "auto-align-horizontal": [
    "M4 5v14",
    "M20 5v14",
    "M8 8h8",
    "M8 12h8",
    "M8 16h8",
    "m6-10 2 2-2 2",
    "m-4 4-2 2 2 2"
  ],
  "auto-align-vertical": [
    "M5 4h14",
    "M5 20h14",
    "M8 8v8",
    "M12 8v8",
    "M16 8v8",
    "m-10 6 2 2 2-2",
    "m4-4 2-2 2 2"
  ],
  "connection-points": ["M7 7h10v10H7z", "M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4"],
  "group-add": ["M4 4h8v8H4z", "M12 12h8v8h-8z", "M17 3v6", "M14 6h6"],
  "group-remove": ["M4 4h8v8H4z", "M12 12h8v8h-8z", "M14 6h6"],
  guides: ["M4 7h16", "M7 4v16", "M12 10v10", "M10 12h10"],
  "spacing-horizontal": [
    "M3 6h4v12H3z",
    "M17 6h4v12h-4z",
    "M9 12h6",
    "m2-2-2 2 2 2",
    "m2-4 2 2-2 2"
  ],
  "spacing-vertical": [
    "M6 3h12v4H6z",
    "M6 17h12v4H6z",
    "M12 9v6",
    "m-2 2 2-2 2 2",
    "m-4 2 2 2 2-2"
  ],
  "page-break-row-add": ["M4 5h16v5H4z", "M4 14h16v5H4z", "M12 10v4", "m-2 2h4"],
  "page-break-row-remove": ["M4 5h16v5H4z", "M4 14h16v5H4z", "M10 12h4"],
  "page-break-column-add": ["M5 4h5v16H5z", "M14 4h5v16h-5z", "M10 12h4", "m-2-2v4"],
  "page-break-column-remove": ["M5 4h5v16H5z", "M14 4h5v16h-5z", "M10 12h4"],
  "print-area": ["M5 3h11l3 3v15H5z", "M16 3v4h4", "M8 10h8v7H8z", "M8 13h8", "M12 10v7"],
  "row-hide": ["M4 5h16v14H4z", "M4 10h16", "M4 14h16", "m7-6 6 6"],
  "row-show": [
    "M4 5h16v14H4z",
    "M4 10h16",
    "M4 14h16",
    "M9 12s1.2-2 3-2 3 2 3 2-1.2 2-3 2-3-2-3-2Z"
  ],
  "column-hide": ["M5 4h14v16H5z", "M10 4v16", "M14 4v16", "m-6 7 6 6"],
  "column-show": [
    "M5 4h14v16H5z",
    "M10 4v16",
    "M14 4v16",
    "M12 9s2 1.2 2 3-2 3-2 3-2-1.2-2-3 2-3 2-3Z"
  ],
  "link-off": ["M9 7H8a4 4 0 0 0 0 8h2", "M14 7h2a4 4 0 0 1 1.5 7.7", "M8 12h4", "M3 3l18 18"],
  lock: ["M7 10V8a5 5 0 0 1 10 0v2", "M6 10h12v10H6z", "M12 14v2"],
  info: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "M12 11v5", "M12 8h.01"],
  inspect: ["M11 16a5 5 0 1 0 0-10 5 5 0 0 0 0 10", "m15 15 4 4", "M11 8v6", "M8 11h6"],
  json: ["M8 7H6v10h2", "M16 7h2v10h-2", "M11 9 9.5 15", "M13 9h.01", "M14 15h.01"],
  "match-height": ["M8 6h8v12H8z", "M12 4v4", "M10 6l2-2 2 2", "M12 20v-4", "M10 18l2 2 2-2"],
  "match-size": ["M7 7h10v10H7z", "M4 7h3V4", "M17 4v3h3", "M20 17h-3v3", "M7 20v-3H4"],
  "match-width": ["M6 8h12v8H6z", "M4 12h5", "M6 10l-2 2 2 2", "M20 12h-5", "M18 10l2 2-2 2"],
  "merge-cells": [
    "M4 5h16v14H4z",
    "M4 10h16",
    "M4 14h16",
    "M9 5v5",
    "M15 5v5",
    "M9 14v5",
    "M15 14v5"
  ],
  "new-file": ["M6 3h8l4 4v14H6z", "M14 3v5h4", "M12 11v6", "M9 14h6"],
  "new-slide": ["M4 6h12v10H4z", "M18 11h4", "M20 9v4"],
  metadata: ["M6 5h12v14H6z", "M9 9h6", "M9 13h6", "M9 17h3"],
  minus: ["M5 12h14"],
  move: [
    "M12 2v20",
    "M2 12h20",
    "M9 5l3-3 3 3",
    "M9 19l3 3 3-3",
    "M5 9l-3 3 3 3",
    "M19 9l3 3-3 3"
  ],
  notes: ["M6 5h12v14H6z", "M9 9h6", "M9 13h6", "M9 17h4"],
  "normal-view": ["M4 5h5v14H4z", "M11 5h9v14h-9z"],
  "open-file": ["M5 6h5l2 2h7v10H5z", "M8 13h8", "m13 10 3 3-3 3"],
  "numbered-list": [
    "M4 4.5h1v4",
    "M3.5 12h2l-2 3h2",
    "M3.5 18h2l-1 1 1 1h-2",
    "M9 7h11",
    "M9 14h11",
    "M9 20h11"
  ],
  panel: ["M5 5h14v14H5z", "M14 5v14"],
  "pane-accessibility": [
    "M12 7a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 12 7",
    "M4 9.5h16",
    "M12 9.5V14",
    "m8 21 4-7 4 7"
  ],
  "pane-chart": ["M4 4v16h16", "M7 17v-4h2v4z", "M11 17V9h2v8z", "M15 17v-6h2v6z"],
  "pane-group": [
    "M4 8V4h4",
    "M16 4h4v4",
    "M20 16v4h-4",
    "M8 20H4v-4",
    "M7.5 8h5.5v5.5H7.5z",
    "M11 11h5.5v5.5H11z"
  ],
  "pane-picture": ["M4 5h16v14H4z", "m6.5 16 4-4 3.25 3 2.25-2.5 2.5 3.5", "M15.5 8.5h.01"],
  "pane-selection": ["M4 8V4h4", "M16 4h4v4", "M20 16v4h-4", "M8 20H4v-4", "M8.5 8.5h7v7h-7z"],
  "pane-shape": ["M4 5h9v9H4z", "M15.5 8a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9"],
  "pane-slide": ["M4 5h16v14H4z", "M7 8.5h10", "M7 12h7", "M7 15.5h9"],
  "pane-table": ["M4 5h16v14H4z", "M4 9.5h16", "M4 14h16", "M9.5 5v14", "M15 5v14"],
  "pane-text": ["M4.5 5h15", "M12 5v14", "M8.5 19h7"],
  palette: [
    "M12 4a8 8 0 0 0 0 16h1.5a1.5 1.5 0 0 0 0-3H13a1.5 1.5 0 0 1 0-3h1a6 6 0 0 0-2-10z",
    "M8 10h.01",
    "M10.5 7.5h.01",
    "M14 8h.01"
  ],
  paragraph: ["M14 5v14", "M18 5v14", "M14 5h-3a4 4 0 0 0 0 8h3"],
  paste: ["M8 6h8", "M9 4h6v4H9z", "M6 7h12v13H6z"],
  play: ["M8 5v14l11-7z"],
  audio: ["M4 10v4", "M8 7v10", "M12 4v16", "M16 7v10", "M20 10v4"],
  video: ["M3 6h13v12H3z", "M16 10l5-3v10l-5-3z"],
  pointer: ["M5 3l12 9-6 1.5L8 20z", "M11 13.5l4 6"],
  print: [
    "M7 8V3h10v5",
    "M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
    "M7 13h10v8H7z"
  ],
  plus: ["M12 5v14", "M5 12h14"],
  "reading-view": ["M4 6h16v12H4z", "M9 18h6"],
  reload: ["M18 9a6 6 0 1 0 1 5", "M18 5v4h-4"],
  redo: ["M7 7h7a5 5 0 1 1-4.5 7.2", "M14 7h4V3"],
  "rotate-left": ["M8 8H5V5", "M5.5 8A7 7 0 1 1 7 17"],
  "rotate-right": ["M16 8h3V5", "M18.5 8A7 7 0 1 0 17 17"],
  "flip-horizontal": ["M12 4v16", "M5 7h4v10H5z", "M19 7h-4v10h4z"],
  "flip-vertical": ["M4 12h16", "M7 5v4h10V5z", "M7 19v-4h10v4z"],
  "row-add": ["M3 5h13v14H3z", "M3 10h13", "M3 15h13", "M20 8v8", "M17 12h6"],
  "row-delete": ["M3 5h13v14H3z", "M3 10h13", "M3 15h13", "M17 12h6"],
  search: ["M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12", "m15.5 15.5 3.5 3.5"],
  "send-backward": ["M5 9h9v9H5z", "M10 5h9v9h-5", "M7.5 6.5v5", "m5 9-2.5 2.5L5 9"],
  "send-back": ["M7 7h9v9H7z", "M10 10h9v9h-9z", "M10 10h3v3h-3z"],
  save: ["M5 4h12l2 2v14H5z", "M8 4v6h8V4", "M8 15h8"],
  // Save keeps the plain disk; Save As adds a plus so "write a new copy" and
  // "export to another format" (sheet + arrow) stop sharing one glyph.
  "save-as": ["M5 4h12l2 2v14H5z", "M8 4v5h8V4", "M8 14h4", "M15.75 13.25v5", "M13.25 15.75h5"],
  "session-file": ["M7 4h8l3 3v13H7z", "M15 4v4h3", "M10 12h5", "M10 16h4"],
  shape: [
    "M5.5 7h7v7h-7z",
    "M16 7.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7",
    "M12 19l3.5-5.5L19 19z"
  ],
  "shape-fill": ["M7 5h10v8H7z", "M7 13l3 4h4l3-4", "M6 19h12"],
  "shape-gallery": [
    "M4.5 6.5h6.5v5.5H4.5z",
    "M16.4 6.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6",
    "M8 19l3.7-5.4 3.8 5.4z"
  ],
  "shape-outline": ["M5 7h14v10H5z", "M8 20h8", "M9 20l2-3", "M15 20l-2-3"],
  "shape-cloud": [
    "M6.8 17.4h9.3a3.1 3.1 0 0 0 .5-6.2A4.7 4.7 0 0 0 8.2 9.5a3.9 3.9 0 0 0-1.4 7.9z",
    "M8.5 17.4h7.2"
  ],
  "shape-chevron": ["M6.2 5.2h6.9l4.9 6.8-4.9 6.8H6.2l5-6.8z", "M10.5 8.8 13 12l-2.5 3.2"],
  "shape-decision": ["M12 3.8 20.2 12 12 20.2 3.8 12z", "M8 12h8", "M12 8v8"],
  "shape-diamond": ["M12 3.8 20.2 12 12 20.2 3.8 12z", "M12 7.2 16.8 12 12 16.8 7.2 12z"],
  "shape-document": ["M5 5h14v11.5c-2.2-1.8-4.5 1.8-7 0s-4.8 1.8-7 0z", "M8 9h8", "M8 12h6"],
  "shape-ellipse": ["M4.3 12a7.7 5.2 0 1 0 15.4 0 7.7 5.2 0 1 0-15.4 0", "M7.4 12h9.2"],
  "shape-heart": [
    "M12 20s-7.2-4.5-7.2-10.2a4 4 0 0 1 7.2-2.3 4 4 0 0 1 7.2 2.3C19.2 15.5 12 20 12 20z",
    "M8.6 9.8a1.8 1.8 0 0 1 3.4-.6"
  ],
  "shape-hexagon": ["M8 4.8h8l4.2 7.2L16 19.2H8L3.8 12z", "M8.5 8h7"],
  "shape-left-arrow": ["M20 8.2h-8.6V5L4 12l7.4 7v-3.2H20z", "M10.4 9.2 7.5 12l2.9 2.8"],
  "shape-parallelogram": ["M8 5h12l-4 14H4z", "M9.2 8h6.4"],
  "shape-pentagon": ["M12 3.8 20.2 10l-3.1 10H6.9L3.8 10z", "M8.2 10h7.6"],
  "shape-plus": ["M9.8 4.8h4.4v5h5v4.4h-5v5H9.8v-5h-5V9.8h5z", "M12 8.2v7.6", "M8.2 12h7.6"],
  "shape-rect": ["M4.8 7h14.4v10H4.8z", "M7.4 9.4h9.2"],
  "shape-right-triangle": ["M6 4.8v14.4h13.2z", "M8.8 9.8v5.2h4.8"],
  "shape-right-arrow": ["M4 8.2h8.6V5L20 12l-7.4 7v-3.2H4z", "M13.6 9.2 16.5 12l-2.9 2.8"],
  "shape-round-rect": [
    "M7 6.6h10a3.4 3.4 0 0 1 3.4 3.4v4a3.4 3.4 0 0 1-3.4 3.4H7A3.4 3.4 0 0 1 3.6 14v-4A3.4 3.4 0 0 1 7 6.6z",
    "M7.4 9.5h9.2"
  ],
  "shape-star": [
    "M12 3.8l2.4 5 5.6.7-4.1 3.8 1.1 5.6-5-2.8-5 2.8 1.1-5.6L4 9.5l5.6-.7z",
    "M12 8.2 13.1 11l3 .3-2.2 2.1.6 3-2.5-1.5-2.5 1.5.6-3-2.2-2.1 3-.3z"
  ],
  "shape-trapezoid": ["M8 6h8l4.2 12H3.8z", "M8.4 9h7.2"],
  "shape-triangle": ["M12 4.8 20.2 19.2H3.8z", "M12 9.5v5.2"],
  "shape-up-arrow": ["M8.2 20v-8.7H5L12 4l7 7.3h-3.2V20z", "M12 8.2v7.8"],
  "shape-down-arrow": ["M8.2 4v8.7H5L12 20l7-7.3h-3.2V4z", "M12 8v7.8"],
  slide: ["M4 6h16v12H4z", "M8 10h8", "M8 14h5"],
  "slide-first": ["M5 6h14v12H5z", "M9 9v6", "m16 9-4 3 4 3"],
  "slide-last": ["M5 6h14v12H5z", "M15 9v6", "m9 9 4 3-4 3"],
  "slide-next": ["M5 6h14v12H5z", "m11 9 4 3-4 3"],
  "slide-previous": ["M5 6h14v12H5z", "m13 9-4 3 4 3"],
  "sorter-view": ["M4 5h7v5H4z", "M13 5h7v5h-7z", "M4 14h7v5H4z", "M13 14h7v5h-7z"],
  "speed-fast": ["M5 16h5", "M5 12h9", "M5 8h13", "m15 8 3 4-3 4"],
  "speed-medium": ["M5 16h7", "M5 12h10", "M5 8h10", "M17 8l3 4-3 4"],
  "speed-slow": ["M5 16h10", "M5 12h8", "M5 8h6", "M18 8l2 4-2 4"],
  "split-cells": ["M4 5h16v14H4z", "M4 10h16", "M4 14h16", "M9 5v14", "M15 5v14", "M12 10v4"],
  sparkles: [
    "M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z",
    "M18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z",
    "M6 13l.6 1.9 1.9.6-1.9.6L6 18l-.6-1.9-1.9-.6 1.9-.6z"
  ],
  subscribe: [
    "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
    "M8.5 16.5a6 6 0 0 1 0-9",
    "M5.5 19.5a10 10 0 0 1 0-15"
  ],
  table: ["M5 6h14v12H5z", "M5 10h14", "M5 14h14", "M10 6v12", "M15 6v12"],
  "table-grid": [
    "M4.5 5.5h15v13h-15z",
    "M4.5 10h15",
    "M4.5 14h15",
    "M9.5 5.5v13",
    "M14.5 5.5v13"
  ],
  "text-box": ["M5 6h14v12H5z", "M8 10h8", "M12 10v6", "M10 16h4"],
  "wrap-text": [
    "M8 11.5V16",
    "M8 13H6a1.75 1.75 0 1 0 2 1.75",
    "M11 8v8",
    "M11 12.5h2a1.75 1.75 0 0 1 0 3.5h-2",
    "M16 9h3a2 2 0 0 1 2 2v1.5a2 2 0 0 1-2 2h-4",
    "m17.5 12-2.5 2.5 2.5 2.5"
  ],
  "rich-text": ["m3.5 18 4-12 4 12", "M5 14h5", "M14 7h6", "M14 11h4.5", "M14 15h6", "M14 18h4"],
  "transition-apply-all": ["M5 6h8v6H5z", "M11 12h8v6h-8z", "m15 8 4 4-4 4"],
  "transition-bars": ["M5 6h14v12H5z", "M8 7v10", "M11 7v10", "M14 7v10", "M17 7v10"],
  "transition-circle": ["M5 6h14v12H5z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6"],
  "transition-dissolve": [
    "M5 6h14v12H5z",
    "M8 9h.01",
    "M11 8h.01",
    "M15 10h.01",
    "M10 13h.01",
    "M14 14h.01",
    "M17 13h.01"
  ],
  "transition-fade": ["M5 6h14v12H5z", "M9 6v12", "M12 6v12", "M15 6v12"],
  "transition-none": ["M5 6h14v12H5z"],
  "transition-push": ["M5 7h8v10H5z", "m16 8 3 4-3 4", "M12 12h7"],
  "transition-split": ["M5 6h14v12H5z", "M12 6v12", "m9 12 3-3 3 3", "m15 12-3-3-3 3"],
  "transition-wipe": ["M5 6h14v12H5z", "M8 6v12", "m12 8 4 4-4 4", "M8 12h8"],
  "transition-zoom": [
    "M5 6h14v12H5z",
    "M9 10h6v4H9z",
    "M8 9l-3-3",
    "M16 9l3-3",
    "M8 15l-3 3",
    "M16 15l3 3"
  ],
  subscript: [
    "M5 5l7 9",
    "M12 5l-7 9",
    "M15 13.5c.4-1 1.3-1.5 2.5-1.5 1.5 0 2.5.8 2.5 2 0 1-.7 1.8-1.7 2.5L15 20h5"
  ],
  superscript: [
    "M5 9l7 9",
    "M12 9l-7 9",
    "M15 5.5c.4-1 1.3-1.5 2.5-1.5 1.5 0 2.5.8 2.5 2 0 1-.7 1.8-1.7 2.5L15 12h5"
  ],
  trash: ["M4 7h16", "M9 7V4.5h6V7", "M6.5 7l1 13h9l1-13", "M10 11v5", "M14 11v5"],
  undo: ["M17 7h-7a5 5 0 1 0 4.5 7.2", "M10 7H6V3"],
  ungroup: ["M5 7h6v6H5z", "M13 11h6v6h-6z", "M11 10h2"],
  unlock: ["M8 10V8a4 4 0 0 1 7.4-2.1", "M6 10h12v10H6z", "M12 14v2"],
  text: ["M5 6h14", "M12 6v12", "M9 18h6"],
  "web-layout": [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    "M3 12h18",
    "M12 3c2.7 2.5 4 5.5 4 9s-1.3 6.5-4 9",
    "M12 3c-2.7 2.5-4 5.5-4 9s1.3 6.5 4 9"
  ]
};
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Es = (e) => e === "";
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const sh = (...e) => e.filter((t, r, n) => !!t && t.trim() !== "" && n.indexOf(t) === r).join(" ").trim();
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const xs = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const lh = (e) => e.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (t, r, n) => n ? n.toUpperCase() : r.toLowerCase()
);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const uh = (e) => {
  const t = lh(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var pn = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ch = /* @__PURE__ */ Symbol("lucide-icons");
function dh() {
  return Jr(ch, {});
}
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const fh = ({
  name: e,
  iconNode: t,
  "icon-node": r,
  absoluteStrokeWidth: n,
  "absolute-stroke-width": i,
  strokeWidth: o,
  "stroke-width": a,
  size: s,
  color: l,
  ...f
}, { slots: d }) => {
  const {
    size: u,
    color: h,
    strokeWidth: c = 2,
    absoluteStrokeWidth: y = !1,
    class: m = ""
  } = dh(), b = be(() => {
    const g = Es(n) || Es(i) || n === !0 || i === !0 || y === !0, _ = o || a || c || pn["stroke-width"];
    return g ? Number(_) * 24 / Number(s ?? u ?? pn.width) : _;
  });
  return ir(
    "svg",
    {
      ...pn,
      ...f,
      width: s ?? u ?? pn.width,
      height: s ?? u ?? pn.height,
      stroke: l ?? h ?? pn.stroke,
      "stroke-width": b.value,
      class: sh(
        "lucide",
        m,
        ...e ? [`lucide-${xs(uh(e))}-icon`, `lucide-${xs(e)}`] : ["lucide-icon"]
      )
    },
    [
      ...(t ?? r ?? []).map((g) => ir(...g)),
      ...d.default ? [d.default()] : []
    ]
  );
};
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const J = (e, t) => (r, { slots: n, attrs: i }) => ir(
  fh,
  {
    ...i,
    ...r,
    iconNode: t,
    name: e
  },
  n.default ? { default: n.default } : void 0
);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const hh = [
  ["circle", { cx: "16", cy: "4", r: "1", key: "1grugj" }],
  ["path", { d: "m18 19 1-7-6 1", key: "r0i19z" }],
  ["path", { d: "m5 8 3-3 5.5 3-2.36 3.5", key: "9ptxx2" }],
  ["path", { d: "M4.24 14.5a5 5 0 0 0 6.88 6", key: "10kmtu" }],
  ["path", { d: "M13.76 17.5a5 5 0 0 0-6.88-6", key: "2qq6rc" }]
], Ds = J("accessibility", hh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ph = [
  ["path", { d: "M12 2v20", key: "t6zp3m" }],
  ["path", { d: "M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4", key: "14d6g8" }],
  ["path", { d: "M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4", key: "1e2lrw" }],
  ["path", { d: "M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1", key: "1fkdwx" }],
  ["path", { d: "M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1", key: "1euafb" }]
], mh = J("align-center-vertical", ph);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const gh = [
  ["rect", { width: "16", height: "6", x: "2", y: "4", rx: "2", key: "10wcwx" }],
  ["rect", { width: "9", height: "6", x: "9", y: "14", rx: "2", key: "4p5bwg" }],
  ["path", { d: "M22 22V2", key: "12ipfv" }]
], yh = J("align-end-vertical", gh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const vh = [
  ["rect", { width: "6", height: "14", x: "3", y: "5", rx: "2", key: "j77dae" }],
  ["rect", { width: "6", height: "10", x: "15", y: "7", rx: "2", key: "bq30hj" }],
  ["path", { d: "M3 2v20", key: "1d2pfg" }],
  ["path", { d: "M21 2v20", key: "p059bm" }]
], bh = J("align-horizontal-space-between", vh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const _h = [
  ["rect", { width: "9", height: "6", x: "6", y: "14", rx: "2", key: "lpm2y7" }],
  ["rect", { width: "16", height: "6", x: "6", y: "4", rx: "2", key: "rdj6ps" }],
  ["path", { d: "M2 2v20", key: "1ivd8o" }]
], wh = J("align-start-vertical", _h);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const kh = [
  ["rect", { width: "14", height: "6", x: "5", y: "15", rx: "2", key: "1w91an" }],
  ["rect", { width: "10", height: "6", x: "7", y: "3", rx: "2", key: "17wqzy" }],
  ["path", { d: "M2 21h20", key: "1nyx9w" }],
  ["path", { d: "M2 3h20", key: "91anmk" }]
], Mh = J("align-vertical-space-between", kh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ah = [
  ["path", { d: "M12 6v16", key: "nqf5sj" }],
  ["path", { d: "m19 13 2-1a9 9 0 0 1-18 0l2 1", key: "y7qv08" }],
  ["path", { d: "M9 11h6", key: "1fldmi" }],
  ["circle", { cx: "12", cy: "4", r: "2", key: "muu5ef" }]
], Eh = J("anchor", Ah);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const xh = [
  ["path", { d: "M12 17V3", key: "1cwfxf" }],
  ["path", { d: "m6 11 6 6 6-6", key: "12ii2o" }],
  ["path", { d: "M19 21H5", key: "150jfl" }]
], Dh = J("arrow-down-to-line", xh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ch = [
  ["path", { d: "M12 5v14", key: "s699le" }],
  ["path", { d: "m19 12-7 7-7-7", key: "1idqje" }]
], Sh = J("arrow-down", Ch);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Th = [
  ["path", { d: "M3 19V5", key: "rwsyhb" }],
  ["path", { d: "m13 6-6 6 6 6", key: "1yhaz7" }],
  ["path", { d: "M7 12h14", key: "uoisry" }]
], Nh = J("arrow-left-to-line", Th);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Oh = [
  ["path", { d: "M17 12H3", key: "8awo09" }],
  ["path", { d: "m11 18 6-6-6-6", key: "8c2y43" }],
  ["path", { d: "M21 5v14", key: "nzette" }]
], Ph = J("arrow-right-to-line", Oh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ih = [
  ["path", { d: "m3 8 4-4 4 4", key: "11wl7u" }],
  ["path", { d: "M7 4v16", key: "1glfcx" }],
  ["path", { d: "M11 12h4", key: "q8tih4" }],
  ["path", { d: "M11 16h7", key: "uosisv" }],
  ["path", { d: "M11 20h10", key: "jvxblo" }]
], Lh = J("arrow-up-narrow-wide", Ih);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Rh = [
  ["path", { d: "M5 3h14", key: "7usisc" }],
  ["path", { d: "m18 13-6-6-6 6", key: "1kf1n9" }],
  ["path", { d: "M12 7v14", key: "1akyts" }]
], Bh = J("arrow-up-to-line", Rh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Fh = [
  ["path", { d: "m5 12 7-7 7 7", key: "hav0vg" }],
  ["path", { d: "M12 19V5", key: "x0mq9r" }]
], zh = J("arrow-up", Fh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const qh = [
  ["path", { d: "M2 10v3", key: "1fnikh" }],
  ["path", { d: "M6 6v11", key: "11sgs0" }],
  ["path", { d: "M10 3v18", key: "yhl04a" }],
  ["path", { d: "M14 8v7", key: "3a1oy3" }],
  ["path", { d: "M18 5v13", key: "123xd1" }],
  ["path", { d: "M22 10v3", key: "154ddg" }]
], Hh = J("audio-lines", qh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Uh = [
  ["path", { d: "M4 20h16", key: "14thso" }],
  ["path", { d: "m6 16 6-12 6 12", key: "1b4byz" }],
  ["path", { d: "M8 12h8", key: "1wcyev" }]
], Vh = J("baseline", Uh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $h = [
  ["rect", { width: "13", height: "7", x: "3", y: "3", rx: "1", key: "11xb64" }],
  ["path", { d: "m22 15-3-3 3-3", key: "26chmm" }],
  ["rect", { width: "13", height: "7", x: "3", y: "14", rx: "1", key: "k6ky7n" }]
], jh = J("between-horizontal-end", $h);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Wh = [
  ["rect", { width: "13", height: "7", x: "8", y: "3", rx: "1", key: "pkso9a" }],
  ["path", { d: "m2 9 3 3-3 3", key: "1agib5" }],
  ["rect", { width: "13", height: "7", x: "8", y: "14", rx: "1", key: "1q5fc1" }]
], Gh = J("between-horizontal-start", Wh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Kh = [
  [
    "path",
    { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8", key: "mg9rjx" }
  ]
], Xh = J("bold", Kh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Yh = [
  ["path", { d: "M12 5v16", key: "1f6ucr" }],
  ["path", { d: "M16 13h2", key: "weia3s" }],
  ["path", { d: "M16 9h2", key: "1n7gjm" }],
  [
    "path",
    {
      d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
      key: "1fyvmf"
    }
  ],
  ["path", { d: "M6 13h2", key: "1cckiz" }],
  ["path", { d: "M6 9h2", key: "1k7j9f" }]
], Zh = J("book-open-text", Yh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Qh = [
  ["path", { d: "M12 5v16", key: "1f6ucr" }],
  [
    "path",
    {
      d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
      key: "1fyvmf"
    }
  ]
], Jh = J("book-open", Qh);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ep = [
  [
    "path",
    {
      d: "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z",
      key: "oz39mx"
    }
  ]
], tp = J("bookmark", ep);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const rp = [
  [
    "path",
    { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1", key: "ezmyqa" }
  ],
  [
    "path",
    {
      d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",
      key: "e1hn23"
    }
  ]
], np = J("braces", rp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ip = [
  ["rect", { x: "8", y: "8", width: "8", height: "8", rx: "2", key: "yj20xf" }],
  ["path", { d: "M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2", key: "1ltk23" }],
  ["path", { d: "M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2", key: "1q24h9" }]
], op = J("bring-to-front", ip);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ap = [
  ["path", { d: "M16 14v2.2l1.6 1", key: "fo4ql5" }],
  ["path", { d: "M16 2v3", key: "otl347" }],
  ["path", { d: "M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338", key: "7hb8p4" }],
  ["path", { d: "M3 9h5.859", key: "numkqi" }],
  ["path", { d: "M8 2v3", key: "1ioesn" }],
  ["circle", { cx: "16", cy: "16", r: "6", key: "qoo3c4" }]
], sp = J("calendar-clock", ap);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const lp = [
  ["rect", { width: "18", height: "14", x: "3", y: "5", rx: "2", ry: "2", key: "12ruh7" }],
  ["path", { d: "M7 15h4M15 15h2M7 11h2M13 11h4", key: "1ueiar" }]
], up = J("captions", lp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const cp = [
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16", key: "c24i48" }],
  [
    "path",
    {
      d: "M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z",
      key: "q0gr47"
    }
  ]
], dp = J("chart-area", cp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const fp = [
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16", key: "c24i48" }],
  ["rect", { x: "7", y: "13", width: "9", height: "4", rx: "1", key: "1iip1u" }],
  ["rect", { x: "7", y: "5", width: "12", height: "4", rx: "1", key: "1anskk" }]
], hp = J("chart-bar-big", fp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const pp = [
  ["path", { d: "M5 21v-6", key: "1hz6c0" }],
  ["path", { d: "M12 21V9", key: "uvy0l4" }],
  ["path", { d: "M19 21V3", key: "11j9sm" }]
], Cs = J("chart-no-axes-column-increasing", pp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const mp = [
  ["path", { d: "M12 16v5", key: "zza2cw" }],
  ["path", { d: "M16 14.639V21", key: "1s85h0" }],
  ["path", { d: "M20 10.656V21", key: "q45596" }],
  [
    "path",
    { d: "m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15", key: "1fw8x9" }
  ],
  ["path", { d: "M4 18.463V21", key: "1otddq" }],
  ["path", { d: "M8 14.656V21", key: "1t2idw" }]
], gp = J("chart-no-axes-combined", mp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const yp = [
  [
    "path",
    {
      d: "M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z",
      key: "pzmjnu"
    }
  ],
  ["path", { d: "M21.21 15.89A10 10 0 1 1 8 2.83", key: "k2fpak" }]
], vp = J("chart-pie", yp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const bp = [
  ["path", { d: "M3 3v16a2 2 0 0 0 2 2h16", key: "c24i48" }],
  ["path", { d: "M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7", key: "lw07rv" }]
], _p = J("chart-spline", bp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const wp = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]], kp = J("check", wp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Mp = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]], Ap = J("chevron-down", Mp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Ep = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]], xp = J("chevron-left", Ep);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Dp = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], Cp = J("chevron-right", Dp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Sp = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }]
], Tp = J("circle-dot", Sp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Np = [
  [
    "path",
    {
      d: "M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z",
      key: "kmsa83"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }]
], Op = J("circle-play", Np);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Pp = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M8 12h8", key: "1wcyev" }],
  ["path", { d: "M12 8v8", key: "napkw2" }]
], Ip = J("circle-plus", Pp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Lp = [
  ["path", { d: "M11 14h10", key: "1w8e9d" }],
  ["path", { d: "M16 4h2a2 2 0 0 1 2 2v1.344", key: "1e62lh" }],
  ["path", { d: "m17 18 4-4-4-4", key: "z2g111" }],
  ["path", { d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113", key: "bjbb7m" }],
  ["rect", { x: "8", y: "2", width: "8", height: "4", rx: "1", key: "ublpy" }]
], Rp = J("clipboard-paste", Lp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Bp = [
  ["path", { d: "m18 16 4-4-4-4", key: "1inbqp" }],
  ["path", { d: "m6 8-4 4 4 4", key: "15zrgr" }],
  ["path", { d: "m14.5 4-5 16", key: "e7oirm" }]
], Fp = J("code-xml", Bp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const zp = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 18a6 6 0 0 0 0-12v12z", key: "j4l70d" }]
], qp = J("contrast", zp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Hp = [
  ["path", { d: "M6 2v14a2 2 0 0 0 2 2h14", key: "ron5a4" }],
  ["path", { d: "M18 22V8a2 2 0 0 0-2-2H2", key: "7s9ehn" }]
], Up = J("crop", Hp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Vp = [
  ["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3", key: "msslwz" }],
  ["path", { d: "M3 5V19A9 3 0 0 0 15 21.84", key: "14ibmq" }],
  ["path", { d: "M21 5V8", key: "1marbg" }],
  ["path", { d: "M21 12L18 17H22L19 22", key: "zafso" }],
  ["path", { d: "M3 12A9 3 0 0 0 14.59 14.87", key: "1y4wr8" }]
], $p = J("database-zap", Vp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const jp = [
  [
    "path",
    {
      d: "M20.5 10a2.5 2.5 0 0 1-2.4-3H18a2.95 2.95 0 0 1-2.6-4.4 10 10 0 1 0 6.3 7.1c-.3.2-.8.3-1.2.3",
      key: "19sr3x"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Wp = J("donut", jp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Gp = [
  ["path", { d: "M21.54 15H17a2 2 0 0 0-2 2v4.54", key: "1djwo0" }],
  [
    "path",
    {
      d: "M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17",
      key: "1tzkfa"
    }
  ],
  ["path", { d: "M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05", key: "14pb5j" }],
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }]
], Ss = J("earth", Gp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Kp = [
  [
    "path",
    {
      d: "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",
      key: "g5wo59"
    }
  ],
  ["path", { d: "m5.082 11.09 8.828 8.828", key: "1wx5vj" }]
], Xp = J("eraser", Kp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Yp = [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      key: "1nclc0"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], Zp = J("eye", Yp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Qp = [
  [
    "path",
    {
      d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
      key: "ct8e1f"
    }
  ],
  ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242", key: "151rxh" }],
  [
    "path",
    {
      d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
      key: "13bj9a"
    }
  ],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }]
], Jp = J("eye-off", Qp);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const e1 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  [
    "path",
    { d: "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1", key: "1oajmo" }
  ],
  [
    "path",
    { d: "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1", key: "mpwhp6" }
  ]
], t1 = J("file-braces", e1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const r1 = [
  [
    "path",
    {
      d: "M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6",
      key: "g5mvt7"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "m14 20 2 2 4-4", key: "15kota" }]
], n1 = J("file-check-corner", r1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const i1 = [
  [
    "path",
    {
      d: "M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35",
      key: "1wthlu"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "m5 16-3 3 3 3", key: "331omg" }],
  ["path", { d: "m9 22 3-3-3-3", key: "lsp7cz" }]
], o1 = J("file-code-corner", i1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const a1 = [
  [
    "path",
    {
      d: "M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z",
      key: "1ckgky"
    }
  ],
  ["path", { d: "M20 8v12a2 2 0 0 1-2 2h-4.182", key: "1726p0" }],
  ["path", { d: "m3.305 19.53.923-.382", key: "ao1pio" }],
  ["path", { d: "M4 10.592V4a2 2 0 0 1 2-2h8", key: "1foop0" }],
  ["path", { d: "m4.228 16.852-.924-.383", key: "1fv9zy" }],
  ["path", { d: "m5.852 15.228-.383-.923", key: "1a9hc2" }],
  ["path", { d: "m5.852 20.772-.383.924", key: "1sh9ke" }],
  ["path", { d: "m8.148 15.228.383-.923", key: "4yu6lf" }],
  ["path", { d: "m8.53 21.696-.382-.924", key: "18b0s9" }],
  ["path", { d: "m9.773 16.852.922-.383", key: "ti6xop" }],
  ["path", { d: "m9.773 19.148.922.383", key: "rws47d" }],
  ["circle", { cx: "7", cy: "18", r: "3", key: "lvkj7j" }]
], s1 = J("file-cog", a1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const l1 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M12 18v-6", key: "17g6i2" }],
  ["path", { d: "m9 15 3 3 3-3", key: "1npd3o" }]
], u1 = J("file-down", l1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const c1 = [
  [
    "path",
    {
      d: "M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1",
      key: "1q9hii"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M2 15h10", key: "jfw4w8" }],
  ["path", { d: "m9 18 3-3-3-3", key: "112psh" }]
], d1 = J("file-input", c1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const f1 = [
  [
    "path",
    {
      d: "M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3",
      key: "1432pc"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M9 17v-2a2 2 0 0 0-4 0v2", key: "168m41" }],
  ["rect", { width: "8", height: "5", x: "3", y: "17", rx: "1", key: "o8vfew" }]
], h1 = J("file-lock", f1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const p1 = [
  [
    "path",
    {
      d: "M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127",
      key: "wfxp4w"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "m5 11-3 3", key: "1dgrs4" }],
  ["path", { d: "m5 17-3-3h10", key: "1mvvaf" }]
], m1 = J("file-output", p1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const g1 = [
  [
    "path",
    {
      d: "M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z",
      key: "ukzhwg"
    }
  ],
  ["path", { d: "M14.487 7.858A1 1 0 0 1 14 7V2", key: "1klhew" }],
  [
    "path",
    {
      d: "M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516",
      key: "rxaxab"
    }
  ],
  ["path", { d: "M8 18h1", key: "13wk12" }]
], y1 = J("file-pen-line", g1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const v1 = [
  [
    "path",
    {
      d: "M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35",
      key: "17jvcc"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M14 19h6", key: "bvotb8" }],
  ["path", { d: "M17 16v6", key: "18yu1i" }]
], b1 = J("file-plus-corner", v1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const _1 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M8 13h2", key: "yr2amv" }],
  ["path", { d: "M14 13h2", key: "un5t4a" }],
  ["path", { d: "M8 17h2", key: "2yhykz" }],
  ["path", { d: "M14 17h2", key: "10kma7" }]
], w1 = J("file-spreadsheet", _1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const k1 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
], M1 = J("file-text", k1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const A1 = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
], E1 = J("folder-open", A1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const x1 = [
  [
    "path",
    {
      d: "M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473",
      key: "ol2ft2"
    }
  ],
  ["path", { d: "m16.5 3.5 5 5", key: "15e6fa" }],
  ["path", { d: "m21.5 3.5-5 5", key: "m0lwru" }]
], D1 = J("funnel-x", x1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const C1 = [
  ["path", { d: "M2 7v10", key: "a2pl2d" }],
  ["path", { d: "M6 5v14", key: "1kq3d7" }],
  ["rect", { width: "12", height: "18", x: "10", y: "3", rx: "2", key: "13i7bc" }]
], S1 = J("gallery-horizontal-end", C1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const T1 = [
  ["path", { d: "M15 6a9 9 0 0 0-9 9V3", key: "1cii5b" }],
  ["circle", { cx: "18", cy: "6", r: "3", key: "1h7g24" }],
  ["circle", { cx: "6", cy: "18", r: "3", key: "fqmcym" }]
], N1 = J("git-branch", T1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const O1 = [
  ["circle", { cx: "5", cy: "6", r: "3", key: "1qnov2" }],
  ["path", { d: "M12 6h5a2 2 0 0 1 2 2v7", key: "1yj91y" }],
  ["path", { d: "m15 9-3-3 3-3", key: "1lwv8l" }],
  ["circle", { cx: "19", cy: "18", r: "3", key: "1qljk2" }],
  ["path", { d: "M12 18H7a2 2 0 0 1-2-2V9", key: "16sdep" }],
  ["path", { d: "m9 15 3 3-3 3", key: "1m3kbl" }]
], P1 = J("git-compare-arrows", O1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const I1 = [
  ["circle", { cx: "12", cy: "18", r: "3", key: "1mpf1b" }],
  ["circle", { cx: "6", cy: "6", r: "3", key: "1lh9wr" }],
  ["circle", { cx: "18", cy: "6", r: "3", key: "1h7g24" }],
  ["path", { d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9", key: "1uq4wg" }],
  ["path", { d: "M12 12v3", key: "158kv8" }]
], L1 = J("git-fork", I1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const R1 = [
  ["path", { d: "M3 7V5c0-1.1.9-2 2-2h2", key: "adw53z" }],
  ["path", { d: "M17 3h2c1.1 0 2 .9 2 2v2", key: "an4l38" }],
  ["path", { d: "M21 17v2c0 1.1-.9 2-2 2h-2", key: "144t0e" }],
  ["path", { d: "M7 21H5c-1.1 0-2-.9-2-2v-2", key: "rtnfgi" }],
  ["rect", { width: "7", height: "5", x: "7", y: "7", rx: "1", key: "1eyiv7" }],
  ["rect", { width: "7", height: "5", x: "10", y: "12", rx: "1", key: "1qlmkx" }]
], Ts = J("group", R1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const B1 = [
  ["path", { d: "M6 12h12", key: "8npq4p" }],
  ["path", { d: "M6 20V4", key: "1w1bmo" }],
  ["path", { d: "M18 20V4", key: "o2hl4u" }]
], F1 = J("heading", B1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const z1 = [
  ["path", { d: "M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7", key: "m87ecr" }],
  ["line", { x1: "16", x2: "22", y1: "5", y2: "5", key: "ez7e4s" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
], q1 = J("image-minus", z1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const H1 = [
  ["path", { d: "M16 5h6", key: "1vod17" }],
  ["path", { d: "M19 2v6", key: "4bpg5p" }],
  ["path", { d: "M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5", key: "1ue2ih" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }]
], U1 = J("image-plus", H1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const V1 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
], Ns = J("image", V1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $1 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
], j1 = J("info", $1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const W1 = [
  ["line", { x1: "19", x2: "10", y1: "4", y2: "4", key: "15jd3p" }],
  ["line", { x1: "14", x2: "5", y1: "20", y2: "20", key: "bu0au3" }],
  ["line", { x1: "15", x2: "9", y1: "4", y2: "20", key: "uljnxc" }]
], G1 = J("italic", W1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const K1 = [
  ["path", { d: "M10 8h.01", key: "1r9ogq" }],
  ["path", { d: "M12 12h.01", key: "1mp3jc" }],
  ["path", { d: "M14 8h.01", key: "1primd" }],
  ["path", { d: "M16 12h.01", key: "1l6xoz" }],
  ["path", { d: "M18 8h.01", key: "emo2bl" }],
  ["path", { d: "M6 8h.01", key: "x9i8wu" }],
  ["path", { d: "M7 16h10", key: "wp8him" }],
  ["path", { d: "M8 12h.01", key: "czm47f" }],
  ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2", key: "18n3k1" }]
], X1 = J("keyboard", K1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Y1 = [
  ["path", { d: "m5 8 6 6", key: "1wu5hv" }],
  ["path", { d: "m4 14 6-6 2-3", key: "1k1g8d" }],
  ["path", { d: "M2 5h12", key: "or177f" }],
  ["path", { d: "M7 2h1", key: "1t2jsx" }],
  ["path", { d: "m22 22-5-10-5 10", key: "don7ne" }],
  ["path", { d: "M14 18h6", key: "1m8k6r" }]
], Z1 = J("languages", Y1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Q1 = [
  ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1", key: "1g98yp" }],
  ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1", key: "6d4xhi" }],
  ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1", key: "nxv5o0" }],
  ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1", key: "1bb6yr" }]
], J1 = J("layout-grid", Q1);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const e2 = [
  ["rect", { width: "18", height: "7", x: "3", y: "3", rx: "1", key: "f1a2em" }],
  ["rect", { width: "9", height: "7", x: "3", y: "14", rx: "1", key: "jqznyg" }],
  ["rect", { width: "5", height: "7", x: "16", y: "14", rx: "1", key: "q5h2i8" }]
], t2 = J("layout-template", e2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const r2 = [
  ["path", { d: "M9 17H7A5 5 0 0 1 7 7h2", key: "8i5ue5" }],
  ["path", { d: "M15 7h2a5 5 0 1 1 0 10h-2", key: "1b9ql8" }],
  ["line", { x1: "8", x2: "16", y1: "12", y2: "12", key: "1jonct" }]
], Os = J("link-2", r2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const n2 = [
  ["path", { d: "M13 5h8", key: "a7qcls" }],
  ["path", { d: "M13 12h8", key: "h98zly" }],
  ["path", { d: "M13 19h8", key: "c3s6r1" }],
  ["path", { d: "m3 17 2 2 4-4", key: "1jhpwq" }],
  ["path", { d: "m3 7 2 2 4-4", key: "1obspn" }]
], i2 = J("list-checks", n2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const o2 = [
  ["path", { d: "M16 5H3", key: "m91uny" }],
  ["path", { d: "M16 12H3", key: "1a2rj7" }],
  ["path", { d: "M9 19H3", key: "s61nz1" }],
  ["path", { d: "m16 16-3 3 3 3", key: "117b85" }],
  ["path", { d: "M21 5v12a2 2 0 0 1-2 2h-6", key: "hey24a" }]
], a2 = J("list-end", o2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const s2 = [
  ["path", { d: "M2 5h20", key: "1fs1ex" }],
  ["path", { d: "M6 12h12", key: "8npq4p" }],
  ["path", { d: "M9 19h6", key: "456am0" }]
], l2 = J("list-filter", s2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const u2 = [
  ["path", { d: "M21 5H11", key: "us1j55" }],
  ["path", { d: "M21 12H11", key: "wd7e0v" }],
  ["path", { d: "M21 19H11", key: "saa85w" }],
  ["path", { d: "m7 8-4 4 4 4", key: "o5hrat" }]
], c2 = J("list-indent-decrease", u2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const d2 = [
  ["path", { d: "M21 5H11", key: "us1j55" }],
  ["path", { d: "M21 12H11", key: "wd7e0v" }],
  ["path", { d: "M21 19H11", key: "saa85w" }],
  ["path", { d: "m3 8 4 4-4 4", key: "1a3j6y" }]
], f2 = J("list-indent-increase", d2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const h2 = [
  ["path", { d: "M11 5h10", key: "1cz7ny" }],
  ["path", { d: "M11 12h10", key: "1438ji" }],
  ["path", { d: "M11 19h10", key: "11t30w" }],
  ["path", { d: "M4 4h1v5", key: "10yrso" }],
  ["path", { d: "M4 9h2", key: "r1h2o0" }],
  ["path", { d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02", key: "xtkcd5" }]
], p2 = J("list-ordered", h2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const m2 = [
  ["path", { d: "M3 5h6", key: "1ltk0q" }],
  ["path", { d: "M3 12h13", key: "ppymz1" }],
  ["path", { d: "M3 19h13", key: "bpdczq" }],
  ["path", { d: "m16 8-3-3 3-3", key: "1pjpp6" }],
  ["path", { d: "M21 19V7a2 2 0 0 0-2-2h-6", key: "4zzq67" }]
], g2 = J("list-start", m2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const y2 = [
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M13 12h8", key: "h98zly" }],
  ["path", { d: "M13 19h8", key: "c3s6r1" }],
  ["path", { d: "M3 10a2 2 0 0 0 2 2h3", key: "1npucw" }],
  ["path", { d: "M3 5v12a2 2 0 0 0 2 2h3", key: "x1gjn2" }]
], v2 = J("list-tree", y2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const b2 = [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
], _2 = J("list", b2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const w2 = [
  ["path", { d: "M16 5H3", key: "m91uny" }],
  ["path", { d: "M11 12H3", key: "51ecnj" }],
  ["path", { d: "M16 19H3", key: "zzsher" }],
  ["path", { d: "m15.5 9.5 5 5", key: "ytk86i" }],
  ["path", { d: "m20.5 9.5-5 5", key: "17o44f" }]
], k2 = J("list-x", w2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const M2 = [
  ["line", { x1: "2", x2: "5", y1: "12", y2: "12", key: "bvdh0s" }],
  ["line", { x1: "19", x2: "22", y1: "12", y2: "12", key: "1tbv5k" }],
  ["line", { x1: "12", x2: "12", y1: "2", y2: "5", key: "11lu5j" }],
  ["line", { x1: "12", x2: "12", y1: "19", y2: "22", key: "x3vr5v" }],
  ["circle", { cx: "12", cy: "12", r: "7", key: "fim9np" }],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
], A2 = J("locate-fixed", M2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const E2 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1", key: "1mm8w8" }]
], x2 = J("lock-open", E2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const D2 = [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2", key: "1w4ew1" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4", key: "fwvmzm" }]
], C2 = J("lock", D2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const S2 = [
  ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
  ["path", { d: "m21 3-7 7", key: "1l2asr" }],
  ["path", { d: "m3 21 7-7", key: "tjx5ai" }],
  ["path", { d: "M9 21H3v-6", key: "wtvkvv" }]
], T2 = J("maximize-2", S2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const N2 = [
  [
    "path",
    {
      d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      key: "18887p"
    }
  ],
  ["path", { d: "M12 8v6", key: "1ib9pf" }],
  ["path", { d: "M9 11h6", key: "1fldmi" }]
], O2 = J("message-square-plus", N2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const P2 = [
  [
    "path",
    {
      d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      key: "18887p"
    }
  ],
  ["path", { d: "m10 8-3 3 3 3", key: "fp6dz7" }],
  ["path", { d: "M17 14v-1a2 2 0 0 0-2-2H7", key: "1tkjnz" }]
], Ps = J("message-square-reply", P2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const I2 = [
  [
    "path",
    {
      d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      key: "18887p"
    }
  ],
  ["path", { d: "m14.5 8.5-5 5", key: "19tnj2" }],
  ["path", { d: "m9.5 8.5 5 5", key: "1oa8ql" }]
], L2 = J("message-square-x", I2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const R2 = [
  [
    "path",
    {
      d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      key: "18887p"
    }
  ]
], B2 = J("message-square", R2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const F2 = [["path", { d: "M5 12h14", key: "1ays0h" }]], z2 = J("minus", F2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const q2 = [
  ["path", { d: "M14 4.1 12 6", key: "ita8i4" }],
  ["path", { d: "m5.1 8-2.9-.8", key: "1go3kf" }],
  ["path", { d: "m6 12-1.9 2", key: "mnht97" }],
  ["path", { d: "M7.2 2.2 8 5.1", key: "1cfko1" }],
  [
    "path",
    {
      d: "M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z",
      key: "s0h3yz"
    }
  ]
], H2 = J("mouse-pointer-click", q2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const U2 = [
  ["path", { d: "m18 8 4 4-4 4", key: "1ak13k" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }],
  ["path", { d: "m6 8-4 4 4 4", key: "15zrgr" }]
], V2 = J("move-horizontal", U2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $2 = [
  ["path", { d: "M12 2v20", key: "t6zp3m" }],
  ["path", { d: "m8 18 4 4 4-4", key: "bh5tu3" }],
  ["path", { d: "m8 6 4-4 4 4", key: "ybng9g" }]
], j2 = J("move-vertical", $2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const W2 = [
  ["path", { d: "M12 2v20", key: "t6zp3m" }],
  ["path", { d: "m15 19-3 3-3-3", key: "11eu04" }],
  ["path", { d: "m19 9 3 3-3 3", key: "1mg7y2" }],
  ["path", { d: "M2 12h20", key: "9i4pu4" }],
  ["path", { d: "m5 9-3 3 3 3", key: "j64kie" }],
  ["path", { d: "m9 5 3-3 3 3", key: "l8vdw6" }]
], G2 = J("move", W2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const K2 = [
  ["rect", { x: "16", y: "16", width: "6", height: "6", rx: "1", key: "4q2zg0" }],
  ["rect", { x: "2", y: "16", width: "6", height: "6", rx: "1", key: "8cvhb9" }],
  ["rect", { x: "9", y: "2", width: "6", height: "6", rx: "1", key: "1egb70" }],
  ["path", { d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3", key: "1jsf9p" }],
  ["path", { d: "M12 12V8", key: "2874zd" }]
], X2 = J("network", K2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Y2 = [
  ["path", { d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4", key: "re6nr2" }],
  ["path", { d: "M2 6h4", key: "aawbzj" }],
  ["path", { d: "M2 10h4", key: "l0bgd4" }],
  ["path", { d: "M2 14h4", key: "1gsvsf" }],
  ["path", { d: "M2 18h4", key: "1bu2t1" }],
  [
    "path",
    {
      d: "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
      key: "pqwjuv"
    }
  ]
], Z2 = J("notebook-pen", Y2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Q2 = [
  ["path", { d: "M20.341 6.484A10 10 0 0 1 10.266 21.85", key: "1enhxb" }],
  ["path", { d: "M3.659 17.516A10 10 0 0 1 13.74 2.152", key: "1crzgf" }],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }],
  ["circle", { cx: "19", cy: "5", r: "2", key: "mhkx31" }],
  ["circle", { cx: "5", cy: "19", r: "2", key: "v8kfzx" }]
], J2 = J("orbit", Q2);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const e0 = [
  ["path", { d: "m14.622 17.897-10.68-2.913", key: "vj2p1u" }],
  [
    "path",
    {
      d: "M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z",
      key: "18tc5c"
    }
  ],
  [
    "path",
    {
      d: "M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15",
      key: "ytzfxy"
    }
  ]
], t0 = J("paintbrush", e0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const r0 = [
  [
    "path",
    {
      d: "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
      key: "e79jfc"
    }
  ],
  ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor", key: "1okk4w" }],
  ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor", key: "f64h9f" }],
  ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor", key: "qy21gx" }],
  ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor", key: "fotxhn" }]
], n0 = J("palette", r0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const i0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M14 15h1", key: "171nev" }],
  ["path", { d: "M19 15h2", key: "1vnucp" }],
  ["path", { d: "M3 15h2", key: "8bym0q" }],
  ["path", { d: "M9 15h1", key: "1tg3ks" }]
], o0 = J("panel-bottom-dashed", i0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const a0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M9 3v18", key: "fh3hqa" }],
  ["path", { d: "m14 9 3 3-3 3", key: "8010ee" }]
], s0 = J("panel-left-open", a0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const l0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M15 3v18", key: "14nvp0" }]
], u0 = J("panel-right", l0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const c0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["path", { d: "m9 16 3-3 3 3", key: "1idcnm" }]
], d0 = J("panel-top-close", c0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const f0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["path", { d: "m15 14-3 3-3-3", key: "g215vf" }]
], h0 = J("panel-top-open", f0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const p0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M3 9h18", key: "1pudct" }]
], m0 = J("panel-top", p0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const g0 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["path", { d: "M9 21V9", key: "1oto5p" }]
], y0 = J("panels-top-left", g0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const v0 = [
  ["path", { d: "M13 4v16", key: "8vvj80" }],
  ["path", { d: "M17 4v16", key: "7dpous" }],
  ["path", { d: "M19 4H9.5a4.5 4.5 0 0 0 0 9H13", key: "sh4n9v" }]
], b0 = J("pilcrow", v0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const _0 = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
], w0 = J("plus", _0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const k0 = [
  ["path", { d: "M2 3h20", key: "91anmk" }],
  ["path", { d: "M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3", key: "2k9sn8" }],
  ["path", { d: "m7 21 5-5 5 5", key: "bip4we" }]
], Is = J("presentation", k0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const M0 = [
  [
    "path",
    {
      d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
      key: "143wyd"
    }
  ],
  ["path", { d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6", key: "1itne7" }],
  ["rect", { x: "6", y: "14", width: "12", height: "8", rx: "1", key: "1ue0tg" }]
], A0 = J("printer", M0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const E0 = [
  [
    "path",
    {
      d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "rib7q0"
    }
  ],
  [
    "path",
    {
      d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "1ymkrd"
    }
  ]
], x0 = J("quote", E0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const D0 = [
  ["path", { d: "M19.07 4.93A10 10 0 0 0 6.99 3.34", key: "z3du51" }],
  ["path", { d: "M4 6h.01", key: "oypzma" }],
  ["path", { d: "M2.29 9.62A10 10 0 1 0 21.31 8.35", key: "qzzz0" }],
  ["path", { d: "M16.24 7.76A6 6 0 1 0 8.23 16.67", key: "1yjesh" }],
  ["path", { d: "M12 18h.01", key: "mhygvu" }],
  ["path", { d: "M17.99 11.66A6 6 0 0 1 15.77 16.67", key: "1u2y91" }],
  ["circle", { cx: "12", cy: "12", r: "2", key: "1c9p78" }],
  ["path", { d: "m13.41 10.59 5.66-5.66", key: "mhq4k0" }]
], C0 = J("radar", D0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const S0 = [
  ["path", { d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9", key: "s0qx1y" }],
  ["path", { d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5", key: "1idnkw" }],
  ["circle", { cx: "12", cy: "9", r: "2", key: "1092wv" }],
  ["path", { d: "M16.2 4.8c2 2 2.26 5.11.8 7.47", key: "ojru2q" }],
  ["path", { d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1", key: "rhi7fg" }],
  ["path", { d: "M9.5 18h5", key: "mfy3pd" }],
  ["path", { d: "m8 22 4-11 4 11", key: "25yftu" }]
], T0 = J("radio-tower", S0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const N0 = [
  ["path", { d: "m15 14 5-5-5-5", key: "12vg1m" }],
  ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13", key: "6uklza" }]
], O0 = J("redo-2", N0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const P0 = [
  ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", key: "v9h5vc" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }],
  ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", key: "3uifl3" }],
  ["path", { d: "M8 16H3v5", key: "1cv678" }]
], I0 = J("refresh-cw", P0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const L0 = [
  ["path", { d: "M4 7V4h16v3", key: "9msm58" }],
  ["path", { d: "M5 20h6", key: "1h6pxn" }],
  ["path", { d: "M13 4 8 20", key: "kqq6aj" }],
  ["path", { d: "m15 15 5 5", key: "me55sn" }],
  ["path", { d: "m20 15-5 5", key: "11p7ol" }]
], R0 = J("remove-formatting", L0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const B0 = [
  ["path", { d: "M14 4a1 1 0 0 1 1-1", key: "dhj8ez" }],
  ["path", { d: "M15 10a1 1 0 0 1-1-1", key: "1mnyi5" }],
  ["path", { d: "M21 4a1 1 0 0 0-1-1", key: "sfs9ap" }],
  ["path", { d: "M21 9a1 1 0 0 1-1 1", key: "mp6qeo" }],
  ["path", { d: "m3 7 3 3 3-3", key: "x25e72" }],
  ["path", { d: "M6 10V5a2 2 0 0 1 2-2h2", key: "15xut4" }],
  ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1", key: "1bkyp8" }]
], F0 = J("replace", B0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const z0 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ["path", { d: "M12 7v5l4 2", key: "1fdv2h" }]
], q0 = J("rotate-ccw-clock", z0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const H0 = [
  ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
], U0 = J("rotate-ccw", H0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const V0 = [
  ["path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", key: "1p45f6" }],
  ["path", { d: "M21 3v5h-5", key: "1q7to0" }]
], $0 = J("rotate-cw", V0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const j0 = [
  [
    "path",
    {
      d: "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",
      key: "icamh8"
    }
  ],
  ["path", { d: "m14.5 12.5 2-2", key: "inckbg" }],
  ["path", { d: "m11.5 9.5 2-2", key: "fmmyf7" }],
  ["path", { d: "m8.5 6.5 2-2", key: "vc6u1g" }],
  ["path", { d: "m17.5 15.5 2-2", key: "wo5hmg" }]
], W0 = J("ruler", j0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const G0 = [
  [
    "path",
    {
      d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      key: "1c8476"
    }
  ],
  ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", key: "1ydtos" }],
  ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7", key: "t51u73" }]
], K0 = J("save", G0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const X0 = [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "aa7l1z" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "4qcy5o" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "6vwrx8" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "ioqczr" }],
  ["path", { d: "M7 12h10", key: "b7w52i" }]
], Ls = J("scan-line", X0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Y0 = [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "aa7l1z" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "4qcy5o" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "6vwrx8" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "ioqczr" }],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }],
  ["path", { d: "m16 16-1.9-1.9", key: "1dq9hf" }]
], Z0 = J("scan-search", Y0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Q0 = [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "aa7l1z" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "4qcy5o" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "6vwrx8" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "ioqczr" }]
], Rs = J("scan", Q0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const J0 = [
  ["circle", { cx: "6", cy: "6", r: "3", key: "1lh9wr" }],
  ["path", { d: "M8.12 8.12 12 12", key: "1alkpv" }],
  ["path", { d: "M20 4 8.12 15.88", key: "xgtan2" }],
  ["circle", { cx: "6", cy: "18", r: "3", key: "fqmcym" }],
  ["path", { d: "M14.8 14.8 20 20", key: "ptml3r" }]
], em = J("scissors", J0);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const tm = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
], rm = J("search", tm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const nm = [
  ["rect", { x: "14", y: "14", width: "8", height: "8", rx: "2", key: "1b0bso" }],
  ["rect", { x: "2", y: "2", width: "8", height: "8", rx: "2", key: "1x09vl" }],
  ["path", { d: "M7 14v1a2 2 0 0 0 2 2h1", key: "pao6x6" }],
  ["path", { d: "M14 7h1a2 2 0 0 1 2 2v1", key: "19tdru" }]
], im = J("send-to-back", nm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const om = [
  ["path", { d: "m16 16-4 4-4-4", key: "3dv8je" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "m8 8 4-4 4 4", key: "2bscm2" }]
], am = J("separator-horizontal", om);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const sm = [
  [
    "path",
    {
      d: "M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z",
      key: "1bo67w"
    }
  ],
  ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1", key: "1bkyp8" }],
  ["circle", { cx: "17.5", cy: "17.5", r: "3.5", key: "w3z12y" }]
], Io = J("shapes", sm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const lm = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
], um = J("shield-check", lm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const cm = [
  [
    "path",
    {
      d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
      key: "wuwx1p"
    }
  ]
], dm = J("sigma", cm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const fm = [["path", { d: "M22 2 2 22", key: "y4kqgn" }]], hm = J("slash", fm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const pm = [
  [
    "path",
    {
      d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
      key: "1s2grr"
    }
  ],
  ["path", { d: "M20 2v4", key: "1rf3ol" }],
  ["path", { d: "M22 4h-4", key: "gwowj6" }],
  ["circle", { cx: "4", cy: "20", r: "2", key: "6kqj1y" }]
], mm = J("sparkles", pm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const gm = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m14 16-4-4 4-4", key: "ojs7w8" }]
], ym = J("square-chevron-left", gm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const vm = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "m10 8 4 4-4 4", key: "1wy4r4" }]
], bm = J("square-chevron-right", vm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const _m = [
  ["path", { d: "m10 9-3 3 3 3", key: "1oro0q" }],
  ["path", { d: "m14 15 3-3-3-3", key: "bz13h7" }],
  ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", key: "h1oib" }]
], wm = J("square-code", _m);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const km = [
  ["path", { d: "M5 3a2 2 0 0 0-2 2", key: "y57alp" }],
  ["path", { d: "M19 3a2 2 0 0 1 2 2", key: "18rm91" }],
  ["path", { d: "M21 19a2 2 0 0 1-2 2", key: "1j7049" }],
  ["path", { d: "M5 21a2 2 0 0 1-2-2", key: "sbafld" }],
  ["path", { d: "M9 3h1", key: "1yesri" }],
  ["path", { d: "M9 21h1", key: "15o7lz" }],
  ["path", { d: "M14 3h1", key: "1ec4yj" }],
  ["path", { d: "M14 21h1", key: "v9vybs" }],
  ["path", { d: "M3 9v1", key: "1r0deq" }],
  ["path", { d: "M21 9v1", key: "mxsmne" }],
  ["path", { d: "M3 14v1", key: "vnatye" }],
  ["path", { d: "M21 14v1", key: "169vum" }]
], Mm = J("square-dashed", km);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Am = [
  ["path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", key: "1m0v6g" }],
  [
    "path",
    {
      d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
      key: "ohrbg2"
    }
  ]
], Em = J("square-pen", Am);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const xm = [
  ["path", { d: "M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3", key: "lubmu8" }],
  ["path", { d: "M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3", key: "1ag34g" }],
  ["line", { x1: "12", x2: "12", y1: "4", y2: "20", key: "1tx1rr" }]
], Dm = J("square-split-horizontal", xm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Cm = [
  ["path", { d: "M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13", key: "i9gjdv" }],
  [
    "path",
    {
      d: "M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z",
      key: "1vzg3v"
    }
  ],
  ["path", { d: "M5 22h14", key: "ehvnwv" }]
], Sm = J("stamp", Cm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Tm = [
  ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4", key: "43sutm" }],
  ["path", { d: "M14 12a4 4 0 0 1 0 8H6", key: "nlfj13" }],
  ["line", { x1: "4", x2: "20", y1: "12", y2: "12", key: "1e0a9i" }]
], Nm = J("strikethrough", Tm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Om = [
  [
    "path",
    {
      d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
      key: "gugj83"
    }
  ]
], Lo = J("table-2", Om);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Pm = [
  ["path", { d: "M12 21v-6", key: "lihzve" }],
  ["path", { d: "M12 9V3", key: "da5inc" }],
  ["path", { d: "M3 15h18", key: "5xshup" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]
], Im = J("table-cells-merge", Pm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Lm = [
  ["path", { d: "M12 15V9", key: "8c7uyn" }],
  ["path", { d: "M3 15h18", key: "5xshup" }],
  ["path", { d: "M3 9h18", key: "1pudct" }],
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]
], Rm = J("table-cells-split", Lm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Bm = [
  ["path", { d: "M16 5H3", key: "m91uny" }],
  ["path", { d: "M16 12H3", key: "1a2rj7" }],
  ["path", { d: "M16 19H3", key: "zzsher" }],
  ["path", { d: "M21 5h.01", key: "wa75ra" }],
  ["path", { d: "M21 12h.01", key: "msek7k" }],
  ["path", { d: "M21 19h.01", key: "qvbq2j" }]
], Fm = J("table-of-contents", Bm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const zm = [
  ["path", { d: "M14 10h2", key: "1lstlu" }],
  ["path", { d: "M15 22v-8", key: "1fwwgm" }],
  ["path", { d: "M15 2v4", key: "1044rn" }],
  ["path", { d: "M2 10h2", key: "1r8dkt" }],
  ["path", { d: "M20 10h2", key: "1ug425" }],
  ["path", { d: "M3 19h18", key: "awlh7x" }],
  ["path", { d: "M3 22v-6a2 2 135 0 1 2-2h14a2 2 45 0 1 2 2v6", key: "ibqhof" }],
  ["path", { d: "M3 2v2a2 2 45 0 0 2 2h14a2 2 135 0 0 2-2V2", key: "1uenja" }],
  ["path", { d: "M8 10h2", key: "66od0" }],
  ["path", { d: "M9 22v-8", key: "fmnu31" }],
  ["path", { d: "M9 2v4", key: "j1yeou" }]
], qm = J("table-rows-split", zm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Hm = [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M17 12H7", key: "16if0g" }],
  ["path", { d: "M19 19H5", key: "vjpgq2" }]
], Um = J("text-align-center", Hm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Vm = [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M21 12H9", key: "dn1m92" }],
  ["path", { d: "M21 19H7", key: "4cu937" }]
], $m = J("text-align-end", Vm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const jm = [
  ["path", { d: "M3 5h18", key: "1u36vt" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "M3 19h18", key: "awlh7x" }]
], Wm = J("text-align-justify", jm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Gm = [
  ["path", { d: "M21 5H3", key: "1fi0y6" }],
  ["path", { d: "M15 12H3", key: "6jk70r" }],
  ["path", { d: "M17 19H3", key: "z6ezky" }]
], Km = J("text-align-start", Gm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Xm = [
  ["path", { d: "M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6", key: "1528k5" }],
  ["path", { d: "M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7", key: "13ksps" }],
  ["path", { d: "M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1", key: "1n9rhb" }],
  ["path", { d: "M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1", key: "1mj8rg" }],
  ["path", { d: "M9 6v12", key: "velyjx" }]
], Ym = J("text-cursor-input", Xm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Zm = [
  ["path", { d: "m16 16-3 3 3 3", key: "117b85" }],
  ["path", { d: "M3 12h14.5a1 1 0 0 1 0 7H13", key: "18xa6z" }],
  ["path", { d: "M3 19h6", key: "1ygdsz" }],
  ["path", { d: "M3 5h18", key: "1u36vt" }]
], Qm = J("text-wrap", Zm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Jm = [
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
], eg = J("trash", Jm);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const tg = [
  ["path", { d: "M12 4v16", key: "1654pz" }],
  ["path", { d: "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", key: "e0r10z" }],
  ["path", { d: "M9 20h6", key: "s66wpe" }]
], Ro = J("type", tg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const rg = [
  ["path", { d: "M6 4v6a6 6 0 0 0 12 0V4", key: "9kb039" }],
  ["line", { x1: "4", x2: "20", y1: "20", y2: "20", key: "nun2al" }]
], ng = J("underline", rg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ig = [
  ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
  ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11", key: "f3b9sd" }]
], og = J("undo-2", ig);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const ag = [
  ["path", { d: "M16 12h6", key: "15xry1" }],
  ["path", { d: "M8 12H2", key: "1jqql6" }],
  ["path", { d: "M12 2v2", key: "tus03m" }],
  ["path", { d: "M12 8v2", key: "1woqiv" }],
  ["path", { d: "M12 14v2", key: "8jcxud" }],
  ["path", { d: "M12 20v2", key: "1lh1kg" }],
  ["path", { d: "m19 15 3-3-3-3", key: "wjy7rq" }],
  ["path", { d: "m5 9-3 3 3 3", key: "j64kie" }]
], sg = J("unfold-horizontal", ag);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const lg = [
  ["path", { d: "M12 22v-6", key: "6o8u61" }],
  ["path", { d: "M12 8V2", key: "1wkif3" }],
  ["path", { d: "M4 12H2", key: "rhcxmi" }],
  ["path", { d: "M10 12H8", key: "s88cx1" }],
  ["path", { d: "M16 12h-2", key: "10asgb" }],
  ["path", { d: "M22 12h-2", key: "14jgyd" }],
  ["path", { d: "m15 19-3 3-3-3", key: "11eu04" }],
  ["path", { d: "m15 5-3-3-3 3", key: "itvq4r" }]
], ug = J("unfold-vertical", lg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const cg = [
  ["rect", { x: "11", y: "14", width: "10", height: "7", rx: "2", key: "nfm8rk" }],
  ["rect", { x: "3", y: "3", width: "10", height: "7", rx: "2", key: "1ljebb" }]
], dg = J("ungroup", cg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const fg = [
  ["path", { d: "M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2", key: "1re2ne" }]
], hg = J("unlink-2", fg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const pg = [
  [
    "path",
    {
      d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
      key: "ftymec"
    }
  ],
  ["rect", { x: "2", y: "6", width: "14", height: "12", rx: "2", key: "158x01" }]
], mg = J("video", pg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const gg = [
  [
    "path",
    {
      d: "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
      key: "ul74o6"
    }
  ],
  ["path", { d: "m14 7 3 3", key: "1r5n42" }],
  ["path", { d: "M5 6v4", key: "ilb8ba" }],
  ["path", { d: "M19 14v4", key: "blhpug" }],
  ["path", { d: "M10 2v2", key: "7u0qdc" }],
  ["path", { d: "M7 8H3", key: "zfb6yr" }],
  ["path", { d: "M21 16h-4", key: "1cnmox" }],
  ["path", { d: "M11 3H9", key: "1obp7u" }]
], yg = J("wand-sparkles", gg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const vg = [
  ["rect", { width: "8", height: "8", x: "3", y: "3", rx: "2", key: "by2w9f" }],
  ["path", { d: "M7 11v4a2 2 0 0 0 2 2h4", key: "xkn7yn" }],
  ["rect", { width: "8", height: "8", x: "13", y: "13", rx: "2", key: "1cgmvn" }]
], bg = J("workflow", vg);
/**
 * @license @lucide/vue v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const _g = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], wg = J("x", _g), kg = J("CopyAligned", [
  [
    "path",
    {
      d: "M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
      key: "f"
    }
  ],
  ["path", { d: "M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1", key: "b" }]
]), Mg = J("DuplicateAligned", [
  [
    "path",
    {
      d: "M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
      key: "f"
    }
  ],
  ["path", { d: "M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1", key: "b" }],
  ["path", { d: "M15 12v6", key: "v" }],
  ["path", { d: "M12 15h6", key: "h" }]
]), Ag = {
  accessibility: G(Ds),
  anchor: G(Eh),
  audio: G(Hh),
  "animation-add": G(Ip),
  "animation-start": G(H2),
  "align-bottom": G(yh),
  "align-center": G(Um),
  "align-justify": G(Wm),
  "align-left": G(Km),
  "align-middle": G(mh),
  "align-right": G($m),
  "align-top": G(wh),
  "arrow-down": G(Sh),
  "arrow-up": G(zh),
  "auto-connect": G(L1),
  "autofit-column": G(sg),
  "autofit-row": G(ug),
  "background-add": G(U1),
  "background-remove": G(q1),
  bibliography: G(Zh),
  bold: G(Xh),
  "bring-front": G(op),
  "bullet-list": G(_2),
  chart: G(Cs),
  "chart-area": G(dp),
  "chart-bar": G(hp),
  "chart-doughnut": G(Wp),
  "chart-line": G(_p),
  "chart-pie": G(vp),
  "chart-radar": G(C0),
  caption: G(up),
  check: G(kp),
  "clear-formatting": G(R0),
  "clear-contents": G(Xp),
  "chevron-down": G(Ap),
  "chevron-left": G(xp),
  "chevron-right": G(Cp),
  close: G(wg),
  "comment-add": G(O2),
  "comment-delete": G(L2),
  "comment-next": G(Ps),
  "comment-previous": G(Ps),
  comments: G(B2),
  code: G(Fp),
  "code-block": G(o1),
  "conditional-formatting": G(i2),
  "content-control-marks": G(Ls),
  "convert-range": G(qm),
  color: G(Vh),
  contrast: G(qp),
  copy: G(kg),
  "crop-fill": G(Ls),
  "crop-fit": G(Rs),
  "crop-reset": G(Up),
  cut: G(em),
  "data-check": G(n1),
  "data-edit": G(y1),
  "data-validation": G(um),
  "date-time": G(sp),
  duplicate: G(Mg),
  "distribute-horizontal": G(bh),
  "distribute-vertical": G(Mh),
  editor: G(Em),
  effects: G(yg),
  endnote: G(a2),
  "export-file": G(u1),
  eye: G(Zp),
  "eye-off": G(Jp),
  "file-import": G(w1),
  "fill-series": G(v2),
  filter: G(l2),
  "filter-remove": G(D1),
  "formula-average": G(gp),
  "formula-maximum": G(Bh),
  "formula-minimum": G(Dh),
  font: G(Ro),
  footnote: G(g2),
  "format-painter": G(t0),
  "web-layout": G(Ss),
  group: G(Ts),
  history: G(q0),
  heading: G(F1),
  "horizontal-rule": G(am),
  image: G(Ns),
  "image-replace": G(F0),
  "indent-decrease": G(c2),
  "indent-increase": G(f2),
  info: G(j1),
  italic: G(G1),
  inspect: G(Z0),
  json: G(np),
  language: G(Z1),
  layout: G(t2),
  "layout-circular": G(Tp),
  "layout-flowchart": G(bg),
  "layout-hierarchy": G(X2),
  "layout-radial": G(J2),
  line: G(hm),
  "link-action": G(Os),
  "link-off": G(hg),
  lock: G(C2),
  "match-height": G(j2),
  "match-size": G(T2),
  "match-width": G(V2),
  "merge-cells": G(Im),
  metadata: G(M1),
  minus: G(z2),
  move: G(G2),
  "new-file": G(b1),
  "new-slide": G(S1),
  notes: G(Z2),
  "normal-view": G(y0),
  "numbered-list": G(p2),
  "open-file": G(E1),
  bookmark: G(tp),
  palette: G(n0),
  panel: G(u0),
  paragraph: G(b0),
  "page-border": G(Mm),
  "page-break": G(o0),
  "page-setup": G(s1),
  "pane-accessibility": G(Ds),
  "pane-chart": G(Cs),
  "pane-group": G(Ts),
  "pane-picture": G(Ns),
  "pane-selection": G(Rs),
  "pane-shape": G(Io),
  "pane-slide": G(Is),
  "pane-table": G(Lo),
  "pane-text": G(Ro),
  paste: G(Rp),
  play: G(Op),
  print: G(A0),
  plus: G(w0),
  "reading-view": G(Jh),
  redo: G(O0),
  "regional-format": G(Ss),
  reload: G(I0),
  locate: G(A2),
  "remove-duplicates": G(k2),
  "rotate-left": G(U0),
  "rotate-right": G($0),
  search: G(rm),
  save: G(K0),
  "send-back": G(im),
  "session-file": G(t1),
  "session-export": G(m1),
  "session-import": G(d1),
  shape: G(Io),
  "shape-gallery": G(Io),
  slide: G(Is),
  "slide-first": G(Nh),
  "slide-last": G(Ph),
  "slide-next": G(bm),
  "slide-previous": G(ym),
  video: G(mg),
  "sorter-view": G(J1),
  sparkles: G(mm),
  sort: G(Lh),
  "source-code": G(wm),
  strikethrough: G(Nm),
  "section-break": G(Dm),
  "split-cells": G(Rm),
  subscribe: G(T0),
  table: G(Lo),
  "table-grid": G(Lo),
  "table-of-contents": G(Fm),
  text: G(Ro),
  "text-box": G(Ym),
  "trace-dependents": G(jh),
  "trace-precedents": G(Gh),
  "track-changes": G(P1),
  trash: G(eg),
  "unfreeze-panes": G(h0),
  undo: G(og),
  underline: G(ng),
  keyboard: G(X1),
  ungroup: G(dg),
  unlock: G(x2),
  watermark: G(Sm),
  "what-if": G(N1),
  "workbook-links": G(Os),
  "workbook-lock": G(h1),
  "wrap-text": G(Qm),
  "freeze-column": G(s0),
  "freeze-panes": G(m0),
  "freeze-row": G(d0),
  "queries-connections": G($p),
  quote: G(x0),
  ruler: G(W0),
  symbol: G(dm)
}, Eg = ["data-icon-family", "data-icon-name", "preserveAspectRatio"], xg = { key: 0 }, Dg = ["d"], Nt = /* @__PURE__ */ Ee({
  __name: "UiIcon",
  props: {
    name: {},
    size: { default: 16 },
    title: {}
  },
  setup(e) {
    const t = e, r = be(() => ah[t.name] ?? []), n = be(() => Ag[t.name]), i = be(() => typeof t.size == "number" ? `${t.size}px` : t.size), o = be(() => {
      if (t.name.startsWith("shape-")) return "shape";
      if (t.name.startsWith("layout-")) return "layout";
      if (t.name.startsWith("transition-")) return "transition";
      if (t.name.startsWith("line-")) return "line";
      if (t.name.startsWith("pane-")) return "pane";
    });
    return (a, s) => n.value ? (de(), ve(lu(n.value), {
      key: 0,
      class: "als-ofs-ui-icon",
      "data-icon-family": o.value,
      "data-icon-name": e.name,
      "data-icon-source": "lucide",
      style: at({ "--als-ofs-ui-icon-size": i.value }),
      "stroke-width": 1.5,
      "aria-hidden": "true",
      focusable: "false"
    }, null, 8, ["data-icon-family", "data-icon-name", "style"])) : (de(), We("svg", {
      key: 1,
      class: "als-ofs-ui-icon",
      "data-icon-family": o.value,
      "data-icon-name": e.name,
      "data-icon-source": "domain",
      style: at({ "--als-ofs-ui-icon-size": i.value }),
      preserveAspectRatio: o.value === "layout" ? "none" : void 0,
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      focusable: "false"
    }, [
      e.title ? (de(), We("title", xg, gt(e.title), 1)) : yt("", !0),
      (de(!0), We(et, null, Ci(r.value, (l) => (de(), We("path", {
        key: l,
        d: l
      }, null, 8, Dg))), 128))
    ], 12, Eg));
  }
}), Cg = ["aria-label", "data-active", "data-kind", "data-size", "disabled", "title", "type"], Sg = /* @__PURE__ */ Ee({
  __name: "UiButton",
  props: {
    active: { type: Boolean, default: !1 },
    ariaLabel: {},
    disabled: { type: Boolean, default: !1 },
    icon: {},
    kind: { default: "default" },
    size: { default: "sm" },
    title: {},
    type: { default: "button" }
  },
  setup(e) {
    return (t, r) => (de(), We("button", {
      class: "als-ofs-ui-button",
      "aria-label": e.ariaLabel,
      "data-active": e.active ? "true" : void 0,
      "data-kind": e.kind,
      "data-size": e.size,
      disabled: e.disabled,
      title: e.title,
      type: e.type
    }, [
      e.icon ? (de(), ve(Nt, {
        key: 0,
        name: e.icon
      }, null, 8, ["name"])) : yt("", !0),
      Pe(t.$slots, "default")
    ], 8, Cg));
  }
});
function Gt(e, t) {
  const r = typeof e == "string" && !t ? `${e}Context` : t, n = Symbol(r);
  return [(a) => {
    const s = Jr(n, a);
    if (s || s === null) return s;
    throw new Error(`Injection \`${n.toString()}\` not found. Component must be used within ${Array.isArray(e) ? `one of the following components: ${e.join(", ")}` : `\`${e}\``}`);
  }, (a) => (xa(n, a), a)];
}
function wt() {
  let e = document.activeElement;
  if (e == null) return null;
  for (; e != null && e.shadowRoot != null && e.shadowRoot.activeElement != null; ) e = e.shadowRoot.activeElement;
  return e;
}
function Ou(e, t, r) {
  const n = r.originalEvent.target, i = new CustomEvent(e, {
    bubbles: !1,
    cancelable: !0,
    detail: r
  });
  t && n.addEventListener(e, t, { once: !0 }), n.dispatchEvent(i);
}
function Tg(e) {
  return e == null;
}
function ci(e, t) {
  return _a() ? (xl(e, t), !0) : !1;
}
// @__NO_SIDE_EFFECTS__
function Ng() {
  const e = /* @__PURE__ */ new Set(), t = (o) => {
    e.delete(o);
  };
  return {
    on: (o) => {
      e.add(o);
      const a = () => t(o);
      return ci(a), { off: a };
    },
    off: t,
    trigger: (...o) => Promise.all(Array.from(e).map((a) => a(...o))),
    clear: () => {
      e.clear();
    }
  };
}
// @__NO_SIDE_EFFECTS__
function Og(e) {
  let t = !1, r;
  const n = El(!0);
  return ((...i) => (t || (r = n.run(() => e(...i)), t = !0), r));
}
const sr = typeof window < "u" && typeof document < "u";
typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
const Pg = (e) => typeof e < "u", Ig = Object.prototype.toString, Lg = (e) => Ig.call(e) === "[object Object]";
function Bo(e) {
  return Array.isArray(e) ? e : [e];
}
function Rg(e) {
  return cr();
}
// @__NO_SIDE_EFFECTS__
function Pu(e) {
  if (!sr) return e;
  let t = 0, r, n;
  const i = () => {
    t -= 1, n && t <= 0 && (n.stop(), r = void 0, n = void 0);
  };
  return ((...o) => (t += 1, n || (n = El(!0), r = n.run(() => e(...o))), ci(i), r));
}
function Iu(e, t = 1e4) {
  return id((r, n) => {
    let i = St(e), o;
    const a = () => setTimeout(() => {
      i = St(e), n();
    }, St(t));
    return ci(() => {
      clearTimeout(o);
    }), {
      get() {
        return r(), i;
      },
      set(s) {
        i = s, n(), clearTimeout(o), o = a();
      }
    };
  });
}
function Bg(e, t) {
  Rg() && au(e, t);
}
function Lu(e, t, r = {}) {
  const { immediate: n = !0, immediateCallback: i = !1 } = r, o = /* @__PURE__ */ to(!1);
  let a;
  function s() {
    a && (clearTimeout(a), a = void 0);
  }
  function l() {
    o.value = !1, s();
  }
  function f(...d) {
    i && e(), s(), o.value = !0, a = setTimeout(() => {
      o.value = !1, a = void 0, e(...d);
    }, St(t));
  }
  return n && (o.value = !0, sr && f()), ci(l), {
    isPending: /* @__PURE__ */ Gr(o),
    start: f,
    stop: l
  };
}
function Fg(e, t, r) {
  return tt(e, t, {
    ...r,
    immediate: !0
  });
}
const Pa = sr ? window : void 0;
function Nn(e) {
  var t;
  const r = St(e);
  return (t = r == null ? void 0 : r.$el) !== null && t !== void 0 ? t : r;
}
function ni(...e) {
  const t = (n, i, o, a) => (n.addEventListener(i, o, a), () => n.removeEventListener(i, o, a)), r = be(() => {
    const n = Bo(St(e[0])).filter((i) => i != null);
    return n.every((i) => typeof i != "string") ? n : void 0;
  });
  return Fg(() => {
    var n, i;
    return [
      (n = (i = r.value) === null || i === void 0 ? void 0 : i.map((o) => Nn(o))) !== null && n !== void 0 ? n : [Pa].filter((o) => o != null),
      Bo(St(r.value ? e[1] : e[0])),
      Bo(X(r.value ? e[2] : e[1])),
      St(r.value ? e[3] : e[2])
    ];
  }, ([n, i, o, a], s, l) => {
    if (!(n != null && n.length) || !(i != null && i.length) || !(o != null && o.length)) return;
    const f = Lg(a) ? { ...a } : a, d = n.flatMap((u) => i.flatMap((h) => o.map((c) => t(u, h, c, f))));
    l(() => {
      d.forEach((u) => u());
    });
  }, { flush: "post" });
}
// @__NO_SIDE_EFFECTS__
function zg() {
  const e = /* @__PURE__ */ to(!1), t = cr();
  return t && nn(() => {
    e.value = !0;
  }, t), e;
}
function qg(e) {
  return typeof e == "function" ? e : typeof e == "string" ? (t) => t.key === e : Array.isArray(e) ? (t) => e.includes(t.key) : () => !0;
}
function Hg(...e) {
  let t, r, n = {};
  e.length === 3 ? (t = e[0], r = e[1], n = e[2]) : e.length === 2 ? typeof e[1] == "object" ? (t = !0, r = e[0], n = e[1]) : (t = e[0], r = e[1]) : (t = !0, r = e[0]);
  const { target: i = Pa, eventName: o = "keydown", passive: a = !1, dedupe: s = !1 } = n, l = qg(t);
  return ni(i, o, (d) => {
    d.repeat && St(s) || l(d) && r(d);
  }, a);
}
function Ug(e) {
  return JSON.parse(JSON.stringify(e));
}
// @__NO_SIDE_EFFECTS__
function On(e, t, r, n = {}) {
  var i, o;
  const { clone: a = !1, passive: s = !1, eventName: l, deep: f = !1, defaultValue: d, shouldEmit: u } = n, h = cr(), c = r || (h == null ? void 0 : h.emit) || (h == null || (i = h.$emit) === null || i === void 0 ? void 0 : i.bind(h)) || (h == null || (o = h.proxy) === null || o === void 0 || (o = o.$emit) === null || o === void 0 ? void 0 : o.bind(h == null ? void 0 : h.proxy));
  let y = l;
  t || (t = "modelValue"), y = y || `update:${t.toString()}`;
  const m = (_) => a ? typeof a == "function" ? a(_) : Ug(_) : _, b = () => Pg(e[t]) ? m(e[t]) : d, g = (_) => {
    u ? u(_) && c(y, _) : c(y, _);
  };
  if (s) {
    const _ = /* @__PURE__ */ _e(b());
    let x = !1;
    return tt(() => e[t], (D) => {
      x || (x = !0, _.value = m(D), ht(() => x = !1));
    }), tt(_, (D) => {
      !x && (D !== e[t] || f) && g(D);
    }, { deep: f }), _;
  } else return be({
    get() {
      return b();
    },
    set(_) {
      g(_);
    }
  });
}
function Ia(e) {
  return e ? e.flatMap((t) => t.type === et ? Ia(t.children) : [t]) : [];
}
const Vg = ["INPUT", "TEXTAREA"];
function Bs(e, t, r, n = {}) {
  if (!t || n.enableIgnoredElement && Vg.includes(t.nodeName)) return null;
  const { arrowKeyOptions: i = "both", attributeName: o = "[data-reka-collection-item]", itemsArray: a = [], loop: s = !0, dir: l = "ltr", preventScroll: f = !0, focus: d = !1 } = n, [u, h, c, y, m, b] = [
    e.key === "ArrowRight",
    e.key === "ArrowLeft",
    e.key === "ArrowUp",
    e.key === "ArrowDown",
    e.key === "Home",
    e.key === "End"
  ], g = c || y, _ = u || h;
  if (!m && !b && (!g && !_ || i === "vertical" && _ || i === "horizontal" && g)) return null;
  const x = r ? Array.from(r.querySelectorAll(o)) : a;
  if (!x.length) return null;
  f && e.preventDefault();
  let D = null;
  return _ || g ? D = Ru(x, t, {
    goForward: g ? y : l === "ltr" ? u : h,
    loop: s
  }) : m ? D = x.at(0) || null : b && (D = x.at(-1) || null), d && (D == null || D.focus()), D;
}
function Ru(e, t, r, n = e.includes(t) ? e.length : e.length + 1) {
  if (--n === 0) return null;
  const i = e.indexOf(t);
  let o;
  if (i === -1 ? o = r.goForward ? 0 : e.length - 1 : o = r.goForward ? i + 1 : i - 1, !r.loop && (o < 0 || o >= e.length)) return null;
  const a = (o + e.length) % e.length, s = e[a];
  return s ? s.hasAttribute("disabled") && s.getAttribute("disabled") !== "false" ? Ru(e, s, r, n) : s : null;
}
const [lo] = /* @__PURE__ */ Gt("ConfigProvider"), Ct = /* @__PURE__ */ Sn({
  layersRoot: /* @__PURE__ */ new Set(),
  layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
  originalBodyPointerEvents: void 0,
  branches: /* @__PURE__ */ new Set()
});
function Fo(e) {
  if (e === null || typeof e != "object")
    return !1;
  const t = Object.getPrototypeOf(e);
  return t !== null && t !== Object.prototype && Object.getPrototypeOf(t) !== null || Symbol.iterator in e ? !1 : Symbol.toStringTag in e ? Object.prototype.toString.call(e) === "[object Module]" : !0;
}
function ca(e, t, r = ".", n) {
  if (!Fo(t))
    return ca(e, {}, r, n);
  const i = { ...t };
  for (const o of Object.keys(e)) {
    if (o === "__proto__" || o === "constructor")
      continue;
    const a = e[o];
    a != null && (n && n(i, o, a, r) || (Array.isArray(a) && Array.isArray(i[o]) ? i[o] = [...a, ...i[o]] : Fo(a) && Fo(i[o]) ? i[o] = ca(
      a,
      i[o],
      (r ? `${r}.` : "") + o.toString(),
      n
    ) : i[o] = a));
  }
  return i;
}
function $g(e) {
  return (...t) => (
    // eslint-disable-next-line unicorn/no-array-reduce
    t.reduce((r, n) => ca(r, n, "", e), {})
  );
}
const Bu = $g(), jg = /* @__PURE__ */ Pu(() => {
  const e = /* @__PURE__ */ _e(/* @__PURE__ */ new Map()), t = /* @__PURE__ */ _e(), r = be(() => {
    for (const o of e.value.values()) if (o) return !0;
    return !1;
  }), n = lo({ scrollBody: /* @__PURE__ */ _e(!0) }), i = () => {
    document.body.style.paddingRight = "", document.body.style.marginRight = "", Ct.layersWithOutsidePointerEventsDisabled.size === 0 && (document.body.style.pointerEvents = ""), document.documentElement.style.removeProperty("--scrollbar-width"), document.body.style.overflow = t.value ?? "", t.value = void 0;
  };
  return tt(r, (o, a) => {
    var d;
    if (!sr) return;
    if (!o) {
      a && i();
      return;
    }
    t.value === void 0 && (t.value = document.body.style.overflow);
    const s = window.innerWidth - document.documentElement.clientWidth, l = {
      padding: s,
      margin: 0
    }, f = (d = n.scrollBody) != null && d.value ? typeof n.scrollBody.value == "object" ? Bu({
      padding: n.scrollBody.value.padding === !0 ? s : n.scrollBody.value.padding,
      margin: n.scrollBody.value.margin === !0 ? s : n.scrollBody.value.margin
    }, l) : l : {
      padding: 0,
      margin: 0
    };
    s > 0 && (document.body.style.paddingRight = typeof f.padding == "number" ? `${f.padding}px` : String(f.padding), document.body.style.marginRight = typeof f.margin == "number" ? `${f.margin}px` : String(f.margin), document.documentElement.style.setProperty("--scrollbar-width", `${s}px`), document.body.style.overflow = "hidden"), ht(() => {
      r.value && (document.body.style.pointerEvents = "none", document.body.style.overflow = "hidden");
    });
  }, {
    immediate: !0,
    flush: "sync"
  }), e;
});
function Wg(e) {
  const t = Math.random().toString(36).substring(2, 7), r = jg();
  r.value.set(t, e ?? !1);
  const n = be({
    get: () => r.value.get(t) ?? !1,
    set: (i) => r.value.set(t, i)
  });
  return Bg(() => {
    r.value.delete(t);
  }), n;
}
function uo(e) {
  const t = lo({ dir: /* @__PURE__ */ _e("ltr") });
  return be(() => {
    var r;
    return (e == null ? void 0 : e.value) || ((r = t.dir) == null ? void 0 : r.value) || "ltr";
  });
}
function Fu(e) {
  const t = cr(), r = t == null ? void 0 : t.type.emits, n = {};
  return r != null && r.length || console.warn(`No emitted event found. Please check component: ${t == null ? void 0 : t.type.__name}`), r == null || r.forEach((i) => {
    n[Wn(ft(i))] = (...o) => e(i, ...o);
  }), n;
}
let zo = 0;
function Gg() {
  jt((e) => {
    if (!sr) return;
    const t = document.querySelectorAll("[data-reka-focus-guard]");
    document.body.insertAdjacentElement("afterbegin", t[0] ?? Fs()), document.body.insertAdjacentElement("beforeend", t[1] ?? Fs()), zo++, e(() => {
      zo === 1 && document.querySelectorAll("[data-reka-focus-guard]").forEach((r) => r.remove()), zo--;
    });
  });
}
function Fs() {
  const e = document.createElement("span");
  return e.setAttribute("data-reka-focus-guard", ""), e.tabIndex = 0, e.style.outline = "none", e.style.opacity = "0", e.style.position = "fixed", e.style.pointerEvents = "none", e;
}
function Ye() {
  const e = cr(), t = /* @__PURE__ */ _e(), r = be(() => n());
  ou(() => {
    r.value !== n() && td(t);
  });
  function n() {
    return t.value && "$el" in t.value && ["#text", "#comment"].includes(t.value.$el.nodeName) ? t.value.$el.nextElementSibling : Nn(t);
  }
  const i = Object.assign({}, e.exposed), o = {};
  for (const s in e.props) Object.defineProperty(o, s, {
    enumerable: !0,
    configurable: !0,
    get: () => e.props[s]
  });
  if (Object.keys(i).length > 0) for (const s in i) Object.defineProperty(o, s, {
    enumerable: !0,
    configurable: !0,
    get: () => i[s]
  });
  Object.defineProperty(o, "$el", {
    enumerable: !0,
    configurable: !0,
    get: () => e.vnode.el
  }), e.exposed = o;
  function a(s) {
    if (t.value = s, !!s && (Object.defineProperty(o, "$el", {
      enumerable: !0,
      configurable: !0,
      get: () => s instanceof Element ? s : s.$el
    }), !(s instanceof Element) && !Object.hasOwn(s, "$el"))) {
      const l = s.$.exposed, f = Object.assign({}, o);
      for (const d in l) Object.defineProperty(f, d, {
        enumerable: !0,
        configurable: !0,
        get: () => l[d]
      });
      e.exposed = f;
    }
  }
  return {
    forwardRef: a,
    currentRef: t,
    currentElement: r
  };
}
function zu(e) {
  const t = cr(), r = Object.keys((t == null ? void 0 : t.type.props) ?? {}).reduce((i, o) => {
    const a = (t == null ? void 0 : t.type.props[o]).default;
    return a !== void 0 && (i[o] = a), i;
  }, {}), n = /* @__PURE__ */ sd(e);
  return be(() => {
    const i = {}, o = (t == null ? void 0 : t.vnode.props) ?? {};
    return Object.keys(o).forEach((a) => {
      i[ft(a)] = o[a];
    }), Object.keys({
      ...r,
      ...i
    }).reduce((a, s) => (n.value[s] !== void 0 && (a[s] = n.value[s]), a), {});
  });
}
function an(e, t) {
  const r = zu(e), n = t ? Fu(t) : {};
  return be(() => ({
    ...r.value,
    ...n
  }));
}
function Kg(e, t) {
  const r = Iu(!1, 300);
  ci(() => {
    r.value = !1;
  });
  const n = /* @__PURE__ */ _e(null), i = /* @__PURE__ */ Ng();
  function o() {
    n.value = null, r.value = !1;
  }
  function a(s, l) {
    if (!l) return;
    const f = s.currentTarget, d = {
      x: s.clientX,
      y: s.clientY
    }, u = Xg(d, f.getBoundingClientRect()), h = Yg(d, u, 1), c = Zg(l.getBoundingClientRect()), y = Jg([...h, ...c]);
    n.value = y, r.value = !0;
  }
  return jt((s) => {
    if (e.value && t.value) {
      const l = (d) => a(d, t.value), f = (d) => a(d, e.value);
      e.value.addEventListener("pointerleave", l), t.value.addEventListener("pointerleave", f), s(() => {
        var d, u;
        (d = e.value) == null || d.removeEventListener("pointerleave", l), (u = t.value) == null || u.removeEventListener("pointerleave", f);
      });
    }
  }), jt((s) => {
    var l;
    if (n.value) {
      const f = (d) => {
        var b, g;
        if (!n.value || !(d.target instanceof Element)) return;
        const u = d.target, h = {
          x: d.clientX,
          y: d.clientY
        }, c = ((b = e.value) == null ? void 0 : b.contains(u)) || ((g = t.value) == null ? void 0 : g.contains(u)), y = !Qg(h, n.value), m = !!u.closest("[data-grace-area-trigger]");
        c ? o() : (y || m) && (o(), i.trigger());
      };
      (l = e.value) == null || l.ownerDocument.addEventListener("pointermove", f), s(() => {
        var d;
        return (d = e.value) == null ? void 0 : d.ownerDocument.removeEventListener("pointermove", f);
      });
    }
  }), {
    isPointerInTransit: r,
    onPointerExit: i.on
  };
}
function Xg(e, t) {
  const r = Math.abs(t.top - e.y), n = Math.abs(t.bottom - e.y), i = Math.abs(t.right - e.x), o = Math.abs(t.left - e.x);
  switch (Math.min(r, n, i, o)) {
    case o:
      return "left";
    case i:
      return "right";
    case r:
      return "top";
    case n:
      return "bottom";
    default:
      throw new Error("unreachable");
  }
}
function Yg(e, t, r = 5) {
  const n = [];
  switch (t) {
    case "top":
      n.push({
        x: e.x - r,
        y: e.y + r
      }, {
        x: e.x + r,
        y: e.y + r
      });
      break;
    case "bottom":
      n.push({
        x: e.x - r,
        y: e.y - r
      }, {
        x: e.x + r,
        y: e.y - r
      });
      break;
    case "left":
      n.push({
        x: e.x + r,
        y: e.y - r
      }, {
        x: e.x + r,
        y: e.y + r
      });
      break;
    case "right":
      n.push({
        x: e.x - r,
        y: e.y - r
      }, {
        x: e.x - r,
        y: e.y + r
      });
      break;
  }
  return n;
}
function Zg(e) {
  const { top: t, right: r, bottom: n, left: i } = e;
  return [
    {
      x: i,
      y: t
    },
    {
      x: r,
      y: t
    },
    {
      x: r,
      y: n
    },
    {
      x: i,
      y: n
    }
  ];
}
function Qg(e, t) {
  const { x: r, y: n } = e;
  let i = !1;
  for (let o = 0, a = t.length - 1; o < t.length; a = o++) {
    const s = t[o].x, l = t[o].y, f = t[a].x, d = t[a].y;
    l > n != d > n && r < (f - s) * (n - l) / (d - l) + s && (i = !i);
  }
  return i;
}
function Jg(e) {
  const t = e.slice();
  return t.sort((r, n) => r.x < n.x ? -1 : r.x > n.x ? 1 : r.y < n.y ? -1 : r.y > n.y ? 1 : 0), ey(t);
}
function ey(e) {
  if (e.length <= 1) return e.slice();
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const i = e[n];
    for (; t.length >= 2; ) {
      const o = t.at(-1), a = t[t.length - 2];
      if ((o.x - a.x) * (i.y - a.y) >= (o.y - a.y) * (i.x - a.x)) t.pop();
      else break;
    }
    t.push(i);
  }
  t.pop();
  const r = [];
  for (let n = e.length - 1; n >= 0; n--) {
    const i = e[n];
    for (; r.length >= 2; ) {
      const o = r.at(-1), a = r[r.length - 2];
      if ((o.x - a.x) * (i.y - a.y) >= (o.y - a.y) * (i.x - a.x)) r.pop();
      else break;
    }
    r.push(i);
  }
  return r.pop(), t.length === 1 && r.length === 1 && t[0].x === r[0].x && t[0].y === r[0].y ? t : t.concat(r);
}
var ty = function(e) {
  if (typeof document > "u")
    return null;
  var t = Array.isArray(e) ? e[0] : e;
  return t.ownerDocument.body;
}, mn = /* @__PURE__ */ new WeakMap(), wi = /* @__PURE__ */ new WeakMap(), ki = {}, qo = 0, qu = function(e) {
  return e && (e.host || qu(e.parentNode));
}, ry = function(e, t) {
  return t.map(function(r) {
    if (e.contains(r))
      return r;
    var n = qu(r);
    return n && e.contains(n) ? n : (console.error("aria-hidden", r, "in not contained inside", e, ". Doing nothing"), null);
  }).filter(function(r) {
    return !!r;
  });
}, ny = function(e, t, r, n) {
  var i = ry(t, Array.isArray(e) ? e : [e]);
  ki[r] || (ki[r] = /* @__PURE__ */ new WeakMap());
  var o = ki[r], a = [], s = /* @__PURE__ */ new Set(), l = new Set(i), f = function(u) {
    !u || s.has(u) || (s.add(u), f(u.parentNode));
  };
  i.forEach(f);
  var d = function(u) {
    !u || l.has(u) || Array.prototype.forEach.call(u.children, function(h) {
      if (s.has(h))
        d(h);
      else
        try {
          var c = h.getAttribute(n), y = c !== null && c !== "false", m = (mn.get(h) || 0) + 1, b = (o.get(h) || 0) + 1;
          mn.set(h, m), o.set(h, b), a.push(h), m === 1 && y && wi.set(h, !0), b === 1 && h.setAttribute(r, "true"), y || h.setAttribute(n, "true");
        } catch (g) {
          console.error("aria-hidden: cannot operate on ", h, g);
        }
    });
  };
  return d(t), s.clear(), qo++, function() {
    a.forEach(function(u) {
      var h = mn.get(u) - 1, c = o.get(u) - 1;
      mn.set(u, h), o.set(u, c), h || (wi.has(u) || u.removeAttribute(n), wi.delete(u)), c || u.removeAttribute(r);
    }), qo--, qo || (mn = /* @__PURE__ */ new WeakMap(), mn = /* @__PURE__ */ new WeakMap(), wi = /* @__PURE__ */ new WeakMap(), ki = {});
  };
}, iy = function(e, t, r) {
  r === void 0 && (r = "data-aria-hidden");
  var n = Array.from(Array.isArray(e) ? e : [e]), i = ty(e);
  return i ? (n.push.apply(n, Array.from(i.querySelectorAll("[aria-live], script"))), ny(n, i, r, "aria-hidden")) : function() {
    return null;
  };
};
function oy(e) {
  let t;
  tt(() => Nn(e), (r) => {
    let n = !1;
    try {
      n = !!(r != null && r.closest("[popover]:not(:popover-open)"));
    } catch {
    }
    r && !n ? t = iy(r) : t && t();
  }), on(() => {
    t && t();
  });
}
function di(e, t = "reka") {
  let r;
  const n = lo({ useId: void 0 });
  return n.useId ? r = n.useId() : r = So == null ? void 0 : So(), t ? `${t}-${r}` : r;
}
function ay(e) {
  const t = /* @__PURE__ */ _e(), r = be(() => {
    var o;
    return ((o = t.value) == null ? void 0 : o.width) ?? 0;
  }), n = be(() => {
    var o;
    return ((o = t.value) == null ? void 0 : o.height) ?? 0;
  });
  let i;
  return nn(() => {
    const o = Nn(e);
    o ? (t.value = {
      width: o.offsetWidth,
      height: o.offsetHeight
    }, i = new ResizeObserver((a) => {
      if (!Array.isArray(a) || !a.length) return;
      const s = a[0];
      let l, f;
      if ("borderBoxSize" in s) {
        const d = s.borderBoxSize, u = Array.isArray(d) ? d[0] : d;
        l = u.inlineSize, f = u.blockSize;
      } else
        l = o.offsetWidth, f = o.offsetHeight;
      t.value = {
        width: l,
        height: f
      };
    }), i.observe(o, { box: "border-box" })) : t.value = void 0;
  }), on(() => {
    i == null || i.disconnect(), i = void 0;
  }), {
    width: r,
    height: n
  };
}
function sy(e, t) {
  const r = /* @__PURE__ */ _e(e);
  function n(o) {
    return t[r.value][o] ?? r.value;
  }
  return {
    state: r,
    dispatch: (o) => {
      r.value = n(o);
    }
  };
}
function ly(e) {
  const t = Iu("", 1e3);
  return {
    search: t,
    handleTypeaheadSearch: (i, o) => {
      t.value = t.value + i;
      {
        const a = wt(), s = o.map((h) => {
          var c, y;
          return {
            ...h,
            textValue: ((c = h.value) == null ? void 0 : c.textValue) ?? ((y = h.ref.textContent) == null ? void 0 : y.trim()) ?? ""
          };
        }), l = s.find((h) => h.ref === a), f = s.map((h) => h.textValue), d = cy(f, t.value, l == null ? void 0 : l.textValue), u = s.find((h) => h.textValue === d);
        return u && u.ref.focus(), u == null ? void 0 : u.ref;
      }
    },
    resetTypeahead: () => {
      t.value = "";
    }
  };
}
function uy(e, t) {
  return e.map((r, n) => e[(t + n) % e.length]);
}
function cy(e, t, r) {
  const i = t.length > 1 && Array.from(t).every((f) => f === t[0]) ? t[0] : t, o = r ? e.indexOf(r) : -1;
  let a = uy(e, Math.max(o, 0));
  i.length === 1 && (a = a.filter((f) => f !== r));
  const l = a.find((f) => f.toLowerCase().startsWith(i.toLowerCase()));
  return l !== r ? l : void 0;
}
function dy(e, t) {
  var b;
  const r = /* @__PURE__ */ _e({}), n = /* @__PURE__ */ _e("none"), i = /* @__PURE__ */ _e(e), o = e.value ? "mounted" : "unmounted";
  let a;
  const s = ((b = t.value) == null ? void 0 : b.ownerDocument.defaultView) ?? Pa, { state: l, dispatch: f } = sy(o, {
    mounted: {
      UNMOUNT: "unmounted",
      ANIMATION_OUT: "unmountSuspended"
    },
    unmountSuspended: {
      MOUNT: "mounted",
      ANIMATION_END: "unmounted"
    },
    unmounted: { MOUNT: "mounted" }
  }), d = (g) => {
    var _;
    if (sr) {
      const x = new CustomEvent(g, {
        bubbles: !1,
        cancelable: !1
      });
      (_ = t.value) == null || _.dispatchEvent(x);
    }
  };
  tt(e, async (g, _) => {
    var D;
    const x = _ !== g;
    if (await ht(), x) {
      const R = n.value, C = Mi(t.value);
      g ? (f("MOUNT"), d("enter"), C === "none" && d("after-enter")) : C === "none" || C === "undefined" || ((D = r.value) == null ? void 0 : D.display) === "none" ? (f("UNMOUNT"), d("leave"), d("after-leave")) : _ && R !== C ? (f("ANIMATION_OUT"), d("leave")) : (f("UNMOUNT"), d("after-leave"));
    }
  }, { immediate: !0 });
  const u = (g) => {
    if (g.target !== t.value) return;
    const _ = Mi(t.value), x = _.includes(CSS.escape(g.animationName)), D = l.value === "mounted" ? "enter" : "leave";
    if (x && (d(`after-${D}`), f("ANIMATION_END"), !i.value)) {
      const R = t.value.style.animationFillMode;
      t.value.style.animationFillMode = "forwards", a = s == null ? void 0 : s.setTimeout(() => {
        var C;
        ((C = t.value) == null ? void 0 : C.style.animationFillMode) === "forwards" && (t.value.style.animationFillMode = R);
      });
    }
    _ === "none" && f("ANIMATION_END");
  }, h = (g) => {
    g.target === t.value && (n.value = Mi(t.value));
  }, c = tt(t, (g, _) => {
    g ? (r.value = getComputedStyle(g), g.addEventListener("animationstart", h), g.addEventListener("animationcancel", u), g.addEventListener("animationend", u)) : (f("ANIMATION_END"), a !== void 0 && (s == null || s.clearTimeout(a)), _ == null || _.removeEventListener("animationstart", h), _ == null || _.removeEventListener("animationcancel", u), _ == null || _.removeEventListener("animationend", u));
  }, { immediate: !0 }), y = tt(l, () => {
    const g = Mi(t.value);
    n.value = l.value === "mounted" ? g : "none";
  });
  return on(() => {
    c(), y(), t.value && (t.value.removeEventListener("animationstart", h), t.value.removeEventListener("animationcancel", u), t.value.removeEventListener("animationend", u)), a !== void 0 && (s == null || s.clearTimeout(a));
  }), { isPresent: be(() => ["mounted", "unmountSuspended"].includes(l.value)) };
}
function Mi(e) {
  return e && getComputedStyle(e).animationName || "none";
}
var La = /* @__PURE__ */ Ee({
  name: "Presence",
  props: {
    present: {
      type: Boolean,
      required: !0
    },
    forceMount: { type: Boolean }
  },
  slots: {},
  setup(e, { slots: t, expose: r }) {
    var f;
    const { present: n, forceMount: i } = /* @__PURE__ */ Tn(e), o = /* @__PURE__ */ _e(), { isPresent: a } = dy(n, o);
    r({ present: a });
    let s = t.default({ present: a.value });
    s = Ia(s || []);
    const l = cr();
    if (s && (s == null ? void 0 : s.length) > 1) {
      const d = (f = l == null ? void 0 : l.parent) != null && f.type.name ? `<${l.parent.type.name} />` : "component";
      throw new Error([
        `Detected an invalid children for \`${d}\` for  \`Presence\` component.`,
        "",
        "Note: Presence works similarly to `v-if` directly, but it waits for animation/transition to finished before unmounting. So it expect only one direct child of valid VNode type.",
        "You can apply a few solutions:",
        ["Provide a single child element so that `presence` directive attach correctly.", "Ensure the first child is an actual element instead of a raw text node or comment node."].map((u) => `  - ${u}`).join(`
`)
      ].join(`
`));
    }
    return () => i.value || n.value || a.value ? ir(t.default({ present: a.value })[0], { ref: (d) => {
      const u = Nn(d);
      return typeof (u == null ? void 0 : u.hasAttribute) > "u" || (u != null && u.hasAttribute("data-reka-popper-content-wrapper") ? o.value = u.firstElementChild : o.value = u), u;
    } }) : null;
  }
});
const da = /* @__PURE__ */ Ee({
  name: "PrimitiveSlot",
  inheritAttrs: !1,
  setup(e, { attrs: t, slots: r }) {
    return () => {
      var l;
      if (!r.default) return null;
      const n = Ia(r.default()), i = n.findIndex((f) => f.type !== Wt);
      if (i === -1) return n;
      const o = n[i];
      (l = o.props) == null || delete l.ref;
      const a = o.props ? nt(t, o.props) : t, s = en({
        ...o,
        props: {}
      }, a);
      return n.length === 1 ? s : (n[i] = s, n);
    };
  }
}), fy = [
  "area",
  "img",
  "input"
], Rt = /* @__PURE__ */ Ee({
  name: "Primitive",
  inheritAttrs: !1,
  props: {
    asChild: {
      type: Boolean,
      default: !1
    },
    as: {
      type: [String, Object],
      default: "div"
    }
  },
  setup(e, { attrs: t, slots: r }) {
    const n = e.asChild ? "template" : e.as;
    return typeof n == "string" && fy.includes(n) ? () => ir(n, t) : n !== "template" ? () => ir(e.as, t, { default: r.default }) : () => ir(da, t, { default: r.default });
  }
});
function zs() {
  const e = /* @__PURE__ */ _e(), t = be(() => {
    var r, n;
    return ["#text", "#comment"].includes((r = e.value) == null ? void 0 : r.$el.nodeName) ? (n = e.value) == null ? void 0 : n.$el.nextElementSibling : Nn(e);
  });
  return {
    primitiveElement: e,
    currentElement: t
  };
}
const hy = "dismissableLayer.pointerDownOutside", py = "dismissableLayer.focusOutside";
function Hu(e, t) {
  if (!(t instanceof Element)) return !1;
  const r = t.closest("[data-dismissable-layer]"), n = e.dataset.dismissableLayer === "" ? e : e.querySelector("[data-dismissable-layer]"), i = Array.from(e.ownerDocument.querySelectorAll("[data-dismissable-layer]"));
  return !!(r && (n === r || i.indexOf(n) < i.indexOf(r)));
}
function my(e, t, r = !0) {
  var a;
  const n = ((a = t == null ? void 0 : t.value) == null ? void 0 : a.ownerDocument) ?? (globalThis == null ? void 0 : globalThis.document), i = /* @__PURE__ */ _e(!1), o = /* @__PURE__ */ _e(() => {
  });
  return jt((s) => {
    if (!sr || !St(r)) return;
    const l = async (d) => {
      const u = d.target;
      if (!(!(t != null && t.value) || !u)) {
        if (Hu(t.value, u)) {
          i.value = !1;
          return;
        }
        if (d.target && !i.value) {
          let y = function() {
            Ou(hy, e, c);
          };
          var h = y;
          const c = { originalEvent: d };
          d.pointerType === "touch" ? (n.removeEventListener("click", o.value), o.value = y, n.addEventListener("click", o.value, { once: !0 })) : y();
        } else n.removeEventListener("click", o.value);
        i.value = !1;
      }
    }, f = window.setTimeout(() => {
      n.addEventListener("pointerdown", l);
    }, 0);
    s(() => {
      window.clearTimeout(f), n.removeEventListener("pointerdown", l), n.removeEventListener("click", o.value);
    });
  }), { onPointerDownCapture: () => {
    St(r) && (i.value = !0);
  } };
}
function gy(e, t, r = !0) {
  var o;
  const n = ((o = t == null ? void 0 : t.value) == null ? void 0 : o.ownerDocument) ?? (globalThis == null ? void 0 : globalThis.document), i = /* @__PURE__ */ _e(!1);
  return jt((a) => {
    if (!sr || !St(r)) return;
    const s = async (l) => {
      if (!(t != null && t.value)) return;
      await ht(), await ht();
      const f = l.target;
      !t.value || !f || Hu(t.value, f) || l.target && !i.value && Ou(py, e, { originalEvent: l });
    };
    n.addEventListener("focusin", s), a(() => n.removeEventListener("focusin", s));
  }), {
    onFocusCapture: () => {
      St(r) && (i.value = !0);
    },
    onBlurCapture: () => {
      St(r) && (i.value = !1);
    }
  };
}
var yy = /* @__PURE__ */ Ee({
  __name: "DismissableLayer",
  props: {
    disableOutsidePointerEvents: {
      type: Boolean,
      required: !1,
      default: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    },
    present: {
      type: Boolean,
      required: !1,
      default: !0
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "dismiss"
  ],
  setup(e, { emit: t }) {
    const r = e, n = t, { forwardRef: i, currentElement: o } = Ye(), a = be(() => {
      var c;
      return ((c = o.value) == null ? void 0 : c.ownerDocument) ?? globalThis.document;
    }), s = be(() => Ct.layersRoot), l = be(() => o.value ? Array.from(s.value).indexOf(o.value) : -1), f = be(() => Ct.layersWithOutsidePointerEventsDisabled.size > 0), d = be(() => {
      const c = Array.from(s.value), [y] = [...Ct.layersWithOutsidePointerEventsDisabled].slice(-1), m = c.indexOf(y);
      return l.value >= m;
    }), u = my(async (c) => {
      const y = [...Ct.branches].some((m) => m == null ? void 0 : m.contains(c.target));
      !r.present || !d.value || y || (n("pointerDownOutside", c), n("interactOutside", c), await ht(), c.defaultPrevented || n("dismiss"));
    }, o), h = gy((c) => {
      const y = [...Ct.branches].some((m) => m == null ? void 0 : m.contains(c.target));
      !r.present || y || (n("focusOutside", c), n("interactOutside", c), c.defaultPrevented || n("dismiss"));
    }, o);
    return Hg("Escape", (c) => {
      !r.present || !(l.value === s.value.size - 1) || (n("escapeKeyDown", c), c.defaultPrevented || n("dismiss"));
    }), tt([
      o,
      () => r.disableOutsidePointerEvents,
      () => r.present
    ], ([c, y, m], b, g) => {
      !c || !m || y && (Ct.layersWithOutsidePointerEventsDisabled.size === 0 && (Ct.originalBodyPointerEvents = a.value.body.style.pointerEvents, a.value.body.style.pointerEvents = "none"), Ct.layersWithOutsidePointerEventsDisabled.add(c), g(() => {
        Ct.layersWithOutsidePointerEventsDisabled.delete(c), Ct.layersWithOutsidePointerEventsDisabled.size === 0 && !Tg(Ct.originalBodyPointerEvents) && (a.value.body.style.pointerEvents = Ct.originalBodyPointerEvents);
      }));
    }, { immediate: !0 }), tt([o, () => r.present], ([c, y], m, b) => {
      !c || !y || (s.value.add(c), b(() => {
        s.value.delete(c);
      }));
    }, { immediate: !0 }), jt((c) => {
      c(() => {
        o.value && (s.value.delete(o.value), Ct.layersWithOutsidePointerEventsDisabled.delete(o.value));
      });
    }), (c, y) => (de(), ve(X(Rt), {
      ref: X(i),
      "as-child": c.asChild,
      as: c.as,
      "data-dismissable-layer": "",
      style: at({ pointerEvents: f.value ? d.value ? "auto" : "none" : void 0 }),
      onFocusCapture: X(h).onFocusCapture,
      onBlurCapture: X(h).onBlurCapture,
      onPointerdownCapture: X(u).onPointerDownCapture
    }, {
      default: ge(() => [Pe(c.$slots, "default")]),
      _: 3
    }, 8, [
      "as-child",
      "as",
      "style",
      "onFocusCapture",
      "onBlurCapture",
      "onPointerdownCapture"
    ]));
  }
}), Uu = yy;
const vy = /* @__PURE__ */ Og(() => /* @__PURE__ */ _e([]));
function by() {
  const e = vy();
  return {
    add(t) {
      const r = e.value[0];
      t !== r && (r == null || r.pause()), e.value = qs(e.value, t), e.value.unshift(t);
    },
    remove(t) {
      var r;
      e.value = qs(e.value, t), (r = e.value[0]) == null || r.resume();
    }
  };
}
function qs(e, t) {
  const r = [...e], n = r.indexOf(t);
  return n !== -1 && r.splice(n, 1), r;
}
const Ho = "focusScope.autoFocusOnMount", Uo = "focusScope.autoFocusOnUnmount", Hs = {
  bubbles: !1,
  cancelable: !0
};
function _y(e, { select: t = !1 } = {}) {
  const r = wt();
  for (const n of e)
    if (Nr(n, { select: t }), wt() !== r) return !0;
}
function wy(e) {
  const t = Vu(e), r = Us(t, e), n = Us(t.reverse(), e);
  return [r, n];
}
function Vu(e) {
  const t = [], r = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => {
    const i = n.tagName === "INPUT" && n.type === "hidden";
    return n.disabled || n.hidden || i ? NodeFilter.FILTER_SKIP : n.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
  } });
  for (; r.nextNode(); ) t.push(r.currentNode);
  return t;
}
function Us(e, t) {
  for (const r of e) if (!ky(r, { upTo: t })) return r;
}
function ky(e, { upTo: t }) {
  if (getComputedStyle(e).visibility === "hidden") return !0;
  for (; e; ) {
    if (t !== void 0 && e === t) return !1;
    if (getComputedStyle(e).display === "none") return !0;
    e = e.parentElement;
  }
  return !1;
}
function My(e) {
  return e instanceof HTMLInputElement && "select" in e;
}
function Nr(e, { select: t = !1 } = {}) {
  if (e && e.focus) {
    const r = wt();
    e.focus({ preventScroll: !0 }), e !== r && My(e) && t && e.select();
  }
}
var Ay = /* @__PURE__ */ Ee({
  __name: "FocusScope",
  props: {
    loop: {
      type: Boolean,
      required: !1,
      default: !1
    },
    trapped: {
      type: Boolean,
      required: !1,
      default: !1
    },
    present: {
      type: Boolean,
      required: !1,
      default: !0
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: ["mountAutoFocus", "unmountAutoFocus"],
  setup(e, { emit: t }) {
    const r = e, n = t, { currentRef: i, currentElement: o } = Ye(), a = /* @__PURE__ */ _e(null), s = by(), l = /* @__PURE__ */ Sn({
      paused: !1,
      pause() {
        this.paused = !0;
      },
      resume() {
        this.paused = !1;
      }
    });
    jt((u) => {
      if (!sr) return;
      const h = o.value;
      if (!r.trapped) return;
      function c(g) {
        if (l.paused || !h) return;
        const _ = g.target;
        h.contains(_) ? a.value = _ : Nr(a.value, { select: !0 });
      }
      function y(g) {
        if (l.paused || !h) return;
        const _ = g.relatedTarget;
        _ !== null && (h.contains(_) || Nr(a.value, { select: !0 }));
      }
      function m(g) {
        const _ = a.value;
        if (_ === null || !g.some((R) => R.removedNodes.length > 0)) return;
        h.contains(_) || Nr(h);
      }
      document.addEventListener("focusin", c), document.addEventListener("focusout", y);
      const b = new MutationObserver(m);
      h && b.observe(h, {
        childList: !0,
        subtree: !0
      }), u(() => {
        document.removeEventListener("focusin", c), document.removeEventListener("focusout", y), b.disconnect();
      });
    });
    function f(u, h) {
      const c = new CustomEvent(Ho, Hs), y = (m) => n("mountAutoFocus", m);
      u.addEventListener(Ho, y), u.dispatchEvent(c), u.removeEventListener(Ho, y), c.defaultPrevented || (_y(Vu(u), { select: !0 }), wt() === h && Nr(u));
    }
    jt(async (u) => {
      const h = o.value;
      if (await ht(), !h) return;
      r.present !== !1 && s.add(l);
      const c = wt();
      !h.contains(c) && r.present !== !1 && f(h, c), u(() => {
        const m = new CustomEvent(Uo, Hs), b = (g) => {
          n("unmountAutoFocus", g);
        };
        h.addEventListener(Uo, b), h.dispatchEvent(m), h.setAttribute("data-focus-scope-unmounting", ""), setTimeout(() => {
          m.defaultPrevented || Nr(c ?? document.body, { select: !0 }), h.removeEventListener(Uo, b), s.remove(l), h.removeAttribute("data-focus-scope-unmounting");
        }, 0);
      });
    }), tt(() => r.present, async (u, h) => {
      if (!sr) return;
      if (u === !1 && h === !0) {
        s.remove(l);
        return;
      }
      if (u !== !0 || h !== !1) return;
      s.add(l), await ht();
      const c = o.value;
      if (!c) return;
      const y = wt();
      c.contains(y) || f(c, y);
    });
    function d(u) {
      if (!r.loop && !r.trapped || l.paused) return;
      const h = u.key === "Tab" && !u.altKey && !u.ctrlKey && !u.metaKey, c = wt();
      if (h && c) {
        const y = u.currentTarget, [m, b] = wy(y);
        m && b ? !u.shiftKey && c === b ? (u.preventDefault(), r.loop && Nr(m, { select: !0 })) : u.shiftKey && c === m && (u.preventDefault(), r.loop && Nr(b, { select: !0 })) : c === y && u.preventDefault();
      }
    }
    return (u, h) => (de(), ve(X(Rt), {
      ref_key: "currentRef",
      ref: i,
      tabindex: "-1",
      "as-child": u.asChild,
      as: u.as,
      onKeydown: d
    }, {
      default: ge(() => [Pe(u.$slots, "default")]),
      _: 3
    }, 8, ["as-child", "as"]));
  }
}), Ey = Ay;
const xy = "menu.itemSelect", fa = ["Enter", " "], Dy = [
  "ArrowDown",
  "PageUp",
  "Home"
], $u = [
  "ArrowUp",
  "PageDown",
  "End"
], Cy = [...Dy, ...$u], Sy = {
  ltr: [...fa, "ArrowRight"],
  rtl: [...fa, "ArrowLeft"]
}, Ty = {
  ltr: ["ArrowLeft"],
  rtl: ["ArrowRight"]
};
function ju(e) {
  return e ? "open" : "closed";
}
function Ny(e) {
  const t = wt();
  for (const r of e)
    if (r === t || (r.focus(), wt() !== t)) return;
}
function Oy(e, t) {
  const { x: r, y: n } = e;
  let i = !1;
  for (let o = 0, a = t.length - 1; o < t.length; a = o++) {
    const s = t[o].x, l = t[o].y, f = t[a].x, d = t[a].y;
    l > n != d > n && r < (f - s) * (n - l) / (d - l) + s && (i = !i);
  }
  return i;
}
function Py(e, t) {
  if (!t) return !1;
  const r = {
    x: e.clientX,
    y: e.clientY
  };
  return Oy(r, t);
}
function Cn(e) {
  return e.pointerType === "mouse";
}
var Iy = /* @__PURE__ */ Ee({
  __name: "Teleport",
  props: {
    to: {
      type: null,
      required: !1
    },
    disabled: {
      type: Boolean,
      required: !1
    },
    defer: {
      type: Boolean,
      required: !1
    },
    forceMount: {
      type: Boolean,
      required: !1
    }
  },
  setup(e) {
    const t = e, r = lo({}), n = be(() => {
      var o;
      return t.to ?? ((o = r.teleportTo) == null ? void 0 : o.value) ?? "body";
    }), i = /* @__PURE__ */ zg();
    return (o, a) => X(i) || o.forceMount ? (de(), ve(Sd, {
      key: 0,
      to: n.value,
      disabled: o.disabled,
      defer: o.defer
    }, [Pe(o.$slots, "default")], 8, [
      "to",
      "disabled",
      "defer"
    ])) : yt("v-if", !0);
  }
}), Wu = Iy;
const Vs = "data-reka-collection-item";
function Gu(e = {}) {
  const { key: t = "", isProvider: r = !1 } = e, n = `${t}CollectionProvider`;
  let i;
  r ? (i = {
    collectionRef: /* @__PURE__ */ _e(),
    itemMap: /* @__PURE__ */ _e(/* @__PURE__ */ new Map())
  }, xa(n, i)) : i = Jr(n);
  const o = (d = !1) => {
    const u = i.collectionRef.value;
    if (!u) return [];
    const h = Array.from(u.querySelectorAll(`[${Vs}]`)), c = new Map(h.map((b, g) => [b, g])), m = Array.from(i.itemMap.value.values()).sort((b, g) => (c.get(b.ref) ?? -1) - (c.get(g.ref) ?? -1));
    return d ? m : m.filter((b) => b.ref.dataset.disabled !== "");
  }, a = /* @__PURE__ */ Ee({
    name: "CollectionSlot",
    inheritAttrs: !1,
    setup(d, { slots: u, attrs: h }) {
      const { primitiveElement: c, currentElement: y } = zs();
      return tt(y, () => {
        i.collectionRef.value = y.value;
      }), () => ir(da, {
        ref: c,
        ...h
      }, u);
    }
  }), s = /* @__PURE__ */ Ee({
    name: "CollectionItem",
    inheritAttrs: !1,
    props: { value: { validator: () => !0 } },
    setup(d, { slots: u, attrs: h }) {
      const { primitiveElement: c, currentElement: y } = zs();
      return jt((m) => {
        if (y.value) {
          const b = G(y.value);
          i.itemMap.value.set(b, {
            ref: y.value,
            value: d.value
          }), m(() => i.itemMap.value.delete(b));
        }
      }), () => ir(da, {
        ...h,
        [Vs]: "",
        ref: c
      }, u);
    }
  }), l = be(() => Array.from(i.itemMap.value.values())), f = be(() => i.itemMap.value.size);
  return {
    getItems: o,
    reactiveItems: l,
    itemMapSize: f,
    CollectionSlot: a,
    CollectionItem: s
  };
}
var Ly = /* @__PURE__ */ Ee({
  __name: "VisuallyHidden",
  props: {
    feature: {
      type: String,
      required: !1,
      default: "focusable"
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "span"
    }
  },
  setup(e) {
    return (t, r) => (de(), ve(X(Rt), {
      as: t.as,
      "as-child": t.asChild,
      "aria-hidden": t.feature === "focusable" || t.feature === "fully-hidden" ? "true" : void 0,
      "data-hidden": t.feature === "fully-hidden" ? "" : void 0,
      tabindex: t.feature === "fully-hidden" ? "-1" : void 0,
      style: {
        position: "absolute",
        border: 0,
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
        wordWrap: "normal",
        top: "-1px",
        left: "-1px"
      }
    }, {
      default: ge(() => [Pe(t.$slots, "default")]),
      _: 3
    }, 8, [
      "as",
      "as-child",
      "aria-hidden",
      "data-hidden",
      "tabindex"
    ]));
  }
}), Ry = Ly;
const By = "rovingFocusGroup.onEntryFocus", Fy = {
  bubbles: !1,
  cancelable: !0
};
function zy(e, t = !1) {
  const r = wt();
  for (const n of e)
    if (n === r || (n.focus({ preventScroll: t }), wt() !== r)) return;
}
const [Ku, qy] = /* @__PURE__ */ Gt("PopperRoot");
var Hy = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "PopperRoot",
  setup(e) {
    const t = /* @__PURE__ */ _e();
    return qy({
      anchor: t,
      onAnchorChange: (r) => t.value = r
    }), (r, n) => Pe(r.$slots, "default");
  }
}), Ra = Hy, Uy = /* @__PURE__ */ Ee({
  __name: "PopperAnchor",
  props: {
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e, { forwardRef: r, currentElement: n } = Ye(), i = Ku();
    return Jl(() => {
      i.onAnchorChange(t.reference ?? n.value);
    }), (o, a) => (de(), ve(X(Rt), {
      ref: X(r),
      as: o.as,
      "as-child": o.asChild
    }, {
      default: ge(() => [Pe(o.$slots, "default")]),
      _: 3
    }, 8, ["as", "as-child"]));
  }
}), Xu = Uy;
const Vy = {
  key: 0,
  d: "M0 0L6 6L12 0"
}, $y = {
  key: 1,
  d: "M0 0L4.58579 4.58579C5.36683 5.36683 6.63316 5.36684 7.41421 4.58579L12 0"
};
var jy = /* @__PURE__ */ Ee({
  __name: "Arrow",
  props: {
    width: {
      type: Number,
      required: !1,
      default: 10
    },
    height: {
      type: Number,
      required: !1,
      default: 5
    },
    rounded: {
      type: Boolean,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "svg"
    }
  },
  setup(e) {
    const t = e;
    return Ye(), (r, n) => (de(), ve(X(Rt), nt(t, {
      width: r.width,
      height: r.height,
      viewBox: r.asChild ? void 0 : "0 0 12 6",
      preserveAspectRatio: r.asChild ? void 0 : "none"
    }), {
      default: ge(() => [Pe(r.$slots, "default", {}, () => [r.rounded ? (de(), We("path", $y)) : (de(), We("path", Vy))])]),
      _: 3
    }, 16, [
      "width",
      "height",
      "viewBox",
      "preserveAspectRatio"
    ]));
  }
}), Wy = jy;
function Gy(e) {
  return e !== null;
}
function Ky(e) {
  return {
    name: "transformOrigin",
    options: e,
    fn(t) {
      var g, _, x;
      const { placement: r, rects: n, middlewareData: i } = t, a = ((g = i.arrow) == null ? void 0 : g.centerOffset) !== 0, s = a ? 0 : e.arrowWidth, l = a ? 0 : e.arrowHeight, [f, d] = ha(r), u = {
        start: e.dir === "rtl" ? "100%" : "0%",
        center: "50%",
        end: e.dir === "rtl" ? "0%" : "100%"
      }[d], h = {
        start: "0%",
        center: "50%",
        end: "100%"
      }[d], c = (((_ = i.arrow) == null ? void 0 : _.x) ?? 0) + s / 2, y = (((x = i.arrow) == null ? void 0 : x.y) ?? 0) + l / 2;
      let m = "", b = "";
      return f === "bottom" ? (m = a ? u : `${c}px`, b = `${-l}px`) : f === "top" ? (m = a ? u : `${c}px`, b = `${n.floating.height + l}px`) : f === "right" ? (m = `${-l}px`, b = a ? h : `${y}px`) : f === "left" && (m = `${n.floating.width + l}px`, b = a ? h : `${y}px`), { data: {
        x: m,
        y: b
      } };
    }
  };
}
function ha(e) {
  const [t, r = "center"] = e.split("-");
  return [t, r];
}
const Xy = ["top", "right", "bottom", "left"], Ir = Math.min, br = Math.max, Ui = Math.round, Ai = Math.floor, _r = (e) => ({
  x: e,
  y: e
}), Yy = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function Yu(e, t, r) {
  return br(e, Ir(t, r));
}
function Ar(e, t) {
  return typeof e == "function" ? e(t) : e;
}
function Lr(e) {
  return e.split("-")[0];
}
function Pn(e) {
  return e.split("-")[1];
}
function Ba(e) {
  return e === "x" ? "y" : "x";
}
function Fa(e) {
  return e === "y" ? "height" : "width";
}
function nr(e) {
  const t = e[0];
  return t === "t" || t === "b" ? "y" : "x";
}
function za(e) {
  return Ba(nr(e));
}
function Zy(e, t, r) {
  r === void 0 && (r = !1);
  const n = Pn(e), i = za(e), o = Fa(i);
  let a = i === "x" ? n === (r ? "end" : "start") ? "right" : "left" : n === "start" ? "bottom" : "top";
  return t.reference[o] > t.floating[o] && (a = Vi(a)), [a, Vi(a)];
}
function Qy(e) {
  const t = Vi(e);
  return [pa(e), t, pa(t)];
}
function pa(e) {
  return e.includes("start") ? e.replace("start", "end") : e.replace("end", "start");
}
const $s = ["left", "right"], js = ["right", "left"], Jy = ["top", "bottom"], ev = ["bottom", "top"];
function tv(e, t, r) {
  switch (e) {
    case "top":
    case "bottom":
      return r ? t ? js : $s : t ? $s : js;
    case "left":
    case "right":
      return t ? Jy : ev;
    default:
      return [];
  }
}
function rv(e, t, r, n) {
  const i = Pn(e);
  let o = tv(Lr(e), r === "start", n);
  return i && (o = o.map((a) => a + "-" + i), t && (o = o.concat(o.map(pa)))), o;
}
function Vi(e) {
  const t = Lr(e);
  return Yy[t] + e.slice(t.length);
}
function nv(e) {
  var t, r, n, i;
  return {
    top: (t = e.top) != null ? t : 0,
    right: (r = e.right) != null ? r : 0,
    bottom: (n = e.bottom) != null ? n : 0,
    left: (i = e.left) != null ? i : 0
  };
}
function Zu(e) {
  return typeof e != "number" ? nv(e) : {
    top: e,
    right: e,
    bottom: e,
    left: e
  };
}
function $i(e) {
  const {
    x: t,
    y: r,
    width: n,
    height: i
  } = e;
  return {
    width: n,
    height: i,
    top: r,
    left: t,
    right: t + n,
    bottom: r + i,
    x: t,
    y: r
  };
}
function Ws(e, t, r) {
  let {
    reference: n,
    floating: i
  } = e;
  const o = nr(t), a = za(t), s = Fa(a), l = Lr(t), f = o === "y", d = n.x + n.width / 2 - i.width / 2, u = n.y + n.height / 2 - i.height / 2, h = n[s] / 2 - i[s] / 2;
  let c;
  switch (l) {
    case "top":
      c = {
        x: d,
        y: n.y - i.height
      };
      break;
    case "bottom":
      c = {
        x: d,
        y: n.y + n.height
      };
      break;
    case "right":
      c = {
        x: n.x + n.width,
        y: u
      };
      break;
    case "left":
      c = {
        x: n.x - i.width,
        y: u
      };
      break;
    default:
      c = {
        x: n.x,
        y: n.y
      };
  }
  const y = Pn(t);
  return y && (c[a] += h * (y === "end" ? 1 : -1) * (r && f ? -1 : 1)), c;
}
async function iv(e, t) {
  var r;
  t === void 0 && (t = {});
  const {
    x: n,
    y: i,
    platform: o,
    rects: a,
    elements: s,
    strategy: l
  } = e, {
    boundary: f = "clippingAncestors",
    rootBoundary: d = "viewport",
    elementContext: u = "floating",
    altBoundary: h = !1,
    padding: c = 0
  } = Ar(t, e), y = Zu(c), b = s[h ? u === "floating" ? "reference" : "floating" : u], g = $i(await o.getClippingRect({
    element: (r = await (o.isElement == null ? void 0 : o.isElement(b))) == null || r ? b : b.contextElement || await (o.getDocumentElement == null ? void 0 : o.getDocumentElement(s.floating)),
    boundary: f,
    rootBoundary: d,
    strategy: l
  })), _ = u === "floating" ? {
    x: n,
    y: i,
    width: a.floating.width,
    height: a.floating.height
  } : a.reference, x = await (o.getOffsetParent == null ? void 0 : o.getOffsetParent(s.floating)), D = await (o.isElement == null ? void 0 : o.isElement(x)) && await (o.getScale == null ? void 0 : o.getScale(x)) || {
    x: 1,
    y: 1
  }, R = $i(o.convertOffsetParentRelativeRectToViewportRelativeRect ? await o.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: s,
    rect: _,
    offsetParent: x,
    strategy: l
  }) : _);
  return {
    top: (g.top - R.top + y.top) / D.y,
    bottom: (R.bottom - g.bottom + y.bottom) / D.y,
    left: (g.left - R.left + y.left) / D.x,
    right: (R.right - g.right + y.right) / D.x
  };
}
const ov = 50, av = async (e, t, r) => {
  const {
    placement: n = "bottom",
    strategy: i = "absolute",
    middleware: o = [],
    platform: a
  } = r, s = a.detectOverflow ? a : {
    ...a,
    detectOverflow: iv
  }, l = await (a.isRTL == null ? void 0 : a.isRTL(t));
  let f = await a.getElementRects({
    reference: e,
    floating: t,
    strategy: i
  }), {
    x: d,
    y: u
  } = Ws(f, n, l), h = n, c = 0;
  const y = {};
  for (let m = 0; m < o.length; m++) {
    const b = o[m];
    if (!b)
      continue;
    const {
      name: g,
      fn: _
    } = b, {
      x,
      y: D,
      data: R,
      reset: C
    } = await _({
      x: d,
      y: u,
      initialPlacement: n,
      placement: h,
      strategy: i,
      middlewareData: y,
      rects: f,
      platform: s,
      elements: {
        reference: e,
        floating: t
      }
    });
    d = x ?? d, u = D ?? u, y[g] = {
      ...y[g],
      ...R
    }, C && c < ov && (c++, typeof C == "object" && (C.placement && (h = C.placement), C.rects && (f = C.rects === !0 ? await a.getElementRects({
      reference: e,
      floating: t,
      strategy: i
    }) : C.rects), {
      x: d,
      y: u
    } = Ws(f, h, l)), m = -1);
  }
  return {
    x: d,
    y: u,
    placement: h,
    strategy: i,
    middlewareData: y
  };
}, sv = (e) => ({
  name: "arrow",
  options: e,
  async fn(t) {
    const {
      x: r,
      y: n,
      placement: i,
      rects: o,
      platform: a,
      elements: s,
      middlewareData: l
    } = t, {
      element: f,
      padding: d = 0
    } = Ar(e, t) || {};
    if (f == null)
      return {};
    const u = Zu(d), h = {
      x: r,
      y: n
    }, c = za(i), y = Fa(c), m = await a.getDimensions(f), b = c === "y", g = b ? "top" : "left", _ = b ? "bottom" : "right", x = b ? "clientHeight" : "clientWidth", D = o.reference[y] + o.reference[c] - h[c] - o.floating[y], R = h[c] - o.reference[c], C = await (a.getOffsetParent == null ? void 0 : a.getOffsetParent(f));
    let P = C ? C[x] : 0;
    (!P || !await (a.isElement == null ? void 0 : a.isElement(C))) && (P = s.floating[x] || o.floating[y]);
    const W = D / 2 - R / 2, j = P / 2 - m[y] / 2 - 1, oe = Ir(u[g], j), ue = Ir(u[_], j), B = P - m[y] - ue, Z = P / 2 - m[y] / 2 + W, w = Yu(oe, Z, B), E = !l.arrow && Pn(i) != null && Z !== w && o.reference[y] / 2 - (Z < oe ? oe : ue) - m[y] / 2 < 0, N = E ? Z < oe ? Z - oe : Z - B : 0;
    return {
      [c]: h[c] + N,
      data: {
        [c]: w,
        centerOffset: Z - w - N,
        ...E && {
          alignmentOffset: N
        }
      },
      reset: E
    };
  }
}), lv = function(e) {
  return e === void 0 && (e = {}), {
    name: "flip",
    options: e,
    async fn(t) {
      var r, n;
      const {
        placement: i,
        middlewareData: o,
        rects: a,
        initialPlacement: s,
        platform: l,
        elements: f
      } = t, {
        mainAxis: d = !0,
        crossAxis: u = !0,
        fallbackPlacements: h,
        fallbackStrategy: c = "bestFit",
        fallbackAxisSideDirection: y = "none",
        flipAlignment: m = !0,
        ...b
      } = Ar(e, t);
      if ((r = o.arrow) != null && r.alignmentOffset)
        return {};
      const g = Lr(i), _ = nr(s), x = Lr(s) === s, D = await (l.isRTL == null ? void 0 : l.isRTL(f.floating)), R = h || (x || !m ? [Vi(s)] : Qy(s)), C = y !== "none";
      !h && C && R.push(...rv(s, m, y, D));
      const P = [s, ...R], W = await l.detectOverflow(t, b), j = [];
      let oe = ((n = o.flip) == null ? void 0 : n.overflows) || [];
      if (d && j.push(W[g]), u) {
        const w = Zy(i, a, D);
        j.push(W[w[0]], W[w[1]]);
      }
      if (oe = [...oe, {
        placement: i,
        overflows: j
      }], !j.every((w) => w <= 0)) {
        var ue, B;
        const w = (((ue = o.flip) == null ? void 0 : ue.index) || 0) + 1, E = P[w];
        if (E && (!(u === "alignment" ? _ !== nr(E) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        oe.every((F) => nr(F.placement) === _ ? F.overflows[0] > 0 : !0)))
          return {
            data: {
              index: w,
              overflows: oe
            },
            reset: {
              placement: E
            }
          };
        let N = (B = oe.filter((L) => L.overflows[0] <= 0).sort((L, F) => L.overflows[1] - F.overflows[1])[0]) == null ? void 0 : B.placement;
        if (!N)
          switch (c) {
            case "bestFit": {
              var Z;
              const L = (Z = oe.filter((F) => {
                if (C) {
                  const Y = nr(F.placement);
                  return Y === _ || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  Y === "y";
                }
                return !0;
              }).map((F) => [F.placement, F.overflows.filter((Y) => Y > 0).reduce((Y, ee) => Y + ee, 0)]).sort((F, Y) => F[1] - Y[1])[0]) == null ? void 0 : Z[0];
              L && (N = L);
              break;
            }
            case "initialPlacement":
              N = s;
              break;
          }
        if (i !== N)
          return {
            reset: {
              placement: N
            }
          };
      }
      return {};
    }
  };
};
function Gs(e, t) {
  return {
    top: e.top - t.height,
    right: e.right - t.width,
    bottom: e.bottom - t.height,
    left: e.left - t.width
  };
}
function Ks(e) {
  return Xy.some((t) => e[t] >= 0);
}
const uv = function(e) {
  return e === void 0 && (e = {}), {
    name: "hide",
    options: e,
    async fn(t) {
      const {
        rects: r,
        platform: n
      } = t, {
        strategy: i = "referenceHidden",
        ...o
      } = Ar(e, t);
      switch (i) {
        case "referenceHidden": {
          const a = await n.detectOverflow(t, {
            ...o,
            elementContext: "reference"
          }), s = Gs(a, r.reference);
          return {
            data: {
              referenceHiddenOffsets: s,
              referenceHidden: Ks(s)
            }
          };
        }
        case "escaped": {
          const a = await n.detectOverflow(t, {
            ...o,
            altBoundary: !0
          }), s = Gs(a, r.floating);
          return {
            data: {
              escapedOffsets: s,
              escaped: Ks(s)
            }
          };
        }
        default:
          return {};
      }
    }
  };
}, Qu = /* @__PURE__ */ new Set(["left", "top"]);
async function cv(e, t) {
  const {
    placement: r,
    platform: n,
    elements: i
  } = e, o = await (n.isRTL == null ? void 0 : n.isRTL(i.floating)), a = Lr(r), s = Pn(r), l = nr(r) === "y", f = Qu.has(a) ? -1 : 1, d = o && l ? -1 : 1, u = Ar(t, e);
  let {
    mainAxis: h,
    crossAxis: c,
    alignmentAxis: y
  } = typeof u == "number" ? {
    mainAxis: u,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: u.mainAxis || 0,
    crossAxis: u.crossAxis || 0,
    alignmentAxis: u.alignmentAxis
  };
  return s && typeof y == "number" && (c = s === "end" ? y * -1 : y), l ? {
    x: c * d,
    y: h * f
  } : {
    x: h * f,
    y: c * d
  };
}
const dv = function(e) {
  return e === void 0 && (e = 0), {
    name: "offset",
    options: e,
    async fn(t) {
      var r, n;
      const {
        x: i,
        y: o,
        placement: a,
        middlewareData: s
      } = t, l = await cv(t, e);
      return a === ((r = s.offset) == null ? void 0 : r.placement) && (n = s.arrow) != null && n.alignmentOffset ? {} : {
        x: i + l.x,
        y: o + l.y,
        data: {
          ...l,
          placement: a
        }
      };
    }
  };
}, fv = function(e) {
  return e === void 0 && (e = {}), {
    name: "shift",
    options: e,
    async fn(t) {
      const {
        x: r,
        y: n,
        placement: i,
        platform: o
      } = t, {
        mainAxis: a = !0,
        crossAxis: s = !1,
        limiter: l = {
          fn: (_) => {
            let {
              x,
              y: D
            } = _;
            return {
              x,
              y: D
            };
          }
        },
        ...f
      } = Ar(e, t), d = {
        x: r,
        y: n
      }, u = await o.detectOverflow(t, f), h = nr(i), c = Ba(h);
      let y = d[c], m = d[h];
      const b = (_, x) => Yu(x + u[_ === "y" ? "top" : "left"], x, x - u[_ === "y" ? "bottom" : "right"]);
      a && (y = b(c, y)), s && (m = b(h, m));
      const g = l.fn({
        ...t,
        [c]: y,
        [h]: m
      });
      return {
        ...g,
        data: {
          x: g.x - r,
          y: g.y - n,
          enabled: {
            [c]: a,
            [h]: s
          }
        }
      };
    }
  };
}, hv = function(e) {
  return e === void 0 && (e = {}), {
    options: e,
    fn(t) {
      var r, n;
      const {
        x: i,
        y: o,
        placement: a,
        rects: s,
        middlewareData: l
      } = t, {
        offset: f = 0,
        mainAxis: d = !0,
        crossAxis: u = !0
      } = Ar(e, t), h = {
        x: i,
        y: o
      }, c = nr(a), y = Ba(c);
      let m = h[y], b = h[c];
      const g = Ar(f, t), _ = typeof g == "number" ? {
        mainAxis: g,
        crossAxis: 0
      } : {
        mainAxis: (r = g.mainAxis) != null ? r : 0,
        crossAxis: (n = g.crossAxis) != null ? n : 0
      };
      if (d) {
        const R = y === "y" ? "height" : "width", C = s.reference[y] - s.floating[R] + _.mainAxis, P = s.reference[y] + s.reference[R] - _.mainAxis;
        m < C ? m = C : m > P && (m = P);
      }
      if (u) {
        var x, D;
        const R = y === "y" ? "width" : "height", C = Qu.has(Lr(a)), P = s.reference[c] - s.floating[R] + (C && ((x = l.offset) == null ? void 0 : x[c]) || 0) + (C ? 0 : _.crossAxis), W = s.reference[c] + s.reference[R] + (C ? 0 : ((D = l.offset) == null ? void 0 : D[c]) || 0) - (C ? _.crossAxis : 0);
        b < P ? b = P : b > W && (b = W);
      }
      return {
        [y]: m,
        [c]: b
      };
    }
  };
}, pv = function(e) {
  return e === void 0 && (e = {}), {
    name: "size",
    options: e,
    async fn(t) {
      const {
        placement: r,
        rects: n,
        platform: i,
        elements: o
      } = t, {
        apply: a = () => {
        },
        ...s
      } = Ar(e, t), l = await i.detectOverflow(t, s), f = Lr(r), d = Pn(r), u = nr(r) === "y", {
        width: h,
        height: c
      } = n.floating;
      let y, m;
      f === "top" || f === "bottom" ? (y = f, m = d === (await (i.isRTL == null ? void 0 : i.isRTL(o.floating)) ? "start" : "end") ? "left" : "right") : (m = f, y = d === "end" ? "top" : "bottom");
      const b = c - l.top - l.bottom, g = h - l.left - l.right, _ = Ir(c - l[y], b), x = Ir(h - l[m], g), D = t.middlewareData.shift, R = !D;
      let C = _, P = x;
      D != null && D.enabled.x && (P = g), D != null && D.enabled.y && (C = b), R && !d && (u ? P = h - 2 * br(l.left, l.right) : C = c - 2 * br(l.top, l.bottom)), await a({
        ...t,
        availableWidth: P,
        availableHeight: C
      });
      const W = await i.getDimensions(o.floating);
      return h !== W.width || c !== W.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function co() {
  return typeof window < "u";
}
function sn(e) {
  return qa(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function Tt(e) {
  var t;
  return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function Dr(e) {
  var t;
  return (t = (qa(e) ? e.ownerDocument : e.document) || window.document) == null ? void 0 : t.documentElement;
}
function qa(e) {
  return co() ? e instanceof Node || e instanceof Tt(e).Node : !1;
}
function lr(e) {
  return co() ? e instanceof Element || e instanceof Tt(e).Element : !1;
}
function Br(e) {
  return co() ? e instanceof HTMLElement || e instanceof Tt(e).HTMLElement : !1;
}
function Xs(e) {
  return !co() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof Tt(e).ShadowRoot;
}
function fo(e) {
  const {
    overflow: t,
    overflowX: r,
    overflowY: n,
    display: i
  } = ur(e);
  return /auto|scroll|overlay|hidden|clip/.test(t + n + r) && i !== "inline" && i !== "contents";
}
function mv(e) {
  return /^(table|td|th)$/.test(sn(e));
}
function ho(e) {
  try {
    if (e.matches(":popover-open"))
      return !0;
  } catch {
  }
  try {
    return e.matches(":modal");
  } catch {
    return !1;
  }
}
const gv = /transform|translate|scale|rotate|perspective|filter/, yv = /paint|layout|strict|content/, jr = (e) => !!e && e !== "none";
let Vo;
function Ha(e) {
  const t = lr(e) ? ur(e) : e;
  return jr(t.transform) || jr(t.translate) || jr(t.scale) || jr(t.rotate) || jr(t.perspective) || !Ua() && (jr(t.backdropFilter) || jr(t.filter)) || gv.test(t.willChange || "") || yv.test(t.contain || "");
}
function vv(e) {
  let t = tn(e);
  for (; Br(t) && !ii(t); ) {
    if (Ha(t))
      return t;
    if (ho(t))
      return null;
    t = tn(t);
  }
  return null;
}
function Ua() {
  return Vo == null && (Vo = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), Vo;
}
function ii(e) {
  return /^(html|body|#document)$/.test(sn(e));
}
function ur(e) {
  return Tt(e).getComputedStyle(e);
}
function po(e) {
  return lr(e) ? {
    scrollLeft: e.scrollLeft,
    scrollTop: e.scrollTop
  } : {
    scrollLeft: e.scrollX,
    scrollTop: e.scrollY
  };
}
function tn(e) {
  if (sn(e) === "html")
    return e;
  const t = (
    // Step into the shadow DOM of the parent of a slotted node.
    e.assignedSlot || // DOM Element detected.
    e.parentNode || // ShadowRoot detected.
    Xs(e) && e.host || // Fallback.
    Dr(e)
  );
  return Xs(t) ? t.host : t;
}
function Ju(e) {
  const t = tn(e);
  return ii(t) ? (e.ownerDocument || e).body : Br(t) && fo(t) ? t : Ju(t);
}
function oi(e, t, r) {
  var n;
  t === void 0 && (t = []), r === void 0 && (r = !0);
  const i = Ju(e), o = i === ((n = e.ownerDocument) == null ? void 0 : n.body), a = Tt(i);
  if (o) {
    const s = ma(a);
    return t.concat(a, a.visualViewport || [], fo(i) ? i : [], s && r ? oi(s) : []);
  } else
    return t.concat(i, oi(i, [], r));
}
function ma(e) {
  return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
function ec(e) {
  const t = ur(e);
  let r = parseFloat(t.width) || 0, n = parseFloat(t.height) || 0;
  const i = Br(e), o = i ? e.offsetWidth : r, a = i ? e.offsetHeight : n, s = Ui(r) !== o || Ui(n) !== a;
  return s && (r = o, n = a), {
    width: r,
    height: n,
    $: s
  };
}
function Va(e) {
  return lr(e) ? e : e.contextElement;
}
function En(e) {
  const t = Va(e);
  if (!Br(t))
    return _r(1);
  const r = t.getBoundingClientRect(), {
    width: n,
    height: i,
    $: o
  } = ec(t);
  let a = (o ? Ui(r.width) : r.width) / n, s = (o ? Ui(r.height) : r.height) / i;
  return (!a || !Number.isFinite(a)) && (a = 1), (!s || !Number.isFinite(s)) && (s = 1), {
    x: a,
    y: s
  };
}
const bv = /* @__PURE__ */ _r(0);
function tc(e) {
  const t = Tt(e);
  return !Ua() || !t.visualViewport ? bv : {
    x: t.visualViewport.offsetLeft,
    y: t.visualViewport.offsetTop
  };
}
function _v(e, t, r) {
  return t === void 0 && (t = !1), !!r && t && r === Tt(e);
}
function rn(e, t, r, n) {
  t === void 0 && (t = !1), r === void 0 && (r = !1);
  const i = e.getBoundingClientRect(), o = Va(e);
  let a = _r(1);
  t && (n ? lr(n) && (a = En(n)) : a = En(e));
  const s = _v(o, r, n) ? tc(o) : _r(0);
  let l = (i.left + s.x) / a.x, f = (i.top + s.y) / a.y, d = i.width / a.x, u = i.height / a.y;
  if (o && n) {
    const h = Tt(o), c = lr(n) ? Tt(n) : n;
    let y = h, m = ma(y);
    for (; m && c !== y; ) {
      const b = En(m), g = m.getBoundingClientRect(), _ = ur(m), x = g.left + (m.clientLeft + parseFloat(_.paddingLeft)) * b.x, D = g.top + (m.clientTop + parseFloat(_.paddingTop)) * b.y;
      l *= b.x, f *= b.y, d *= b.x, u *= b.y, l += x, f += D, y = Tt(m), m = ma(y);
    }
  }
  return $i({
    width: d,
    height: u,
    x: l,
    y: f
  });
}
function mo(e, t) {
  const r = po(e).scrollLeft;
  return t ? t.left + r : rn(Dr(e)).left + r;
}
function rc(e, t) {
  const r = e.getBoundingClientRect(), n = r.left + t.scrollLeft - mo(e, r), i = r.top + t.scrollTop;
  return {
    x: n,
    y: i
  };
}
function wv(e) {
  let {
    elements: t,
    rect: r,
    offsetParent: n,
    strategy: i
  } = e;
  const o = i === "fixed", a = Dr(n), s = t ? ho(t.floating) : !1;
  if (n === a || s && o)
    return r;
  let l = {
    scrollLeft: 0,
    scrollTop: 0
  }, f = _r(1);
  const d = _r(0), u = Br(n);
  if ((u || !o) && ((sn(n) !== "body" || fo(a)) && (l = po(n)), u)) {
    const c = rn(n);
    f = En(n), d.x = c.x + n.clientLeft, d.y = c.y + n.clientTop;
  }
  const h = a && !u && !o ? rc(a, l) : _r(0);
  return {
    width: r.width * f.x,
    height: r.height * f.y,
    x: r.x * f.x - l.scrollLeft * f.x + d.x + h.x,
    y: r.y * f.y - l.scrollTop * f.y + d.y + h.y
  };
}
function kv(e) {
  return e.getClientRects ? Array.from(e.getClientRects()) : [];
}
function Mv(e) {
  const t = po(e), r = e.ownerDocument.body, n = br(e.scrollWidth, e.clientWidth, r.scrollWidth, r.clientWidth), i = br(e.scrollHeight, e.clientHeight, r.scrollHeight, r.clientHeight);
  let o = -t.scrollLeft + mo(e);
  const a = -t.scrollTop;
  return ur(r).direction === "rtl" && (o += br(e.clientWidth, r.clientWidth) - n), {
    width: n,
    height: i,
    x: o,
    y: a
  };
}
const Av = 25;
function Ev(e, t, r) {
  r === void 0 && (r = "viewport");
  const n = r === "layoutViewport", i = Tt(e), o = Dr(e), a = i.visualViewport;
  let s = o.clientWidth, l = o.clientHeight, f = 0, d = 0;
  if (a) {
    const h = !Ua() || t === "fixed";
    n ? h || (f = -a.offsetLeft, d = -a.offsetTop) : (s = a.width, l = a.height, h && (f = a.offsetLeft, d = a.offsetTop));
  }
  if (mo(o) <= 0) {
    const h = o.ownerDocument, c = h.body, y = getComputedStyle(c), m = h.compatMode === "CSS1Compat" && parseFloat(y.marginLeft) + parseFloat(y.marginRight) || 0, b = Math.abs(o.clientWidth - c.clientWidth - m), g = getComputedStyle(o).scrollbarGutter === "stable both-edges" ? b / 2 : b;
    g <= Av && (s -= g);
  }
  return {
    width: s,
    height: l,
    x: f,
    y: d
  };
}
function xv(e, t) {
  const r = rn(e, !0, t === "fixed"), n = r.top + e.clientTop, i = r.left + e.clientLeft, o = En(e), a = e.clientWidth * o.x, s = e.clientHeight * o.y, l = i * o.x, f = n * o.y;
  return {
    width: a,
    height: s,
    x: l,
    y: f
  };
}
function Ys(e, t, r) {
  let n;
  if (t === "viewport" || t === "layoutViewport")
    n = Ev(e, r, t);
  else if (t === "document")
    n = Mv(Dr(e));
  else if (lr(t))
    n = xv(t, r);
  else {
    const i = tc(e);
    n = {
      x: t.x - i.x,
      y: t.y - i.y,
      width: t.width,
      height: t.height
    };
  }
  return $i(n);
}
function Dv(e, t) {
  const r = t.get(e);
  if (r)
    return r;
  let n = oi(e, [], !1).filter((s) => lr(s) && sn(s) !== "body"), i = null;
  const o = ur(e).position === "fixed";
  let a = o ? tn(e) : e;
  for (; lr(a) && !ii(a); ) {
    const s = ur(a), l = Ha(a), f = i ? i.position : o ? "fixed" : "";
    !l && (f === "fixed" || f === "absolute" && s.position === "static") ? n = n.filter((u) => u !== a) : i = s, a = tn(a);
  }
  return t.set(e, n), n;
}
function Cv(e) {
  let {
    element: t,
    boundary: r,
    rootBoundary: n,
    strategy: i
  } = e;
  const a = [...r === "clippingAncestors" ? ho(t) ? [] : Dv(t, this._c) : [].concat(r), n], s = Ys(t, a[0], i);
  let l = s.top, f = s.right, d = s.bottom, u = s.left;
  for (let h = 1; h < a.length; h++) {
    const c = Ys(t, a[h], i);
    l = br(c.top, l), f = Ir(c.right, f), d = Ir(c.bottom, d), u = br(c.left, u);
  }
  return {
    width: f - u,
    height: d - l,
    x: u,
    y: l
  };
}
function Sv(e) {
  const {
    width: t,
    height: r
  } = ec(e);
  return {
    width: t,
    height: r
  };
}
function Tv(e, t, r) {
  const n = Br(t), i = Dr(t), o = r === "fixed", a = rn(e, !0, o, t);
  let s = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const l = _r(0);
  if ((n || !o) && ((sn(t) !== "body" || fo(i)) && (s = po(t)), n)) {
    const h = rn(t, !0, o, t);
    l.x = h.x + t.clientLeft, l.y = h.y + t.clientTop;
  }
  !n && i && (l.x = mo(i));
  const f = i && !n && !o ? rc(i, s) : _r(0), d = a.left + s.scrollLeft - l.x - f.x, u = a.top + s.scrollTop - l.y - f.y;
  return {
    x: d,
    y: u,
    width: a.width,
    height: a.height
  };
}
function $o(e) {
  return ur(e).position === "static";
}
function Zs(e, t) {
  if (!Br(e) || ur(e).position === "fixed")
    return null;
  if (t)
    return t(e);
  let r = e.offsetParent;
  return Dr(e) === r && (r = r.ownerDocument.body), r;
}
function nc(e, t) {
  const r = Tt(e);
  if (ho(e))
    return r;
  if (!Br(e)) {
    let i = tn(e);
    for (; i && !ii(i); ) {
      if (lr(i) && !$o(i))
        return i;
      i = tn(i);
    }
    return r;
  }
  let n = Zs(e, t);
  for (; n && mv(n) && $o(n); )
    n = Zs(n, t);
  return n && ii(n) && $o(n) && !Ha(n) ? r : n || vv(e) || r;
}
const Nv = async function(e) {
  const t = this.getOffsetParent || nc, r = this.getDimensions, n = await r(e.floating);
  return {
    reference: Tv(e.reference, await t(e.floating), e.strategy),
    floating: {
      x: 0,
      y: 0,
      width: n.width,
      height: n.height
    }
  };
};
function Ov(e) {
  return ur(e).direction === "rtl";
}
const Pv = {
  convertOffsetParentRelativeRectToViewportRelativeRect: wv,
  getDocumentElement: Dr,
  getClippingRect: Cv,
  getOffsetParent: nc,
  getElementRects: Nv,
  getClientRects: kv,
  getDimensions: Sv,
  getScale: En,
  isElement: lr,
  isRTL: Ov
};
function ic(e, t) {
  return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function Iv(e, t, r) {
  let n = null, i;
  const o = Dr(e);
  function a() {
    var d;
    clearTimeout(i), (d = n) == null || d.disconnect(), n = null;
  }
  function s(d, u) {
    d === void 0 && (d = !1), u === void 0 && (u = 1), a();
    const h = e.getBoundingClientRect(), {
      left: c,
      top: y,
      width: m,
      height: b
    } = h;
    if (d || t(), !m || !b)
      return;
    const g = Ai(y), _ = Ai(o.clientWidth - (c + m)), x = Ai(o.clientHeight - (y + b)), D = Ai(c), C = {
      rootMargin: -g + "px " + -_ + "px " + -x + "px " + -D + "px",
      threshold: br(0, Ir(1, u)) || 1
    };
    let P = !0;
    function W(j) {
      const oe = j[0].intersectionRatio;
      if (!ic(h, e.getBoundingClientRect()))
        return s();
      if (oe !== u) {
        if (!P)
          return s();
        oe ? s(!1, oe) : i = setTimeout(() => {
          s(!1, 1e-7);
        }, 1e3);
      }
      P = !1;
    }
    try {
      n = new IntersectionObserver(W, {
        ...C,
        // Handle <iframe>s
        root: o.ownerDocument
      });
    } catch {
      n = new IntersectionObserver(W, C);
    }
    n.observe(e);
  }
  const l = Tt(e), f = () => s(r);
  return l.addEventListener("resize", f), s(!0), () => {
    l.removeEventListener("resize", f), a();
  };
}
function Lv(e, t, r, n) {
  n === void 0 && (n = {});
  const {
    ancestorScroll: i = !0,
    ancestorResize: o = !0,
    elementResize: a = typeof ResizeObserver == "function",
    layoutShift: s = typeof IntersectionObserver == "function",
    animationFrame: l = !1
  } = n, f = Va(e), d = i || o ? [...f ? oi(f) : [], ...t ? oi(t) : []] : [];
  d.forEach((g) => {
    i && g.addEventListener("scroll", r), o && g.addEventListener("resize", r);
  });
  const u = f && s ? Iv(f, r, o) : null;
  let h = -1, c = null;
  a && (c = new ResizeObserver((g) => {
    let [_] = g;
    _ && _.target === f && c && t && (c.unobserve(t), cancelAnimationFrame(h), h = requestAnimationFrame(() => {
      var x;
      (x = c) == null || x.observe(t);
    })), r();
  }), f && !l && c.observe(f), t && c.observe(t));
  let y, m = l ? rn(e) : null;
  l && b();
  function b() {
    const g = rn(e);
    m && !ic(m, g) && r(), m = g, y = requestAnimationFrame(b);
  }
  return r(), () => {
    var g;
    d.forEach((_) => {
      i && _.removeEventListener("scroll", r), o && _.removeEventListener("resize", r);
    }), u == null || u(), (g = c) == null || g.disconnect(), c = null, l && cancelAnimationFrame(y);
  };
}
const Rv = dv, Bv = fv, Qs = lv, Fv = pv, zv = uv, qv = sv, Hv = hv, Uv = (e, t, r) => {
  const n = /* @__PURE__ */ new Map(), i = r ?? {}, o = {
    ...Pv,
    ...i.platform,
    _c: n
  };
  return av(e, t, {
    ...i,
    platform: o
  });
};
function Vv(e) {
  return e != null && typeof e == "object" && "$el" in e;
}
function ga(e) {
  if (Vv(e)) {
    const t = e.$el;
    return qa(t) && sn(t) === "#comment" ? null : t;
  }
  return e;
}
function vn(e) {
  return typeof e == "function" ? e() : X(e);
}
function $v(e) {
  return {
    name: "arrow",
    options: e,
    fn(t) {
      const r = ga(vn(e.element));
      return r == null ? {} : qv({
        element: r,
        padding: e.padding
      }).fn(t);
    }
  };
}
function oc(e) {
  return typeof window > "u" ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function Js(e, t) {
  const r = oc(e);
  return Math.round(t * r) / r;
}
function jv(e, t, r) {
  r === void 0 && (r = {});
  const n = r.whileElementsMounted, i = be(() => {
    var P;
    return (P = vn(r.open)) != null ? P : !0;
  }), o = be(() => vn(r.middleware)), a = be(() => {
    var P;
    return (P = vn(r.placement)) != null ? P : "bottom";
  }), s = be(() => {
    var P;
    return (P = vn(r.strategy)) != null ? P : "absolute";
  }), l = be(() => {
    var P;
    return (P = vn(r.transform)) != null ? P : !0;
  }), f = be(() => ga(e.value)), d = be(() => ga(t.value)), u = /* @__PURE__ */ _e(0), h = /* @__PURE__ */ _e(0), c = /* @__PURE__ */ _e(s.value), y = /* @__PURE__ */ _e(a.value), m = /* @__PURE__ */ to({}), b = /* @__PURE__ */ _e(!1), g = be(() => {
    const P = {
      position: c.value,
      left: "0",
      top: "0"
    };
    if (!d.value)
      return P;
    const W = Js(d.value, u.value), j = Js(d.value, h.value);
    return l.value ? {
      ...P,
      transform: "translate(" + W + "px, " + j + "px)",
      ...oc(d.value) >= 1.5 && {
        willChange: "transform"
      }
    } : {
      position: c.value,
      left: W + "px",
      top: j + "px"
    };
  });
  let _;
  function x() {
    if (f.value == null || d.value == null)
      return;
    const P = i.value;
    Uv(f.value, d.value, {
      middleware: o.value,
      placement: a.value,
      strategy: s.value
    }).then((W) => {
      u.value = W.x, h.value = W.y, c.value = W.strategy, y.value = W.placement, m.value = W.middlewareData, b.value = P !== !1;
    });
  }
  function D() {
    typeof _ == "function" && (_(), _ = void 0);
  }
  function R() {
    if (D(), n === void 0) {
      x();
      return;
    }
    if (f.value != null && d.value != null) {
      _ = n(f.value, d.value, x);
      return;
    }
  }
  function C() {
    i.value || (b.value = !1);
  }
  return tt([o, a, s, i], x, {
    flush: "sync"
  }), tt([f, d], R, {
    flush: "sync"
  }), tt(i, C, {
    flush: "sync"
  }), _a() && xl(D), {
    x: /* @__PURE__ */ Gr(u),
    y: /* @__PURE__ */ Gr(h),
    strategy: /* @__PURE__ */ Gr(c),
    placement: /* @__PURE__ */ Gr(y),
    middlewareData: /* @__PURE__ */ Gr(m),
    isPositioned: /* @__PURE__ */ Gr(b),
    floatingStyles: g,
    update: x
  };
}
const Wv = ["dir"], ac = {
  side: "bottom",
  sideOffset: 0,
  sideFlip: !0,
  align: "center",
  alignOffset: 0,
  alignFlip: !0,
  arrowPadding: 0,
  hideShiftedArrow: !0,
  avoidCollisions: !0,
  collisionBoundary: () => [],
  collisionPadding: 0,
  sticky: "partial",
  hideWhenDetached: !1,
  positionStrategy: "fixed",
  updatePositionStrategy: "optimized",
  prioritizePosition: !1
}, [Gv, Kv] = /* @__PURE__ */ Gt("PopperContent");
var Xv = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "PopperContent",
  props: /* @__PURE__ */ cu({
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    dir: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  }, { ...ac }),
  emits: ["placed"],
  setup(e, { emit: t }) {
    const r = e, n = t, i = Ku(), { forwardRef: o, currentElement: a } = Ye(), s = uo(be(() => r.dir)), l = /* @__PURE__ */ _e(), f = /* @__PURE__ */ _e(), { width: d, height: u } = ay(f), h = be(() => r.side + (r.align !== "center" ? `-${r.align}` : "")), c = be(() => typeof r.collisionPadding == "number" ? r.collisionPadding : {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...r.collisionPadding
    }), y = be(() => Array.isArray(r.collisionBoundary) ? r.collisionBoundary : [r.collisionBoundary]), m = be(() => ({
      padding: c.value,
      boundary: y.value.filter(Gy),
      altBoundary: y.value.length > 0
    })), b = be(() => ({
      mainAxis: r.sideFlip,
      crossAxis: r.alignFlip
    })), g = be(() => [
      Rv({
        mainAxis: r.sideOffset + u.value,
        alignmentAxis: r.alignOffset
      }),
      r.prioritizePosition && r.avoidCollisions && Qs({
        ...m.value,
        ...b.value
      }),
      r.avoidCollisions && Bv({
        mainAxis: !0,
        crossAxis: !!r.prioritizePosition,
        limiter: r.sticky === "partial" ? Hv() : void 0,
        ...m.value
      }),
      !r.prioritizePosition && r.avoidCollisions && Qs({
        ...m.value,
        ...b.value
      }),
      Fv({
        ...m.value,
        apply: ({ elements: Z, rects: w, availableWidth: E, availableHeight: N }) => {
          const { width: L, height: F } = w.reference, Y = Z.floating.style;
          Y.setProperty("--reka-popper-available-width", `${E}px`), Y.setProperty("--reka-popper-available-height", `${N}px`), Y.setProperty("--reka-popper-anchor-width", `${L}px`), Y.setProperty("--reka-popper-anchor-height", `${F}px`);
        }
      }),
      f.value && $v({
        element: f.value,
        padding: r.arrowPadding
      }),
      Ky({
        arrowWidth: d.value,
        arrowHeight: u.value,
        dir: s.value
      }),
      r.hideWhenDetached && zv({
        strategy: "referenceHidden",
        ...m.value
      })
    ]), _ = be(() => r.reference ?? i.anchor.value), { floatingStyles: x, placement: D, isPositioned: R, middlewareData: C } = jv(_, l, {
      strategy: r.positionStrategy,
      placement: h,
      whileElementsMounted: (...Z) => Lv(...Z, {
        layoutShift: !r.disableUpdateOnLayoutShift,
        animationFrame: r.updatePositionStrategy === "always"
      }),
      middleware: g
    }), P = be(() => ha(D.value)[0]), W = be(() => ha(D.value)[1]);
    Jl(() => {
      R.value && n("placed");
    });
    const j = be(() => {
      var w;
      const Z = ((w = C.value.arrow) == null ? void 0 : w.centerOffset) !== 0;
      return r.hideShiftedArrow && Z;
    }), oe = /* @__PURE__ */ _e("");
    jt(() => {
      a.value && (oe.value = window.getComputedStyle(a.value).zIndex);
    });
    const ue = be(() => {
      var Z;
      return ((Z = C.value.arrow) == null ? void 0 : Z.x) ?? 0;
    }), B = be(() => {
      var Z;
      return ((Z = C.value.arrow) == null ? void 0 : Z.y) ?? 0;
    });
    return Kv({
      placedSide: P,
      onArrowChange: (Z) => f.value = Z,
      arrowX: ue,
      arrowY: B,
      shouldHideArrow: j
    }), (Z, w) => {
      var E, N, L;
      return de(), We("div", {
        ref_key: "floatingRef",
        ref: l,
        "data-reka-popper-content-wrapper": "",
        dir: X(s),
        style: at({
          ...X(x),
          transform: X(R) ? X(x).transform : "translate(0, -200%)",
          minWidth: "max-content",
          zIndex: oe.value,
          "--reka-popper-transform-origin": [(E = X(C).transformOrigin) == null ? void 0 : E.x, (N = X(C).transformOrigin) == null ? void 0 : N.y].join(" "),
          ...((L = X(C).hide) == null ? void 0 : L.referenceHidden) && {
            visibility: "hidden",
            pointerEvents: "none"
          }
        })
      }, [r.memoDependencies ? Cf([
        r.asChild,
        r.as,
        P.value,
        W.value,
        X(R),
        ...Object.values(Z.$attrs),
        ...r.memoDependencies
      ], () => (de(), ve(X(Rt), nt({
        key: 0,
        ref: X(o)
      }, Z.$attrs, {
        "as-child": r.asChild,
        as: r.as,
        "data-side": P.value,
        "data-align": W.value,
        style: { animation: X(R) ? void 0 : "none" }
      }), {
        default: ge(() => [Pe(Z.$slots, "default")]),
        _: 3
      }, 16, [
        "as-child",
        "as",
        "data-side",
        "data-align",
        "style"
      ])), w, 0) : (de(), ve(X(Rt), nt({
        key: 1,
        ref: X(o)
      }, Z.$attrs, {
        "as-child": r.asChild,
        as: r.as,
        "data-side": P.value,
        "data-align": W.value,
        dir: X(s),
        style: { animation: X(R) ? void 0 : "none" }
      }), {
        default: ge(() => [Pe(Z.$slots, "default")]),
        _: 3
      }, 16, [
        "as-child",
        "as",
        "data-side",
        "data-align",
        "dir",
        "style"
      ]))], 12, Wv);
    };
  }
}), sc = Xv;
const Yv = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right"
};
var Zv = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "PopperArrow",
  props: {
    width: {
      type: Number,
      required: !1
    },
    height: {
      type: Number,
      required: !1
    },
    rounded: {
      type: Boolean,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "svg"
    }
  },
  setup(e) {
    const { forwardRef: t } = Ye(), r = Gv(), n = be(() => Yv[r.placedSide.value]);
    return (i, o) => {
      var a, s, l, f;
      return de(), We("span", {
        ref: (d) => {
          X(r).onArrowChange(d ?? void 0);
        },
        style: at({
          position: "absolute",
          left: (a = X(r).arrowX) != null && a.value ? `${(s = X(r).arrowX) == null ? void 0 : s.value}px` : void 0,
          top: (l = X(r).arrowY) != null && l.value ? `${(f = X(r).arrowY) == null ? void 0 : f.value}px` : void 0,
          [n.value]: 0,
          transformOrigin: {
            top: "",
            right: "0 0",
            bottom: "center 0",
            left: "100% 0"
          }[X(r).placedSide.value],
          transform: {
            top: "translateY(100%)",
            right: "translateY(50%) rotate(90deg) translateX(-50%)",
            bottom: "rotate(180deg)",
            left: "translateY(50%) rotate(-90deg) translateX(50%)"
          }[X(r).placedSide.value],
          visibility: X(r).shouldHideArrow.value ? "hidden" : void 0
        })
      }, [Ie(Wy, nt(i.$attrs, {
        ref: X(t),
        style: { display: "block" },
        as: i.as,
        "as-child": i.asChild,
        rounded: i.rounded,
        width: i.width,
        height: i.height
      }), {
        default: ge(() => [Pe(i.$slots, "default")]),
        _: 3
      }, 16, [
        "as",
        "as-child",
        "rounded",
        "width",
        "height"
      ])], 4);
    };
  }
}), Qv = Zv;
const [r5, Jv] = /* @__PURE__ */ Gt("RovingFocusGroup");
var eb = /* @__PURE__ */ Ee({
  __name: "RovingFocusGroup",
  props: {
    orientation: {
      type: String,
      required: !1,
      default: void 0
    },
    dir: {
      type: String,
      required: !1
    },
    loop: {
      type: Boolean,
      required: !1,
      default: !1
    },
    currentTabStopId: {
      type: [String, null],
      required: !1
    },
    defaultCurrentTabStopId: {
      type: String,
      required: !1
    },
    preventScrollOnEntryFocus: {
      type: Boolean,
      required: !1,
      default: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: ["entryFocus", "update:currentTabStopId"],
  setup(e, { expose: t, emit: r }) {
    const n = e, i = r, { loop: o, orientation: a, dir: s } = /* @__PURE__ */ Tn(n), l = uo(s), f = /* @__PURE__ */ On(n, "currentTabStopId", i, {
      defaultValue: n.defaultCurrentTabStopId,
      passive: n.currentTabStopId === void 0
    }), d = /* @__PURE__ */ _e(!1), u = /* @__PURE__ */ _e(!1), h = /* @__PURE__ */ _e(0), { getItems: c, CollectionSlot: y } = Gu({ isProvider: !0 });
    function m(g) {
      const _ = !u.value;
      if (g.currentTarget && g.target === g.currentTarget && _ && !d.value) {
        const x = new CustomEvent(By, Fy);
        if (g.currentTarget.dispatchEvent(x), i("entryFocus", x), !x.defaultPrevented) {
          const D = c().map((j) => j.ref).filter((j) => j.dataset.disabled !== ""), R = D.find((j) => j.getAttribute("data-active") === ""), C = D.find((j) => j.getAttribute("data-highlighted") === ""), P = D.find((j) => j.id === f.value), W = [
            R,
            C,
            P,
            ...D
          ].filter(Boolean);
          zy(W, n.preventScrollOnEntryFocus);
        }
      }
      u.value = !1;
    }
    function b() {
      setTimeout(() => {
        u.value = !1;
      }, 1);
    }
    return t({ getItems: c }), Jv({
      loop: o,
      dir: l,
      orientation: a,
      currentTabStopId: f,
      onItemFocus: (g) => {
        f.value = g;
      },
      onItemShiftTab: () => {
        d.value = !0;
      },
      onFocusableItemAdd: () => {
        h.value++;
      },
      onFocusableItemRemove: () => {
        h.value--;
      }
    }), (g, _) => (de(), ve(X(y), null, {
      default: ge(() => [Ie(X(Rt), {
        tabindex: d.value || h.value === 0 ? -1 : 0,
        "data-orientation": X(a),
        as: g.as,
        "as-child": g.asChild,
        dir: X(l),
        style: { outline: "none" },
        onMousedown: _[0] || (_[0] = (x) => u.value = !0),
        onMouseup: b,
        onFocus: m,
        onBlur: _[1] || (_[1] = (x) => d.value = !1)
      }, {
        default: ge(() => [Pe(g.$slots, "default")]),
        _: 3
      }, 8, [
        "tabindex",
        "data-orientation",
        "as",
        "as-child",
        "dir"
      ])]),
      _: 3
    }));
  }
}), tb = eb, rb = /* @__PURE__ */ Ee({
  __name: "MenuAnchor",
  props: {
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return (r, n) => (de(), ve(X(Xu), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), lc = rb;
function nb() {
  const e = /* @__PURE__ */ _e(!1);
  return nn(() => {
    ni("keydown", () => {
      e.value = !0;
    }, {
      capture: !0,
      passive: !0
    }), ni(["pointerdown", "pointermove"], () => {
      e.value = !1;
    }, {
      capture: !0,
      passive: !0
    });
  }), e;
}
const ib = /* @__PURE__ */ Pu(nb), [ln, uc] = /* @__PURE__ */ Gt(["MenuRoot", "MenuSub"], "MenuContext"), [fi, ob] = /* @__PURE__ */ Gt("MenuRoot");
var ab = /* @__PURE__ */ Ee({
  __name: "MenuRoot",
  props: {
    open: {
      type: Boolean,
      required: !1,
      default: !1
    },
    dir: {
      type: String,
      required: !1
    },
    modal: {
      type: Boolean,
      required: !1,
      default: !0
    }
  },
  emits: ["update:open"],
  setup(e, { emit: t }) {
    const r = e, n = t, { modal: i, dir: o } = /* @__PURE__ */ Tn(r), a = uo(o), s = /* @__PURE__ */ On(r, "open", n), l = /* @__PURE__ */ _e(), f = ib();
    return uc({
      open: s,
      onOpenChange: (d) => {
        s.value = d;
      },
      content: l,
      onContentChange: (d) => {
        l.value = d;
      }
    }), ob({
      onClose: () => {
        s.value = !1;
      },
      isUsingKeyboardRef: f,
      dir: a,
      modal: i
    }), (d, u) => (de(), ve(X(Ra), null, {
      default: ge(() => [Pe(d.$slots, "default")]),
      _: 3
    }));
  }
}), sb = ab;
const [go, lb] = /* @__PURE__ */ Gt("MenuContent");
var ub = /* @__PURE__ */ Ee({
  __name: "MenuContentImpl",
  props: /* @__PURE__ */ cu({
    loop: {
      type: Boolean,
      required: !1
    },
    disableOutsidePointerEvents: {
      type: Boolean,
      required: !1
    },
    disableOutsideScroll: {
      type: Boolean,
      required: !1
    },
    trapFocus: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  }, { ...ac }),
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus",
    "dismiss"
  ],
  setup(e, { emit: t }) {
    const r = e, n = t, i = ln(), o = fi(), { trapFocus: a, disableOutsidePointerEvents: s, loop: l } = /* @__PURE__ */ Tn(r);
    Gg(), Wg(s.value);
    const f = /* @__PURE__ */ _e(""), d = /* @__PURE__ */ _e(0), u = /* @__PURE__ */ _e(0), h = /* @__PURE__ */ _e(null), c = /* @__PURE__ */ _e("right"), y = /* @__PURE__ */ _e(0), m = /* @__PURE__ */ _e(null), b = /* @__PURE__ */ _e(), { forwardRef: g, currentElement: _ } = Ye(), { handleTypeaheadSearch: x } = ly(), D = /* @__PURE__ */ _e();
    function R(E) {
      const N = Bs(E, D.value || wt(), _.value, {
        loop: l.value,
        arrowKeyOptions: "vertical",
        dir: o == null ? void 0 : o.dir.value,
        focus: !1,
        attributeName: "[data-reka-collection-item]:not([data-disabled])"
      });
      N && (D.value = N, N.scrollIntoView({ block: "nearest" }));
    }
    function C() {
      D.value && D.value.click();
    }
    const P = /* @__PURE__ */ _e(), W = /* @__PURE__ */ _e();
    tt(D, (E) => {
      if (W.value && (E === void 0 || E !== W.value.trigger.value)) {
        if (E === void 0) return;
        W.value.onOpenChange(!1), W.value = void 0;
      }
    }), tt(_, (E) => {
      i.onContentChange(E);
    }), on(() => {
      window.clearTimeout(d.value);
    });
    function j(E) {
      var L, F;
      return c.value === ((L = h.value) == null ? void 0 : L.side) && Py(E, (F = h.value) == null ? void 0 : F.area);
    }
    async function oe(E) {
      var N;
      n("openAutoFocus", E), !E.defaultPrevented && (E.preventDefault(), (N = _.value) == null || N.focus({ preventScroll: !0 }));
    }
    function ue(E) {
      var ae;
      if (E.defaultPrevented) return;
      const N = E.target, L = N.closest("[data-reka-menu-content]") === E.currentTarget, F = ["input", "textarea"].includes(N.tagName.toLowerCase()), Y = E.ctrlKey || E.altKey || E.metaKey, ee = E.key.length === 1, H = Bs(E, wt(), _.value, {
        loop: l.value,
        arrowKeyOptions: "vertical",
        dir: o == null ? void 0 : o.dir.value,
        focus: !0,
        attributeName: "[data-reka-collection-item]:not([data-disabled])"
      });
      if (H) return H == null ? void 0 : H.focus();
      if (E.code === "Space") return;
      const K = ((ae = b.value) == null ? void 0 : ae.getItems()) ?? [];
      if (L && (E.key === "Tab" && o.modal.value && E.preventDefault(), !Y && ee && !F && x(E.key, K)), E.target !== _.value || !Cy.includes(E.key)) return;
      E.preventDefault();
      const le = [...K.map((ne) => ne.ref)];
      $u.includes(E.key) && le.reverse(), Ny(le);
    }
    function B(E) {
      var N, L;
      (L = (N = E == null ? void 0 : E.currentTarget) == null ? void 0 : N.contains) != null && L.call(N, E.target) || (window.clearTimeout(d.value), f.value = "");
    }
    function Z(E) {
      var F;
      if (!Cn(E)) return;
      const N = E.target, L = y.value !== E.clientX;
      if ((F = E == null ? void 0 : E.currentTarget) != null && F.contains(N) && L) {
        const Y = E.clientX > y.value ? "right" : "left";
        c.value = Y, y.value = E.clientX;
      }
    }
    function w(E) {
      Cn(E) && P.value && P.value.focus();
    }
    return lb({
      onItemEnter: (E) => !!j(E),
      onItemLeave: (E) => {
        var L, F;
        return j(E) ? !0 : (["INPUT", "TEXTAREA"].includes(((L = wt()) == null ? void 0 : L.tagName) || "") || (F = _.value) == null || F.focus(), m.value = null, !1);
      },
      onTriggerLeave: (E) => !!j(E),
      searchRef: f,
      highlightedElement: D,
      onKeydownNavigation: R,
      onKeydownEnter: C,
      filterElement: P,
      onFilterElementChange: (E) => {
        P.value = E;
      },
      activeSubmenuContext: W,
      pointerGraceTimerRef: u,
      onPointerGraceIntentChange: (E) => {
        h.value = E;
      }
    }), (E, N) => (de(), ve(X(Ey), {
      "as-child": "",
      trapped: X(a),
      onMountAutoFocus: oe,
      onUnmountAutoFocus: N[7] || (N[7] = (L) => n("closeAutoFocus", L))
    }, {
      default: ge(() => [Ie(X(Uu), {
        "as-child": "",
        "disable-outside-pointer-events": X(s),
        onEscapeKeyDown: N[2] || (N[2] = (L) => n("escapeKeyDown", L)),
        onPointerDownOutside: N[3] || (N[3] = (L) => n("pointerDownOutside", L)),
        onFocusOutside: N[4] || (N[4] = (L) => n("focusOutside", L)),
        onInteractOutside: N[5] || (N[5] = (L) => n("interactOutside", L)),
        onDismiss: N[6] || (N[6] = (L) => n("dismiss"))
      }, {
        default: ge(() => [Ie(X(tb), {
          ref_key: "rovingFocusGroupRef",
          ref: b,
          "current-tab-stop-id": m.value,
          "onUpdate:currentTabStopId": N[0] || (N[0] = (L) => m.value = L),
          "as-child": "",
          orientation: "vertical",
          dir: X(o).dir.value,
          loop: X(l),
          onEntryFocus: N[1] || (N[1] = (L) => {
            n("entryFocus", L), X(o).isUsingKeyboardRef.value || L.preventDefault();
          })
        }, {
          default: ge(() => [Ie(X(sc), {
            ref: X(g),
            role: "menu",
            as: E.as,
            "as-child": E.asChild,
            "aria-orientation": "vertical",
            "data-reka-menu-content": "",
            "data-state": X(ju)(X(i).open.value),
            dir: X(o).dir.value,
            side: E.side,
            "side-offset": E.sideOffset,
            align: E.align,
            "align-offset": E.alignOffset,
            "avoid-collisions": E.avoidCollisions,
            "collision-boundary": E.collisionBoundary,
            "collision-padding": E.collisionPadding,
            "arrow-padding": E.arrowPadding,
            "prioritize-position": E.prioritizePosition,
            "position-strategy": E.positionStrategy,
            "update-position-strategy": E.updatePositionStrategy,
            sticky: E.sticky,
            "hide-when-detached": E.hideWhenDetached,
            reference: E.reference,
            onKeydown: ue,
            onBlur: B,
            onPointermove: Z,
            onPointerenter: w
          }, {
            default: ge(() => [Pe(E.$slots, "default")]),
            _: 3
          }, 8, [
            "as",
            "as-child",
            "data-state",
            "dir",
            "side",
            "side-offset",
            "align",
            "align-offset",
            "avoid-collisions",
            "collision-boundary",
            "collision-padding",
            "arrow-padding",
            "prioritize-position",
            "position-strategy",
            "update-position-strategy",
            "sticky",
            "hide-when-detached",
            "reference"
          ])]),
          _: 3
        }, 8, [
          "current-tab-stop-id",
          "dir",
          "loop"
        ])]),
        _: 3
      }, 8, ["disable-outside-pointer-events"])]),
      _: 3
    }, 8, ["trapped"]));
  }
}), $a = ub, cb = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "MenuItemImpl",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    textValue: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e, r = go(), { forwardRef: n, currentElement: i } = Ye(), { CollectionItem: o } = Gu(), a = /* @__PURE__ */ _e(!1), s = be(() => a.value || i.value != null && r.highlightedElement.value === i.value);
    async function l(d) {
      var u;
      if (!(d.defaultPrevented || !Cn(d))) {
        if (t.disabled) r.onItemLeave(d);
        else if (!r.onItemEnter(d)) {
          const c = d.currentTarget;
          r.highlightedElement.value = c, ["INPUT", "TEXTAREA"].includes(((u = wt()) == null ? void 0 : u.tagName) || "") || c.focus({ preventScroll: !0 });
        }
      }
    }
    async function f(d) {
      if (await ht(), d.defaultPrevented || !Cn(d) || r.highlightedElement.value !== i.value) return;
      !r.onItemLeave(d) && r.highlightedElement.value === i.value && (r.highlightedElement.value = void 0);
    }
    return (d, u) => (de(), ve(X(o), { value: { textValue: d.textValue } }, {
      default: ge(() => [Ie(X(Rt), nt({
        ref: X(n),
        role: "menuitem",
        tabindex: "-1"
      }, d.$attrs, {
        as: d.as,
        "as-child": d.asChild,
        "aria-disabled": d.disabled || void 0,
        "data-disabled": d.disabled ? "" : void 0,
        "data-highlighted": s.value ? "" : void 0,
        onPointermove: l,
        onPointerleave: f,
        onFocus: u[0] || (u[0] = async (h) => {
          await ht(), !(h.defaultPrevented || d.disabled) && (a.value = !0, X(r).highlightedElement.value = h.currentTarget);
        }),
        onBlur: u[1] || (u[1] = async (h) => {
          await ht(), !h.defaultPrevented && (a.value = !1);
        })
      }), {
        default: ge(() => [Pe(d.$slots, "default")]),
        _: 3
      }, 16, [
        "as",
        "as-child",
        "aria-disabled",
        "data-disabled",
        "data-highlighted"
      ])]),
      _: 3
    }, 8, ["value"]));
  }
}), cc = cb, db = /* @__PURE__ */ Ee({
  __name: "MenuItem",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    textValue: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: ["select"],
  setup(e, { emit: t }) {
    const r = e, n = t, { forwardRef: i, currentElement: o } = Ye(), a = fi(), s = go(), l = /* @__PURE__ */ _e(!1);
    async function f() {
      const d = o.value;
      if (!r.disabled && d) {
        const u = new CustomEvent(xy, {
          bubbles: !0,
          cancelable: !0
        });
        n("select", u), await ht(), u.defaultPrevented ? l.value = !1 : a.onClose();
      }
    }
    return (d, u) => (de(), ve(cc, nt(r, {
      ref: X(i),
      onClick: f,
      onPointerdown: u[0] || (u[0] = () => {
        l.value = !0;
      }),
      onPointerup: u[1] || (u[1] = async (h) => {
        var c;
        await ht(), !h.defaultPrevented && (l.value || (c = h.currentTarget) == null || c.click());
      }),
      onKeydown: u[2] || (u[2] = async (h) => {
        var y;
        const c = X(s).searchRef.value !== "";
        d.disabled || c && h.key === " " || X(fa).includes(h.key) && ((y = h.currentTarget) == null || y.click(), h.preventDefault());
      })
    }), {
      default: ge(() => [Pe(d.$slots, "default")]),
      _: 3
    }, 16));
  }
}), fb = db, hb = /* @__PURE__ */ Ee({
  __name: "MenuRootContentModal",
  props: {
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const r = e, n = t, i = an(r, n), o = ln(), { forwardRef: a, currentElement: s } = Ye();
    return oy(s), (l, f) => (de(), ve($a, nt(X(i), {
      ref: X(a),
      "trap-focus": X(o).open.value,
      "disable-outside-pointer-events": X(o).open.value,
      "disable-outside-scroll": !0,
      onDismiss: f[0] || (f[0] = (d) => X(o).onOpenChange(!1)),
      onFocusOutside: f[1] || (f[1] = Hi((d) => n("focusOutside", d), ["prevent"]))
    }), {
      default: ge(() => [Pe(l.$slots, "default")]),
      _: 3
    }, 16, ["trap-focus", "disable-outside-pointer-events"]));
  }
}), pb = hb, mb = /* @__PURE__ */ Ee({
  __name: "MenuRootContentNonModal",
  props: {
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const i = an(e, t), o = ln();
    return (a, s) => (de(), ve($a, nt(X(i), {
      "trap-focus": !1,
      "disable-outside-pointer-events": !1,
      "disable-outside-scroll": !1,
      onDismiss: s[0] || (s[0] = (l) => X(o).onOpenChange(!1))
    }), {
      default: ge(() => [Pe(a.$slots, "default")]),
      _: 3
    }, 16));
  }
}), gb = mb, yb = /* @__PURE__ */ Ee({
  __name: "MenuContent",
  props: {
    forceMount: {
      type: Boolean,
      required: !1
    },
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const i = an(e, t), o = ln(), a = fi();
    return (s, l) => (de(), ve(X(La), { present: s.forceMount || X(o).open.value }, {
      default: ge(() => [X(a).modal.value ? (de(), ve(pb, or(nt({ key: 0 }, {
        ...s.$attrs,
        ...X(i)
      })), {
        default: ge(() => [Pe(s.$slots, "default")]),
        _: 3
      }, 16)) : (de(), ve(gb, or(nt({ key: 1 }, {
        ...s.$attrs,
        ...X(i)
      })), {
        default: ge(() => [Pe(s.$slots, "default")]),
        _: 3
      }, 16))]),
      _: 3
    }, 8, ["present"]));
  }
}), vb = yb, bb = /* @__PURE__ */ Ee({
  __name: "MenuPortal",
  props: {
    to: {
      type: null,
      required: !1
    },
    disabled: {
      type: Boolean,
      required: !1
    },
    defer: {
      type: Boolean,
      required: !1
    },
    forceMount: {
      type: Boolean,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return (r, n) => (de(), ve(X(Wu), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), _b = bb, wb = /* @__PURE__ */ Ee({
  __name: "MenuSeparator",
  props: {
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return (r, n) => (de(), ve(X(Rt), nt(t, {
      role: "separator",
      "aria-orientation": "horizontal"
    }), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), kb = wb;
const [dc, Mb] = /* @__PURE__ */ Gt("MenuSub");
var Ab = /* @__PURE__ */ Ee({
  __name: "MenuSub",
  props: { open: {
    type: Boolean,
    required: !1,
    default: void 0
  } },
  emits: ["update:open"],
  setup(e, { emit: t }) {
    const r = e, i = /* @__PURE__ */ On(r, "open", t, {
      defaultValue: !1,
      passive: r.open === void 0
    }), o = ln(), a = /* @__PURE__ */ _e(), s = /* @__PURE__ */ _e();
    return jt((l) => {
      (o == null ? void 0 : o.open.value) === !1 && (i.value = !1), l(() => i.value = !1);
    }), uc({
      open: i,
      onOpenChange: (l) => {
        i.value = l;
      },
      content: s,
      onContentChange: (l) => {
        s.value = l;
      }
    }), Mb({
      triggerId: "",
      contentId: "",
      trigger: a,
      onTriggerChange: (l) => {
        a.value = l;
      }
    }), (l, f) => (de(), ve(X(Ra), null, {
      default: ge(() => [Pe(l.$slots, "default")]),
      _: 3
    }));
  }
}), Eb = Ab, xb = /* @__PURE__ */ Ee({
  __name: "MenuSubContent",
  props: {
    forceMount: {
      type: Boolean,
      required: !1
    },
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1,
      default: !0
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const i = an(e, t), o = ln(), a = fi(), s = dc(), l = go(), { forwardRef: f, currentElement: d } = Ye();
    return s.contentId || (s.contentId = di(void 0, "reka-menu-sub-content")), (u, h) => (de(), ve(X(La), { present: u.forceMount || X(o).open.value }, {
      default: ge(() => [Ie($a, nt(X(i), {
        id: X(s).contentId,
        ref: X(f),
        "aria-labelledby": X(s).triggerId,
        align: "start",
        side: X(a).dir.value === "rtl" ? "left" : "right",
        "disable-outside-pointer-events": !1,
        "disable-outside-scroll": !1,
        "trap-focus": !1,
        onOpenAutoFocus: h[0] || (h[0] = Hi((c) => {
          var y;
          X(a).isUsingKeyboardRef.value && ((y = X(d)) == null || y.focus());
        }, ["prevent"])),
        onCloseAutoFocus: h[1] || (h[1] = Hi(() => {
        }, ["prevent"])),
        onFocusOutside: h[2] || (h[2] = (c) => {
          var m;
          if (c.defaultPrevented) return;
          const y = (m = X(l).filterElement.value) == null ? void 0 : m.contains(c.target);
          c.target !== X(s).trigger.value && !y && X(o).onOpenChange(!1);
        }),
        onEscapeKeyDown: h[3] || (h[3] = (c) => {
          X(a).onClose(), c.preventDefault();
        }),
        onKeydown: h[4] || (h[4] = (c) => {
          var b, g, _;
          const y = (b = c.currentTarget) == null ? void 0 : b.contains(c.target), m = X(Ty)[X(a).dir.value].includes(c.key);
          y && m && (X(o).onOpenChange(!1), X(l).filterElement.value ? (X(l).filterElement.value.focus(), X(l).highlightedElement.value = X(s).trigger.value, (g = X(s).trigger.value) == null || g.scrollIntoView({ block: "nearest" })) : (_ = X(s).trigger.value) == null || _.focus(), c.preventDefault());
        })
      }), {
        default: ge(() => [Pe(u.$slots, "default")]),
        _: 3
      }, 16, [
        "id",
        "aria-labelledby",
        "side"
      ])]),
      _: 3
    }, 8, ["present"]));
  }
}), Db = xb, Cb = /* @__PURE__ */ Ee({
  __name: "MenuSubTrigger",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    textValue: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e, r = ln(), n = fi(), i = dc(), o = go();
    tt(r.open, (u) => {
      var h;
      u ? o.activeSubmenuContext.value = {
        onOpenChange: r.onOpenChange,
        trigger: i.trigger
      } : ((h = o.activeSubmenuContext.value) == null ? void 0 : h.trigger.value) === i.trigger.value && (o.activeSubmenuContext.value = void 0);
    });
    const a = /* @__PURE__ */ _e(null);
    i.triggerId || (i.triggerId = di(void 0, "reka-menu-sub-trigger"));
    function s() {
      a.value && window.clearTimeout(a.value), a.value = null;
    }
    on(() => {
      s();
    });
    function l(u) {
      !Cn(u) || o.onItemEnter(u) || !t.disabled && !r.open.value && !a.value && (o.onPointerGraceIntentChange(null), a.value = window.setTimeout(() => {
        r.onOpenChange(!0), s();
      }, 100));
    }
    async function f(u) {
      var c, y;
      if (!Cn(u)) return;
      s();
      const h = (c = r.content.value) == null ? void 0 : c.getBoundingClientRect();
      if (h != null && h.width) {
        const m = (y = r.content.value) == null ? void 0 : y.dataset.side, b = m === "right", g = b ? -5 : 5, _ = h[b ? "left" : "right"], x = h[b ? "right" : "left"];
        o.onPointerGraceIntentChange({
          area: [
            {
              x: u.clientX + g,
              y: u.clientY
            },
            {
              x: _,
              y: h.top
            },
            {
              x,
              y: h.top
            },
            {
              x,
              y: h.bottom
            },
            {
              x: _,
              y: h.bottom
            }
          ],
          side: m
        }), window.clearTimeout(o.pointerGraceTimerRef.value), o.pointerGraceTimerRef.value = window.setTimeout(() => o.onPointerGraceIntentChange(null), 300);
      } else {
        if (o.onTriggerLeave(u)) return;
        o.onPointerGraceIntentChange(null);
      }
    }
    async function d(u) {
      var c;
      const h = o.searchRef.value !== "";
      t.disabled || h && u.key === " " || Sy[n.dir.value].includes(u.key) && (r.onOpenChange(!0), await ht(), (c = r.content.value) == null || c.focus(), u.preventDefault());
    }
    return (u, h) => (de(), ve(lc, { "as-child": "" }, {
      default: ge(() => [Ie(cc, nt(t, {
        id: X(i).triggerId,
        ref: (c) => {
          var y;
          c && ((y = X(i)) == null || y.onTriggerChange(c == null ? void 0 : c.$el));
        },
        "aria-haspopup": "menu",
        "aria-expanded": X(r).open.value,
        "aria-controls": X(i).contentId,
        "data-state": X(ju)(X(r).open.value),
        onClick: h[0] || (h[0] = async (c) => {
          var y;
          t.disabled || c.defaultPrevented || ((y = c.currentTarget) == null || y.focus(), X(r).open.value || X(r).onOpenChange(!0));
        }),
        onPointermove: l,
        onPointerleave: f,
        onKeydown: d
      }), {
        default: ge(() => [Pe(u.$slots, "default")]),
        _: 3
      }, 16, [
        "id",
        "aria-expanded",
        "aria-controls",
        "data-state"
      ])]),
      _: 3
    }));
  }
}), Sb = Cb;
const [fc, Tb] = /* @__PURE__ */ Gt("DropdownMenuRoot");
var Nb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuRoot",
  props: {
    defaultOpen: {
      type: Boolean,
      required: !1
    },
    open: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    dir: {
      type: String,
      required: !1
    },
    modal: {
      type: Boolean,
      required: !1,
      default: !0
    }
  },
  emits: ["update:open"],
  setup(e, { emit: t }) {
    const r = e, n = t;
    Ye();
    const i = /* @__PURE__ */ On(r, "open", n, {
      defaultValue: r.defaultOpen,
      passive: r.open === void 0
    }), o = /* @__PURE__ */ _e(), { modal: a, dir: s } = /* @__PURE__ */ Tn(r), l = uo(s);
    return Tb({
      open: i,
      onOpenChange: (f) => {
        i.value = f;
      },
      onOpenToggle: () => {
        i.value = !i.value;
      },
      triggerId: "",
      triggerElement: o,
      contentId: "",
      modal: a,
      dir: l
    }), (f, d) => (de(), ve(X(sb), {
      open: X(i),
      "onUpdate:open": d[0] || (d[0] = (u) => /* @__PURE__ */ ot(i) ? i.value = u : null),
      dir: X(l),
      modal: X(a)
    }, {
      default: ge(() => [Pe(f.$slots, "default", { open: X(i) })]),
      _: 3
    }, 8, [
      "open",
      "dir",
      "modal"
    ]));
  }
}), Ob = Nb, Pb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuContent",
  props: {
    forceMount: {
      type: Boolean,
      required: !1
    },
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const i = an(e, t);
    Ye();
    const o = fc(), a = /* @__PURE__ */ _e(!1);
    function s(l) {
      l.defaultPrevented || (a.value || setTimeout(() => {
        var f;
        (f = o.triggerElement.value) == null || f.focus();
      }, 0), a.value = !1, l.preventDefault());
    }
    return o.contentId || (o.contentId = di(void 0, "reka-dropdown-menu-content")), (l, f) => {
      var d;
      return de(), ve(X(vb), nt(X(i), {
        id: X(o).contentId,
        "aria-labelledby": (d = X(o)) == null ? void 0 : d.triggerId,
        style: {
          "--reka-dropdown-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
          "--reka-dropdown-menu-content-available-width": "var(--reka-popper-available-width)",
          "--reka-dropdown-menu-content-available-height": "var(--reka-popper-available-height)",
          "--reka-dropdown-menu-trigger-width": "var(--reka-popper-anchor-width)",
          "--reka-dropdown-menu-trigger-height": "var(--reka-popper-anchor-height)"
        },
        onCloseAutoFocus: s,
        onInteractOutside: f[0] || (f[0] = (u) => {
          var m;
          if (u.defaultPrevented) return;
          const h = u.detail.originalEvent, c = h.button === 0 && h.ctrlKey === !0, y = h.button === 2 || c;
          (!X(o).modal.value || y) && (a.value = !0), (m = X(o).triggerElement.value) != null && m.contains(u.target) && u.preventDefault();
        })
      }), {
        default: ge(() => [Pe(l.$slots, "default")]),
        _: 3
      }, 16, ["id", "aria-labelledby"]);
    };
  }
}), Ib = Pb, Lb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuItem",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    textValue: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: ["select"],
  setup(e, { emit: t }) {
    const r = e, i = Fu(t);
    return Ye(), (o, a) => (de(), ve(X(fb), or(xr({
      ...r,
      ...X(i)
    })), {
      default: ge(() => [Pe(o.$slots, "default")]),
      _: 3
    }, 16));
  }
}), jo = Lb, Rb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuPortal",
  props: {
    to: {
      type: null,
      required: !1
    },
    disabled: {
      type: Boolean,
      required: !1
    },
    defer: {
      type: Boolean,
      required: !1
    },
    forceMount: {
      type: Boolean,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return (r, n) => (de(), ve(X(_b), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), el = Rb, Bb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuSeparator",
  props: {
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return Ye(), (r, n) => (de(), ve(X(kb), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), tl = Bb, Fb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuSub",
  props: {
    defaultOpen: {
      type: Boolean,
      required: !1
    },
    open: {
      type: Boolean,
      required: !1,
      default: void 0
    }
  },
  emits: ["update:open"],
  setup(e, { emit: t }) {
    const r = e, i = /* @__PURE__ */ On(r, "open", t, {
      passive: r.open === void 0,
      defaultValue: r.defaultOpen ?? !1
    });
    return Ye(), (o, a) => (de(), ve(X(Eb), {
      open: X(i),
      "onUpdate:open": a[0] || (a[0] = (s) => /* @__PURE__ */ ot(i) ? i.value = s : null)
    }, {
      default: ge(() => [Pe(o.$slots, "default", { open: X(i) })]),
      _: 3
    }, 8, ["open"]));
  }
}), zb = Fb, qb = /* @__PURE__ */ Ee({
  __name: "DropdownMenuSubContent",
  props: {
    forceMount: {
      type: Boolean,
      required: !1
    },
    loop: {
      type: Boolean,
      required: !1
    },
    memoDependencies: {
      type: Array,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    sideFlip: {
      type: Boolean,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    alignFlip: {
      type: Boolean,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    hideShiftedArrow: {
      type: Boolean,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    },
    disableUpdateOnLayoutShift: {
      type: Boolean,
      required: !1
    },
    prioritizePosition: {
      type: Boolean,
      required: !1
    },
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  emits: [
    "escapeKeyDown",
    "pointerDownOutside",
    "focusOutside",
    "interactOutside",
    "entryFocus",
    "openAutoFocus",
    "closeAutoFocus"
  ],
  setup(e, { emit: t }) {
    const i = an(e, t);
    return Ye(), (o, a) => (de(), ve(X(Db), nt(X(i), { style: {
      "--reka-dropdown-menu-content-transform-origin": "var(--reka-popper-transform-origin)",
      "--reka-dropdown-menu-content-available-width": "var(--reka-popper-available-width)",
      "--reka-dropdown-menu-content-available-height": "var(--reka-popper-available-height)",
      "--reka-dropdown-menu-trigger-width": "var(--reka-popper-anchor-width)",
      "--reka-dropdown-menu-trigger-height": "var(--reka-popper-anchor-height)"
    } }), {
      default: ge(() => [Pe(o.$slots, "default")]),
      _: 3
    }, 16));
  }
}), Hb = qb, Ub = /* @__PURE__ */ Ee({
  __name: "DropdownMenuSubTrigger",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    textValue: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return Ye(), (r, n) => (de(), ve(X(Sb), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), Vb = Ub, $b = /* @__PURE__ */ Ee({
  __name: "DropdownMenuTrigger",
  props: {
    disabled: {
      type: Boolean,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "button"
    }
  },
  setup(e) {
    const t = e, r = fc(), { forwardRef: n, currentElement: i } = Ye();
    return nn(() => {
      r.triggerElement = i;
    }), r.triggerId || (r.triggerId = di(void 0, "reka-dropdown-menu-trigger")), (o, a) => (de(), ve(X(lc), { "as-child": "" }, {
      default: ge(() => [Ie(X(Rt), {
        id: X(r).triggerId,
        ref: X(n),
        type: o.as === "button" ? "button" : void 0,
        "as-child": t.asChild,
        as: o.as,
        "aria-haspopup": "menu",
        "aria-expanded": X(r).open.value,
        "aria-controls": X(r).open.value ? X(r).contentId : void 0,
        "data-disabled": o.disabled ? "" : void 0,
        disabled: o.disabled,
        "data-state": X(r).open.value ? "open" : "closed",
        onClick: a[0] || (a[0] = async (s) => {
          var l;
          !o.disabled && s.button === 0 && s.ctrlKey === !1 && ((l = X(r)) == null || l.onOpenToggle(), await ht(), X(r).open.value && s.preventDefault());
        }),
        onKeydown: a[1] || (a[1] = eh((s) => {
          o.disabled || (["Enter", " "].includes(s.key) && X(r).onOpenToggle(), s.key === "ArrowDown" && X(r).onOpenChange(!0), [
            "Enter",
            " ",
            "ArrowDown"
          ].includes(s.key) && s.preventDefault());
        }, [
          "enter",
          "space",
          "arrow-down"
        ]))
      }, {
        default: ge(() => [Pe(o.$slots, "default")]),
        _: 3
      }, 8, [
        "id",
        "type",
        "as-child",
        "as",
        "aria-expanded",
        "aria-controls",
        "data-disabled",
        "disabled",
        "data-state"
      ])]),
      _: 3
    }));
  }
}), jb = $b, Wb = /* @__PURE__ */ Ee({
  __name: "TooltipArrow",
  props: {
    width: {
      type: Number,
      required: !1,
      default: 10
    },
    height: {
      type: Number,
      required: !1,
      default: 5
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "svg"
    }
  },
  setup(e) {
    const t = e;
    return Ye(), (r, n) => (de(), ve(X(Qv), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), Gb = Wb;
const [yo, Kb] = /* @__PURE__ */ Gt("TooltipProvider");
var Xb = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "TooltipProvider",
  props: {
    delayDuration: {
      type: Number,
      required: !1,
      default: 700
    },
    skipDelayDuration: {
      type: Number,
      required: !1,
      default: 300
    },
    disableHoverableContent: {
      type: Boolean,
      required: !1,
      default: !1
    },
    disableClosingTrigger: {
      type: Boolean,
      required: !1
    },
    disabled: {
      type: Boolean,
      required: !1
    },
    ignoreNonKeyboardFocus: {
      type: Boolean,
      required: !1,
      default: !1
    },
    content: {
      type: Object,
      required: !1
    }
  },
  setup(e) {
    const t = e, { delayDuration: r, skipDelayDuration: n, disableHoverableContent: i, disableClosingTrigger: o, ignoreNonKeyboardFocus: a, disabled: s, content: l } = /* @__PURE__ */ Tn(t);
    Ye();
    const f = /* @__PURE__ */ _e(!0), d = /* @__PURE__ */ _e(!1), { start: u, stop: h } = Lu(() => {
      f.value = !0;
    }, n, { immediate: !1 });
    return Kb({
      isOpenDelayed: f,
      delayDuration: r,
      onOpen() {
        h(), f.value = !1;
      },
      onClose() {
        u();
      },
      isPointerInTransitRef: d,
      disableHoverableContent: i,
      disableClosingTrigger: o,
      disabled: s,
      ignoreNonKeyboardFocus: a,
      content: l
    }), (c, y) => Pe(c.$slots, "default");
  }
}), Yb = Xb;
const hc = "tooltip.open", [vo, Zb] = /* @__PURE__ */ Gt("TooltipRoot");
var Qb = /* @__PURE__ */ Ee({
  __name: "TooltipRoot",
  props: {
    defaultOpen: {
      type: Boolean,
      required: !1,
      default: !1
    },
    open: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    delayDuration: {
      type: Number,
      required: !1,
      default: void 0
    },
    disableHoverableContent: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    disableClosingTrigger: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    disabled: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    ignoreNonKeyboardFocus: {
      type: Boolean,
      required: !1,
      default: void 0
    }
  },
  emits: ["update:open"],
  setup(e, { emit: t }) {
    const r = e, n = t;
    Ye();
    const i = yo(), o = be(() => r.disableHoverableContent ?? i.disableHoverableContent.value), a = be(() => r.disableClosingTrigger ?? i.disableClosingTrigger.value), s = be(() => r.disabled ?? i.disabled.value), l = be(() => r.delayDuration ?? i.delayDuration.value), f = be(() => r.ignoreNonKeyboardFocus ?? i.ignoreNonKeyboardFocus.value), d = /* @__PURE__ */ On(r, "open", n, {
      defaultValue: r.defaultOpen,
      passive: r.open === void 0
    });
    tt(d, (x) => {
      i.onClose && (x ? (i.onOpen(), document.dispatchEvent(new CustomEvent(hc))) : i.onClose());
    });
    const u = /* @__PURE__ */ _e(!1), h = /* @__PURE__ */ _e(), c = be(() => d.value ? u.value ? "delayed-open" : "instant-open" : "closed"), { start: y, stop: m } = Lu(() => {
      u.value = !0, d.value = !0;
    }, l, { immediate: !1 });
    function b() {
      m(), u.value = !1, d.value = !0;
    }
    function g() {
      m(), d.value = !1;
    }
    function _() {
      y();
    }
    return Zb({
      contentId: "",
      open: d,
      stateAttribute: c,
      trigger: h,
      onTriggerChange(x) {
        h.value = x;
      },
      onTriggerEnter() {
        i.isOpenDelayed.value ? _() : b();
      },
      onTriggerLeave() {
        o.value ? g() : m();
      },
      onOpen: b,
      onClose: g,
      disableHoverableContent: o,
      disableClosingTrigger: a,
      disabled: s,
      ignoreNonKeyboardFocus: f
    }), (x, D) => (de(), ve(X(Ra), null, {
      default: ge(() => [Pe(x.$slots, "default", { open: X(d) })]),
      _: 3
    }));
  }
}), Jb = Qb, e_ = /* @__PURE__ */ Ee({
  __name: "TooltipContentImpl",
  props: {
    ariaLabel: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    as: {
      type: null,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1,
      default: void 0
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    }
  },
  emits: ["escapeKeyDown", "pointerDownOutside"],
  setup(e, { emit: t }) {
    const r = e, n = t, i = vo(), o = yo(), { forwardRef: a, currentElement: s } = Ye(), l = be(() => {
      var d;
      return r.ariaLabel || ((d = s.value) == null ? void 0 : d.textContent);
    }), f = be(() => {
      const { ariaLabel: d, ...u } = r;
      return Bu(u, o.content.value ?? {}, {
        side: "top",
        sideOffset: 0,
        align: "center",
        avoidCollisions: !0,
        collisionBoundary: [],
        collisionPadding: 0,
        arrowPadding: 0,
        sticky: "partial",
        hideWhenDetached: !1
      });
    });
    return nn(() => {
      ni(window, "scroll", (d) => {
        const u = d.target;
        u != null && u.contains(i.trigger.value) && i.onClose();
      }, { capture: !0 }), ni(window, hc, i.onClose);
    }), (d, u) => (de(), ve(X(Uu), {
      "as-child": "",
      "disable-outside-pointer-events": !1,
      onEscapeKeyDown: u[0] || (u[0] = (h) => n("escapeKeyDown", h)),
      onPointerDownOutside: u[1] || (u[1] = (h) => {
        var c;
        X(i).disableClosingTrigger.value && ((c = X(i).trigger.value) != null && c.contains(h.target)) && h.preventDefault(), n("pointerDownOutside", h);
      }),
      onFocusOutside: u[2] || (u[2] = Hi(() => {
      }, ["prevent"])),
      onDismiss: u[3] || (u[3] = (h) => X(i).onClose())
    }, {
      default: ge(() => [Ie(X(sc), nt({
        ref: X(a),
        "data-state": X(i).stateAttribute.value
      }, {
        ...d.$attrs,
        ...f.value
      }, { style: {
        "--reka-tooltip-content-transform-origin": "var(--reka-popper-transform-origin)",
        "--reka-tooltip-content-available-width": "var(--reka-popper-available-width)",
        "--reka-tooltip-content-available-height": "var(--reka-popper-available-height)",
        "--reka-tooltip-trigger-width": "var(--reka-popper-anchor-width)",
        "--reka-tooltip-trigger-height": "var(--reka-popper-anchor-height)"
      } }), {
        default: ge(() => [Pe(d.$slots, "default"), Ie(X(Ry), {
          id: X(i).contentId,
          role: "tooltip"
        }, {
          default: ge(() => [Na(gt(l.value), 1)]),
          _: 1
        }, 8, ["id"])]),
        _: 3
      }, 16, ["data-state"])]),
      _: 3
    }));
  }
}), pc = e_, t_ = /* @__PURE__ */ Ee({
  __name: "TooltipContentHoverable",
  props: {
    ariaLabel: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    }
  },
  setup(e) {
    const r = zu(e), { forwardRef: n, currentElement: i } = Ye(), { trigger: o, onClose: a } = vo(), s = yo(), { isPointerInTransit: l, onPointerExit: f } = Kg(o, i);
    return s.isPointerInTransitRef = l, f(() => {
      a();
    }), (d, u) => (de(), ve(pc, nt({ ref: X(n) }, X(r)), {
      default: ge(() => [Pe(d.$slots, "default")]),
      _: 3
    }, 16));
  }
}), r_ = t_, n_ = /* @__PURE__ */ Ee({
  __name: "TooltipContent",
  props: {
    forceMount: {
      type: Boolean,
      required: !1
    },
    ariaLabel: {
      type: String,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1
    },
    side: {
      type: null,
      required: !1
    },
    sideOffset: {
      type: Number,
      required: !1
    },
    align: {
      type: null,
      required: !1
    },
    alignOffset: {
      type: Number,
      required: !1
    },
    avoidCollisions: {
      type: Boolean,
      required: !1
    },
    collisionBoundary: {
      type: null,
      required: !1
    },
    collisionPadding: {
      type: [Number, Object],
      required: !1
    },
    arrowPadding: {
      type: Number,
      required: !1
    },
    sticky: {
      type: String,
      required: !1
    },
    hideWhenDetached: {
      type: Boolean,
      required: !1
    },
    positionStrategy: {
      type: String,
      required: !1
    },
    updatePositionStrategy: {
      type: String,
      required: !1
    }
  },
  emits: ["escapeKeyDown", "pointerDownOutside"],
  setup(e, { emit: t }) {
    const r = e, n = t, i = vo(), o = an(r, n), { forwardRef: a } = Ye();
    return (s, l) => (de(), ve(X(La), { present: s.forceMount || X(i).open.value }, {
      default: ge(() => [(de(), ve(lu(X(i).disableHoverableContent.value ? pc : r_), nt({ ref: X(a) }, X(o)), {
        default: ge(() => [Pe(s.$slots, "default")]),
        _: 3
      }, 16))]),
      _: 3
    }, 8, ["present"]));
  }
}), i_ = n_, o_ = /* @__PURE__ */ Ee({
  __name: "TooltipPortal",
  props: {
    to: {
      type: null,
      required: !1
    },
    disabled: {
      type: Boolean,
      required: !1
    },
    defer: {
      type: Boolean,
      required: !1
    },
    forceMount: {
      type: Boolean,
      required: !1
    }
  },
  setup(e) {
    const t = e;
    return (r, n) => (de(), ve(X(Wu), or(xr(t)), {
      default: ge(() => [Pe(r.$slots, "default")]),
      _: 3
    }, 16));
  }
}), a_ = o_, s_ = /* @__PURE__ */ Ee({
  __name: "TooltipTrigger",
  props: {
    reference: {
      type: null,
      required: !1
    },
    asChild: {
      type: Boolean,
      required: !1
    },
    as: {
      type: null,
      required: !1,
      default: "button"
    }
  },
  setup(e) {
    const t = e, r = vo(), n = yo();
    r.contentId || (r.contentId = di(void 0, "reka-tooltip-content"));
    const { forwardRef: i, currentElement: o } = Ye(), a = /* @__PURE__ */ _e(!1), s = /* @__PURE__ */ _e(!1), l = be(() => r.disabled.value ? {} : {
      click: m,
      focus: c,
      pointermove: u,
      pointerleave: h,
      pointerdown: d,
      blur: y
    });
    nn(() => {
      r.onTriggerChange(o.value);
    });
    function f() {
      setTimeout(() => {
        a.value = !1;
      }, 1);
    }
    function d() {
      r.open && !r.disableClosingTrigger.value && r.onClose(), a.value = !0, document.addEventListener("pointerup", f, { once: !0 });
    }
    function u(b) {
      b.pointerType !== "touch" && !s.value && !n.isPointerInTransitRef.value && (r.onTriggerEnter(), s.value = !0);
    }
    function h() {
      r.onTriggerLeave(), s.value = !1;
    }
    function c(b) {
      var g, _;
      a.value || r.ignoreNonKeyboardFocus.value && !((_ = (g = b.target).matches) != null && _.call(g, ":focus-visible")) || r.onOpen();
    }
    function y() {
      r.onClose();
    }
    function m() {
      r.disableClosingTrigger.value || r.onClose();
    }
    return (b, g) => (de(), ve(X(Xu), {
      "as-child": "",
      reference: b.reference
    }, {
      default: ge(() => [Ie(X(Rt), nt({
        ref: X(i),
        "aria-describedby": X(r).open.value ? X(r).contentId : void 0,
        "data-state": X(r).stateAttribute.value,
        as: b.as,
        "as-child": t.asChild,
        "data-grace-area-trigger": ""
      }, Ud(l.value)), {
        default: ge(() => [Pe(b.$slots, "default")]),
        _: 3
      }, 16, [
        "aria-describedby",
        "data-state",
        "as",
        "as-child"
      ])]),
      _: 3
    }, 8, ["reference"]));
  }
}), l_ = s_;
const u_ = /* @__PURE__ */ Ee({
  __name: "UiTooltip",
  props: {
    delayDuration: { default: 500 },
    disabled: { type: Boolean, default: !1 },
    side: { default: "bottom" },
    text: {}
  },
  setup(e) {
    return (t, r) => (de(), ve(X(Yb), {
      "delay-duration": e.delayDuration,
      disabled: e.disabled || !e.text,
      "skip-delay-duration": 250
    }, {
      default: ge(() => [
        Ie(X(Jb), null, {
          default: ge(() => [
            Ie(X(l_), { "as-child": "" }, {
              default: ge(() => [
                Pe(t.$slots, "default")
              ]),
              _: 3
            }),
            Ie(X(a_), null, {
              default: ge(() => [
                Ie(X(i_), {
                  class: "als-ofs-editor-ui-popover als-ofs-ui-tooltip",
                  side: e.side,
                  "side-offset": 6
                }, {
                  default: ge(() => [
                    Na(gt(e.text) + " ", 1),
                    Ie(X(Gb), {
                      class: "als-ofs-ui-tooltip__arrow",
                      height: 5,
                      width: 9
                    })
                  ]),
                  _: 1
                }, 8, ["side"])
              ]),
              _: 1
            })
          ]),
          _: 3
        })
      ]),
      _: 3
    }, 8, ["delay-duration", "disabled"]));
  }
});
function Wo(e, t) {
  return e.replace(/\{([A-Za-z0-9_.-]+)\}/g, (r, n) => {
    const i = t[n];
    return i == null ? r : String(i);
  });
}
function c_(e, t) {
  const r = /* @__PURE__ */ new Set([...Object.keys(e), ...Object.keys(t)]);
  return new Map([...r].map((n) => [
    n,
    new Map([
      ...Object.entries(e[n] ?? {}),
      ...Object.entries(t[n] ?? {})
    ])
  ]));
}
class d_ {
  constructor(t = {}) {
    this.options = t, this.activeLocale = t.locale ?? "en-US", this.fallbackLocale = t.fallbackLocale ?? "en-US", this.catalogs = c_(t.catalogs ?? {}, t.overrides ?? {});
  }
  get locale() {
    return this.activeLocale;
  }
  setLocale(t) {
    this.activeLocale = t;
  }
  registerCatalog(t, r, n = {}) {
    const i = this.catalogs.get(t) ?? /* @__PURE__ */ new Map();
    for (const [o, a] of Object.entries(r))
      (n.override || !i.has(o)) && i.set(o, a);
    this.catalogs.set(t, i);
  }
  t(t, r = {}) {
    const n = this.resolve(t);
    return Wo(n ?? t, r);
  }
  tc(t, r, n = {}) {
    var l, f;
    const i = new Intl.PluralRules(this.activeLocale).select(r), o = `${t}.${i}`, a = `${t}.other`, s = this.resolve(o) ?? this.resolve(a) ?? this.resolve(t);
    return s ? Wo(s, { ...n, count: r }) : ((f = (l = this.options).onMissingKey) == null || f.call(l, t, this.activeLocale), Wo(t, { ...n, count: r }));
  }
  number(t, r) {
    return new Intl.NumberFormat(this.activeLocale, r).format(t);
  }
  date(t, r) {
    const n = t instanceof Date ? t : new Date(t);
    return new Intl.DateTimeFormat(this.activeLocale, r).format(n);
  }
  resolve(t) {
    var n, i, o, a;
    const r = ((n = this.catalogs.get(this.activeLocale)) == null ? void 0 : n.get(t)) ?? ((i = this.catalogs.get(this.fallbackLocale)) == null ? void 0 : i.get(t));
    return r === void 0 && ((a = (o = this.options).onMissingKey) == null || a.call(o, t, this.activeLocale)), r;
  }
}
function f_(e = {}) {
  return new d_(e);
}
const h_ = {
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.apply": "Apply",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "common.new": "New",
  "common.print": "Print",
  "common.open": "Open",
  "common.save": "Save",
  "common.saveAs": "Save As",
  "common.export": "Export",
  "common.saved": "Saved",
  "common.retry": "Retry",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.noResults": "No results",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.more": "More",
  "shell.titlebar": "Document title bar",
  "shell.ribbon": "Editor ribbon",
  "shell.fileCommands": "File commands",
  "shell.workspace": "Document editor workspace",
  "shell.status": "Editor status",
  "shell.documentCanvas": "Document canvas",
  "shell.loadingDocument": "Loading document…",
  "shell.openFailed": "We couldn't open this file",
  "shell.openFailedDescription": "The file may be damaged, password-protected, or in an unsupported format. Check the file and try again.",
  "shell.technicalDetails": "Technical details",
  "shell.quickAccess": "Quick access",
  "shell.ribbonTabs": "Ribbon tabs",
  "shell.gallery": "Gallery",
  "versionInfo.title": "Version",
  "versionInfo.appIcon": "{app} application icon",
  "dialog.close": "Close dialog",
  "dialog.closeConfirmation": "Close confirmation",
  "panel.close": "Close panel",
  "panel.open": "Open panel",
  "panel.actions": "Panel actions",
  "panel.resize": "Resize panel",
  "dock.editor": "Editor dock",
  "dock.formatPane": "Format pane",
  "dock.close": "Close dock",
  "dock.openLeft": "Open left dock",
  "dock.openRight": "Open right dock",
  "ribbon.scrollLeft": "Scroll ribbon commands left",
  "ribbon.scrollRight": "Scroll ribbon commands right",
  "ribbon.moreGroups": "More ribbon groups",
  "ribbon.moreGroupsCount": "More ribbon groups ({count})",
  "history.quickAccess": "Quick access history",
  "history.undo": "Undo last action",
  "history.redo": "Redo last action",
  "history.undoShortcut": "Undo (Ctrl+Z)",
  "history.redoShortcut": "Redo (Ctrl+Y or Ctrl+Shift+Z)",
  "search.find": "Find",
  "search.placeholder": "Search",
  "search.position": "{current} of {count}",
  "search.replaced": "{count} replaced",
  "search.enterTerm": "Enter a search term",
  "search.clear": "Clear search",
  "search.noResults": "No results found.",
  "search.enterText": "Enter search text.",
  "search.replaceWith": "Replace with",
  "search.replace": "Replace",
  "search.replaceAll": "Replace all",
  "status.views": "Editor views",
  "status.zoom": "Zoom",
  "status.aiReading": "AI is reading…",
  "status.aiReadComplete": "AI read complete",
  "status.aiReadFailed": "AI read failed",
  "slider.decrease": "Decrease {label}",
  "slider.increase": "Increase {label}",
  "shape.rectangle": "Rectangle",
  "shape.roundedRectangle": "Rounded Rectangle",
  "shape.oval": "Oval",
  "shape.triangle": "Triangle",
  "shape.rightTriangle": "Right Triangle",
  "shape.diamond": "Diamond",
  "shape.parallelogram": "Parallelogram",
  "shape.trapezoid": "Trapezoid",
  "shape.pentagon": "Pentagon",
  "shape.hexagon": "Hexagon",
  "shape.chevron": "Chevron",
  "shape.rightArrow": "Right Arrow",
  "shape.leftArrow": "Left Arrow",
  "shape.upArrow": "Up Arrow",
  "shape.downArrow": "Down Arrow",
  "shape.plus": "Plus",
  "shape.star": "Star",
  "shape.heart": "Heart",
  "shape.cloud": "Cloud",
  "shape.decision": "Decision",
  "comments.ariaLabel": "Comments",
  "comments.add": "Add Comment",
  "comments.addLower": "Add a comment",
  "comments.empty": "No comments.",
  "comments.comment": "Comment",
  "comments.replyingInThread": "Replying in thread",
  "comments.replyingTo": "Replying to {author}",
  "comments.cancelReply": "Cancel reply",
  "comments.replyText": "Reply text",
  "comments.newComment": "New comment",
  "comments.reply": "Reply",
  "comments.addReply": "Add Reply",
  "comments.authorComment": "{author} comment",
  "comments.authorReplyTo": "{author} reply to {parent}",
  "comments.resolved": "Resolved",
  "comments.commentText": "Comment text",
  "comments.replyToComment": "Reply to comment",
  "comments.reopenComment": "Reopen comment",
  "comments.resolveComment": "Resolve comment",
  "comments.reopen": "Reopen",
  "comments.resolve": "Resolve",
  "comments.editComment": "Edit comment",
  "comments.edit": "Edit",
  "comments.deleteComment": "Delete comment",
  "comments.unread": "Unread",
  "comments.anchorMissing": "Anchor missing",
  "comments.anchorCollapsed": "Point comment",
  "comments.mentions": "Mentions {people}",
  "comments.assigned": "Assigned to {people}",
  "font.family": "Font family",
  "font.size": "Font size",
  "font.changeCase": "Change case",
  "font.clearFormatting": "Clear formatting",
  "font.bold": "Bold",
  "font.italic": "Italic",
  "font.underline": "Underline",
  "font.doubleUnderline": "Double underline",
  "font.strike": "Strike",
  "font.subscript": "Subscript",
  "font.superscript": "Superscript",
  "font.highlight": "Text highlight",
  "font.color": "Font color",
  "paragraph.bullets": "Bullets",
  "paragraph.numbering": "Numbering",
  "paragraph.multilevel": "Multilevel",
  "paragraph.promoteListLevel": "Promote list level",
  "paragraph.demoteListLevel": "Demote list level",
  "paragraph.alignLeft": "Align left",
  "paragraph.alignCenter": "Center",
  "paragraph.alignRight": "Align right",
  "paragraph.justify": "Justify",
  "paragraph.decreaseIndent": "Decrease indent",
  "paragraph.increaseIndent": "Increase indent",
  "paragraph.list": "List",
  "paragraph.listStyle": "Paragraph list style",
  "paragraph.start": "Start",
  "paragraph.numberingStart": "Numbering start value",
  "textAlignment.group": "Text alignment",
  "textAlignment.alignTop": "Align top",
  "textAlignment.alignMiddle": "Align middle",
  "textAlignment.alignBottom": "Align bottom",
  "colorPicker.picker": "{label} picker",
  "colorPicker.heading": "Theme and standard colors",
  "colorPicker.themeColors": "{label} theme colors",
  "colorPicker.colors": "{label} colors",
  "colorPicker.setTo": "Set {label} to {color}",
  "colorPicker.noColor": "No color",
  "colorPicker.hex": "Hex",
  "colorPicker.hexColor": "Hex color",
  "slideNav.ariaLabel": "Slide navigation",
  "slideNav.previous": "Previous slide",
  "slideNav.previousShort": "Prev",
  "slideNav.slide": "Slide",
  "slideNav.position": "Slide / {total}",
  "slideNav.next": "Next slide",
  "slideNav.nextShort": "Next",
  "slideNav.showAll": "Show all slides",
  "slideNav.allShort": "All",
  "animation.order": "Animation order",
  "animation.empty": "No animations for the current selection.",
  "animation.moveEarlier": "Move animation earlier",
  "animation.moveEarlierShort": "Move earlier",
  "animation.moveLater": "Move animation later",
  "animation.moveLaterShort": "Move later",
  "animation.remove": "Remove animation",
  "selection.objects": "Objects on this slide",
  "selection.objectName": "Object name",
  "selection.showObject": "Show object",
  "selection.hideObject": "Hide object",
  "selection.unlockObject": "Unlock object",
  "selection.lockObject": "Lock object",
  "selection.moveForward": "Move object forward",
  "selection.moveBackward": "Move object backward",
  "selection.none": "No selection",
  "selection.connectorStart": "Move connector start",
  "selection.connectorEnd": "Move connector end",
  "selection.adjustCornerRadius": "Adjust corner radius",
  "selection.cropFrom": "Crop picture from {direction}",
  "slides.rail": "Slides",
  "slides.hidden": "Hidden slide",
  "notes.label": "Speaker Notes",
  "notes.empty": "No speaker notes for this slide.",
  "notes.save": "Save Notes",
  "notes.title": "Speaker notes for this slide",
  "shapes.gallery": "Shape gallery",
  "shapes.label": "Shapes",
  "drawing.canvas": "Drawing canvas",
  "drawing.connector": "Connector",
  "drawing.image": "Drawing image",
  "outline.emptyTitle": "No headings",
  "outline.emptyDescription": "Apply heading styles to build the document outline.",
  "outline.headings": "Document outline headings",
  "outline.expand": "Expand {label}",
  "outline.collapse": "Collapse {label}",
  "inspector.formatProperties": "Format properties",
  "inspector.modes": "Inspector modes",
  "issues.workbench": "Issue workbench",
  "equation.editTitle": "Edit equation",
  "equation.insertTitle": "Insert equation",
  "equation.insert": "Insert",
  "equation.editDescription": "Edit UnicodeMath or LaTeX source. Each top-level line becomes one equation row.",
  "equation.insertDescription": "Enter UnicodeMath or LaTeX source. Each top-level line becomes one equation row.",
  "equation.close": "Close equation dialog",
  "equation.inputFormat": "Input format",
  "equation.inputFormatAria": "Equation input format",
  "equation.displayLine": "Display on its own line",
  "equation.commonFormulas": "Common formulas",
  "equation.presets": "{count} presets",
  "equation.commonFormulaPresets": "Common formula presets",
  "equation.usePreset": "Use {label}",
  "equation.linearInput": "Linear input",
  "equation.help": "Each top-level line becomes one equation row. Line breaks inside braces or matrix structures remain part of that structure. Press Ctrl+Enter or Command+Enter to apply.",
  "equation.fallback": "Input interpreted with fallback: {error}",
  "equation.opaqueNotice": "This formula contains preserved Office Math that cannot be represented completely as linear input. Apply without editing to keep it unchanged, or edit the source to replace it.",
  "equation.overwriteNotice": "This formula contains preserved Office Math. Confirming replaces that preserved content.",
  "equation.preview": "Preview",
  "equation.confirmOverwrite": "Confirm overwrite",
  "equation.preset.quadratic": "Quadratic formula",
  "equation.preset.pythagorean": "Pythagorean theorem",
  "equation.preset.euler": "Euler's identity",
  "equation.preset.circle-area": "Circle area",
  "equation.preset.newton": "Newton's second law",
  "equation.preset.sum": "Finite sum",
  "equation.preset.integral": "Definite integral",
  "equation.preset.derivative": "Derivative limit",
  "equation.preset.product": "Finite product",
  "equation.preset.bayes": "Bayes' theorem",
  "equation.preset.matrix": "2 × 2 matrix",
  "equation.preset.system": "Equation system",
  "inspector.moreModes": "More panels",
  "commandPalette.title": "Commands",
  "commandPalette.description": "Search and run editor commands.",
  "commandPalette.placeholder": "Search commands",
  "commandPalette.recent": "Recently used",
  "commandPalette.all": "All commands",
  "commandPalette.noResults": "No matching commands",
  "commandPalette.close": "Close commands",
  "commandPalette.runFailed": "The command could not be completed.",
  "commandPalette.disabled": "Unavailable: {reason}",
  "issues.title": "Editor",
  "issues.errors.one": "{count} error",
  "issues.errors.other": "{count} errors",
  "issues.warnings.one": "{count} warning",
  "issues.warnings.other": "{count} warnings",
  "issues.empty": "No issues found",
  "issues.emptyDescription": "This document passes the current checks.",
  "issues.search": "Search issues",
  "issues.searchPlaceholder": "Search issues and locations",
  "issues.filter": "Filter issues",
  "issues.filterAll": "All issues",
  "issues.filterErrors": "Errors",
  "issues.filterWarnings": "Warnings",
  "issues.filterInfo": "Information",
  "issues.category": "Issue category",
  "issues.allCategories": "All categories",
  "issues.summary": "{count} issues",
  "issues.summary.one": "{count} issue",
  "issues.summary.other": "{count} issues",
  "issues.jump": "Go to issue",
  "issues.loading": "Checking document…",
  "issues.failed": "Checks could not be completed.",
  "issues.applySuggestion": "Apply suggestion",
  "issues.ignoreOnce": "Ignore once",
  "issues.ignoreSimilar": "Ignore similar",
  "issues.categorySpelling": "Spelling",
  "issues.categoryGrammar": "Grammar",
  "issues.categoryAccessibility": "Accessibility",
  "issues.sourceProofing": "Proofing",
  "issues.sourceAccessibility": "Accessibility checker",
  "issues.locationParagraph": "Paragraph: {text}",
  "issues.locationTable": "Table: {text}",
  "issues.locationTableNumber": "Table {number}",
  "issues.locationObject": "Object in: {text}",
  "issues.markHeaderRow": "Mark first row as header",
  "issues.addDocumentTitle": "Add document title…",
  "issues.addAltText": "Add alt text…",
  "issues.addLinkText": "Add link text…",
  "issues.addContentControlLabel": "Add content control label…",
  "issues.useHeadingLevel": "Use Heading {level}",
  "issues.fixTitle.document-title": "Add document title",
  "issues.fixTitle.picture-alt": "Add picture alt text",
  "issues.fixTitle.drawing-alt": "Add drawing alt text",
  "issues.fixTitle.link-text": "Add hyperlink text",
  "issues.fixTitle.content-control-label": "Add content control label",
  "issues.fixDescription.document-title": "Enter a concise title that identifies this document.",
  "issues.fixDescription.picture-alt": "Describe the picture's purpose or essential content for screen-reader users.",
  "issues.fixDescription.drawing-alt": "Describe the drawing's purpose or essential content for screen-reader users.",
  "issues.fixDescription.link-text": "Enter visible text that describes the hyperlink destination or purpose.",
  "issues.fixDescription.content-control-label": "Enter a visible, descriptive label that tells users what information this content control expects (WCAG 3.3.2).",
  "issues.fixField.document-title": "Document title",
  "issues.fixField.picture-alt": "Picture alt text",
  "issues.fixField.drawing-alt": "Drawing alt text",
  "issues.fixField.link-text": "Hyperlink text",
  "issues.fixField.content-control-label": "Content control label",
  "issues.fixRequired": "Enter a value before applying this fix.",
  "issues.preflightTitle.save": "Review issues before saving?",
  "issues.preflightTitle.export": "Review issues before exporting?",
  "issues.preflightDescription": "Editor found {count} current issues. You can review them now or continue without fixing them.",
  "issues.preflightReview": "Review issues",
  "issues.preflightContinue": "Continue anyway",
  "versions.title": "Version history",
  "versions.description": "Review, compare, and restore Host-persisted versions.",
  "versions.refresh": "Refresh versions",
  "versions.saveVersion": "Save a version",
  "versions.saveLabel": "Version label",
  "versions.savePlaceholder": "For example, Before legal review",
  "versions.empty": "No saved versions",
  "versions.emptyDescription": "Versions saved by the Host will appear here.",
  "versions.loading": "Loading version history…",
  "versions.failed": "Version history could not be loaded.",
  "versions.createdBy": "{date} · {author}",
  "versions.unknownAuthor": "Unknown author",
  "versions.size": "{size}",
  "versions.select": "Select version {label}",
  "versions.compare": "Compare with current",
  "versions.merge": "Merge",
  "versions.moreOptions": "More options",
  "versions.restore": "Restore this version",
  "versions.openCopy": "Open as a copy",
  "versions.conflictTitle": "A newer version is available",
  "versions.conflictDescription": "The remote document changed after this editor opened it. Choose how to continue; the remote version will not be overwritten silently.",
  "versions.keepLocal": "Keep local copy",
  "versions.openRemote": "Open remote version",
  "versions.saveCopy": "Save as new version",
  "recovery.title": "Recover unsaved work",
  "recovery.description": "A newer local recovery snapshot is available for this file.",
  "recovery.snapshot": "Recovered {date} · {size}",
  "recovery.restore": "Restore",
  "recovery.discard": "Discard",
  "recovery.failed": "The local recovery snapshot could not be opened.",
  "bookmarks.title": "Bookmarks",
  "bookmarks.description": "Create, find, rename, and remove document bookmarks.",
  "bookmarks.add": "Add bookmark",
  "bookmarks.addDescription": "Name the current text selection or cursor position.",
  "bookmarks.name": "Bookmark name",
  "bookmarks.namePlaceholder": "For example, Introduction",
  "bookmarks.addSelection": "Add at selection",
  "bookmarks.search": "Search bookmarks",
  "bookmarks.searchPlaceholder": "Search by name or text",
  "bookmarks.filter": "Filter bookmarks",
  "bookmarks.filterAll": "All bookmarks",
  "bookmarks.filterEditable": "Editable",
  "bookmarks.filterImported": "Imported read-only",
  "bookmarks.sort": "Sort bookmarks",
  "bookmarks.sortDocument": "Document order",
  "bookmarks.sortName": "Name",
  "bookmarks.summary": "{count} bookmarks",
  "bookmarks.list": "Document bookmarks",
  "bookmarks.importedReadOnly": "Imported read-only",
  "bookmarks.internal": "Internal",
  "bookmarks.dependencies": "{count} references",
  "bookmarks.empty": "No bookmarks",
  "bookmarks.emptyDescription": "Select text or place the cursor, then choose Add bookmark.",
  "bookmarks.noMatches": "No matching bookmarks",
  "bookmarks.noMatchesDescription": "Try another name or clear the filter.",
  "bookmarks.selected": "Selected bookmark",
  "bookmarks.selectNamed": "Select bookmark {name}",
  "bookmarks.details": "Bookmark details",
  "bookmarks.edit": "Edit bookmark",
  "bookmarks.bookmarkedText": "Bookmarked text",
  "bookmarks.type": "Type",
  "bookmarks.editable": "Editable",
  "bookmarks.references": "References",
  "bookmarks.hyperlink": "Hyperlink",
  "bookmarks.field": "Field",
  "bookmarks.dependencySummary": "{count} links or fields point to this bookmark.",
  "bookmarks.noDependencies": "Nothing currently points to this bookmark.",
  "bookmarks.readOnlyDescription": "This imported bookmark uses an overlapping OOXML range. It is preserved and can be located, but cannot be safely renamed or deleted.",
  "bookmarks.renameTo": "Rename to",
  "bookmarks.goTo": "Go to",
  "bookmarks.goToNamed": "Go to bookmark {name}",
  "bookmarks.editNamed": "Edit bookmark {name}",
  "bookmarks.deleteNamed": "Delete bookmark {name}",
  "bookmarks.editTitle": "Edit {name}",
  "bookmarks.editDescription": "Rename this bookmark. Dependent links and fields are updated automatically.",
  "bookmarks.rename": "Rename",
  "bookmarks.delete": "Delete bookmark",
  "bookmarks.deleteTitle": "Delete {name}?",
  "bookmarks.deleteImpact": "{count} dependent links or fields will become broken. The bookmarked text will remain.",
  "bookmarks.deleteNoImpact": "The bookmarked text will remain.",
  "citations.title": "Citations",
  "citations.citation": "Citation",
  "citations.sourcesSummary": "{sources} sources · {citations} citations",
  "citations.newSource": "New source",
  "citations.saveSource": "Save source",
  "citations.addSource": "Add source",
  "citations.noSources": "No citation sources",
  "citations.noSourcesDescription": "Add a source to cite it here and include it in the bibliography.",
  "citations.noMatches": "No matching sources",
  "citations.noMatchesDescription": "Try another title, author, or source id.",
  "citations.searchSources": "Search citation sources",
  "citations.insert": "Insert Citation",
  "citations.cite": "Cite",
  "citations.style": "Citation style",
  "citations.update": "Update Citations",
  "citations.updateAll": "Update citations and bibliography",
  "citations.bibliography": "Bibliography",
  "citations.insertBibliography": "Insert bibliography",
  "citations.titleField": "Title",
  "citations.titlePlaceholder": "Source title",
  "citations.author": "Author",
  "citations.authorPlaceholder": "Family, Given",
  "citations.year": "Year",
  "citations.type": "CSL type",
  "citations.locator": "Page or locator",
  "citations.optional": "Optional",
  "citations.suppressAuthor": "Suppress author",
  "citations.anonymous": "Anonymous",
  "citations.untitled": "Untitled",
  "citations.cursorRequired": "Place the cursor in the document first.",
  "citations.titleRequired": "Enter a source title.",
  "citations.group": "Citations & bibliography",
  "citations.inDocument": "Citations in document",
  "citations.editCitation": "Edit citation",
  "citations.deleteCitation": "Delete citation",
  "citations.saveCitation": "Save citation",
  "citations.dialogDescription": "Manage sources, insert citations, and keep the bibliography up to date.",
  "citations.panelEmpty": "No citations in this document",
  "citations.panelEmptyDescription": "Use References > Insert Citation to add the first citation.",
  "citations.insertDescription": "Choose one or more sources, adjust each item's details, then insert the citation at the cursor.",
  "citations.editDescription": "Update the sources and optional details for the selected citation.",
  "citations.chooseSource": "Choose a citation source",
  "citations.chooseSources": "Choose citation sources",
  "citations.editSource": "Edit source",
  "citations.backToSources": "Back to sources",
  "citations.sourceFormDescription": "Enter the source details used to format the citation and bibliography.",
  "citations.optionalDetails": "Citation details",
  "citations.optionalDetailsDescription": "Optional settings for this citation only.",
  "citations.cluster": "Sources in this citation",
  "citations.clusterDescription": "Sources are formatted as one citation cluster in the order shown.",
  "citations.selectedSourceCount": "{count} selected",
  "citations.noSelectedSources": "No sources selected",
  "citations.noSelectedSourcesDescription": "Select one or more sources from the list above.",
  "citations.sourceRequired": "Select at least one citation source.",
  "citations.editItemDetails": "Edit citation details",
  "citations.itemDetailsDescription": "Set optional details for this source in the current citation only.",
  "citations.editItemAria": "Edit citation details for {source}",
  "citations.removeItemAria": "Remove {source} from this citation",
  "citations.prefix": "Prefix",
  "citations.suffix": "Suffix",
  "citations.locatorLabel": "Locator type",
  "citations.locatorPage": "Page",
  "citations.locatorChapter": "Chapter",
  "citations.locatorSection": "Section",
  "citations.locatorParagraph": "Paragraph",
  "citations.locatorFigure": "Figure",
  "citations.locatorTable": "Table",
  "citations.prefixSummary": "Prefix: {value}",
  "citations.suffixSummary": "Suffix: {value}",
  "citations.noItemDetails": "No optional details",
  "paragraph.title": "Paragraph",
  "paragraph.description": "Set line and paragraph spacing for the selected paragraphs.",
  "paragraph.lineSpacing": "Line spacing",
  "paragraph.lines": "lines",
  "paragraph.before": "Before",
  "paragraph.after": "After",
  "paragraph.lineSpacingOptions": "Line Spacing Options…",
  "paragraph.addSpaceBefore": "Add Space Before Paragraph",
  "paragraph.removeSpaceBefore": "Remove Space Before Paragraph",
  "paragraph.addSpaceAfter": "Add Space After Paragraph",
  "paragraph.removeSpaceAfter": "Remove Space After Paragraph",
  "styles.group": "Styles",
  "styles.quickStyles": "Quick Styles",
  "styles.moreStyles": "More Styles",
  "styles.pane": "Styles Pane",
  "styles.clearFormatting": "Clear Formatting",
  "styles.currentStyle": "Current style:",
  "styles.newStyle": "New Style…",
  "styles.newStyleDefaultName": "New Style",
  "styles.selectAll": "Select All",
  "styles.applyStyle": "Apply a style:",
  "styles.modifyStyle": "Modify Style…",
  "styles.updateFromSelection": "Update to Match Selection",
  "styles.noStyles": "No styles",
  "styles.noStylesDescription": "This document does not contain any paragraph styles.",
  "styles.showGuides": "Show style guides",
  "styles.modifyDescription": "Define the reusable paragraph and character formatting for this style.",
  "styles.properties": "Properties",
  "styles.name": "Name",
  "styles.styleType": "Style type",
  "styles.paragraphStyle": "Paragraph",
  "styles.basedOn": "Style based on",
  "styles.followingParagraph": "Style for following paragraph",
  "styles.formatting": "Formatting",
  "styles.previousParagraphPreview": "Previous paragraph",
  "styles.currentParagraphPreview": "The current paragraph shows the selected style formatting.",
  "styles.followingParagraphPreview": "Following paragraph",
  "styles.addToQuickStyles": "Add to Quick Style list",
  "styles.list": "List",
  "styles.filterRecommended": "Recommended",
  "styles.filterAll": "All styles",
  "styles.filterInUse": "In use",
  "drawing.diagram": "SmartArt diagram",
  "drawing.diagramNode": "SmartArt node",
  "drawing.diagramTools": "SmartArt tools",
  "drawing.diagramAddNode": "Add SmartArt node",
  "drawing.diagramDeleteNode": "Delete selected SmartArt node",
  "drawing.diagramChangeStyle": "Change SmartArt style",
  "drawing.diagramTextPane": "SmartArt text pane",
  "drawing.diagramLayout": "Layout",
  "drawing.diagramNodeActions": "Node actions",
  "drawing.diagramMoveUp": "Move node up",
  "drawing.diagramMoveDown": "Move node down",
  "drawing.diagramPromote": "Promote node",
  "drawing.diagramDemote": "Demote node",
  "drawing.diagramReplacePicture": "Replace node picture",
  "table.sizePicker.label": "Table",
  "table.sizePicker.insert": "Insert table",
  "table.sizePicker.choose": "Insert a table",
  "table.sizePicker.prompt": "Insert table",
  "table.sizePicker.selection": "{columns}×{rows} table",
  "table.sizePicker.custom": "Insert Table...",
  "smartArt.label": "SmartArt",
  "smartArt.insert": "Insert SmartArt",
  "smartArt.choose": "Choose a SmartArt graphic",
  "smartArt.chooseDescription": "Select a layout by its visual structure.",
  "smartArt.categories": "SmartArt categories",
  "smartArt.layouts": "SmartArt layouts",
  "smartArt.preview": "Preview",
  "smartArt.insertHint": "Select a thumbnail to insert this editable layout.",
  "smartArt.edit": "Edit SmartArt",
  "smartArt.editorDescription": "Edit the diagram structure and review the result in the preview.",
  "smartArt.structure": "Structure",
  "smartArt.nodeCount": "{count} nodes",
  "smartArt.editorHint": "Double-click a shape to edit its text directly.",
  "smartArt.textPaneHint": "Enter adds a shape, Tab/Shift+Tab demotes or promotes, Alt+Arrow moves.",
  "smartArt.readOnly.unsupportedLayout": "This SmartArt layout is preserved as read-only.",
  "smartArt.readOnly.layoutDropsNodes": "This SmartArt has more shapes than the layout can place, so it is preserved as read-only.",
  "smartArt.readOnly.unknownLayout": "Unrecognized Office layout",
  "smartArt.readOnly.layoutFixed": "This is the layout Office saved in the file. It cannot be changed here.",
  "smartArt.readOnly.previewUnavailable": "No preview: this editor would only approximate Office's layout, so it would not show what the file contains. The slide itself shows the original drawing.",
  "smartArt.ownLayoutsHint": "These are this editor's own editable layouts. An Office layout of the same name is a different design and is preserved read-only when opened.",
  "smartArt.done": "Done",
  "smartArt.category.all": "All",
  "smartArt.category.list": "List",
  "smartArt.category.process": "Process",
  "smartArt.category.cycle": "Cycle",
  "smartArt.category.hierarchy": "Hierarchy",
  "smartArt.category.relationship": "Relationship",
  "smartArt.category.matrix": "Matrix",
  "smartArt.category.pyramid": "Pyramid",
  "smartArt.category.picture": "Picture",
  "smartArt.category.textcard": "Text Card",
  "smartArt.category.timeline": "Timeline",
  "smartArt.category.meettheteam": "Meet the Team",
  "smartArt.layout.list": "Basic Block List",
  "smartArt.layout.process": "Basic Process",
  "smartArt.layout.hierarchy": "Organization Chart",
  "smartArt.layout.cycle": "Basic Cycle",
  "smartArt.layout.radial": "Basic Radial",
  "smartArt.layout.relationship": "Circle Relationship",
  "smartArt.layout.matrix": "Basic Matrix",
  "smartArt.layout.pyramid": "Basic Pyramid",
  "smartArt.layout.venn": "Basic Venn",
  "smartArt.layout.target": "Basic Target",
  "smartArt.layout.stack": "Stacked Venn",
  "smartArt.layout.picture": "Picture Accent List",
  "smartArt.layout.segmented": "Segmented Process",
  "smartArt.layoutDescription.list": "Show nonsequential or grouped information in equal blocks.",
  "smartArt.layoutDescription.process": "Show progression through a horizontal series of steps.",
  "smartArt.layoutDescription.hierarchy": "Show reporting relationships in an organization.",
  "smartArt.layoutDescription.cycle": "Show a continuing sequence of stages, tasks, or events.",
  "smartArt.layoutDescription.radial": "Show how several ideas relate to one central idea.",
  "smartArt.layoutDescription.relationship": "Show related or contrasting ideas arranged around a center.",
  "smartArt.layoutDescription.matrix": "Show the relationship of components to a whole in quadrants.",
  "smartArt.layoutDescription.pyramid": "Show proportional or hierarchical relationships from top to bottom.",
  "smartArt.layoutDescription.venn": "Show overlapping or interconnected relationships.",
  "smartArt.layoutDescription.target": "Show containment, gradation, or steps toward a goal.",
  "smartArt.layoutDescription.stack": "Show overlapping relationships with a clear front-to-back order.",
  "smartArt.layoutDescription.picture": "Pair a picture accent with supporting text for each item.",
  "smartArt.layoutDescription.textcard": "Show titled cards of text, each with its own accent.",
  "smartArt.layoutDescription.timeline": "Show events in the order they happen along a line.",
  "smartArt.layoutDescription.meettheteam": "Introduce people with a picture, a name and a role.",
  "smartArt.layoutDescription.segmented": "Show sequential steps as connected chevron segments.",
  "drawing.chart": "Chart",
  "drawing.chartTitle": "Chart title",
  "drawing.chartUnsupported": "This chart type is preserved as read-only."
}, p_ = {
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.apply": "应用",
  "common.confirm": "确认",
  "common.delete": "删除",
  "common.new": "新建",
  "common.print": "打印",
  "common.open": "打开",
  "common.save": "保存",
  "common.saveAs": "另存为",
  "common.export": "导出",
  "common.saved": "已保存",
  "common.retry": "重试",
  "common.loading": "正在加载…",
  "common.search": "搜索",
  "common.noResults": "没有结果",
  "common.previous": "上一个",
  "common.next": "下一个",
  "common.more": "更多",
  "shell.titlebar": "文档标题栏",
  "shell.ribbon": "编辑器功能区",
  "shell.fileCommands": "文件命令",
  "shell.workspace": "文档编辑区",
  "shell.status": "编辑器状态",
  "shell.documentCanvas": "文档画布",
  "shell.loadingDocument": "正在加载文档…",
  "shell.openFailed": "无法打开此文件",
  "shell.openFailedDescription": "文件可能已损坏、受密码保护或格式不受支持。请检查文件后重试。",
  "shell.technicalDetails": "技术详情",
  "shell.quickAccess": "快速访问",
  "shell.ribbonTabs": "功能区选项卡",
  "shell.gallery": "库",
  "versionInfo.title": "版本",
  "versionInfo.appIcon": "{app} 应用图标",
  "dialog.close": "关闭对话框",
  "dialog.closeConfirmation": "关闭确认对话框",
  "panel.close": "关闭面板",
  "panel.open": "打开面板",
  "panel.actions": "面板操作",
  "panel.resize": "调整面板大小",
  "dock.editor": "编辑器窗格",
  "dock.formatPane": "格式窗格",
  "dock.close": "关闭窗格",
  "dock.openLeft": "打开左侧窗格",
  "dock.openRight": "打开右侧窗格",
  "ribbon.scrollLeft": "向左滚动功能区命令",
  "ribbon.scrollRight": "向右滚动功能区命令",
  "ribbon.moreGroups": "更多功能区组",
  "ribbon.moreGroupsCount": "更多功能区组（{count}）",
  "history.quickAccess": "快速访问历史",
  "history.undo": "撤销上一步操作",
  "history.redo": "重做上一步操作",
  "history.undoShortcut": "撤销 (Ctrl+Z)",
  "history.redoShortcut": "重做 (Ctrl+Y 或 Ctrl+Shift+Z)",
  "search.find": "查找",
  "search.placeholder": "搜索",
  "search.position": "第 {current} 项,共 {count} 项",
  "search.replaced": "已替换 {count} 处",
  "search.enterTerm": "输入搜索内容",
  "search.clear": "清除搜索",
  "search.noResults": "没有搜索结果。",
  "search.enterText": "请输入搜索内容。",
  "search.replaceWith": "替换为",
  "search.replace": "替换",
  "search.replaceAll": "全部替换",
  "status.views": "编辑器视图",
  "status.zoom": "缩放",
  "status.aiReading": "AI 正在读取…",
  "status.aiReadComplete": "AI 读取完成",
  "status.aiReadFailed": "AI 读取失败",
  "slider.decrease": "减小{label}",
  "slider.increase": "增大{label}",
  "shape.rectangle": "矩形",
  "shape.roundedRectangle": "圆角矩形",
  "shape.oval": "椭圆",
  "shape.triangle": "三角形",
  "shape.rightTriangle": "直角三角形",
  "shape.diamond": "菱形",
  "shape.parallelogram": "平行四边形",
  "shape.trapezoid": "梯形",
  "shape.pentagon": "五边形",
  "shape.hexagon": "六边形",
  "shape.chevron": "燕尾形",
  "shape.rightArrow": "向右箭头",
  "shape.leftArrow": "向左箭头",
  "shape.upArrow": "向上箭头",
  "shape.downArrow": "向下箭头",
  "shape.plus": "十字形",
  "shape.star": "星形",
  "shape.heart": "心形",
  "shape.cloud": "云形",
  "shape.decision": "判定",
  "comments.ariaLabel": "批注",
  "comments.add": "添加批注",
  "comments.addLower": "添加批注",
  "comments.empty": "没有批注。",
  "comments.comment": "批注",
  "comments.replyingInThread": "正在回复此会话",
  "comments.replyingTo": "回复 {author}",
  "comments.cancelReply": "取消回复",
  "comments.replyText": "回复内容",
  "comments.newComment": "新建批注",
  "comments.reply": "回复",
  "comments.addReply": "添加回复",
  "comments.authorComment": "{author} 的批注",
  "comments.authorReplyTo": "{author} 回复 {parent}",
  "comments.resolved": "已解决",
  "comments.commentText": "批注内容",
  "comments.replyToComment": "回复批注",
  "comments.reopenComment": "重新打开批注",
  "comments.resolveComment": "解决批注",
  "comments.reopen": "重新打开",
  "comments.resolve": "解决",
  "comments.editComment": "编辑批注",
  "comments.edit": "编辑",
  "comments.deleteComment": "删除批注",
  "comments.unread": "未读",
  "comments.anchorMissing": "锚点缺失",
  "comments.anchorCollapsed": "插入点批注",
  "comments.mentions": "提及 {people}",
  "comments.assigned": "指派给 {people}",
  "font.family": "字体",
  "font.size": "字号",
  "font.changeCase": "更改大小写",
  "font.clearFormatting": "清除格式",
  "font.bold": "加粗",
  "font.italic": "倾斜",
  "font.underline": "下划线",
  "font.doubleUnderline": "双下划线",
  "font.strike": "删除线",
  "font.subscript": "下标",
  "font.superscript": "上标",
  "font.highlight": "文本突出显示颜色",
  "font.color": "字体颜色",
  "paragraph.bullets": "项目符号",
  "paragraph.numbering": "编号",
  "paragraph.multilevel": "多级列表",
  "paragraph.promoteListLevel": "提升列表级别",
  "paragraph.demoteListLevel": "降低列表级别",
  "paragraph.alignLeft": "左对齐",
  "paragraph.alignCenter": "居中",
  "paragraph.alignRight": "右对齐",
  "paragraph.justify": "两端对齐",
  "paragraph.decreaseIndent": "减少缩进",
  "paragraph.increaseIndent": "增加缩进",
  "paragraph.list": "列表",
  "paragraph.listStyle": "段落列表样式",
  "paragraph.start": "起始编号",
  "paragraph.numberingStart": "编号起始值",
  "textAlignment.group": "文本对齐",
  "textAlignment.alignTop": "顶端对齐",
  "textAlignment.alignMiddle": "垂直居中",
  "textAlignment.alignBottom": "底端对齐",
  "colorPicker.picker": "{label} 选择器",
  "colorPicker.heading": "主题颜色和标准颜色",
  "colorPicker.themeColors": "{label}主题颜色",
  "colorPicker.colors": "{label}颜色",
  "colorPicker.setTo": "将{label}设为{color}",
  "colorPicker.noColor": "无颜色",
  "colorPicker.hex": "十六进制",
  "colorPicker.hexColor": "十六进制颜色",
  "slideNav.ariaLabel": "幻灯片导航",
  "slideNav.previous": "上一张幻灯片",
  "slideNav.previousShort": "上一张",
  "slideNav.slide": "幻灯片",
  "slideNav.position": "幻灯片 / {total}",
  "slideNav.next": "下一张幻灯片",
  "slideNav.nextShort": "下一张",
  "slideNav.showAll": "显示所有幻灯片",
  "slideNav.allShort": "全部",
  "animation.order": "动画顺序",
  "animation.empty": "当前所选内容没有动画。",
  "animation.moveEarlier": "向前移动动画",
  "animation.moveEarlierShort": "向前移动",
  "animation.moveLater": "向后移动动画",
  "animation.moveLaterShort": "向后移动",
  "animation.remove": "删除动画",
  "selection.objects": "此幻灯片上的对象",
  "selection.objectName": "对象名称",
  "selection.showObject": "显示对象",
  "selection.hideObject": "隐藏对象",
  "selection.unlockObject": "解锁对象",
  "selection.lockObject": "锁定对象",
  "selection.moveForward": "上移一层",
  "selection.moveBackward": "下移一层",
  "selection.none": "未选择内容",
  "selection.connectorStart": "移动连接线起点",
  "selection.connectorEnd": "移动连接线终点",
  "selection.adjustCornerRadius": "调整圆角半径",
  "selection.cropFrom": "从{direction}裁剪图片",
  "slides.rail": "幻灯片",
  "slides.hidden": "隐藏的幻灯片",
  "notes.label": "演讲者备注",
  "notes.empty": "此幻灯片没有演讲者备注。",
  "notes.save": "保存备注",
  "notes.title": "此幻灯片的演讲者备注",
  "shapes.gallery": "形状库",
  "shapes.label": "形状",
  "drawing.canvas": "绘图画布",
  "drawing.connector": "连接线",
  "drawing.image": "绘图图像",
  "outline.emptyTitle": "没有标题",
  "outline.emptyDescription": "应用标题样式以构建文档大纲。",
  "outline.headings": "文档大纲标题",
  "outline.expand": "展开{label}",
  "outline.collapse": "折叠{label}",
  "inspector.formatProperties": "格式属性",
  "inspector.modes": "检查器模式",
  "issues.workbench": "问题工作台",
  "equation.editTitle": "编辑公式",
  "equation.insertTitle": "插入公式",
  "equation.insert": "插入",
  "equation.editDescription": "编辑 UnicodeMath 或 LaTeX 源码。每个顶层行会生成一行公式。",
  "equation.insertDescription": "输入 UnicodeMath 或 LaTeX 源码。每个顶层行会生成一行公式。",
  "equation.close": "关闭公式对话框",
  "equation.inputFormat": "输入格式",
  "equation.inputFormatAria": "公式输入格式",
  "equation.displayLine": "单独成行显示",
  "equation.commonFormulas": "常用公式",
  "equation.presets": "{count} 个预设",
  "equation.commonFormulaPresets": "常用公式预设",
  "equation.usePreset": "使用{label}",
  "equation.linearInput": "线性输入",
  "equation.help": "每个顶层行会生成一行公式。大括号或矩阵结构中的换行仍属于该结构。按 Ctrl+Enter 或 Command+Enter 应用。",
  "equation.fallback": "已使用后备方式解释输入：{error}",
  "equation.opaqueNotice": "此公式包含无法完整表示为线性输入的已保留 Office Math。未编辑时应用可保持原样；编辑源码会替换该内容。",
  "equation.overwriteNotice": "此公式包含已保留的 Office Math。确认后将替换该内容。",
  "equation.preview": "预览",
  "equation.confirmOverwrite": "确认覆盖",
  "equation.preset.quadratic": "二次方程求根公式",
  "equation.preset.pythagorean": "勾股定理",
  "equation.preset.euler": "欧拉恒等式",
  "equation.preset.circle-area": "圆面积",
  "equation.preset.newton": "牛顿第二定律",
  "equation.preset.sum": "有限求和",
  "equation.preset.integral": "定积分",
  "equation.preset.derivative": "导数极限",
  "equation.preset.product": "有限乘积",
  "equation.preset.bayes": "贝叶斯定理",
  "equation.preset.matrix": "2 × 2 矩阵",
  "equation.preset.system": "方程组",
  "inspector.moreModes": "更多面板",
  "commandPalette.title": "命令",
  "commandPalette.description": "搜索并运行编辑器命令。",
  "commandPalette.placeholder": "搜索命令",
  "commandPalette.recent": "最近使用",
  "commandPalette.all": "所有命令",
  "commandPalette.noResults": "没有匹配的命令",
  "commandPalette.close": "关闭命令面板",
  "commandPalette.runFailed": "无法完成该命令。",
  "commandPalette.disabled": "不可用：{reason}",
  "issues.title": "编辑器",
  "issues.errors.one": "{count} 个错误",
  "issues.errors.other": "{count} 个错误",
  "issues.warnings.one": "{count} 个警告",
  "issues.warnings.other": "{count} 个警告",
  "issues.empty": "未发现问题",
  "issues.emptyDescription": "此文档已通过当前检查。",
  "issues.search": "搜索问题",
  "issues.searchPlaceholder": "搜索问题和位置",
  "issues.filter": "筛选问题",
  "issues.filterAll": "所有问题",
  "issues.filterErrors": "错误",
  "issues.filterWarnings": "警告",
  "issues.filterInfo": "提示",
  "issues.category": "问题类别",
  "issues.allCategories": "所有类别",
  "issues.summary": "{count} 个问题",
  "issues.summary.one": "{count} 个问题",
  "issues.summary.other": "{count} 个问题",
  "issues.jump": "转到问题",
  "issues.loading": "正在检查文档…",
  "issues.failed": "无法完成检查。",
  "issues.applySuggestion": "应用建议",
  "issues.ignoreOnce": "忽略一次",
  "issues.ignoreSimilar": "忽略同类问题",
  "issues.categorySpelling": "拼写",
  "issues.categoryGrammar": "语法",
  "issues.categoryAccessibility": "辅助功能",
  "issues.sourceProofing": "校对",
  "issues.sourceAccessibility": "辅助功能检查器",
  "issues.locationParagraph": "段落：{text}",
  "issues.locationTable": "表格：{text}",
  "issues.locationTableNumber": "表格 {number}",
  "issues.locationObject": "对象所在位置：{text}",
  "issues.markHeaderRow": "将第一行标记为标题行",
  "issues.addDocumentTitle": "添加文档标题…",
  "issues.addAltText": "添加替代文本…",
  "issues.addLinkText": "添加链接文本…",
  "issues.addContentControlLabel": "添加内容控件标签…",
  "issues.useHeadingLevel": "使用标题 {level}",
  "issues.fixTitle.document-title": "添加文档标题",
  "issues.fixTitle.picture-alt": "添加图片替代文本",
  "issues.fixTitle.drawing-alt": "添加绘图替代文本",
  "issues.fixTitle.link-text": "添加超链接文本",
  "issues.fixTitle.content-control-label": "添加内容控件标签",
  "issues.fixDescription.document-title": "输入一个能够清楚识别此文档的简短标题。",
  "issues.fixDescription.picture-alt": "描述图片的用途或关键信息，供屏幕阅读器用户理解。",
  "issues.fixDescription.drawing-alt": "描述绘图的用途或关键信息，供屏幕阅读器用户理解。",
  "issues.fixDescription.link-text": "输入能够说明超链接目标或用途的可见文本。",
  "issues.fixDescription.content-control-label": "输入一个可见且描述清晰的标签，说明该内容控件需要填写的信息（WCAG 3.3.2）。",
  "issues.fixField.document-title": "文档标题",
  "issues.fixField.picture-alt": "图片替代文本",
  "issues.fixField.drawing-alt": "绘图替代文本",
  "issues.fixField.link-text": "超链接文本",
  "issues.fixField.content-control-label": "内容控件标签",
  "issues.fixRequired": "请先输入内容，再应用此修复。",
  "issues.preflightTitle.save": "保存前检查问题？",
  "issues.preflightTitle.export": "导出前检查问题？",
  "issues.preflightDescription": "编辑器当前发现 {count} 个问题。你可以立即检查，也可以暂不修复并继续。",
  "issues.preflightReview": "检查问题",
  "issues.preflightContinue": "仍然继续",
  "versions.title": "版本历史",
  "versions.description": "查看、比较和恢复由宿主保存的版本。",
  "versions.refresh": "刷新版本",
  "versions.saveVersion": "保存版本",
  "versions.saveLabel": "版本标签",
  "versions.savePlaceholder": "例如：法务审核前",
  "versions.empty": "没有已保存的版本",
  "versions.emptyDescription": "由宿主保存的版本会显示在这里。",
  "versions.loading": "正在加载版本历史…",
  "versions.failed": "无法加载版本历史。",
  "versions.createdBy": "{date} · {author}",
  "versions.unknownAuthor": "未知作者",
  "versions.size": "{size}",
  "versions.select": "选择版本 {label}",
  "versions.compare": "与当前版本比较",
  "versions.merge": "合并",
  "versions.moreOptions": "更多操作",
  "versions.restore": "恢复此版本",
  "versions.openCopy": "作为副本打开",
  "versions.conflictTitle": "发现更新的版本",
  "versions.conflictDescription": "远程文档在本编辑器打开后发生了变化。请选择后续操作；系统不会静默覆盖远程版本。",
  "versions.keepLocal": "保留本地副本",
  "versions.openRemote": "打开远端版本",
  "versions.saveCopy": "另存为新版本",
  "recovery.title": "恢复未保存的工作",
  "recovery.description": "此文件有一个更新的本地恢复快照。",
  "recovery.snapshot": "恢复于 {date} · {size}",
  "recovery.restore": "恢复",
  "recovery.discard": "丢弃",
  "recovery.failed": "无法打开本地恢复快照。",
  "bookmarks.title": "书签",
  "bookmarks.description": "创建、查找、重命名和删除文档书签。",
  "bookmarks.add": "添加书签",
  "bookmarks.addDescription": "为当前文本选区或光标位置命名。",
  "bookmarks.name": "书签名称",
  "bookmarks.namePlaceholder": "例如 Introduction",
  "bookmarks.addSelection": "在选区添加",
  "bookmarks.search": "搜索书签",
  "bookmarks.searchPlaceholder": "按名称或文本搜索",
  "bookmarks.filter": "筛选书签",
  "bookmarks.filterAll": "全部书签",
  "bookmarks.filterEditable": "可编辑",
  "bookmarks.filterImported": "导入的只读书签",
  "bookmarks.sort": "书签排序",
  "bookmarks.sortDocument": "文档顺序",
  "bookmarks.sortName": "名称",
  "bookmarks.summary": "{count} 个书签",
  "bookmarks.list": "文档书签",
  "bookmarks.importedReadOnly": "导入，只读",
  "bookmarks.internal": "内部书签",
  "bookmarks.dependencies": "{count} 个引用",
  "bookmarks.empty": "暂无书签",
  "bookmarks.emptyDescription": "选择文本或放置光标，然后点击“添加书签”。",
  "bookmarks.noMatches": "没有匹配的书签",
  "bookmarks.noMatchesDescription": "请尝试其他名称或清除筛选。",
  "bookmarks.selected": "已选书签",
  "bookmarks.selectNamed": "选择书签 {name}",
  "bookmarks.details": "书签详情",
  "bookmarks.edit": "编辑书签",
  "bookmarks.bookmarkedText": "书签文本",
  "bookmarks.type": "类型",
  "bookmarks.editable": "可编辑",
  "bookmarks.references": "引用",
  "bookmarks.hyperlink": "超链接",
  "bookmarks.field": "域",
  "bookmarks.dependencySummary": "有 {count} 个链接或域指向此书签。",
  "bookmarks.noDependencies": "当前没有内容指向此书签。",
  "bookmarks.readOnlyDescription": "此导入书签使用重叠的 OOXML 范围。编辑器会保留并可定位它，但无法安全地重命名或删除。",
  "bookmarks.renameTo": "重命名为",
  "bookmarks.goTo": "转到",
  "bookmarks.goToNamed": "转到书签 {name}",
  "bookmarks.editNamed": "编辑书签 {name}",
  "bookmarks.deleteNamed": "删除书签 {name}",
  "bookmarks.editTitle": "编辑 {name}",
  "bookmarks.editDescription": "重命名此书签；依赖它的链接和域会自动更新。",
  "bookmarks.rename": "重命名",
  "bookmarks.delete": "删除书签",
  "bookmarks.deleteTitle": "删除 {name}？",
  "bookmarks.deleteImpact": "{count} 个依赖链接或域将变为无效；书签标记的文本会保留。",
  "bookmarks.deleteNoImpact": "书签标记的文本会保留。",
  "citations.title": "引用",
  "citations.citation": "引用",
  "citations.sourcesSummary": "{sources} 条文献 · {citations} 处引用",
  "citations.newSource": "新建文献",
  "citations.saveSource": "保存文献",
  "citations.addSource": "添加文献",
  "citations.noSources": "暂无引用文献",
  "citations.noSourcesDescription": "添加一条文献后，即可在此引用并收录到参考文献表。",
  "citations.noMatches": "没有匹配的文献",
  "citations.noMatchesDescription": "请尝试其他标题、作者或文献 ID。",
  "citations.searchSources": "搜索引用文献",
  "citations.insert": "插入引用",
  "citations.cite": "引用",
  "citations.style": "引用样式",
  "citations.update": "更新引用",
  "citations.updateAll": "更新引用和参考文献表",
  "citations.bibliography": "参考文献表",
  "citations.insertBibliography": "插入参考文献表",
  "citations.titleField": "标题",
  "citations.titlePlaceholder": "文献标题",
  "citations.author": "作者",
  "citations.authorPlaceholder": "姓, 名",
  "citations.year": "年份",
  "citations.type": "CSL 类型",
  "citations.locator": "页码或定位符",
  "citations.optional": "可选",
  "citations.suppressAuthor": "隐藏作者",
  "citations.anonymous": "匿名",
  "citations.untitled": "无标题",
  "citations.cursorRequired": "请先将光标放入文档。",
  "citations.titleRequired": "请输入文献标题。",
  "citations.group": "引用和参考文献表",
  "citations.inDocument": "文档中的引用",
  "citations.editCitation": "编辑引用",
  "citations.deleteCitation": "删除引用",
  "citations.saveCitation": "保存引用",
  "citations.dialogDescription": "管理文献、插入引用，并保持参考文献表为最新状态。",
  "citations.panelEmpty": "文档中暂无引用",
  "citations.panelEmptyDescription": "请使用“引用 → 插入引用”添加第一处引用。",
  "citations.insertDescription": "选择一条或多条文献，按需调整各项信息，然后插入到当前光标位置。",
  "citations.editDescription": "更新所选引用的文献和可选信息。",
  "citations.chooseSource": "选择引用文献",
  "citations.chooseSources": "选择引用文献",
  "citations.editSource": "编辑文献",
  "citations.backToSources": "返回文献列表",
  "citations.sourceFormDescription": "填写用于生成引用和参考文献表的文献信息。",
  "citations.optionalDetails": "本次引用设置",
  "citations.optionalDetailsDescription": "仅应用于本次引用的可选设置。",
  "citations.cluster": "本次引用的文献",
  "citations.clusterDescription": "文献将按当前顺序合并为一组引用。",
  "citations.selectedSourceCount": "已选择 {count} 条",
  "citations.noSelectedSources": "尚未选择文献",
  "citations.noSelectedSourcesDescription": "请从上方列表选择一条或多条文献。",
  "citations.sourceRequired": "请至少选择一条引用文献。",
  "citations.editItemDetails": "编辑引用详情",
  "citations.itemDetailsDescription": "这些可选设置仅应用于当前引用中的这条文献。",
  "citations.editItemAria": "编辑 {source} 的引用详情",
  "citations.removeItemAria": "从本次引用中移除 {source}",
  "citations.prefix": "前缀",
  "citations.suffix": "后缀",
  "citations.locatorLabel": "定位符类型",
  "citations.locatorPage": "页码",
  "citations.locatorChapter": "章节",
  "citations.locatorSection": "小节",
  "citations.locatorParagraph": "段落",
  "citations.locatorFigure": "图",
  "citations.locatorTable": "表",
  "citations.prefixSummary": "前缀：{value}",
  "citations.suffixSummary": "后缀：{value}",
  "citations.noItemDetails": "无可选设置",
  "paragraph.title": "段落",
  "paragraph.description": "设置所选段落的行距和段落间距。",
  "paragraph.lineSpacing": "行距",
  "paragraph.lines": "倍",
  "paragraph.before": "段前",
  "paragraph.after": "段后",
  "paragraph.lineSpacingOptions": "行距选项…",
  "paragraph.addSpaceBefore": "增加段前间距",
  "paragraph.removeSpaceBefore": "删除段前间距",
  "paragraph.addSpaceAfter": "增加段后间距",
  "paragraph.removeSpaceAfter": "删除段后间距",
  "styles.group": "样式",
  "styles.quickStyles": "快速样式",
  "styles.moreStyles": "更多样式",
  "styles.pane": "样式窗格",
  "styles.clearFormatting": "清除格式",
  "styles.currentStyle": "当前样式：",
  "styles.newStyle": "新建样式…",
  "styles.newStyleDefaultName": "新建样式",
  "styles.selectAll": "全选",
  "styles.applyStyle": "应用样式：",
  "styles.modifyStyle": "修改样式…",
  "styles.updateFromSelection": "更新以匹配所选内容",
  "styles.noStyles": "没有样式",
  "styles.noStylesDescription": "此文档不包含段落样式。",
  "styles.showGuides": "显示样式标记",
  "styles.modifyDescription": "定义此样式可复用的段落和字符格式。",
  "styles.properties": "属性",
  "styles.name": "名称",
  "styles.styleType": "样式类型",
  "styles.paragraphStyle": "段落",
  "styles.basedOn": "样式基于",
  "styles.followingParagraph": "后续段落样式",
  "styles.formatting": "格式",
  "styles.previousParagraphPreview": "上一段落",
  "styles.currentParagraphPreview": "当前段落显示所选样式的格式。",
  "styles.followingParagraphPreview": "下一段落",
  "styles.addToQuickStyles": "添加到快速样式列表",
  "styles.list": "列表",
  "styles.filterRecommended": "推荐",
  "styles.filterAll": "所有样式",
  "styles.filterInUse": "正在使用",
  "drawing.diagram": "SmartArt 图示",
  "drawing.diagramNode": "SmartArt 节点",
  "drawing.diagramTools": "SmartArt 工具",
  "drawing.diagramAddNode": "添加 SmartArt 节点",
  "drawing.diagramDeleteNode": "删除所选 SmartArt 节点",
  "drawing.diagramChangeStyle": "更改 SmartArt 样式",
  "drawing.diagramTextPane": "SmartArt 文本窗格",
  "drawing.diagramLayout": "布局",
  "drawing.diagramNodeActions": "节点操作",
  "drawing.diagramMoveUp": "上移节点",
  "drawing.diagramMoveDown": "下移节点",
  "drawing.diagramPromote": "提升节点层级",
  "drawing.diagramDemote": "降低节点层级",
  "drawing.diagramReplacePicture": "替换节点图片",
  "table.sizePicker.label": "表格",
  "table.sizePicker.insert": "插入表格",
  "table.sizePicker.choose": "插入表格",
  "table.sizePicker.prompt": "插入表格",
  "table.sizePicker.selection": "{columns}×{rows} 表格",
  "table.sizePicker.custom": "插入表格...",
  "smartArt.label": "SmartArt",
  "smartArt.insert": "插入 SmartArt",
  "smartArt.choose": "选择 SmartArt 图形",
  "smartArt.chooseDescription": "根据图形结构选择合适的布局。",
  "smartArt.categories": "SmartArt 分类",
  "smartArt.layouts": "SmartArt 布局",
  "smartArt.preview": "预览",
  "smartArt.insertHint": "单击缩略图即可插入此可编辑布局。",
  "smartArt.edit": "编辑 SmartArt",
  "smartArt.editorDescription": "编辑图示结构，并在右侧实时预览结果。",
  "smartArt.structure": "结构",
  "smartArt.nodeCount": "{count} 个节点",
  "smartArt.editorHint": "双击图形可直接编辑其中的文字。",
  "smartArt.textPaneHint": "Enter 新增形状，Tab/Shift+Tab 降级或升级，Alt+方向键移动。",
  "smartArt.readOnly.unsupportedLayout": "此 SmartArt 版式以只读方式保留。",
  "smartArt.readOnly.layoutDropsNodes": "此 SmartArt 的形状数超出版式可容纳的数量，因此以只读方式保留。",
  "smartArt.readOnly.unknownLayout": "无法识别的 Office 版式",
  "smartArt.readOnly.layoutFixed": "这是 Office 保存在文件中的版式，无法在此处更改。",
  "smartArt.readOnly.previewUnavailable": "不提供预览：本编辑器只能近似还原 Office 的版式，无法反映文件的真实内容。幻灯片上显示的才是原始图形。",
  "smartArt.ownLayoutsHint": "以下是本编辑器自带的可编辑版式。同名的 Office 版式是另一种设计，打开时会以只读方式保留。",
  "smartArt.done": "完成",
  "smartArt.category.all": "全部",
  "smartArt.category.list": "列表",
  "smartArt.category.process": "流程",
  "smartArt.category.cycle": "循环",
  "smartArt.category.hierarchy": "层次结构",
  "smartArt.category.relationship": "关系",
  "smartArt.category.matrix": "矩阵",
  "smartArt.category.pyramid": "棱锥图",
  "smartArt.category.picture": "图片",
  "smartArt.category.textcard": "文本卡片",
  "smartArt.category.timeline": "时间线",
  "smartArt.category.meettheteam": "团队介绍",
  "smartArt.layout.list": "基本块列表",
  "smartArt.layout.process": "基本流程",
  "smartArt.layout.hierarchy": "组织结构图",
  "smartArt.layout.cycle": "基本循环",
  "smartArt.layout.radial": "基本射线",
  "smartArt.layout.relationship": "圆形关系",
  "smartArt.layout.matrix": "基本矩阵",
  "smartArt.layout.pyramid": "基本棱锥图",
  "smartArt.layout.venn": "基本维恩图",
  "smartArt.layout.target": "基本目标",
  "smartArt.layout.stack": "堆叠维恩图",
  "smartArt.layout.picture": "图片重点列表",
  "smartArt.layout.segmented": "分段流程",
  "smartArt.layoutDescription.list": "用大小相同的块展示非顺序或分组信息。",
  "smartArt.layoutDescription.process": "用水平排列的步骤展示进展过程。",
  "smartArt.layoutDescription.hierarchy": "展示组织中的汇报和从属关系。",
  "smartArt.layoutDescription.cycle": "展示连续循环的阶段、任务或事件。",
  "smartArt.layoutDescription.radial": "展示多个观点与一个中心观点的关系。",
  "smartArt.layoutDescription.relationship": "展示围绕中心排列的相关或对比观点。",
  "smartArt.layoutDescription.matrix": "用象限展示各组成部分与整体的关系。",
  "smartArt.layoutDescription.pyramid": "从上到下展示比例或层级关系。",
  "smartArt.layoutDescription.venn": "展示重叠或相互联系的关系。",
  "smartArt.layoutDescription.target": "展示包含、渐进或朝向目标的步骤。",
  "smartArt.layoutDescription.stack": "用清晰的前后顺序展示重叠关系。",
  "smartArt.layoutDescription.picture": "为每一项配合图片重点和说明文字。",
  "smartArt.layoutDescription.textcard": "以带强调色的标题卡片呈现文本。",
  "smartArt.layoutDescription.timeline": "沿一条线按发生顺序呈现事件。",
  "smartArt.layoutDescription.meettheteam": "用照片、姓名和职务介绍成员。",
  "smartArt.layoutDescription.segmented": "用相连的 V 形箭头展示顺序步骤。",
  "drawing.chart": "图表",
  "drawing.chartTitle": "图表标题",
  "drawing.chartUnsupported": "此图表类型将以只读方式保留。"
}, m_ = {
  "en-US": h_,
  "zh-CN": p_
};
function g_(e = {}) {
  const t = f_({
    ...e,
    catalogs: m_
  });
  for (const [r, n] of Object.entries(e.catalogs ?? {}))
    t.registerCatalog(r, n, { override: !0 });
  return t;
}
g_();
const y_ = ["aria-label", "aria-pressed", "data-active", "data-icon-only", "data-menu-indicator", "data-size", "data-tone", "disabled"], v_ = {
  class: "als-ofs-ui-ribbon-command-button__icon",
  "aria-hidden": "true"
}, b_ = {
  key: 0,
  class: "als-ofs-ui-ribbon-command-button__label"
}, __ = /* @__PURE__ */ Ee({
  inheritAttrs: !1,
  __name: "UiRibbonCommandButton",
  props: {
    active: { type: Boolean, default: !1 },
    ariaLabel: {},
    disabled: { type: Boolean, default: !1 },
    icon: {},
    iconOnly: { type: Boolean, default: !1 },
    label: {},
    menuIndicator: { type: Boolean, default: !1 },
    size: { default: "sm" },
    title: {},
    tone: { default: "default" }
  },
  emits: ["activate", "doubleActivate"],
  setup(e, { expose: t, emit: r }) {
    const n = r, i = /* @__PURE__ */ _e();
    return t({ element: i }), (o, a) => (de(), ve(u_, {
      text: e.title ?? e.label
    }, {
      default: ge(() => [
        qt("button", nt(o.$attrs, {
          ref_key: "element",
          ref: i,
          class: "als-ofs-editor-ui als-ofs-ui-ribbon-command-button",
          "aria-label": e.ariaLabel || e.label,
          "aria-pressed": e.active ? "true" : void 0,
          "data-active": e.active ? "true" : void 0,
          "data-icon-only": e.iconOnly ? "true" : void 0,
          "data-menu-indicator": e.menuIndicator ? "true" : void 0,
          "data-size": e.size,
          "data-tone": e.tone,
          disabled: e.disabled,
          type: "button",
          onClick: a[0] || (a[0] = (s) => n("activate")),
          onDblclick: a[1] || (a[1] = (s) => n("doubleActivate"))
        }), [
          qt("span", v_, [
            Ie(Nt, { name: e.icon }, null, 8, ["name"])
          ]),
          e.iconOnly ? yt("", !0) : (de(), We("span", b_, [
            qt("span", null, gt(e.label), 1),
            e.menuIndicator ? (de(), ve(Nt, {
              key: 0,
              class: "als-ofs-ui-ribbon-command-button__menu-indicator",
              name: "chevron-down",
              size: 12,
              "aria-hidden": "true"
            })) : yt("", !0)
          ]))
        ], 16, y_)
      ]),
      _: 1
    }, 8, ["text"]));
  }
}), Go = /* @__PURE__ */ new WeakMap(), Ei = /* @__PURE__ */ new WeakMap();
function rl(e, t) {
  e.replaceChildren();
  const r = t.element.cloneNode(!0);
  r.removeAttribute("id"), r.setAttribute("aria-hidden", "true"), r.style.position = "absolute", r.style.pointerEvents = "none", r.style.transformOrigin = "top left", e.appendChild(r);
  const n = Math.min(
    e.clientWidth / Math.max(1, t.width),
    e.clientHeight / Math.max(1, t.height)
  ), i = t.width * n, o = t.height * n;
  r.style.left = `${(e.clientWidth - i) / 2}px`, r.style.top = `${(e.clientHeight - o) / 2}px`, r.style.transform = `scale(${n})`;
}
const w_ = {
  mounted(e, t) {
    Ei.set(e, t.value);
    const r = () => {
      const i = Ei.get(e);
      i && rl(e, i);
    }, n = new ResizeObserver(r);
    Go.set(e, n), n.observe(e), r();
  },
  updated(e, t) {
    Ei.set(e, t.value), rl(e, t.value);
  },
  beforeUnmount(e) {
    var t;
    (t = Go.get(e)) == null || t.disconnect(), Go.delete(e), Ei.delete(e);
  }
}, k_ = { class: "als-ofs-ui-dropdown__label" }, M_ = {
  key: 2,
  class: "als-ofs-ui-menu__icon-placeholder",
  "aria-hidden": "true"
}, A_ = { class: "als-ofs-ui-menu__label" }, E_ = {
  key: 0,
  class: "als-ofs-ui-dropdown__section"
}, x_ = {
  key: 2,
  class: "als-ofs-ui-menu__icon-placeholder",
  "aria-hidden": "true"
}, D_ = { class: "als-ofs-ui-menu__label" }, C_ = {
  key: 2,
  class: "als-ofs-ui-menu__icon-placeholder",
  "aria-hidden": "true"
}, S_ = { class: "als-ofs-ui-menu__label" }, T_ = {
  key: 0,
  class: "als-ofs-ui-layout-preview",
  "aria-hidden": "true"
}, N_ = {
  key: 2,
  class: "als-ofs-ui-dropdown__check",
  "aria-hidden": "true"
}, O_ = /* @__PURE__ */ Ee({
  __name: "UiDropdown",
  props: {
    ariaLabel: {},
    density: { default: "default" },
    disabled: { type: Boolean, default: !1 },
    icon: {},
    items: {},
    label: {},
    menuAlign: { default: "start" },
    menuId: {},
    menuSide: { default: "bottom" },
    modelValue: { type: Boolean },
    presentation: { default: "button" },
    ribbonSize: { default: "sm" },
    selectedId: {},
    title: {},
    triggerId: {},
    variant: { default: "menu" }
  },
  emits: ["update:modelValue", "select"],
  setup(e, { emit: t }) {
    var r;
    const n = e, i = t, o = (r = cr()) == null ? void 0 : r.vnode.props, a = !!(o && ("modelValue" in o || "model-value" in o)), s = be(() => a ? { open: n.modelValue === !0 } : {}), l = /* @__PURE__ */ _e(null), f = /* @__PURE__ */ _e(null), d = /* @__PURE__ */ _e({}), u = [
      "--als-ofs-ui-surface",
      "--als-ofs-ui-surface-muted",
      "--als-ofs-ui-surface-hover",
      "--als-ofs-ui-border",
      "--als-ofs-ui-border-strong",
      "--als-ofs-ui-text",
      "--als-ofs-ui-text-muted",
      "--als-ofs-ui-text-faint",
      "--als-ofs-ui-disabled",
      "--als-ofs-ui-accent",
      "--als-ofs-ui-accent-hover",
      "--als-ofs-ui-accent-soft",
      "--als-ofs-ui-danger",
      "--als-ofs-ui-danger-hover",
      "--als-ofs-ui-danger-surface",
      "--als-ofs-ui-focus",
      "--als-ofs-ui-radius"
    ], h = be(() => {
      if (n.variant === "gallery" || n.variant === "layout-gallery" || n.items.length <= 1) return !0;
      const N = n.items.map((L) => L.icon).filter(Boolean);
      return N.length !== n.items.length || new Set(N).size !== 1;
    }), c = be(() => {
      var N;
      if (n.selectedId !== void 0) return n.selectedId;
      const L = n.items.filter((F) => F.label === n.label);
      return L.length === 1 ? (N = L[0]) == null ? void 0 : N.id : void 0;
    });
    function y(N, L) {
      if (L !== void 0)
        for (const F of N) {
          if (F.id === L) return F;
          const Y = y(F.children ?? [], L);
          if (Y) return Y;
        }
    }
    const m = be(() => {
      var N;
      const L = (N = y(n.items, c.value)) == null ? void 0 : N.previewStyle;
      return (L == null ? void 0 : L.maskImage) ?? (L == null ? void 0 : L.WebkitMaskImage);
    }), b = be(() => {
      const N = m.value;
      return N ? { "--als-ofs-ui-trigger-preview-mask": String(N) } : void 0;
    });
    function g(N) {
      n.disabled && (N = !1), N && P(), i("update:modelValue", N);
    }
    function _(N) {
      N.disabled || (i("select", N), g(!1));
    }
    function x(N) {
      return N.checked !== void 0 || c.value !== void 0;
    }
    function D(N) {
      return N.checked ?? N.id === c.value;
    }
    function R() {
      const N = l.value;
      return N instanceof HTMLElement ? N : (N == null ? void 0 : N.$el) instanceof HTMLElement ? N.$el : null;
    }
    function C() {
      const N = f.value;
      return N instanceof HTMLElement ? N : (N == null ? void 0 : N.element) instanceof HTMLElement ? N.element : (N == null ? void 0 : N.$el) instanceof HTMLElement ? N.$el : null;
    }
    function P() {
      const N = C();
      if (!N) return;
      const L = getComputedStyle(N);
      d.value = Object.fromEntries(
        u.map((F) => [F, L.getPropertyValue(F).trim()]).filter(([, F]) => F)
      );
    }
    function W() {
      ht(() => {
        var N, L;
        (L = (N = R()) == null ? void 0 : N.querySelector('[data-selected="true"]')) == null || L.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
    function j(N) {
      return (n.variant === "gallery" || n.variant === "layout-gallery") && E(N) ? 34 : E(N) ? 24 : N.startsWith("line-arrow-") ? 20 : 18;
    }
    function oe(N) {
      return N ? { fontFamily: `"${N.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}", Aptos, "Segoe UI", sans-serif` } : void 0;
    }
    function ue(N) {
      const L = oe(N.fontFamily);
      if (!(!L && !N.previewStyle))
        return { ...L, ...N.previewStyle };
    }
    function B(N) {
      var L;
      return !!((L = N.children) != null && L.some((F) => F.previewOnly));
    }
    function Z(N) {
      return B(N) ? {
        ...d.value,
        "--als-ofs-ui-dropdown-columns": String(N.childColumns ?? 6)
      } : d.value;
    }
    function w(N) {
      return !!(N != null && N.startsWith("shape-"));
    }
    function E(N) {
      return !!(N != null && N.startsWith("shape-") || N != null && N.startsWith("layout-") || N != null && N.startsWith("transition-") || N != null && N.startsWith("line-arrow-") || N != null && N.startsWith("chart-") || N === "shape" || N === "line");
    }
    return tt(
      () => n.disabled,
      (N) => {
        N && g(!1);
      }
    ), (N, L) => (de(), ve(X(Ob), nt(s.value, {
      modal: !1,
      "onUpdate:open": g
    }), {
      default: ge(() => [
        Ie(X(jb), {
          "as-child": "",
          disabled: e.disabled
        }, {
          default: ge(() => [
            e.presentation === "ribbon" ? (de(), ve(__, {
              key: 0,
              ref_key: "triggerButton",
              ref: f,
              "aria-label": e.ariaLabel,
              disabled: e.disabled,
              icon: e.icon || "chevron-down",
              "data-icon-preview": m.value ? "true" : void 0,
              label: e.label,
              "menu-indicator": "",
              size: e.ribbonSize,
              style: at(b.value),
              title: e.title ?? e.label
            }, null, 8, ["aria-label", "disabled", "icon", "data-icon-preview", "label", "size", "style", "title"])) : (de(), ve(Sg, {
              key: 1,
              ref_key: "triggerButton",
              ref: f,
              id: e.triggerId,
              class: "als-ofs-editor-ui als-ofs-ui-dropdown__trigger",
              "aria-label": e.ariaLabel,
              "data-density": e.density,
              disabled: e.disabled,
              title: e.title ?? e.label
            }, {
              default: ge(() => [
                e.icon ? (de(), ve(Nt, {
                  key: 0,
                  class: "als-ofs-ui-dropdown__trigger-icon",
                  name: e.icon,
                  size: 16,
                  "aria-hidden": "true"
                }, null, 8, ["name"])) : yt("", !0),
                qt("span", k_, gt(e.label), 1),
                Ie(Nt, {
                  class: "als-ofs-ui-dropdown__chevron",
                  name: "chevron-down",
                  size: 14,
                  "aria-hidden": "true"
                })
              ]),
              _: 1
            }, 8, ["id", "aria-label", "data-density", "disabled", "title"]))
          ]),
          _: 1
        }, 8, ["disabled"]),
        Ie(X(el), null, {
          default: ge(() => [
            Ie(X(Ib), {
              ref_key: "menuContent",
              ref: l,
              id: e.menuId,
              "aria-label": e.ariaLabel ?? e.title ?? e.label,
              "data-density": e.density,
              class: Pr([
                "als-ofs-editor-ui-popover",
                "als-ofs-ui-dropdown__menu",
                { "als-ofs-ui-menu": e.variant === "context-menu" }
              ]),
              align: e.menuAlign,
              "avoid-collisions": !0,
              "collision-padding": 8,
              "data-layout-columns": e.variant === "layout-gallery" ? Math.min(5, e.items.length) : void 0,
              "data-variant": e.variant,
              "side-offset": 4,
              side: e.menuSide,
              style: at(d.value),
              "position-strategy": "fixed",
              onOpenAutoFocus: W
            }, {
              default: ge(() => [
                (de(!0), We(et, null, Ci(e.items, (F) => {
                  var Y;
                  return de(), We(et, {
                    key: F.id
                  }, [
                    F.separatorBefore ? (de(), ve(X(tl), {
                      key: 0,
                      class: Pr(
                        e.variant === "context-menu" ? "als-ofs-ui-menu__separator" : "als-ofs-ui-dropdown__separator"
                      )
                    }, null, 8, ["class"])) : yt("", !0),
                    e.variant === "context-menu" && (Y = F.children) != null && Y.length ? (de(), ve(X(zb), { key: 1 }, {
                      default: ge(() => [
                        Ie(X(Vb), {
                          class: "als-ofs-ui-dropdown__item als-ofs-ui-menu__item",
                          disabled: F.disabled,
                          "text-value": F.label
                        }, {
                          default: ge(() => [
                            F.previewText ? (de(), We("span", {
                              key: 0,
                              class: "als-ofs-ui-menu__item-preview",
                              style: at(ue(F)),
                              "aria-hidden": "true"
                            }, gt(F.previewText), 5)) : F.icon ? (de(), ve(Nt, {
                              key: 1,
                              name: F.icon,
                              size: 18
                            }, null, 8, ["name"])) : (de(), We("span", M_)),
                            qt("span", A_, gt(F.label), 1),
                            Ie(Nt, {
                              class: "als-ofs-ui-menu__chevron",
                              name: "chevron-right",
                              size: 16
                            })
                          ]),
                          _: 2
                        }, 1032, ["disabled", "text-value"]),
                        Ie(X(el), null, {
                          default: ge(() => [
                            Ie(X(Hb), {
                              class: "als-ofs-editor-ui-popover als-ofs-ui-dropdown__menu als-ofs-ui-menu",
                              "aria-label": F.label,
                              "avoid-collisions": !0,
                              "collision-padding": 8,
                              "data-density": e.density,
                              "data-layout": B(F) ? "grid" : void 0,
                              "side-offset": 4,
                              style: at(Z(F)),
                              "position-strategy": "fixed"
                            }, {
                              default: ge(() => [
                                B(F) ? (de(!0), We(et, { key: 0 }, Ci(F.children, (ee) => (de(), We(et, {
                                  key: ee.id
                                }, [
                                  ee.sectionLabel ? (de(), We("p", E_, gt(ee.sectionLabel), 1)) : yt("", !0),
                                  Ie(X(jo), {
                                    as: "button",
                                    class: "als-ofs-ui-dropdown__cell",
                                    "aria-checked": x(ee) ? D(ee) : void 0,
                                    "aria-label": ee.label,
                                    "data-selected": D(ee) ? "true" : void 0,
                                    disabled: ee.disabled,
                                    role: x(ee) ? "menuitemcheckbox" : void 0,
                                    "text-value": ee.label,
                                    title: ee.label,
                                    type: "button",
                                    onSelect: (H) => _(ee)
                                  }, {
                                    default: ge(() => [
                                      qt("span", {
                                        class: "als-ofs-ui-dropdown__cell-preview",
                                        style: at(ue(ee)),
                                        "aria-hidden": "true"
                                      }, gt(ee.previewText || "A"), 5)
                                    ]),
                                    _: 2
                                  }, 1032, ["aria-checked", "aria-label", "data-selected", "disabled", "role", "text-value", "title", "onSelect"])
                                ], 64))), 128)) : (de(!0), We(et, { key: 1 }, Ci(F.children, (ee) => (de(), We(et, {
                                  key: ee.id
                                }, [
                                  ee.separatorBefore ? (de(), ve(X(tl), {
                                    key: 0,
                                    class: "als-ofs-ui-menu__separator"
                                  })) : yt("", !0),
                                  Ie(X(jo), {
                                    as: "button",
                                    class: "als-ofs-ui-dropdown__item als-ofs-ui-menu__item",
                                    "aria-checked": x(ee) ? D(ee) : void 0,
                                    "data-checked": D(ee) ? "true" : void 0,
                                    "data-selected": D(ee) ? "true" : void 0,
                                    disabled: ee.disabled,
                                    role: x(ee) ? "menuitemcheckbox" : void 0,
                                    "text-value": ee.label,
                                    type: "button",
                                    onSelect: (H) => _(ee)
                                  }, {
                                    default: ge(() => [
                                      ee.previewText ? (de(), We("span", {
                                        key: 0,
                                        class: "als-ofs-ui-menu__item-preview",
                                        style: at(ue(ee)),
                                        "aria-hidden": "true"
                                      }, gt(ee.previewText), 5)) : ee.icon ? (de(), ve(Nt, {
                                        key: 1,
                                        name: ee.icon,
                                        size: 18
                                      }, null, 8, ["name"])) : (de(), We("span", x_)),
                                      qt("span", D_, gt(ee.label), 1),
                                      D(ee) ? (de(), ve(Nt, {
                                        key: 3,
                                        class: "als-ofs-ui-dropdown__check",
                                        name: "check",
                                        size: 16,
                                        "aria-hidden": "true"
                                      })) : yt("", !0)
                                    ]),
                                    _: 2
                                  }, 1032, ["aria-checked", "data-checked", "data-selected", "disabled", "role", "text-value", "onSelect"])
                                ], 64))), 128))
                              ]),
                              _: 2
                            }, 1032, ["aria-label", "data-density", "data-layout", "style"])
                          ]),
                          _: 2
                        }, 1024)
                      ]),
                      _: 2
                    }, 1024)) : (de(), ve(X(jo), {
                      key: 2,
                      as: "button",
                      class: Pr([
                        "als-ofs-ui-dropdown__item",
                        { "als-ofs-ui-menu__item": e.variant === "context-menu" },
                        {
                          "has-label-preview": F.previewStyle,
                          "has-style-preview": F.previewText
                        }
                      ]),
                      "aria-checked": x(F) ? D(F) : void 0,
                      "data-checked": D(F) ? "true" : void 0,
                      "data-selected": D(F) ? "true" : void 0,
                      disabled: F.disabled,
                      "data-has-preview": F.previewText ? "true" : void 0,
                      role: x(F) ? "menuitemcheckbox" : void 0,
                      "text-value": F.label,
                      type: "button",
                      onSelect: (ee) => _(F)
                    }, {
                      default: ge(() => [
                        e.variant === "context-menu" ? (de(), We(et, { key: 0 }, [
                          F.previewText ? (de(), We("span", {
                            key: 0,
                            class: "als-ofs-ui-menu__item-preview",
                            style: at(ue(F)),
                            "aria-hidden": "true"
                          }, gt(F.previewText), 5)) : F.icon ? (de(), ve(Nt, {
                            key: 1,
                            name: F.icon,
                            size: 18
                          }, null, 8, ["name"])) : (de(), We("span", C_)),
                          qt("span", S_, gt(F.label), 1),
                          D(F) ? (de(), ve(Nt, {
                            key: 3,
                            class: "als-ofs-ui-dropdown__check",
                            name: "check",
                            size: 16,
                            "aria-hidden": "true"
                          })) : yt("", !0)
                        ], 64)) : (de(), We(et, { key: 1 }, [
                          e.variant === "layout-gallery" && F.layoutPreview ? wd((de(), We("span", T_, null, 512)), [
                            [X(w_), F.layoutPreview]
                          ]) : yt("", !0),
                          F.previewText ? (de(), We("span", {
                            key: 1,
                            class: "als-ofs-ui-dropdown__style-preview",
                            style: at(ue(F)),
                            "aria-hidden": "true"
                          }, gt(F.previewText), 5)) : yt("", !0),
                          qt("span", {
                            class: "als-ofs-ui-dropdown__item-label",
                            style: at(F.previewText ? void 0 : ue(F))
                          }, gt(F.label), 5),
                          x(F) ? (de(), We("span", N_, [
                            D(F) ? (de(), ve(Nt, {
                              key: 0,
                              name: "check",
                              size: 16
                            })) : yt("", !0)
                          ])) : yt("", !0),
                          F.swatch ? (de(), We("span", {
                            key: 3,
                            class: "als-ofs-ui-dropdown__swatch",
                            style: at({ "--als-ofs-ui-swatch": F.swatch }),
                            "aria-hidden": "true"
                          }, null, 4)) : !F.layoutPreview && F.icon && h.value ? (de(), ve(Nt, {
                            key: 4,
                            class: Pr({
                              "als-ofs-ui-dropdown__preview-icon": E(F.icon),
                              "als-ofs-ui-dropdown__shape-icon": w(F.icon)
                            }),
                            name: F.icon,
                            size: j(F.icon),
                            "aria-hidden": "true"
                          }, null, 8, ["class", "name", "size"])) : yt("", !0)
                        ], 64))
                      ]),
                      _: 2
                    }, 1032, ["class", "aria-checked", "data-checked", "data-selected", "disabled", "data-has-preview", "role", "text-value", "onSelect"]))
                  ], 64);
                }), 128))
              ]),
              _: 1
            }, 8, ["id", "aria-label", "data-density", "class", "align", "data-layout-columns", "data-variant", "side", "style"])
          ]),
          _: 1
        })
      ]),
      _: 1
    }, 16));
  }
});
var xi = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function Di(e) {
  throw new Error('Could not dynamically require "' + e + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var Ko = { exports: {} };
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/
var nl;
function P_() {
  return nl || (nl = 1, (function(e, t) {
    (function(r) {
      e.exports = r();
    })(function() {
      return (function r(n, i, o) {
        function a(f, d) {
          if (!i[f]) {
            if (!n[f]) {
              var u = typeof Di == "function" && Di;
              if (!d && u) return u(f, !0);
              if (s) return s(f, !0);
              var h = new Error("Cannot find module '" + f + "'");
              throw h.code = "MODULE_NOT_FOUND", h;
            }
            var c = i[f] = { exports: {} };
            n[f][0].call(c.exports, function(y) {
              var m = n[f][1][y];
              return a(m || y);
            }, c, c.exports, r, n, i, o);
          }
          return i[f].exports;
        }
        for (var s = typeof Di == "function" && Di, l = 0; l < o.length; l++) a(o[l]);
        return a;
      })({ 1: [function(r, n, i) {
        var o = r("./utils"), a = r("./support"), s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        i.encode = function(l) {
          for (var f, d, u, h, c, y, m, b = [], g = 0, _ = l.length, x = _, D = o.getTypeOf(l) !== "string"; g < l.length; ) x = _ - g, u = D ? (f = l[g++], d = g < _ ? l[g++] : 0, g < _ ? l[g++] : 0) : (f = l.charCodeAt(g++), d = g < _ ? l.charCodeAt(g++) : 0, g < _ ? l.charCodeAt(g++) : 0), h = f >> 2, c = (3 & f) << 4 | d >> 4, y = 1 < x ? (15 & d) << 2 | u >> 6 : 64, m = 2 < x ? 63 & u : 64, b.push(s.charAt(h) + s.charAt(c) + s.charAt(y) + s.charAt(m));
          return b.join("");
        }, i.decode = function(l) {
          var f, d, u, h, c, y, m = 0, b = 0, g = "data:";
          if (l.substr(0, g.length) === g) throw new Error("Invalid base64 input, it looks like a data url.");
          var _, x = 3 * (l = l.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
          if (l.charAt(l.length - 1) === s.charAt(64) && x--, l.charAt(l.length - 2) === s.charAt(64) && x--, x % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
          for (_ = a.uint8array ? new Uint8Array(0 | x) : new Array(0 | x); m < l.length; ) f = s.indexOf(l.charAt(m++)) << 2 | (h = s.indexOf(l.charAt(m++))) >> 4, d = (15 & h) << 4 | (c = s.indexOf(l.charAt(m++))) >> 2, u = (3 & c) << 6 | (y = s.indexOf(l.charAt(m++))), _[b++] = f, c !== 64 && (_[b++] = d), y !== 64 && (_[b++] = u);
          return _;
        };
      }, { "./support": 30, "./utils": 32 }], 2: [function(r, n, i) {
        var o = r("./external"), a = r("./stream/DataWorker"), s = r("./stream/Crc32Probe"), l = r("./stream/DataLengthProbe");
        function f(d, u, h, c, y) {
          this.compressedSize = d, this.uncompressedSize = u, this.crc32 = h, this.compression = c, this.compressedContent = y;
        }
        f.prototype = { getContentWorker: function() {
          var d = new a(o.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new l("data_length")), u = this;
          return d.on("end", function() {
            if (this.streamInfo.data_length !== u.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
          }), d;
        }, getCompressedWorker: function() {
          return new a(o.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
        } }, f.createWorkerFrom = function(d, u, h) {
          return d.pipe(new s()).pipe(new l("uncompressedSize")).pipe(u.compressWorker(h)).pipe(new l("compressedSize")).withStreamInfo("compression", u);
        }, n.exports = f;
      }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(r, n, i) {
        var o = r("./stream/GenericWorker");
        i.STORE = { magic: "\0\0", compressWorker: function() {
          return new o("STORE compression");
        }, uncompressWorker: function() {
          return new o("STORE decompression");
        } }, i.DEFLATE = r("./flate");
      }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(r, n, i) {
        var o = r("./utils"), a = (function() {
          for (var s, l = [], f = 0; f < 256; f++) {
            s = f;
            for (var d = 0; d < 8; d++) s = 1 & s ? 3988292384 ^ s >>> 1 : s >>> 1;
            l[f] = s;
          }
          return l;
        })();
        n.exports = function(s, l) {
          return s !== void 0 && s.length ? o.getTypeOf(s) !== "string" ? (function(f, d, u, h) {
            var c = a, y = h + u;
            f ^= -1;
            for (var m = h; m < y; m++) f = f >>> 8 ^ c[255 & (f ^ d[m])];
            return -1 ^ f;
          })(0 | l, s, s.length, 0) : (function(f, d, u, h) {
            var c = a, y = h + u;
            f ^= -1;
            for (var m = h; m < y; m++) f = f >>> 8 ^ c[255 & (f ^ d.charCodeAt(m))];
            return -1 ^ f;
          })(0 | l, s, s.length, 0) : 0;
        };
      }, { "./utils": 32 }], 5: [function(r, n, i) {
        i.base64 = !1, i.binary = !1, i.dir = !1, i.createFolders = !0, i.date = null, i.compression = null, i.compressionOptions = null, i.comment = null, i.unixPermissions = null, i.dosPermissions = null;
      }, {}], 6: [function(r, n, i) {
        var o = null;
        o = typeof Promise < "u" ? Promise : r("lie"), n.exports = { Promise: o };
      }, { lie: 37 }], 7: [function(r, n, i) {
        var o = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Uint32Array < "u", a = r("pako"), s = r("./utils"), l = r("./stream/GenericWorker"), f = o ? "uint8array" : "array";
        function d(u, h) {
          l.call(this, "FlateWorker/" + u), this._pako = null, this._pakoAction = u, this._pakoOptions = h, this.meta = {};
        }
        i.magic = "\b\0", s.inherits(d, l), d.prototype.processChunk = function(u) {
          this.meta = u.meta, this._pako === null && this._createPako(), this._pako.push(s.transformTo(f, u.data), !1);
        }, d.prototype.flush = function() {
          l.prototype.flush.call(this), this._pako === null && this._createPako(), this._pako.push([], !0);
        }, d.prototype.cleanUp = function() {
          l.prototype.cleanUp.call(this), this._pako = null;
        }, d.prototype._createPako = function() {
          this._pako = new a[this._pakoAction]({ raw: !0, level: this._pakoOptions.level || -1 });
          var u = this;
          this._pako.onData = function(h) {
            u.push({ data: h, meta: u.meta });
          };
        }, i.compressWorker = function(u) {
          return new d("Deflate", u);
        }, i.uncompressWorker = function() {
          return new d("Inflate", {});
        };
      }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(r, n, i) {
        function o(c, y) {
          var m, b = "";
          for (m = 0; m < y; m++) b += String.fromCharCode(255 & c), c >>>= 8;
          return b;
        }
        function a(c, y, m, b, g, _) {
          var x, D, R = c.file, C = c.compression, P = _ !== f.utf8encode, W = s.transformTo("string", _(R.name)), j = s.transformTo("string", f.utf8encode(R.name)), oe = R.comment, ue = s.transformTo("string", _(oe)), B = s.transformTo("string", f.utf8encode(oe)), Z = j.length !== R.name.length, w = B.length !== oe.length, E = "", N = "", L = "", F = R.dir, Y = R.date, ee = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
          y && !m || (ee.crc32 = c.crc32, ee.compressedSize = c.compressedSize, ee.uncompressedSize = c.uncompressedSize);
          var H = 0;
          y && (H |= 8), P || !Z && !w || (H |= 2048);
          var K = 0, le = 0;
          F && (K |= 16), g === "UNIX" ? (le = 798, K |= (function(ne, me) {
            var we = ne;
            return ne || (we = me ? 16893 : 33204), (65535 & we) << 16;
          })(R.unixPermissions, F)) : (le = 20, K |= (function(ne) {
            return 63 & (ne || 0);
          })(R.dosPermissions)), x = Y.getUTCHours(), x <<= 6, x |= Y.getUTCMinutes(), x <<= 5, x |= Y.getUTCSeconds() / 2, D = Y.getUTCFullYear() - 1980, D <<= 4, D |= Y.getUTCMonth() + 1, D <<= 5, D |= Y.getUTCDate(), Z && (N = o(1, 1) + o(d(W), 4) + j, E += "up" + o(N.length, 2) + N), w && (L = o(1, 1) + o(d(ue), 4) + B, E += "uc" + o(L.length, 2) + L);
          var ae = "";
          return ae += `
\0`, ae += o(H, 2), ae += C.magic, ae += o(x, 2), ae += o(D, 2), ae += o(ee.crc32, 4), ae += o(ee.compressedSize, 4), ae += o(ee.uncompressedSize, 4), ae += o(W.length, 2), ae += o(E.length, 2), { fileRecord: u.LOCAL_FILE_HEADER + ae + W + E, dirRecord: u.CENTRAL_FILE_HEADER + o(le, 2) + ae + o(ue.length, 2) + "\0\0\0\0" + o(K, 4) + o(b, 4) + W + E + ue };
        }
        var s = r("../utils"), l = r("../stream/GenericWorker"), f = r("../utf8"), d = r("../crc32"), u = r("../signature");
        function h(c, y, m, b) {
          l.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = y, this.zipPlatform = m, this.encodeFileName = b, this.streamFiles = c, this.accumulate = !1, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
        }
        s.inherits(h, l), h.prototype.push = function(c) {
          var y = c.meta.percent || 0, m = this.entriesCount, b = this._sources.length;
          this.accumulate ? this.contentBuffer.push(c) : (this.bytesWritten += c.data.length, l.prototype.push.call(this, { data: c.data, meta: { currentFile: this.currentFile, percent: m ? (y + 100 * (m - b - 1)) / m : 100 } }));
        }, h.prototype.openedSource = function(c) {
          this.currentSourceOffset = this.bytesWritten, this.currentFile = c.file.name;
          var y = this.streamFiles && !c.file.dir;
          if (y) {
            var m = a(c, y, !1, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            this.push({ data: m.fileRecord, meta: { percent: 0 } });
          } else this.accumulate = !0;
        }, h.prototype.closedSource = function(c) {
          this.accumulate = !1;
          var y = this.streamFiles && !c.file.dir, m = a(c, y, !0, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
          if (this.dirRecords.push(m.dirRecord), y) this.push({ data: (function(b) {
            return u.DATA_DESCRIPTOR + o(b.crc32, 4) + o(b.compressedSize, 4) + o(b.uncompressedSize, 4);
          })(c), meta: { percent: 100 } });
          else for (this.push({ data: m.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
          this.currentFile = null;
        }, h.prototype.flush = function() {
          for (var c = this.bytesWritten, y = 0; y < this.dirRecords.length; y++) this.push({ data: this.dirRecords[y], meta: { percent: 100 } });
          var m = this.bytesWritten - c, b = (function(g, _, x, D, R) {
            var C = s.transformTo("string", R(D));
            return u.CENTRAL_DIRECTORY_END + "\0\0\0\0" + o(g, 2) + o(g, 2) + o(_, 4) + o(x, 4) + o(C.length, 2) + C;
          })(this.dirRecords.length, m, c, this.zipComment, this.encodeFileName);
          this.push({ data: b, meta: { percent: 100 } });
        }, h.prototype.prepareNextSource = function() {
          this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
        }, h.prototype.registerPrevious = function(c) {
          this._sources.push(c);
          var y = this;
          return c.on("data", function(m) {
            y.processChunk(m);
          }), c.on("end", function() {
            y.closedSource(y.previous.streamInfo), y._sources.length ? y.prepareNextSource() : y.end();
          }), c.on("error", function(m) {
            y.error(m);
          }), this;
        }, h.prototype.resume = function() {
          return !!l.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), !0) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), !0));
        }, h.prototype.error = function(c) {
          var y = this._sources;
          if (!l.prototype.error.call(this, c)) return !1;
          for (var m = 0; m < y.length; m++) try {
            y[m].error(c);
          } catch {
          }
          return !0;
        }, h.prototype.lock = function() {
          l.prototype.lock.call(this);
          for (var c = this._sources, y = 0; y < c.length; y++) c[y].lock();
        }, n.exports = h;
      }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(r, n, i) {
        var o = r("../compressions"), a = r("./ZipFileWorker");
        i.generateWorker = function(s, l, f) {
          var d = new a(l.streamFiles, f, l.platform, l.encodeFileName), u = 0;
          try {
            s.forEach(function(h, c) {
              u++;
              var y = (function(_, x) {
                var D = _ || x, R = o[D];
                if (!R) throw new Error(D + " is not a valid compression method !");
                return R;
              })(c.options.compression, l.compression), m = c.options.compressionOptions || l.compressionOptions || {}, b = c.dir, g = c.date;
              c._compressWorker(y, m).withStreamInfo("file", { name: h, dir: b, date: g, comment: c.comment || "", unixPermissions: c.unixPermissions, dosPermissions: c.dosPermissions }).pipe(d);
            }), d.entriesCount = u;
          } catch (h) {
            d.error(h);
          }
          return d;
        };
      }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(r, n, i) {
        function o() {
          if (!(this instanceof o)) return new o();
          if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
          this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
            var a = new o();
            for (var s in this) typeof this[s] != "function" && (a[s] = this[s]);
            return a;
          };
        }
        (o.prototype = r("./object")).loadAsync = r("./load"), o.support = r("./support"), o.defaults = r("./defaults"), o.version = "3.10.1", o.loadAsync = function(a, s) {
          return new o().loadAsync(a, s);
        }, o.external = r("./external"), n.exports = o;
      }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(r, n, i) {
        var o = r("./utils"), a = r("./external"), s = r("./utf8"), l = r("./zipEntries"), f = r("./stream/Crc32Probe"), d = r("./nodejsUtils");
        function u(h) {
          return new a.Promise(function(c, y) {
            var m = h.decompressed.getContentWorker().pipe(new f());
            m.on("error", function(b) {
              y(b);
            }).on("end", function() {
              m.streamInfo.crc32 !== h.decompressed.crc32 ? y(new Error("Corrupted zip : CRC32 mismatch")) : c();
            }).resume();
          });
        }
        n.exports = function(h, c) {
          var y = this;
          return c = o.extend(c || {}, { base64: !1, checkCRC32: !1, optimizedBinaryString: !1, createFolders: !1, decodeFileName: s.utf8decode }), d.isNode && d.isStream(h) ? a.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : o.prepareContent("the loaded zip file", h, !0, c.optimizedBinaryString, c.base64).then(function(m) {
            var b = new l(c);
            return b.load(m), b;
          }).then(function(m) {
            var b = [a.Promise.resolve(m)], g = m.files;
            if (c.checkCRC32) for (var _ = 0; _ < g.length; _++) b.push(u(g[_]));
            return a.Promise.all(b);
          }).then(function(m) {
            for (var b = m.shift(), g = b.files, _ = 0; _ < g.length; _++) {
              var x = g[_], D = x.fileNameStr, R = o.resolve(x.fileNameStr);
              y.file(R, x.decompressed, { binary: !0, optimizedBinaryString: !0, date: x.date, dir: x.dir, comment: x.fileCommentStr.length ? x.fileCommentStr : null, unixPermissions: x.unixPermissions, dosPermissions: x.dosPermissions, createFolders: c.createFolders }), x.dir || (y.file(R).unsafeOriginalName = D);
            }
            return b.zipComment.length && (y.comment = b.zipComment), y;
          });
        };
      }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(r, n, i) {
        var o = r("../utils"), a = r("../stream/GenericWorker");
        function s(l, f) {
          a.call(this, "Nodejs stream input adapter for " + l), this._upstreamEnded = !1, this._bindStream(f);
        }
        o.inherits(s, a), s.prototype._bindStream = function(l) {
          var f = this;
          (this._stream = l).pause(), l.on("data", function(d) {
            f.push({ data: d, meta: { percent: 0 } });
          }).on("error", function(d) {
            f.isPaused ? this.generatedError = d : f.error(d);
          }).on("end", function() {
            f.isPaused ? f._upstreamEnded = !0 : f.end();
          });
        }, s.prototype.pause = function() {
          return !!a.prototype.pause.call(this) && (this._stream.pause(), !0);
        }, s.prototype.resume = function() {
          return !!a.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), !0);
        }, n.exports = s;
      }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(r, n, i) {
        var o = r("readable-stream").Readable;
        function a(s, l, f) {
          o.call(this, l), this._helper = s;
          var d = this;
          s.on("data", function(u, h) {
            d.push(u) || d._helper.pause(), f && f(h);
          }).on("error", function(u) {
            d.emit("error", u);
          }).on("end", function() {
            d.push(null);
          });
        }
        r("../utils").inherits(a, o), a.prototype._read = function() {
          this._helper.resume();
        }, n.exports = a;
      }, { "../utils": 32, "readable-stream": 16 }], 14: [function(r, n, i) {
        n.exports = { isNode: typeof Buffer < "u", newBufferFrom: function(o, a) {
          if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(o, a);
          if (typeof o == "number") throw new Error('The "data" argument must not be a number');
          return new Buffer(o, a);
        }, allocBuffer: function(o) {
          if (Buffer.alloc) return Buffer.alloc(o);
          var a = new Buffer(o);
          return a.fill(0), a;
        }, isBuffer: function(o) {
          return Buffer.isBuffer(o);
        }, isStream: function(o) {
          return o && typeof o.on == "function" && typeof o.pause == "function" && typeof o.resume == "function";
        } };
      }, {}], 15: [function(r, n, i) {
        function o(R, C, P) {
          var W, j = s.getTypeOf(C), oe = s.extend(P || {}, d);
          oe.date = oe.date || /* @__PURE__ */ new Date(), oe.compression !== null && (oe.compression = oe.compression.toUpperCase()), typeof oe.unixPermissions == "string" && (oe.unixPermissions = parseInt(oe.unixPermissions, 8)), oe.unixPermissions && 16384 & oe.unixPermissions && (oe.dir = !0), oe.dosPermissions && 16 & oe.dosPermissions && (oe.dir = !0), oe.dir && (R = g(R)), oe.createFolders && (W = b(R)) && _.call(this, W, !0);
          var ue = j === "string" && oe.binary === !1 && oe.base64 === !1;
          P && P.binary !== void 0 || (oe.binary = !ue), (C instanceof u && C.uncompressedSize === 0 || oe.dir || !C || C.length === 0) && (oe.base64 = !1, oe.binary = !0, C = "", oe.compression = "STORE", j = "string");
          var B = null;
          B = C instanceof u || C instanceof l ? C : y.isNode && y.isStream(C) ? new m(R, C) : s.prepareContent(R, C, oe.binary, oe.optimizedBinaryString, oe.base64);
          var Z = new h(R, B, oe);
          this.files[R] = Z;
        }
        var a = r("./utf8"), s = r("./utils"), l = r("./stream/GenericWorker"), f = r("./stream/StreamHelper"), d = r("./defaults"), u = r("./compressedObject"), h = r("./zipObject"), c = r("./generate"), y = r("./nodejsUtils"), m = r("./nodejs/NodejsStreamInputAdapter"), b = function(R) {
          R.slice(-1) === "/" && (R = R.substring(0, R.length - 1));
          var C = R.lastIndexOf("/");
          return 0 < C ? R.substring(0, C) : "";
        }, g = function(R) {
          return R.slice(-1) !== "/" && (R += "/"), R;
        }, _ = function(R, C) {
          return C = C !== void 0 ? C : d.createFolders, R = g(R), this.files[R] || o.call(this, R, null, { dir: !0, createFolders: C }), this.files[R];
        };
        function x(R) {
          return Object.prototype.toString.call(R) === "[object RegExp]";
        }
        var D = { load: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, forEach: function(R) {
          var C, P, W;
          for (C in this.files) W = this.files[C], (P = C.slice(this.root.length, C.length)) && C.slice(0, this.root.length) === this.root && R(P, W);
        }, filter: function(R) {
          var C = [];
          return this.forEach(function(P, W) {
            R(P, W) && C.push(W);
          }), C;
        }, file: function(R, C, P) {
          if (arguments.length !== 1) return R = this.root + R, o.call(this, R, C, P), this;
          if (x(R)) {
            var W = R;
            return this.filter(function(oe, ue) {
              return !ue.dir && W.test(oe);
            });
          }
          var j = this.files[this.root + R];
          return j && !j.dir ? j : null;
        }, folder: function(R) {
          if (!R) return this;
          if (x(R)) return this.filter(function(j, oe) {
            return oe.dir && R.test(j);
          });
          var C = this.root + R, P = _.call(this, C), W = this.clone();
          return W.root = P.name, W;
        }, remove: function(R) {
          R = this.root + R;
          var C = this.files[R];
          if (C || (R.slice(-1) !== "/" && (R += "/"), C = this.files[R]), C && !C.dir) delete this.files[R];
          else for (var P = this.filter(function(j, oe) {
            return oe.name.slice(0, R.length) === R;
          }), W = 0; W < P.length; W++) delete this.files[P[W].name];
          return this;
        }, generate: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, generateInternalStream: function(R) {
          var C, P = {};
          try {
            if ((P = s.extend(R || {}, { streamFiles: !1, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: a.utf8encode })).type = P.type.toLowerCase(), P.compression = P.compression.toUpperCase(), P.type === "binarystring" && (P.type = "string"), !P.type) throw new Error("No output type specified.");
            s.checkSupport(P.type), P.platform !== "darwin" && P.platform !== "freebsd" && P.platform !== "linux" && P.platform !== "sunos" || (P.platform = "UNIX"), P.platform === "win32" && (P.platform = "DOS");
            var W = P.comment || this.comment || "";
            C = c.generateWorker(this, P, W);
          } catch (j) {
            (C = new l("error")).error(j);
          }
          return new f(C, P.type || "string", P.mimeType);
        }, generateAsync: function(R, C) {
          return this.generateInternalStream(R).accumulate(C);
        }, generateNodeStream: function(R, C) {
          return (R = R || {}).type || (R.type = "nodebuffer"), this.generateInternalStream(R).toNodejsStream(C);
        } };
        n.exports = D;
      }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(r, n, i) {
        n.exports = r("stream");
      }, { stream: void 0 }], 17: [function(r, n, i) {
        var o = r("./DataReader");
        function a(s) {
          o.call(this, s);
          for (var l = 0; l < this.data.length; l++) s[l] = 255 & s[l];
        }
        r("../utils").inherits(a, o), a.prototype.byteAt = function(s) {
          return this.data[this.zero + s];
        }, a.prototype.lastIndexOfSignature = function(s) {
          for (var l = s.charCodeAt(0), f = s.charCodeAt(1), d = s.charCodeAt(2), u = s.charCodeAt(3), h = this.length - 4; 0 <= h; --h) if (this.data[h] === l && this.data[h + 1] === f && this.data[h + 2] === d && this.data[h + 3] === u) return h - this.zero;
          return -1;
        }, a.prototype.readAndCheckSignature = function(s) {
          var l = s.charCodeAt(0), f = s.charCodeAt(1), d = s.charCodeAt(2), u = s.charCodeAt(3), h = this.readData(4);
          return l === h[0] && f === h[1] && d === h[2] && u === h[3];
        }, a.prototype.readData = function(s) {
          if (this.checkOffset(s), s === 0) return [];
          var l = this.data.slice(this.zero + this.index, this.zero + this.index + s);
          return this.index += s, l;
        }, n.exports = a;
      }, { "../utils": 32, "./DataReader": 18 }], 18: [function(r, n, i) {
        var o = r("../utils");
        function a(s) {
          this.data = s, this.length = s.length, this.index = 0, this.zero = 0;
        }
        a.prototype = { checkOffset: function(s) {
          this.checkIndex(this.index + s);
        }, checkIndex: function(s) {
          if (this.length < this.zero + s || s < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + s + "). Corrupted zip ?");
        }, setIndex: function(s) {
          this.checkIndex(s), this.index = s;
        }, skip: function(s) {
          this.setIndex(this.index + s);
        }, byteAt: function() {
        }, readInt: function(s) {
          var l, f = 0;
          for (this.checkOffset(s), l = this.index + s - 1; l >= this.index; l--) f = (f << 8) + this.byteAt(l);
          return this.index += s, f;
        }, readString: function(s) {
          return o.transformTo("string", this.readData(s));
        }, readData: function() {
        }, lastIndexOfSignature: function() {
        }, readAndCheckSignature: function() {
        }, readDate: function() {
          var s = this.readInt(4);
          return new Date(Date.UTC(1980 + (s >> 25 & 127), (s >> 21 & 15) - 1, s >> 16 & 31, s >> 11 & 31, s >> 5 & 63, (31 & s) << 1));
        } }, n.exports = a;
      }, { "../utils": 32 }], 19: [function(r, n, i) {
        var o = r("./Uint8ArrayReader");
        function a(s) {
          o.call(this, s);
        }
        r("../utils").inherits(a, o), a.prototype.readData = function(s) {
          this.checkOffset(s);
          var l = this.data.slice(this.zero + this.index, this.zero + this.index + s);
          return this.index += s, l;
        }, n.exports = a;
      }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(r, n, i) {
        var o = r("./DataReader");
        function a(s) {
          o.call(this, s);
        }
        r("../utils").inherits(a, o), a.prototype.byteAt = function(s) {
          return this.data.charCodeAt(this.zero + s);
        }, a.prototype.lastIndexOfSignature = function(s) {
          return this.data.lastIndexOf(s) - this.zero;
        }, a.prototype.readAndCheckSignature = function(s) {
          return s === this.readData(4);
        }, a.prototype.readData = function(s) {
          this.checkOffset(s);
          var l = this.data.slice(this.zero + this.index, this.zero + this.index + s);
          return this.index += s, l;
        }, n.exports = a;
      }, { "../utils": 32, "./DataReader": 18 }], 21: [function(r, n, i) {
        var o = r("./ArrayReader");
        function a(s) {
          o.call(this, s);
        }
        r("../utils").inherits(a, o), a.prototype.readData = function(s) {
          if (this.checkOffset(s), s === 0) return new Uint8Array(0);
          var l = this.data.subarray(this.zero + this.index, this.zero + this.index + s);
          return this.index += s, l;
        }, n.exports = a;
      }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(r, n, i) {
        var o = r("../utils"), a = r("../support"), s = r("./ArrayReader"), l = r("./StringReader"), f = r("./NodeBufferReader"), d = r("./Uint8ArrayReader");
        n.exports = function(u) {
          var h = o.getTypeOf(u);
          return o.checkSupport(h), h !== "string" || a.uint8array ? h === "nodebuffer" ? new f(u) : a.uint8array ? new d(o.transformTo("uint8array", u)) : new s(o.transformTo("array", u)) : new l(u);
        };
      }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(r, n, i) {
        i.LOCAL_FILE_HEADER = "PK", i.CENTRAL_FILE_HEADER = "PK", i.CENTRAL_DIRECTORY_END = "PK", i.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", i.ZIP64_CENTRAL_DIRECTORY_END = "PK", i.DATA_DESCRIPTOR = "PK\x07\b";
      }, {}], 24: [function(r, n, i) {
        var o = r("./GenericWorker"), a = r("../utils");
        function s(l) {
          o.call(this, "ConvertWorker to " + l), this.destType = l;
        }
        a.inherits(s, o), s.prototype.processChunk = function(l) {
          this.push({ data: a.transformTo(this.destType, l.data), meta: l.meta });
        }, n.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(r, n, i) {
        var o = r("./GenericWorker"), a = r("../crc32");
        function s() {
          o.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
        }
        r("../utils").inherits(s, o), s.prototype.processChunk = function(l) {
          this.streamInfo.crc32 = a(l.data, this.streamInfo.crc32 || 0), this.push(l);
        }, n.exports = s;
      }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(r, n, i) {
        var o = r("../utils"), a = r("./GenericWorker");
        function s(l) {
          a.call(this, "DataLengthProbe for " + l), this.propName = l, this.withStreamInfo(l, 0);
        }
        o.inherits(s, a), s.prototype.processChunk = function(l) {
          if (l) {
            var f = this.streamInfo[this.propName] || 0;
            this.streamInfo[this.propName] = f + l.data.length;
          }
          a.prototype.processChunk.call(this, l);
        }, n.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(r, n, i) {
        var o = r("../utils"), a = r("./GenericWorker");
        function s(l) {
          a.call(this, "DataWorker");
          var f = this;
          this.dataIsReady = !1, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = !1, l.then(function(d) {
            f.dataIsReady = !0, f.data = d, f.max = d && d.length || 0, f.type = o.getTypeOf(d), f.isPaused || f._tickAndRepeat();
          }, function(d) {
            f.error(d);
          });
        }
        o.inherits(s, a), s.prototype.cleanUp = function() {
          a.prototype.cleanUp.call(this), this.data = null;
        }, s.prototype.resume = function() {
          return !!a.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = !0, o.delay(this._tickAndRepeat, [], this)), !0);
        }, s.prototype._tickAndRepeat = function() {
          this._tickScheduled = !1, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (o.delay(this._tickAndRepeat, [], this), this._tickScheduled = !0));
        }, s.prototype._tick = function() {
          if (this.isPaused || this.isFinished) return !1;
          var l = null, f = Math.min(this.max, this.index + 16384);
          if (this.index >= this.max) return this.end();
          switch (this.type) {
            case "string":
              l = this.data.substring(this.index, f);
              break;
            case "uint8array":
              l = this.data.subarray(this.index, f);
              break;
            case "array":
            case "nodebuffer":
              l = this.data.slice(this.index, f);
          }
          return this.index = f, this.push({ data: l, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
        }, n.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(r, n, i) {
        function o(a) {
          this.name = a || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = !0, this.isFinished = !1, this.isLocked = !1, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
        }
        o.prototype = { push: function(a) {
          this.emit("data", a);
        }, end: function() {
          if (this.isFinished) return !1;
          this.flush();
          try {
            this.emit("end"), this.cleanUp(), this.isFinished = !0;
          } catch (a) {
            this.emit("error", a);
          }
          return !0;
        }, error: function(a) {
          return !this.isFinished && (this.isPaused ? this.generatedError = a : (this.isFinished = !0, this.emit("error", a), this.previous && this.previous.error(a), this.cleanUp()), !0);
        }, on: function(a, s) {
          return this._listeners[a].push(s), this;
        }, cleanUp: function() {
          this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
        }, emit: function(a, s) {
          if (this._listeners[a]) for (var l = 0; l < this._listeners[a].length; l++) this._listeners[a][l].call(this, s);
        }, pipe: function(a) {
          return a.registerPrevious(this);
        }, registerPrevious: function(a) {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.streamInfo = a.streamInfo, this.mergeStreamInfo(), this.previous = a;
          var s = this;
          return a.on("data", function(l) {
            s.processChunk(l);
          }), a.on("end", function() {
            s.end();
          }), a.on("error", function(l) {
            s.error(l);
          }), this;
        }, pause: function() {
          return !this.isPaused && !this.isFinished && (this.isPaused = !0, this.previous && this.previous.pause(), !0);
        }, resume: function() {
          if (!this.isPaused || this.isFinished) return !1;
          var a = this.isPaused = !1;
          return this.generatedError && (this.error(this.generatedError), a = !0), this.previous && this.previous.resume(), !a;
        }, flush: function() {
        }, processChunk: function(a) {
          this.push(a);
        }, withStreamInfo: function(a, s) {
          return this.extraStreamInfo[a] = s, this.mergeStreamInfo(), this;
        }, mergeStreamInfo: function() {
          for (var a in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, a) && (this.streamInfo[a] = this.extraStreamInfo[a]);
        }, lock: function() {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.isLocked = !0, this.previous && this.previous.lock();
        }, toString: function() {
          var a = "Worker " + this.name;
          return this.previous ? this.previous + " -> " + a : a;
        } }, n.exports = o;
      }, {}], 29: [function(r, n, i) {
        var o = r("../utils"), a = r("./ConvertWorker"), s = r("./GenericWorker"), l = r("../base64"), f = r("../support"), d = r("../external"), u = null;
        if (f.nodestream) try {
          u = r("../nodejs/NodejsStreamOutputAdapter");
        } catch {
        }
        function h(y, m) {
          return new d.Promise(function(b, g) {
            var _ = [], x = y._internalType, D = y._outputType, R = y._mimeType;
            y.on("data", function(C, P) {
              _.push(C), m && m(P);
            }).on("error", function(C) {
              _ = [], g(C);
            }).on("end", function() {
              try {
                var C = (function(P, W, j) {
                  switch (P) {
                    case "blob":
                      return o.newBlob(o.transformTo("arraybuffer", W), j);
                    case "base64":
                      return l.encode(W);
                    default:
                      return o.transformTo(P, W);
                  }
                })(D, (function(P, W) {
                  var j, oe = 0, ue = null, B = 0;
                  for (j = 0; j < W.length; j++) B += W[j].length;
                  switch (P) {
                    case "string":
                      return W.join("");
                    case "array":
                      return Array.prototype.concat.apply([], W);
                    case "uint8array":
                      for (ue = new Uint8Array(B), j = 0; j < W.length; j++) ue.set(W[j], oe), oe += W[j].length;
                      return ue;
                    case "nodebuffer":
                      return Buffer.concat(W);
                    default:
                      throw new Error("concat : unsupported type '" + P + "'");
                  }
                })(x, _), R);
                b(C);
              } catch (P) {
                g(P);
              }
              _ = [];
            }).resume();
          });
        }
        function c(y, m, b) {
          var g = m;
          switch (m) {
            case "blob":
            case "arraybuffer":
              g = "uint8array";
              break;
            case "base64":
              g = "string";
          }
          try {
            this._internalType = g, this._outputType = m, this._mimeType = b, o.checkSupport(g), this._worker = y.pipe(new a(g)), y.lock();
          } catch (_) {
            this._worker = new s("error"), this._worker.error(_);
          }
        }
        c.prototype = { accumulate: function(y) {
          return h(this, y);
        }, on: function(y, m) {
          var b = this;
          return y === "data" ? this._worker.on(y, function(g) {
            m.call(b, g.data, g.meta);
          }) : this._worker.on(y, function() {
            o.delay(m, arguments, b);
          }), this;
        }, resume: function() {
          return o.delay(this._worker.resume, [], this._worker), this;
        }, pause: function() {
          return this._worker.pause(), this;
        }, toNodejsStream: function(y) {
          if (o.checkSupport("nodestream"), this._outputType !== "nodebuffer") throw new Error(this._outputType + " is not supported by this method");
          return new u(this, { objectMode: this._outputType !== "nodebuffer" }, y);
        } }, n.exports = c;
      }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(r, n, i) {
        if (i.base64 = !0, i.array = !0, i.string = !0, i.arraybuffer = typeof ArrayBuffer < "u" && typeof Uint8Array < "u", i.nodebuffer = typeof Buffer < "u", i.uint8array = typeof Uint8Array < "u", typeof ArrayBuffer > "u") i.blob = !1;
        else {
          var o = new ArrayBuffer(0);
          try {
            i.blob = new Blob([o], { type: "application/zip" }).size === 0;
          } catch {
            try {
              var a = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              a.append(o), i.blob = a.getBlob("application/zip").size === 0;
            } catch {
              i.blob = !1;
            }
          }
        }
        try {
          i.nodestream = !!r("readable-stream").Readable;
        } catch {
          i.nodestream = !1;
        }
      }, { "readable-stream": 16 }], 31: [function(r, n, i) {
        for (var o = r("./utils"), a = r("./support"), s = r("./nodejsUtils"), l = r("./stream/GenericWorker"), f = new Array(256), d = 0; d < 256; d++) f[d] = 252 <= d ? 6 : 248 <= d ? 5 : 240 <= d ? 4 : 224 <= d ? 3 : 192 <= d ? 2 : 1;
        f[254] = f[254] = 1;
        function u() {
          l.call(this, "utf-8 decode"), this.leftOver = null;
        }
        function h() {
          l.call(this, "utf-8 encode");
        }
        i.utf8encode = function(c) {
          return a.nodebuffer ? s.newBufferFrom(c, "utf-8") : (function(y) {
            var m, b, g, _, x, D = y.length, R = 0;
            for (_ = 0; _ < D; _++) (64512 & (b = y.charCodeAt(_))) == 55296 && _ + 1 < D && (64512 & (g = y.charCodeAt(_ + 1))) == 56320 && (b = 65536 + (b - 55296 << 10) + (g - 56320), _++), R += b < 128 ? 1 : b < 2048 ? 2 : b < 65536 ? 3 : 4;
            for (m = a.uint8array ? new Uint8Array(R) : new Array(R), _ = x = 0; x < R; _++) (64512 & (b = y.charCodeAt(_))) == 55296 && _ + 1 < D && (64512 & (g = y.charCodeAt(_ + 1))) == 56320 && (b = 65536 + (b - 55296 << 10) + (g - 56320), _++), b < 128 ? m[x++] = b : (b < 2048 ? m[x++] = 192 | b >>> 6 : (b < 65536 ? m[x++] = 224 | b >>> 12 : (m[x++] = 240 | b >>> 18, m[x++] = 128 | b >>> 12 & 63), m[x++] = 128 | b >>> 6 & 63), m[x++] = 128 | 63 & b);
            return m;
          })(c);
        }, i.utf8decode = function(c) {
          return a.nodebuffer ? o.transformTo("nodebuffer", c).toString("utf-8") : (function(y) {
            var m, b, g, _, x = y.length, D = new Array(2 * x);
            for (m = b = 0; m < x; ) if ((g = y[m++]) < 128) D[b++] = g;
            else if (4 < (_ = f[g])) D[b++] = 65533, m += _ - 1;
            else {
              for (g &= _ === 2 ? 31 : _ === 3 ? 15 : 7; 1 < _ && m < x; ) g = g << 6 | 63 & y[m++], _--;
              1 < _ ? D[b++] = 65533 : g < 65536 ? D[b++] = g : (g -= 65536, D[b++] = 55296 | g >> 10 & 1023, D[b++] = 56320 | 1023 & g);
            }
            return D.length !== b && (D.subarray ? D = D.subarray(0, b) : D.length = b), o.applyFromCharCode(D);
          })(c = o.transformTo(a.uint8array ? "uint8array" : "array", c));
        }, o.inherits(u, l), u.prototype.processChunk = function(c) {
          var y = o.transformTo(a.uint8array ? "uint8array" : "array", c.data);
          if (this.leftOver && this.leftOver.length) {
            if (a.uint8array) {
              var m = y;
              (y = new Uint8Array(m.length + this.leftOver.length)).set(this.leftOver, 0), y.set(m, this.leftOver.length);
            } else y = this.leftOver.concat(y);
            this.leftOver = null;
          }
          var b = (function(_, x) {
            var D;
            for ((x = x || _.length) > _.length && (x = _.length), D = x - 1; 0 <= D && (192 & _[D]) == 128; ) D--;
            return D < 0 || D === 0 ? x : D + f[_[D]] > x ? D : x;
          })(y), g = y;
          b !== y.length && (a.uint8array ? (g = y.subarray(0, b), this.leftOver = y.subarray(b, y.length)) : (g = y.slice(0, b), this.leftOver = y.slice(b, y.length))), this.push({ data: i.utf8decode(g), meta: c.meta });
        }, u.prototype.flush = function() {
          this.leftOver && this.leftOver.length && (this.push({ data: i.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
        }, i.Utf8DecodeWorker = u, o.inherits(h, l), h.prototype.processChunk = function(c) {
          this.push({ data: i.utf8encode(c.data), meta: c.meta });
        }, i.Utf8EncodeWorker = h;
      }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(r, n, i) {
        var o = r("./support"), a = r("./base64"), s = r("./nodejsUtils"), l = r("./external");
        function f(m) {
          return m;
        }
        function d(m, b) {
          for (var g = 0; g < m.length; ++g) b[g] = 255 & m.charCodeAt(g);
          return b;
        }
        r("setimmediate"), i.newBlob = function(m, b) {
          i.checkSupport("blob");
          try {
            return new Blob([m], { type: b });
          } catch {
            try {
              var g = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              return g.append(m), g.getBlob(b);
            } catch {
              throw new Error("Bug : can't construct the Blob.");
            }
          }
        };
        var u = { stringifyByChunk: function(m, b, g) {
          var _ = [], x = 0, D = m.length;
          if (D <= g) return String.fromCharCode.apply(null, m);
          for (; x < D; ) b === "array" || b === "nodebuffer" ? _.push(String.fromCharCode.apply(null, m.slice(x, Math.min(x + g, D)))) : _.push(String.fromCharCode.apply(null, m.subarray(x, Math.min(x + g, D)))), x += g;
          return _.join("");
        }, stringifyByChar: function(m) {
          for (var b = "", g = 0; g < m.length; g++) b += String.fromCharCode(m[g]);
          return b;
        }, applyCanBeUsed: { uint8array: (function() {
          try {
            return o.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
          } catch {
            return !1;
          }
        })(), nodebuffer: (function() {
          try {
            return o.nodebuffer && String.fromCharCode.apply(null, s.allocBuffer(1)).length === 1;
          } catch {
            return !1;
          }
        })() } };
        function h(m) {
          var b = 65536, g = i.getTypeOf(m), _ = !0;
          if (g === "uint8array" ? _ = u.applyCanBeUsed.uint8array : g === "nodebuffer" && (_ = u.applyCanBeUsed.nodebuffer), _) for (; 1 < b; ) try {
            return u.stringifyByChunk(m, g, b);
          } catch {
            b = Math.floor(b / 2);
          }
          return u.stringifyByChar(m);
        }
        function c(m, b) {
          for (var g = 0; g < m.length; g++) b[g] = m[g];
          return b;
        }
        i.applyFromCharCode = h;
        var y = {};
        y.string = { string: f, array: function(m) {
          return d(m, new Array(m.length));
        }, arraybuffer: function(m) {
          return y.string.uint8array(m).buffer;
        }, uint8array: function(m) {
          return d(m, new Uint8Array(m.length));
        }, nodebuffer: function(m) {
          return d(m, s.allocBuffer(m.length));
        } }, y.array = { string: h, array: f, arraybuffer: function(m) {
          return new Uint8Array(m).buffer;
        }, uint8array: function(m) {
          return new Uint8Array(m);
        }, nodebuffer: function(m) {
          return s.newBufferFrom(m);
        } }, y.arraybuffer = { string: function(m) {
          return h(new Uint8Array(m));
        }, array: function(m) {
          return c(new Uint8Array(m), new Array(m.byteLength));
        }, arraybuffer: f, uint8array: function(m) {
          return new Uint8Array(m);
        }, nodebuffer: function(m) {
          return s.newBufferFrom(new Uint8Array(m));
        } }, y.uint8array = { string: h, array: function(m) {
          return c(m, new Array(m.length));
        }, arraybuffer: function(m) {
          return m.buffer;
        }, uint8array: f, nodebuffer: function(m) {
          return s.newBufferFrom(m);
        } }, y.nodebuffer = { string: h, array: function(m) {
          return c(m, new Array(m.length));
        }, arraybuffer: function(m) {
          return y.nodebuffer.uint8array(m).buffer;
        }, uint8array: function(m) {
          return c(m, new Uint8Array(m.length));
        }, nodebuffer: f }, i.transformTo = function(m, b) {
          if (b = b || "", !m) return b;
          i.checkSupport(m);
          var g = i.getTypeOf(b);
          return y[g][m](b);
        }, i.resolve = function(m) {
          for (var b = m.split("/"), g = [], _ = 0; _ < b.length; _++) {
            var x = b[_];
            x === "." || x === "" && _ !== 0 && _ !== b.length - 1 || (x === ".." ? g.pop() : g.push(x));
          }
          return g.join("/");
        }, i.getTypeOf = function(m) {
          return typeof m == "string" ? "string" : Object.prototype.toString.call(m) === "[object Array]" ? "array" : o.nodebuffer && s.isBuffer(m) ? "nodebuffer" : o.uint8array && m instanceof Uint8Array ? "uint8array" : o.arraybuffer && m instanceof ArrayBuffer ? "arraybuffer" : void 0;
        }, i.checkSupport = function(m) {
          if (!o[m.toLowerCase()]) throw new Error(m + " is not supported by this platform");
        }, i.MAX_VALUE_16BITS = 65535, i.MAX_VALUE_32BITS = -1, i.pretty = function(m) {
          var b, g, _ = "";
          for (g = 0; g < (m || "").length; g++) _ += "\\x" + ((b = m.charCodeAt(g)) < 16 ? "0" : "") + b.toString(16).toUpperCase();
          return _;
        }, i.delay = function(m, b, g) {
          setImmediate(function() {
            m.apply(g || null, b || []);
          });
        }, i.inherits = function(m, b) {
          function g() {
          }
          g.prototype = b.prototype, m.prototype = new g();
        }, i.extend = function() {
          var m, b, g = {};
          for (m = 0; m < arguments.length; m++) for (b in arguments[m]) Object.prototype.hasOwnProperty.call(arguments[m], b) && g[b] === void 0 && (g[b] = arguments[m][b]);
          return g;
        }, i.prepareContent = function(m, b, g, _, x) {
          return l.Promise.resolve(b).then(function(D) {
            return o.blob && (D instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(D)) !== -1) && typeof FileReader < "u" ? new l.Promise(function(R, C) {
              var P = new FileReader();
              P.onload = function(W) {
                R(W.target.result);
              }, P.onerror = function(W) {
                C(W.target.error);
              }, P.readAsArrayBuffer(D);
            }) : D;
          }).then(function(D) {
            var R = i.getTypeOf(D);
            return R ? (R === "arraybuffer" ? D = i.transformTo("uint8array", D) : R === "string" && (x ? D = a.decode(D) : g && _ !== !0 && (D = (function(C) {
              return d(C, o.uint8array ? new Uint8Array(C.length) : new Array(C.length));
            })(D))), D) : l.Promise.reject(new Error("Can't read the data of '" + m + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
          });
        };
      }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(r, n, i) {
        var o = r("./reader/readerFor"), a = r("./utils"), s = r("./signature"), l = r("./zipEntry"), f = r("./support");
        function d(u) {
          this.files = [], this.loadOptions = u;
        }
        d.prototype = { checkSignature: function(u) {
          if (!this.reader.readAndCheckSignature(u)) {
            this.reader.index -= 4;
            var h = this.reader.readString(4);
            throw new Error("Corrupted zip or bug: unexpected signature (" + a.pretty(h) + ", expected " + a.pretty(u) + ")");
          }
        }, isSignature: function(u, h) {
          var c = this.reader.index;
          this.reader.setIndex(u);
          var y = this.reader.readString(4) === h;
          return this.reader.setIndex(c), y;
        }, readBlockEndOfCentral: function() {
          this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
          var u = this.reader.readData(this.zipCommentLength), h = f.uint8array ? "uint8array" : "array", c = a.transformTo(h, u);
          this.zipComment = this.loadOptions.decodeFileName(c);
        }, readBlockZip64EndOfCentral: function() {
          this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
          for (var u, h, c, y = this.zip64EndOfCentralSize - 44; 0 < y; ) u = this.reader.readInt(2), h = this.reader.readInt(4), c = this.reader.readData(h), this.zip64ExtensibleData[u] = { id: u, length: h, value: c };
        }, readBlockZip64EndOfCentralLocator: function() {
          if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
        }, readLocalFiles: function() {
          var u, h;
          for (u = 0; u < this.files.length; u++) h = this.files[u], this.reader.setIndex(h.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), h.readLocalPart(this.reader), h.handleUTF8(), h.processAttributes();
        }, readCentralDir: function() {
          var u;
          for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (u = new l({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(u);
          if (this.centralDirRecords !== this.files.length && this.centralDirRecords !== 0 && this.files.length === 0) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
        }, readEndOfCentral: function() {
          var u = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
          if (u < 0) throw this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Corrupted zip: can't find end of central directory") : new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
          this.reader.setIndex(u);
          var h = u;
          if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === a.MAX_VALUE_16BITS || this.diskWithCentralDirStart === a.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === a.MAX_VALUE_16BITS || this.centralDirRecords === a.MAX_VALUE_16BITS || this.centralDirSize === a.MAX_VALUE_32BITS || this.centralDirOffset === a.MAX_VALUE_32BITS) {
            if (this.zip64 = !0, (u = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
            if (this.reader.setIndex(u), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
            this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
          }
          var c = this.centralDirOffset + this.centralDirSize;
          this.zip64 && (c += 20, c += 12 + this.zip64EndOfCentralSize);
          var y = h - c;
          if (0 < y) this.isSignature(h, s.CENTRAL_FILE_HEADER) || (this.reader.zero = y);
          else if (y < 0) throw new Error("Corrupted zip: missing " + Math.abs(y) + " bytes.");
        }, prepareReader: function(u) {
          this.reader = o(u);
        }, load: function(u) {
          this.prepareReader(u), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
        } }, n.exports = d;
      }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(r, n, i) {
        var o = r("./reader/readerFor"), a = r("./utils"), s = r("./compressedObject"), l = r("./crc32"), f = r("./utf8"), d = r("./compressions"), u = r("./support");
        function h(c, y) {
          this.options = c, this.loadOptions = y;
        }
        h.prototype = { isEncrypted: function() {
          return (1 & this.bitFlag) == 1;
        }, useUTF8: function() {
          return (2048 & this.bitFlag) == 2048;
        }, readLocalPart: function(c) {
          var y, m;
          if (c.skip(22), this.fileNameLength = c.readInt(2), m = c.readInt(2), this.fileName = c.readData(this.fileNameLength), c.skip(m), this.compressedSize === -1 || this.uncompressedSize === -1) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
          if ((y = (function(b) {
            for (var g in d) if (Object.prototype.hasOwnProperty.call(d, g) && d[g].magic === b) return d[g];
            return null;
          })(this.compressionMethod)) === null) throw new Error("Corrupted zip : compression " + a.pretty(this.compressionMethod) + " unknown (inner file : " + a.transformTo("string", this.fileName) + ")");
          this.decompressed = new s(this.compressedSize, this.uncompressedSize, this.crc32, y, c.readData(this.compressedSize));
        }, readCentralPart: function(c) {
          this.versionMadeBy = c.readInt(2), c.skip(2), this.bitFlag = c.readInt(2), this.compressionMethod = c.readString(2), this.date = c.readDate(), this.crc32 = c.readInt(4), this.compressedSize = c.readInt(4), this.uncompressedSize = c.readInt(4);
          var y = c.readInt(2);
          if (this.extraFieldsLength = c.readInt(2), this.fileCommentLength = c.readInt(2), this.diskNumberStart = c.readInt(2), this.internalFileAttributes = c.readInt(2), this.externalFileAttributes = c.readInt(4), this.localHeaderOffset = c.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
          c.skip(y), this.readExtraFields(c), this.parseZIP64ExtraField(c), this.fileComment = c.readData(this.fileCommentLength);
        }, processAttributes: function() {
          this.unixPermissions = null, this.dosPermissions = null;
          var c = this.versionMadeBy >> 8;
          this.dir = !!(16 & this.externalFileAttributes), c == 0 && (this.dosPermissions = 63 & this.externalFileAttributes), c == 3 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || this.fileNameStr.slice(-1) !== "/" || (this.dir = !0);
        }, parseZIP64ExtraField: function() {
          if (this.extraFields[1]) {
            var c = o(this.extraFields[1].value);
            this.uncompressedSize === a.MAX_VALUE_32BITS && (this.uncompressedSize = c.readInt(8)), this.compressedSize === a.MAX_VALUE_32BITS && (this.compressedSize = c.readInt(8)), this.localHeaderOffset === a.MAX_VALUE_32BITS && (this.localHeaderOffset = c.readInt(8)), this.diskNumberStart === a.MAX_VALUE_32BITS && (this.diskNumberStart = c.readInt(4));
          }
        }, readExtraFields: function(c) {
          var y, m, b, g = c.index + this.extraFieldsLength;
          for (this.extraFields || (this.extraFields = {}); c.index + 4 < g; ) y = c.readInt(2), m = c.readInt(2), b = c.readData(m), this.extraFields[y] = { id: y, length: m, value: b };
          c.setIndex(g);
        }, handleUTF8: function() {
          var c = u.uint8array ? "uint8array" : "array";
          if (this.useUTF8()) this.fileNameStr = f.utf8decode(this.fileName), this.fileCommentStr = f.utf8decode(this.fileComment);
          else {
            var y = this.findExtraFieldUnicodePath();
            if (y !== null) this.fileNameStr = y;
            else {
              var m = a.transformTo(c, this.fileName);
              this.fileNameStr = this.loadOptions.decodeFileName(m);
            }
            var b = this.findExtraFieldUnicodeComment();
            if (b !== null) this.fileCommentStr = b;
            else {
              var g = a.transformTo(c, this.fileComment);
              this.fileCommentStr = this.loadOptions.decodeFileName(g);
            }
          }
        }, findExtraFieldUnicodePath: function() {
          var c = this.extraFields[28789];
          if (c) {
            var y = o(c.value);
            return y.readInt(1) !== 1 || l(this.fileName) !== y.readInt(4) ? null : f.utf8decode(y.readData(c.length - 5));
          }
          return null;
        }, findExtraFieldUnicodeComment: function() {
          var c = this.extraFields[25461];
          if (c) {
            var y = o(c.value);
            return y.readInt(1) !== 1 || l(this.fileComment) !== y.readInt(4) ? null : f.utf8decode(y.readData(c.length - 5));
          }
          return null;
        } }, n.exports = h;
      }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(r, n, i) {
        function o(y, m, b) {
          this.name = y, this.dir = b.dir, this.date = b.date, this.comment = b.comment, this.unixPermissions = b.unixPermissions, this.dosPermissions = b.dosPermissions, this._data = m, this._dataBinary = b.binary, this.options = { compression: b.compression, compressionOptions: b.compressionOptions };
        }
        var a = r("./stream/StreamHelper"), s = r("./stream/DataWorker"), l = r("./utf8"), f = r("./compressedObject"), d = r("./stream/GenericWorker");
        o.prototype = { internalStream: function(y) {
          var m = null, b = "string";
          try {
            if (!y) throw new Error("No output type specified.");
            var g = (b = y.toLowerCase()) === "string" || b === "text";
            b !== "binarystring" && b !== "text" || (b = "string"), m = this._decompressWorker();
            var _ = !this._dataBinary;
            _ && !g && (m = m.pipe(new l.Utf8EncodeWorker())), !_ && g && (m = m.pipe(new l.Utf8DecodeWorker()));
          } catch (x) {
            (m = new d("error")).error(x);
          }
          return new a(m, b, "");
        }, async: function(y, m) {
          return this.internalStream(y).accumulate(m);
        }, nodeStream: function(y, m) {
          return this.internalStream(y || "nodebuffer").toNodejsStream(m);
        }, _compressWorker: function(y, m) {
          if (this._data instanceof f && this._data.compression.magic === y.magic) return this._data.getCompressedWorker();
          var b = this._decompressWorker();
          return this._dataBinary || (b = b.pipe(new l.Utf8EncodeWorker())), f.createWorkerFrom(b, y, m);
        }, _decompressWorker: function() {
          return this._data instanceof f ? this._data.getContentWorker() : this._data instanceof d ? this._data : new s(this._data);
        } };
        for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], h = function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, c = 0; c < u.length; c++) o.prototype[u[c]] = h;
        n.exports = o;
      }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(r, n, i) {
        (function(o) {
          var a, s, l = o.MutationObserver || o.WebKitMutationObserver;
          if (l) {
            var f = 0, d = new l(y), u = o.document.createTextNode("");
            d.observe(u, { characterData: !0 }), a = function() {
              u.data = f = ++f % 2;
            };
          } else if (o.setImmediate || o.MessageChannel === void 0) a = "document" in o && "onreadystatechange" in o.document.createElement("script") ? function() {
            var m = o.document.createElement("script");
            m.onreadystatechange = function() {
              y(), m.onreadystatechange = null, m.parentNode.removeChild(m), m = null;
            }, o.document.documentElement.appendChild(m);
          } : function() {
            setTimeout(y, 0);
          };
          else {
            var h = new o.MessageChannel();
            h.port1.onmessage = y, a = function() {
              h.port2.postMessage(0);
            };
          }
          var c = [];
          function y() {
            var m, b;
            s = !0;
            for (var g = c.length; g; ) {
              for (b = c, c = [], m = -1; ++m < g; ) b[m]();
              g = c.length;
            }
            s = !1;
          }
          n.exports = function(m) {
            c.push(m) !== 1 || s || a();
          };
        }).call(this, typeof xi < "u" ? xi : typeof self < "u" ? self : typeof window < "u" ? window : {});
      }, {}], 37: [function(r, n, i) {
        var o = r("immediate");
        function a() {
        }
        var s = {}, l = ["REJECTED"], f = ["FULFILLED"], d = ["PENDING"];
        function u(g) {
          if (typeof g != "function") throw new TypeError("resolver must be a function");
          this.state = d, this.queue = [], this.outcome = void 0, g !== a && m(this, g);
        }
        function h(g, _, x) {
          this.promise = g, typeof _ == "function" && (this.onFulfilled = _, this.callFulfilled = this.otherCallFulfilled), typeof x == "function" && (this.onRejected = x, this.callRejected = this.otherCallRejected);
        }
        function c(g, _, x) {
          o(function() {
            var D;
            try {
              D = _(x);
            } catch (R) {
              return s.reject(g, R);
            }
            D === g ? s.reject(g, new TypeError("Cannot resolve promise with itself")) : s.resolve(g, D);
          });
        }
        function y(g) {
          var _ = g && g.then;
          if (g && (typeof g == "object" || typeof g == "function") && typeof _ == "function") return function() {
            _.apply(g, arguments);
          };
        }
        function m(g, _) {
          var x = !1;
          function D(P) {
            x || (x = !0, s.reject(g, P));
          }
          function R(P) {
            x || (x = !0, s.resolve(g, P));
          }
          var C = b(function() {
            _(R, D);
          });
          C.status === "error" && D(C.value);
        }
        function b(g, _) {
          var x = {};
          try {
            x.value = g(_), x.status = "success";
          } catch (D) {
            x.status = "error", x.value = D;
          }
          return x;
        }
        (n.exports = u).prototype.finally = function(g) {
          if (typeof g != "function") return this;
          var _ = this.constructor;
          return this.then(function(x) {
            return _.resolve(g()).then(function() {
              return x;
            });
          }, function(x) {
            return _.resolve(g()).then(function() {
              throw x;
            });
          });
        }, u.prototype.catch = function(g) {
          return this.then(null, g);
        }, u.prototype.then = function(g, _) {
          if (typeof g != "function" && this.state === f || typeof _ != "function" && this.state === l) return this;
          var x = new this.constructor(a);
          return this.state !== d ? c(x, this.state === f ? g : _, this.outcome) : this.queue.push(new h(x, g, _)), x;
        }, h.prototype.callFulfilled = function(g) {
          s.resolve(this.promise, g);
        }, h.prototype.otherCallFulfilled = function(g) {
          c(this.promise, this.onFulfilled, g);
        }, h.prototype.callRejected = function(g) {
          s.reject(this.promise, g);
        }, h.prototype.otherCallRejected = function(g) {
          c(this.promise, this.onRejected, g);
        }, s.resolve = function(g, _) {
          var x = b(y, _);
          if (x.status === "error") return s.reject(g, x.value);
          var D = x.value;
          if (D) m(g, D);
          else {
            g.state = f, g.outcome = _;
            for (var R = -1, C = g.queue.length; ++R < C; ) g.queue[R].callFulfilled(_);
          }
          return g;
        }, s.reject = function(g, _) {
          g.state = l, g.outcome = _;
          for (var x = -1, D = g.queue.length; ++x < D; ) g.queue[x].callRejected(_);
          return g;
        }, u.resolve = function(g) {
          return g instanceof this ? g : s.resolve(new this(a), g);
        }, u.reject = function(g) {
          var _ = new this(a);
          return s.reject(_, g);
        }, u.all = function(g) {
          var _ = this;
          if (Object.prototype.toString.call(g) !== "[object Array]") return this.reject(new TypeError("must be an array"));
          var x = g.length, D = !1;
          if (!x) return this.resolve([]);
          for (var R = new Array(x), C = 0, P = -1, W = new this(a); ++P < x; ) j(g[P], P);
          return W;
          function j(oe, ue) {
            _.resolve(oe).then(function(B) {
              R[ue] = B, ++C !== x || D || (D = !0, s.resolve(W, R));
            }, function(B) {
              D || (D = !0, s.reject(W, B));
            });
          }
        }, u.race = function(g) {
          var _ = this;
          if (Object.prototype.toString.call(g) !== "[object Array]") return this.reject(new TypeError("must be an array"));
          var x = g.length, D = !1;
          if (!x) return this.resolve([]);
          for (var R = -1, C = new this(a); ++R < x; ) P = g[R], _.resolve(P).then(function(W) {
            D || (D = !0, s.resolve(C, W));
          }, function(W) {
            D || (D = !0, s.reject(C, W));
          });
          var P;
          return C;
        };
      }, { immediate: 36 }], 38: [function(r, n, i) {
        var o = {};
        (0, r("./lib/utils/common").assign)(o, r("./lib/deflate"), r("./lib/inflate"), r("./lib/zlib/constants")), n.exports = o;
      }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(r, n, i) {
        var o = r("./zlib/deflate"), a = r("./utils/common"), s = r("./utils/strings"), l = r("./zlib/messages"), f = r("./zlib/zstream"), d = Object.prototype.toString, u = 0, h = -1, c = 0, y = 8;
        function m(g) {
          if (!(this instanceof m)) return new m(g);
          this.options = a.assign({ level: h, method: y, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, g || {});
          var _ = this.options;
          _.raw && 0 < _.windowBits ? _.windowBits = -_.windowBits : _.gzip && 0 < _.windowBits && _.windowBits < 16 && (_.windowBits += 16), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new f(), this.strm.avail_out = 0;
          var x = o.deflateInit2(this.strm, _.level, _.method, _.windowBits, _.memLevel, _.strategy);
          if (x !== u) throw new Error(l[x]);
          if (_.header && o.deflateSetHeader(this.strm, _.header), _.dictionary) {
            var D;
            if (D = typeof _.dictionary == "string" ? s.string2buf(_.dictionary) : d.call(_.dictionary) === "[object ArrayBuffer]" ? new Uint8Array(_.dictionary) : _.dictionary, (x = o.deflateSetDictionary(this.strm, D)) !== u) throw new Error(l[x]);
            this._dict_set = !0;
          }
        }
        function b(g, _) {
          var x = new m(_);
          if (x.push(g, !0), x.err) throw x.msg || l[x.err];
          return x.result;
        }
        m.prototype.push = function(g, _) {
          var x, D, R = this.strm, C = this.options.chunkSize;
          if (this.ended) return !1;
          D = _ === ~~_ ? _ : _ === !0 ? 4 : 0, typeof g == "string" ? R.input = s.string2buf(g) : d.call(g) === "[object ArrayBuffer]" ? R.input = new Uint8Array(g) : R.input = g, R.next_in = 0, R.avail_in = R.input.length;
          do {
            if (R.avail_out === 0 && (R.output = new a.Buf8(C), R.next_out = 0, R.avail_out = C), (x = o.deflate(R, D)) !== 1 && x !== u) return this.onEnd(x), !(this.ended = !0);
            R.avail_out !== 0 && (R.avail_in !== 0 || D !== 4 && D !== 2) || (this.options.to === "string" ? this.onData(s.buf2binstring(a.shrinkBuf(R.output, R.next_out))) : this.onData(a.shrinkBuf(R.output, R.next_out)));
          } while ((0 < R.avail_in || R.avail_out === 0) && x !== 1);
          return D === 4 ? (x = o.deflateEnd(this.strm), this.onEnd(x), this.ended = !0, x === u) : D !== 2 || (this.onEnd(u), !(R.avail_out = 0));
        }, m.prototype.onData = function(g) {
          this.chunks.push(g);
        }, m.prototype.onEnd = function(g) {
          g === u && (this.options.to === "string" ? this.result = this.chunks.join("") : this.result = a.flattenChunks(this.chunks)), this.chunks = [], this.err = g, this.msg = this.strm.msg;
        }, i.Deflate = m, i.deflate = b, i.deflateRaw = function(g, _) {
          return (_ = _ || {}).raw = !0, b(g, _);
        }, i.gzip = function(g, _) {
          return (_ = _ || {}).gzip = !0, b(g, _);
        };
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(r, n, i) {
        var o = r("./zlib/inflate"), a = r("./utils/common"), s = r("./utils/strings"), l = r("./zlib/constants"), f = r("./zlib/messages"), d = r("./zlib/zstream"), u = r("./zlib/gzheader"), h = Object.prototype.toString;
        function c(m) {
          if (!(this instanceof c)) return new c(m);
          this.options = a.assign({ chunkSize: 16384, windowBits: 0, to: "" }, m || {});
          var b = this.options;
          b.raw && 0 <= b.windowBits && b.windowBits < 16 && (b.windowBits = -b.windowBits, b.windowBits === 0 && (b.windowBits = -15)), !(0 <= b.windowBits && b.windowBits < 16) || m && m.windowBits || (b.windowBits += 32), 15 < b.windowBits && b.windowBits < 48 && (15 & b.windowBits) == 0 && (b.windowBits |= 15), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new d(), this.strm.avail_out = 0;
          var g = o.inflateInit2(this.strm, b.windowBits);
          if (g !== l.Z_OK) throw new Error(f[g]);
          this.header = new u(), o.inflateGetHeader(this.strm, this.header);
        }
        function y(m, b) {
          var g = new c(b);
          if (g.push(m, !0), g.err) throw g.msg || f[g.err];
          return g.result;
        }
        c.prototype.push = function(m, b) {
          var g, _, x, D, R, C, P = this.strm, W = this.options.chunkSize, j = this.options.dictionary, oe = !1;
          if (this.ended) return !1;
          _ = b === ~~b ? b : b === !0 ? l.Z_FINISH : l.Z_NO_FLUSH, typeof m == "string" ? P.input = s.binstring2buf(m) : h.call(m) === "[object ArrayBuffer]" ? P.input = new Uint8Array(m) : P.input = m, P.next_in = 0, P.avail_in = P.input.length;
          do {
            if (P.avail_out === 0 && (P.output = new a.Buf8(W), P.next_out = 0, P.avail_out = W), (g = o.inflate(P, l.Z_NO_FLUSH)) === l.Z_NEED_DICT && j && (C = typeof j == "string" ? s.string2buf(j) : h.call(j) === "[object ArrayBuffer]" ? new Uint8Array(j) : j, g = o.inflateSetDictionary(this.strm, C)), g === l.Z_BUF_ERROR && oe === !0 && (g = l.Z_OK, oe = !1), g !== l.Z_STREAM_END && g !== l.Z_OK) return this.onEnd(g), !(this.ended = !0);
            P.next_out && (P.avail_out !== 0 && g !== l.Z_STREAM_END && (P.avail_in !== 0 || _ !== l.Z_FINISH && _ !== l.Z_SYNC_FLUSH) || (this.options.to === "string" ? (x = s.utf8border(P.output, P.next_out), D = P.next_out - x, R = s.buf2string(P.output, x), P.next_out = D, P.avail_out = W - D, D && a.arraySet(P.output, P.output, x, D, 0), this.onData(R)) : this.onData(a.shrinkBuf(P.output, P.next_out)))), P.avail_in === 0 && P.avail_out === 0 && (oe = !0);
          } while ((0 < P.avail_in || P.avail_out === 0) && g !== l.Z_STREAM_END);
          return g === l.Z_STREAM_END && (_ = l.Z_FINISH), _ === l.Z_FINISH ? (g = o.inflateEnd(this.strm), this.onEnd(g), this.ended = !0, g === l.Z_OK) : _ !== l.Z_SYNC_FLUSH || (this.onEnd(l.Z_OK), !(P.avail_out = 0));
        }, c.prototype.onData = function(m) {
          this.chunks.push(m);
        }, c.prototype.onEnd = function(m) {
          m === l.Z_OK && (this.options.to === "string" ? this.result = this.chunks.join("") : this.result = a.flattenChunks(this.chunks)), this.chunks = [], this.err = m, this.msg = this.strm.msg;
        }, i.Inflate = c, i.inflate = y, i.inflateRaw = function(m, b) {
          return (b = b || {}).raw = !0, y(m, b);
        }, i.ungzip = y;
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(r, n, i) {
        var o = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Int32Array < "u";
        i.assign = function(l) {
          for (var f = Array.prototype.slice.call(arguments, 1); f.length; ) {
            var d = f.shift();
            if (d) {
              if (typeof d != "object") throw new TypeError(d + "must be non-object");
              for (var u in d) d.hasOwnProperty(u) && (l[u] = d[u]);
            }
          }
          return l;
        }, i.shrinkBuf = function(l, f) {
          return l.length === f ? l : l.subarray ? l.subarray(0, f) : (l.length = f, l);
        };
        var a = { arraySet: function(l, f, d, u, h) {
          if (f.subarray && l.subarray) l.set(f.subarray(d, d + u), h);
          else for (var c = 0; c < u; c++) l[h + c] = f[d + c];
        }, flattenChunks: function(l) {
          var f, d, u, h, c, y;
          for (f = u = 0, d = l.length; f < d; f++) u += l[f].length;
          for (y = new Uint8Array(u), f = h = 0, d = l.length; f < d; f++) c = l[f], y.set(c, h), h += c.length;
          return y;
        } }, s = { arraySet: function(l, f, d, u, h) {
          for (var c = 0; c < u; c++) l[h + c] = f[d + c];
        }, flattenChunks: function(l) {
          return [].concat.apply([], l);
        } };
        i.setTyped = function(l) {
          l ? (i.Buf8 = Uint8Array, i.Buf16 = Uint16Array, i.Buf32 = Int32Array, i.assign(i, a)) : (i.Buf8 = Array, i.Buf16 = Array, i.Buf32 = Array, i.assign(i, s));
        }, i.setTyped(o);
      }, {}], 42: [function(r, n, i) {
        var o = r("./common"), a = !0, s = !0;
        try {
          String.fromCharCode.apply(null, [0]);
        } catch {
          a = !1;
        }
        try {
          String.fromCharCode.apply(null, new Uint8Array(1));
        } catch {
          s = !1;
        }
        for (var l = new o.Buf8(256), f = 0; f < 256; f++) l[f] = 252 <= f ? 6 : 248 <= f ? 5 : 240 <= f ? 4 : 224 <= f ? 3 : 192 <= f ? 2 : 1;
        function d(u, h) {
          if (h < 65537 && (u.subarray && s || !u.subarray && a)) return String.fromCharCode.apply(null, o.shrinkBuf(u, h));
          for (var c = "", y = 0; y < h; y++) c += String.fromCharCode(u[y]);
          return c;
        }
        l[254] = l[254] = 1, i.string2buf = function(u) {
          var h, c, y, m, b, g = u.length, _ = 0;
          for (m = 0; m < g; m++) (64512 & (c = u.charCodeAt(m))) == 55296 && m + 1 < g && (64512 & (y = u.charCodeAt(m + 1))) == 56320 && (c = 65536 + (c - 55296 << 10) + (y - 56320), m++), _ += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
          for (h = new o.Buf8(_), m = b = 0; b < _; m++) (64512 & (c = u.charCodeAt(m))) == 55296 && m + 1 < g && (64512 & (y = u.charCodeAt(m + 1))) == 56320 && (c = 65536 + (c - 55296 << 10) + (y - 56320), m++), c < 128 ? h[b++] = c : (c < 2048 ? h[b++] = 192 | c >>> 6 : (c < 65536 ? h[b++] = 224 | c >>> 12 : (h[b++] = 240 | c >>> 18, h[b++] = 128 | c >>> 12 & 63), h[b++] = 128 | c >>> 6 & 63), h[b++] = 128 | 63 & c);
          return h;
        }, i.buf2binstring = function(u) {
          return d(u, u.length);
        }, i.binstring2buf = function(u) {
          for (var h = new o.Buf8(u.length), c = 0, y = h.length; c < y; c++) h[c] = u.charCodeAt(c);
          return h;
        }, i.buf2string = function(u, h) {
          var c, y, m, b, g = h || u.length, _ = new Array(2 * g);
          for (c = y = 0; c < g; ) if ((m = u[c++]) < 128) _[y++] = m;
          else if (4 < (b = l[m])) _[y++] = 65533, c += b - 1;
          else {
            for (m &= b === 2 ? 31 : b === 3 ? 15 : 7; 1 < b && c < g; ) m = m << 6 | 63 & u[c++], b--;
            1 < b ? _[y++] = 65533 : m < 65536 ? _[y++] = m : (m -= 65536, _[y++] = 55296 | m >> 10 & 1023, _[y++] = 56320 | 1023 & m);
          }
          return d(_, y);
        }, i.utf8border = function(u, h) {
          var c;
          for ((h = h || u.length) > u.length && (h = u.length), c = h - 1; 0 <= c && (192 & u[c]) == 128; ) c--;
          return c < 0 || c === 0 ? h : c + l[u[c]] > h ? c : h;
        };
      }, { "./common": 41 }], 43: [function(r, n, i) {
        n.exports = function(o, a, s, l) {
          for (var f = 65535 & o | 0, d = o >>> 16 & 65535 | 0, u = 0; s !== 0; ) {
            for (s -= u = 2e3 < s ? 2e3 : s; d = d + (f = f + a[l++] | 0) | 0, --u; ) ;
            f %= 65521, d %= 65521;
          }
          return f | d << 16 | 0;
        };
      }, {}], 44: [function(r, n, i) {
        n.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
      }, {}], 45: [function(r, n, i) {
        var o = (function() {
          for (var a, s = [], l = 0; l < 256; l++) {
            a = l;
            for (var f = 0; f < 8; f++) a = 1 & a ? 3988292384 ^ a >>> 1 : a >>> 1;
            s[l] = a;
          }
          return s;
        })();
        n.exports = function(a, s, l, f) {
          var d = o, u = f + l;
          a ^= -1;
          for (var h = f; h < u; h++) a = a >>> 8 ^ d[255 & (a ^ s[h])];
          return -1 ^ a;
        };
      }, {}], 46: [function(r, n, i) {
        var o, a = r("../utils/common"), s = r("./trees"), l = r("./adler32"), f = r("./crc32"), d = r("./messages"), u = 0, h = 4, c = 0, y = -2, m = -1, b = 4, g = 2, _ = 8, x = 9, D = 286, R = 30, C = 19, P = 2 * D + 1, W = 15, j = 3, oe = 258, ue = oe + j + 1, B = 42, Z = 113, w = 1, E = 2, N = 3, L = 4;
        function F(p, z) {
          return p.msg = d[z], z;
        }
        function Y(p) {
          return (p << 1) - (4 < p ? 9 : 0);
        }
        function ee(p) {
          for (var z = p.length; 0 <= --z; ) p[z] = 0;
        }
        function H(p) {
          var z = p.state, S = z.pending;
          S > p.avail_out && (S = p.avail_out), S !== 0 && (a.arraySet(p.output, z.pending_buf, z.pending_out, S, p.next_out), p.next_out += S, z.pending_out += S, p.total_out += S, p.avail_out -= S, z.pending -= S, z.pending === 0 && (z.pending_out = 0));
        }
        function K(p, z) {
          s._tr_flush_block(p, 0 <= p.block_start ? p.block_start : -1, p.strstart - p.block_start, z), p.block_start = p.strstart, H(p.strm);
        }
        function le(p, z) {
          p.pending_buf[p.pending++] = z;
        }
        function ae(p, z) {
          p.pending_buf[p.pending++] = z >>> 8 & 255, p.pending_buf[p.pending++] = 255 & z;
        }
        function ne(p, z) {
          var S, A, M = p.max_chain_length, T = p.strstart, U = p.prev_length, V = p.nice_match, q = p.strstart > p.w_size - ue ? p.strstart - (p.w_size - ue) : 0, te = p.window, se = p.w_mask, re = p.prev, fe = p.strstart + oe, he = te[T + U - 1], pe = te[T + U];
          p.prev_length >= p.good_match && (M >>= 2), V > p.lookahead && (V = p.lookahead);
          do
            if (te[(S = z) + U] === pe && te[S + U - 1] === he && te[S] === te[T] && te[++S] === te[T + 1]) {
              T += 2, S++;
              do
                ;
              while (te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && te[++T] === te[++S] && T < fe);
              if (A = oe - (fe - T), T = fe - oe, U < A) {
                if (p.match_start = z, V <= (U = A)) break;
                he = te[T + U - 1], pe = te[T + U];
              }
            }
          while ((z = re[z & se]) > q && --M != 0);
          return U <= p.lookahead ? U : p.lookahead;
        }
        function me(p) {
          var z, S, A, M, T, U, V, q, te, se, re = p.w_size;
          do {
            if (M = p.window_size - p.lookahead - p.strstart, p.strstart >= re + (re - ue)) {
              for (a.arraySet(p.window, p.window, re, re, 0), p.match_start -= re, p.strstart -= re, p.block_start -= re, z = S = p.hash_size; A = p.head[--z], p.head[z] = re <= A ? A - re : 0, --S; ) ;
              for (z = S = re; A = p.prev[--z], p.prev[z] = re <= A ? A - re : 0, --S; ) ;
              M += re;
            }
            if (p.strm.avail_in === 0) break;
            if (U = p.strm, V = p.window, q = p.strstart + p.lookahead, te = M, se = void 0, se = U.avail_in, te < se && (se = te), S = se === 0 ? 0 : (U.avail_in -= se, a.arraySet(V, U.input, U.next_in, se, q), U.state.wrap === 1 ? U.adler = l(U.adler, V, se, q) : U.state.wrap === 2 && (U.adler = f(U.adler, V, se, q)), U.next_in += se, U.total_in += se, se), p.lookahead += S, p.lookahead + p.insert >= j) for (T = p.strstart - p.insert, p.ins_h = p.window[T], p.ins_h = (p.ins_h << p.hash_shift ^ p.window[T + 1]) & p.hash_mask; p.insert && (p.ins_h = (p.ins_h << p.hash_shift ^ p.window[T + j - 1]) & p.hash_mask, p.prev[T & p.w_mask] = p.head[p.ins_h], p.head[p.ins_h] = T, T++, p.insert--, !(p.lookahead + p.insert < j)); ) ;
          } while (p.lookahead < ue && p.strm.avail_in !== 0);
        }
        function we(p, z) {
          for (var S, A; ; ) {
            if (p.lookahead < ue) {
              if (me(p), p.lookahead < ue && z === u) return w;
              if (p.lookahead === 0) break;
            }
            if (S = 0, p.lookahead >= j && (p.ins_h = (p.ins_h << p.hash_shift ^ p.window[p.strstart + j - 1]) & p.hash_mask, S = p.prev[p.strstart & p.w_mask] = p.head[p.ins_h], p.head[p.ins_h] = p.strstart), S !== 0 && p.strstart - S <= p.w_size - ue && (p.match_length = ne(p, S)), p.match_length >= j) if (A = s._tr_tally(p, p.strstart - p.match_start, p.match_length - j), p.lookahead -= p.match_length, p.match_length <= p.max_lazy_match && p.lookahead >= j) {
              for (p.match_length--; p.strstart++, p.ins_h = (p.ins_h << p.hash_shift ^ p.window[p.strstart + j - 1]) & p.hash_mask, S = p.prev[p.strstart & p.w_mask] = p.head[p.ins_h], p.head[p.ins_h] = p.strstart, --p.match_length != 0; ) ;
              p.strstart++;
            } else p.strstart += p.match_length, p.match_length = 0, p.ins_h = p.window[p.strstart], p.ins_h = (p.ins_h << p.hash_shift ^ p.window[p.strstart + 1]) & p.hash_mask;
            else A = s._tr_tally(p, 0, p.window[p.strstart]), p.lookahead--, p.strstart++;
            if (A && (K(p, !1), p.strm.avail_out === 0)) return w;
          }
          return p.insert = p.strstart < j - 1 ? p.strstart : j - 1, z === h ? (K(p, !0), p.strm.avail_out === 0 ? N : L) : p.last_lit && (K(p, !1), p.strm.avail_out === 0) ? w : E;
        }
        function ke(p, z) {
          for (var S, A, M; ; ) {
            if (p.lookahead < ue) {
              if (me(p), p.lookahead < ue && z === u) return w;
              if (p.lookahead === 0) break;
            }
            if (S = 0, p.lookahead >= j && (p.ins_h = (p.ins_h << p.hash_shift ^ p.window[p.strstart + j - 1]) & p.hash_mask, S = p.prev[p.strstart & p.w_mask] = p.head[p.ins_h], p.head[p.ins_h] = p.strstart), p.prev_length = p.match_length, p.prev_match = p.match_start, p.match_length = j - 1, S !== 0 && p.prev_length < p.max_lazy_match && p.strstart - S <= p.w_size - ue && (p.match_length = ne(p, S), p.match_length <= 5 && (p.strategy === 1 || p.match_length === j && 4096 < p.strstart - p.match_start) && (p.match_length = j - 1)), p.prev_length >= j && p.match_length <= p.prev_length) {
              for (M = p.strstart + p.lookahead - j, A = s._tr_tally(p, p.strstart - 1 - p.prev_match, p.prev_length - j), p.lookahead -= p.prev_length - 1, p.prev_length -= 2; ++p.strstart <= M && (p.ins_h = (p.ins_h << p.hash_shift ^ p.window[p.strstart + j - 1]) & p.hash_mask, S = p.prev[p.strstart & p.w_mask] = p.head[p.ins_h], p.head[p.ins_h] = p.strstart), --p.prev_length != 0; ) ;
              if (p.match_available = 0, p.match_length = j - 1, p.strstart++, A && (K(p, !1), p.strm.avail_out === 0)) return w;
            } else if (p.match_available) {
              if ((A = s._tr_tally(p, 0, p.window[p.strstart - 1])) && K(p, !1), p.strstart++, p.lookahead--, p.strm.avail_out === 0) return w;
            } else p.match_available = 1, p.strstart++, p.lookahead--;
          }
          return p.match_available && (A = s._tr_tally(p, 0, p.window[p.strstart - 1]), p.match_available = 0), p.insert = p.strstart < j - 1 ? p.strstart : j - 1, z === h ? (K(p, !0), p.strm.avail_out === 0 ? N : L) : p.last_lit && (K(p, !1), p.strm.avail_out === 0) ? w : E;
        }
        function De(p, z, S, A, M) {
          this.good_length = p, this.max_lazy = z, this.nice_length = S, this.max_chain = A, this.func = M;
        }
        function Be() {
          this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = _, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new a.Buf16(2 * P), this.dyn_dtree = new a.Buf16(2 * (2 * R + 1)), this.bl_tree = new a.Buf16(2 * (2 * C + 1)), ee(this.dyn_ltree), ee(this.dyn_dtree), ee(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new a.Buf16(W + 1), this.heap = new a.Buf16(2 * D + 1), ee(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new a.Buf16(2 * D + 1), ee(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
        }
        function Le(p) {
          var z;
          return p && p.state ? (p.total_in = p.total_out = 0, p.data_type = g, (z = p.state).pending = 0, z.pending_out = 0, z.wrap < 0 && (z.wrap = -z.wrap), z.status = z.wrap ? B : Z, p.adler = z.wrap === 2 ? 0 : 1, z.last_flush = u, s._tr_init(z), c) : F(p, y);
        }
        function O(p) {
          var z = Le(p);
          return z === c && (function(S) {
            S.window_size = 2 * S.w_size, ee(S.head), S.max_lazy_match = o[S.level].max_lazy, S.good_match = o[S.level].good_length, S.nice_match = o[S.level].nice_length, S.max_chain_length = o[S.level].max_chain, S.strstart = 0, S.block_start = 0, S.lookahead = 0, S.insert = 0, S.match_length = S.prev_length = j - 1, S.match_available = 0, S.ins_h = 0;
          })(p.state), z;
        }
        function $(p, z, S, A, M, T) {
          if (!p) return y;
          var U = 1;
          if (z === m && (z = 6), A < 0 ? (U = 0, A = -A) : 15 < A && (U = 2, A -= 16), M < 1 || x < M || S !== _ || A < 8 || 15 < A || z < 0 || 9 < z || T < 0 || b < T) return F(p, y);
          A === 8 && (A = 9);
          var V = new Be();
          return (p.state = V).strm = p, V.wrap = U, V.gzhead = null, V.w_bits = A, V.w_size = 1 << V.w_bits, V.w_mask = V.w_size - 1, V.hash_bits = M + 7, V.hash_size = 1 << V.hash_bits, V.hash_mask = V.hash_size - 1, V.hash_shift = ~~((V.hash_bits + j - 1) / j), V.window = new a.Buf8(2 * V.w_size), V.head = new a.Buf16(V.hash_size), V.prev = new a.Buf16(V.w_size), V.lit_bufsize = 1 << M + 6, V.pending_buf_size = 4 * V.lit_bufsize, V.pending_buf = new a.Buf8(V.pending_buf_size), V.d_buf = 1 * V.lit_bufsize, V.l_buf = 3 * V.lit_bufsize, V.level = z, V.strategy = T, V.method = S, O(p);
        }
        o = [new De(0, 0, 0, 0, function(p, z) {
          var S = 65535;
          for (S > p.pending_buf_size - 5 && (S = p.pending_buf_size - 5); ; ) {
            if (p.lookahead <= 1) {
              if (me(p), p.lookahead === 0 && z === u) return w;
              if (p.lookahead === 0) break;
            }
            p.strstart += p.lookahead, p.lookahead = 0;
            var A = p.block_start + S;
            if ((p.strstart === 0 || p.strstart >= A) && (p.lookahead = p.strstart - A, p.strstart = A, K(p, !1), p.strm.avail_out === 0) || p.strstart - p.block_start >= p.w_size - ue && (K(p, !1), p.strm.avail_out === 0)) return w;
          }
          return p.insert = 0, z === h ? (K(p, !0), p.strm.avail_out === 0 ? N : L) : (p.strstart > p.block_start && (K(p, !1), p.strm.avail_out), w);
        }), new De(4, 4, 8, 4, we), new De(4, 5, 16, 8, we), new De(4, 6, 32, 32, we), new De(4, 4, 16, 16, ke), new De(8, 16, 32, 32, ke), new De(8, 16, 128, 128, ke), new De(8, 32, 128, 256, ke), new De(32, 128, 258, 1024, ke), new De(32, 258, 258, 4096, ke)], i.deflateInit = function(p, z) {
          return $(p, z, _, 15, 8, 0);
        }, i.deflateInit2 = $, i.deflateReset = O, i.deflateResetKeep = Le, i.deflateSetHeader = function(p, z) {
          return p && p.state ? p.state.wrap !== 2 ? y : (p.state.gzhead = z, c) : y;
        }, i.deflate = function(p, z) {
          var S, A, M, T;
          if (!p || !p.state || 5 < z || z < 0) return p ? F(p, y) : y;
          if (A = p.state, !p.output || !p.input && p.avail_in !== 0 || A.status === 666 && z !== h) return F(p, p.avail_out === 0 ? -5 : y);
          if (A.strm = p, S = A.last_flush, A.last_flush = z, A.status === B) if (A.wrap === 2) p.adler = 0, le(A, 31), le(A, 139), le(A, 8), A.gzhead ? (le(A, (A.gzhead.text ? 1 : 0) + (A.gzhead.hcrc ? 2 : 0) + (A.gzhead.extra ? 4 : 0) + (A.gzhead.name ? 8 : 0) + (A.gzhead.comment ? 16 : 0)), le(A, 255 & A.gzhead.time), le(A, A.gzhead.time >> 8 & 255), le(A, A.gzhead.time >> 16 & 255), le(A, A.gzhead.time >> 24 & 255), le(A, A.level === 9 ? 2 : 2 <= A.strategy || A.level < 2 ? 4 : 0), le(A, 255 & A.gzhead.os), A.gzhead.extra && A.gzhead.extra.length && (le(A, 255 & A.gzhead.extra.length), le(A, A.gzhead.extra.length >> 8 & 255)), A.gzhead.hcrc && (p.adler = f(p.adler, A.pending_buf, A.pending, 0)), A.gzindex = 0, A.status = 69) : (le(A, 0), le(A, 0), le(A, 0), le(A, 0), le(A, 0), le(A, A.level === 9 ? 2 : 2 <= A.strategy || A.level < 2 ? 4 : 0), le(A, 3), A.status = Z);
          else {
            var U = _ + (A.w_bits - 8 << 4) << 8;
            U |= (2 <= A.strategy || A.level < 2 ? 0 : A.level < 6 ? 1 : A.level === 6 ? 2 : 3) << 6, A.strstart !== 0 && (U |= 32), U += 31 - U % 31, A.status = Z, ae(A, U), A.strstart !== 0 && (ae(A, p.adler >>> 16), ae(A, 65535 & p.adler)), p.adler = 1;
          }
          if (A.status === 69) if (A.gzhead.extra) {
            for (M = A.pending; A.gzindex < (65535 & A.gzhead.extra.length) && (A.pending !== A.pending_buf_size || (A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), H(p), M = A.pending, A.pending !== A.pending_buf_size)); ) le(A, 255 & A.gzhead.extra[A.gzindex]), A.gzindex++;
            A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), A.gzindex === A.gzhead.extra.length && (A.gzindex = 0, A.status = 73);
          } else A.status = 73;
          if (A.status === 73) if (A.gzhead.name) {
            M = A.pending;
            do {
              if (A.pending === A.pending_buf_size && (A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), H(p), M = A.pending, A.pending === A.pending_buf_size)) {
                T = 1;
                break;
              }
              T = A.gzindex < A.gzhead.name.length ? 255 & A.gzhead.name.charCodeAt(A.gzindex++) : 0, le(A, T);
            } while (T !== 0);
            A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), T === 0 && (A.gzindex = 0, A.status = 91);
          } else A.status = 91;
          if (A.status === 91) if (A.gzhead.comment) {
            M = A.pending;
            do {
              if (A.pending === A.pending_buf_size && (A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), H(p), M = A.pending, A.pending === A.pending_buf_size)) {
                T = 1;
                break;
              }
              T = A.gzindex < A.gzhead.comment.length ? 255 & A.gzhead.comment.charCodeAt(A.gzindex++) : 0, le(A, T);
            } while (T !== 0);
            A.gzhead.hcrc && A.pending > M && (p.adler = f(p.adler, A.pending_buf, A.pending - M, M)), T === 0 && (A.status = 103);
          } else A.status = 103;
          if (A.status === 103 && (A.gzhead.hcrc ? (A.pending + 2 > A.pending_buf_size && H(p), A.pending + 2 <= A.pending_buf_size && (le(A, 255 & p.adler), le(A, p.adler >> 8 & 255), p.adler = 0, A.status = Z)) : A.status = Z), A.pending !== 0) {
            if (H(p), p.avail_out === 0) return A.last_flush = -1, c;
          } else if (p.avail_in === 0 && Y(z) <= Y(S) && z !== h) return F(p, -5);
          if (A.status === 666 && p.avail_in !== 0) return F(p, -5);
          if (p.avail_in !== 0 || A.lookahead !== 0 || z !== u && A.status !== 666) {
            var V = A.strategy === 2 ? (function(q, te) {
              for (var se; ; ) {
                if (q.lookahead === 0 && (me(q), q.lookahead === 0)) {
                  if (te === u) return w;
                  break;
                }
                if (q.match_length = 0, se = s._tr_tally(q, 0, q.window[q.strstart]), q.lookahead--, q.strstart++, se && (K(q, !1), q.strm.avail_out === 0)) return w;
              }
              return q.insert = 0, te === h ? (K(q, !0), q.strm.avail_out === 0 ? N : L) : q.last_lit && (K(q, !1), q.strm.avail_out === 0) ? w : E;
            })(A, z) : A.strategy === 3 ? (function(q, te) {
              for (var se, re, fe, he, pe = q.window; ; ) {
                if (q.lookahead <= oe) {
                  if (me(q), q.lookahead <= oe && te === u) return w;
                  if (q.lookahead === 0) break;
                }
                if (q.match_length = 0, q.lookahead >= j && 0 < q.strstart && (re = pe[fe = q.strstart - 1]) === pe[++fe] && re === pe[++fe] && re === pe[++fe]) {
                  he = q.strstart + oe;
                  do
                    ;
                  while (re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && re === pe[++fe] && fe < he);
                  q.match_length = oe - (he - fe), q.match_length > q.lookahead && (q.match_length = q.lookahead);
                }
                if (q.match_length >= j ? (se = s._tr_tally(q, 1, q.match_length - j), q.lookahead -= q.match_length, q.strstart += q.match_length, q.match_length = 0) : (se = s._tr_tally(q, 0, q.window[q.strstart]), q.lookahead--, q.strstart++), se && (K(q, !1), q.strm.avail_out === 0)) return w;
              }
              return q.insert = 0, te === h ? (K(q, !0), q.strm.avail_out === 0 ? N : L) : q.last_lit && (K(q, !1), q.strm.avail_out === 0) ? w : E;
            })(A, z) : o[A.level].func(A, z);
            if (V !== N && V !== L || (A.status = 666), V === w || V === N) return p.avail_out === 0 && (A.last_flush = -1), c;
            if (V === E && (z === 1 ? s._tr_align(A) : z !== 5 && (s._tr_stored_block(A, 0, 0, !1), z === 3 && (ee(A.head), A.lookahead === 0 && (A.strstart = 0, A.block_start = 0, A.insert = 0))), H(p), p.avail_out === 0)) return A.last_flush = -1, c;
          }
          return z !== h ? c : A.wrap <= 0 ? 1 : (A.wrap === 2 ? (le(A, 255 & p.adler), le(A, p.adler >> 8 & 255), le(A, p.adler >> 16 & 255), le(A, p.adler >> 24 & 255), le(A, 255 & p.total_in), le(A, p.total_in >> 8 & 255), le(A, p.total_in >> 16 & 255), le(A, p.total_in >> 24 & 255)) : (ae(A, p.adler >>> 16), ae(A, 65535 & p.adler)), H(p), 0 < A.wrap && (A.wrap = -A.wrap), A.pending !== 0 ? c : 1);
        }, i.deflateEnd = function(p) {
          var z;
          return p && p.state ? (z = p.state.status) !== B && z !== 69 && z !== 73 && z !== 91 && z !== 103 && z !== Z && z !== 666 ? F(p, y) : (p.state = null, z === Z ? F(p, -3) : c) : y;
        }, i.deflateSetDictionary = function(p, z) {
          var S, A, M, T, U, V, q, te, se = z.length;
          if (!p || !p.state || (T = (S = p.state).wrap) === 2 || T === 1 && S.status !== B || S.lookahead) return y;
          for (T === 1 && (p.adler = l(p.adler, z, se, 0)), S.wrap = 0, se >= S.w_size && (T === 0 && (ee(S.head), S.strstart = 0, S.block_start = 0, S.insert = 0), te = new a.Buf8(S.w_size), a.arraySet(te, z, se - S.w_size, S.w_size, 0), z = te, se = S.w_size), U = p.avail_in, V = p.next_in, q = p.input, p.avail_in = se, p.next_in = 0, p.input = z, me(S); S.lookahead >= j; ) {
            for (A = S.strstart, M = S.lookahead - (j - 1); S.ins_h = (S.ins_h << S.hash_shift ^ S.window[A + j - 1]) & S.hash_mask, S.prev[A & S.w_mask] = S.head[S.ins_h], S.head[S.ins_h] = A, A++, --M; ) ;
            S.strstart = A, S.lookahead = j - 1, me(S);
          }
          return S.strstart += S.lookahead, S.block_start = S.strstart, S.insert = S.lookahead, S.lookahead = 0, S.match_length = S.prev_length = j - 1, S.match_available = 0, p.next_in = V, p.input = q, p.avail_in = U, S.wrap = T, c;
        }, i.deflateInfo = "pako deflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(r, n, i) {
        n.exports = function() {
          this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = !1;
        };
      }, {}], 48: [function(r, n, i) {
        n.exports = function(o, a) {
          var s, l, f, d, u, h, c, y, m, b, g, _, x, D, R, C, P, W, j, oe, ue, B, Z, w, E;
          s = o.state, l = o.next_in, w = o.input, f = l + (o.avail_in - 5), d = o.next_out, E = o.output, u = d - (a - o.avail_out), h = d + (o.avail_out - 257), c = s.dmax, y = s.wsize, m = s.whave, b = s.wnext, g = s.window, _ = s.hold, x = s.bits, D = s.lencode, R = s.distcode, C = (1 << s.lenbits) - 1, P = (1 << s.distbits) - 1;
          e: do {
            x < 15 && (_ += w[l++] << x, x += 8, _ += w[l++] << x, x += 8), W = D[_ & C];
            t: for (; ; ) {
              if (_ >>>= j = W >>> 24, x -= j, (j = W >>> 16 & 255) === 0) E[d++] = 65535 & W;
              else {
                if (!(16 & j)) {
                  if ((64 & j) == 0) {
                    W = D[(65535 & W) + (_ & (1 << j) - 1)];
                    continue t;
                  }
                  if (32 & j) {
                    s.mode = 12;
                    break e;
                  }
                  o.msg = "invalid literal/length code", s.mode = 30;
                  break e;
                }
                oe = 65535 & W, (j &= 15) && (x < j && (_ += w[l++] << x, x += 8), oe += _ & (1 << j) - 1, _ >>>= j, x -= j), x < 15 && (_ += w[l++] << x, x += 8, _ += w[l++] << x, x += 8), W = R[_ & P];
                r: for (; ; ) {
                  if (_ >>>= j = W >>> 24, x -= j, !(16 & (j = W >>> 16 & 255))) {
                    if ((64 & j) == 0) {
                      W = R[(65535 & W) + (_ & (1 << j) - 1)];
                      continue r;
                    }
                    o.msg = "invalid distance code", s.mode = 30;
                    break e;
                  }
                  if (ue = 65535 & W, x < (j &= 15) && (_ += w[l++] << x, (x += 8) < j && (_ += w[l++] << x, x += 8)), c < (ue += _ & (1 << j) - 1)) {
                    o.msg = "invalid distance too far back", s.mode = 30;
                    break e;
                  }
                  if (_ >>>= j, x -= j, (j = d - u) < ue) {
                    if (m < (j = ue - j) && s.sane) {
                      o.msg = "invalid distance too far back", s.mode = 30;
                      break e;
                    }
                    if (Z = g, (B = 0) === b) {
                      if (B += y - j, j < oe) {
                        for (oe -= j; E[d++] = g[B++], --j; ) ;
                        B = d - ue, Z = E;
                      }
                    } else if (b < j) {
                      if (B += y + b - j, (j -= b) < oe) {
                        for (oe -= j; E[d++] = g[B++], --j; ) ;
                        if (B = 0, b < oe) {
                          for (oe -= j = b; E[d++] = g[B++], --j; ) ;
                          B = d - ue, Z = E;
                        }
                      }
                    } else if (B += b - j, j < oe) {
                      for (oe -= j; E[d++] = g[B++], --j; ) ;
                      B = d - ue, Z = E;
                    }
                    for (; 2 < oe; ) E[d++] = Z[B++], E[d++] = Z[B++], E[d++] = Z[B++], oe -= 3;
                    oe && (E[d++] = Z[B++], 1 < oe && (E[d++] = Z[B++]));
                  } else {
                    for (B = d - ue; E[d++] = E[B++], E[d++] = E[B++], E[d++] = E[B++], 2 < (oe -= 3); ) ;
                    oe && (E[d++] = E[B++], 1 < oe && (E[d++] = E[B++]));
                  }
                  break;
                }
              }
              break;
            }
          } while (l < f && d < h);
          l -= oe = x >> 3, _ &= (1 << (x -= oe << 3)) - 1, o.next_in = l, o.next_out = d, o.avail_in = l < f ? f - l + 5 : 5 - (l - f), o.avail_out = d < h ? h - d + 257 : 257 - (d - h), s.hold = _, s.bits = x;
        };
      }, {}], 49: [function(r, n, i) {
        var o = r("../utils/common"), a = r("./adler32"), s = r("./crc32"), l = r("./inffast"), f = r("./inftrees"), d = 1, u = 2, h = 0, c = -2, y = 1, m = 852, b = 592;
        function g(B) {
          return (B >>> 24 & 255) + (B >>> 8 & 65280) + ((65280 & B) << 8) + ((255 & B) << 24);
        }
        function _() {
          this.mode = 0, this.last = !1, this.wrap = 0, this.havedict = !1, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new o.Buf16(320), this.work = new o.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
        }
        function x(B) {
          var Z;
          return B && B.state ? (Z = B.state, B.total_in = B.total_out = Z.total = 0, B.msg = "", Z.wrap && (B.adler = 1 & Z.wrap), Z.mode = y, Z.last = 0, Z.havedict = 0, Z.dmax = 32768, Z.head = null, Z.hold = 0, Z.bits = 0, Z.lencode = Z.lendyn = new o.Buf32(m), Z.distcode = Z.distdyn = new o.Buf32(b), Z.sane = 1, Z.back = -1, h) : c;
        }
        function D(B) {
          var Z;
          return B && B.state ? ((Z = B.state).wsize = 0, Z.whave = 0, Z.wnext = 0, x(B)) : c;
        }
        function R(B, Z) {
          var w, E;
          return B && B.state ? (E = B.state, Z < 0 ? (w = 0, Z = -Z) : (w = 1 + (Z >> 4), Z < 48 && (Z &= 15)), Z && (Z < 8 || 15 < Z) ? c : (E.window !== null && E.wbits !== Z && (E.window = null), E.wrap = w, E.wbits = Z, D(B))) : c;
        }
        function C(B, Z) {
          var w, E;
          return B ? (E = new _(), (B.state = E).window = null, (w = R(B, Z)) !== h && (B.state = null), w) : c;
        }
        var P, W, j = !0;
        function oe(B) {
          if (j) {
            var Z;
            for (P = new o.Buf32(512), W = new o.Buf32(32), Z = 0; Z < 144; ) B.lens[Z++] = 8;
            for (; Z < 256; ) B.lens[Z++] = 9;
            for (; Z < 280; ) B.lens[Z++] = 7;
            for (; Z < 288; ) B.lens[Z++] = 8;
            for (f(d, B.lens, 0, 288, P, 0, B.work, { bits: 9 }), Z = 0; Z < 32; ) B.lens[Z++] = 5;
            f(u, B.lens, 0, 32, W, 0, B.work, { bits: 5 }), j = !1;
          }
          B.lencode = P, B.lenbits = 9, B.distcode = W, B.distbits = 5;
        }
        function ue(B, Z, w, E) {
          var N, L = B.state;
          return L.window === null && (L.wsize = 1 << L.wbits, L.wnext = 0, L.whave = 0, L.window = new o.Buf8(L.wsize)), E >= L.wsize ? (o.arraySet(L.window, Z, w - L.wsize, L.wsize, 0), L.wnext = 0, L.whave = L.wsize) : (E < (N = L.wsize - L.wnext) && (N = E), o.arraySet(L.window, Z, w - E, N, L.wnext), (E -= N) ? (o.arraySet(L.window, Z, w - E, E, 0), L.wnext = E, L.whave = L.wsize) : (L.wnext += N, L.wnext === L.wsize && (L.wnext = 0), L.whave < L.wsize && (L.whave += N))), 0;
        }
        i.inflateReset = D, i.inflateReset2 = R, i.inflateResetKeep = x, i.inflateInit = function(B) {
          return C(B, 15);
        }, i.inflateInit2 = C, i.inflate = function(B, Z) {
          var w, E, N, L, F, Y, ee, H, K, le, ae, ne, me, we, ke, De, Be, Le, O, $, p, z, S, A, M = 0, T = new o.Buf8(4), U = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
          if (!B || !B.state || !B.output || !B.input && B.avail_in !== 0) return c;
          (w = B.state).mode === 12 && (w.mode = 13), F = B.next_out, N = B.output, ee = B.avail_out, L = B.next_in, E = B.input, Y = B.avail_in, H = w.hold, K = w.bits, le = Y, ae = ee, z = h;
          e: for (; ; ) switch (w.mode) {
            case y:
              if (w.wrap === 0) {
                w.mode = 13;
                break;
              }
              for (; K < 16; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if (2 & w.wrap && H === 35615) {
                T[w.check = 0] = 255 & H, T[1] = H >>> 8 & 255, w.check = s(w.check, T, 2, 0), K = H = 0, w.mode = 2;
                break;
              }
              if (w.flags = 0, w.head && (w.head.done = !1), !(1 & w.wrap) || (((255 & H) << 8) + (H >> 8)) % 31) {
                B.msg = "incorrect header check", w.mode = 30;
                break;
              }
              if ((15 & H) != 8) {
                B.msg = "unknown compression method", w.mode = 30;
                break;
              }
              if (K -= 4, p = 8 + (15 & (H >>>= 4)), w.wbits === 0) w.wbits = p;
              else if (p > w.wbits) {
                B.msg = "invalid window size", w.mode = 30;
                break;
              }
              w.dmax = 1 << p, B.adler = w.check = 1, w.mode = 512 & H ? 10 : 12, K = H = 0;
              break;
            case 2:
              for (; K < 16; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if (w.flags = H, (255 & w.flags) != 8) {
                B.msg = "unknown compression method", w.mode = 30;
                break;
              }
              if (57344 & w.flags) {
                B.msg = "unknown header flags set", w.mode = 30;
                break;
              }
              w.head && (w.head.text = H >> 8 & 1), 512 & w.flags && (T[0] = 255 & H, T[1] = H >>> 8 & 255, w.check = s(w.check, T, 2, 0)), K = H = 0, w.mode = 3;
            case 3:
              for (; K < 32; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              w.head && (w.head.time = H), 512 & w.flags && (T[0] = 255 & H, T[1] = H >>> 8 & 255, T[2] = H >>> 16 & 255, T[3] = H >>> 24 & 255, w.check = s(w.check, T, 4, 0)), K = H = 0, w.mode = 4;
            case 4:
              for (; K < 16; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              w.head && (w.head.xflags = 255 & H, w.head.os = H >> 8), 512 & w.flags && (T[0] = 255 & H, T[1] = H >>> 8 & 255, w.check = s(w.check, T, 2, 0)), K = H = 0, w.mode = 5;
            case 5:
              if (1024 & w.flags) {
                for (; K < 16; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                w.length = H, w.head && (w.head.extra_len = H), 512 & w.flags && (T[0] = 255 & H, T[1] = H >>> 8 & 255, w.check = s(w.check, T, 2, 0)), K = H = 0;
              } else w.head && (w.head.extra = null);
              w.mode = 6;
            case 6:
              if (1024 & w.flags && (Y < (ne = w.length) && (ne = Y), ne && (w.head && (p = w.head.extra_len - w.length, w.head.extra || (w.head.extra = new Array(w.head.extra_len)), o.arraySet(w.head.extra, E, L, ne, p)), 512 & w.flags && (w.check = s(w.check, E, ne, L)), Y -= ne, L += ne, w.length -= ne), w.length)) break e;
              w.length = 0, w.mode = 7;
            case 7:
              if (2048 & w.flags) {
                if (Y === 0) break e;
                for (ne = 0; p = E[L + ne++], w.head && p && w.length < 65536 && (w.head.name += String.fromCharCode(p)), p && ne < Y; ) ;
                if (512 & w.flags && (w.check = s(w.check, E, ne, L)), Y -= ne, L += ne, p) break e;
              } else w.head && (w.head.name = null);
              w.length = 0, w.mode = 8;
            case 8:
              if (4096 & w.flags) {
                if (Y === 0) break e;
                for (ne = 0; p = E[L + ne++], w.head && p && w.length < 65536 && (w.head.comment += String.fromCharCode(p)), p && ne < Y; ) ;
                if (512 & w.flags && (w.check = s(w.check, E, ne, L)), Y -= ne, L += ne, p) break e;
              } else w.head && (w.head.comment = null);
              w.mode = 9;
            case 9:
              if (512 & w.flags) {
                for (; K < 16; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                if (H !== (65535 & w.check)) {
                  B.msg = "header crc mismatch", w.mode = 30;
                  break;
                }
                K = H = 0;
              }
              w.head && (w.head.hcrc = w.flags >> 9 & 1, w.head.done = !0), B.adler = w.check = 0, w.mode = 12;
              break;
            case 10:
              for (; K < 32; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              B.adler = w.check = g(H), K = H = 0, w.mode = 11;
            case 11:
              if (w.havedict === 0) return B.next_out = F, B.avail_out = ee, B.next_in = L, B.avail_in = Y, w.hold = H, w.bits = K, 2;
              B.adler = w.check = 1, w.mode = 12;
            case 12:
              if (Z === 5 || Z === 6) break e;
            case 13:
              if (w.last) {
                H >>>= 7 & K, K -= 7 & K, w.mode = 27;
                break;
              }
              for (; K < 3; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              switch (w.last = 1 & H, K -= 1, 3 & (H >>>= 1)) {
                case 0:
                  w.mode = 14;
                  break;
                case 1:
                  if (oe(w), w.mode = 20, Z !== 6) break;
                  H >>>= 2, K -= 2;
                  break e;
                case 2:
                  w.mode = 17;
                  break;
                case 3:
                  B.msg = "invalid block type", w.mode = 30;
              }
              H >>>= 2, K -= 2;
              break;
            case 14:
              for (H >>>= 7 & K, K -= 7 & K; K < 32; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if ((65535 & H) != (H >>> 16 ^ 65535)) {
                B.msg = "invalid stored block lengths", w.mode = 30;
                break;
              }
              if (w.length = 65535 & H, K = H = 0, w.mode = 15, Z === 6) break e;
            case 15:
              w.mode = 16;
            case 16:
              if (ne = w.length) {
                if (Y < ne && (ne = Y), ee < ne && (ne = ee), ne === 0) break e;
                o.arraySet(N, E, L, ne, F), Y -= ne, L += ne, ee -= ne, F += ne, w.length -= ne;
                break;
              }
              w.mode = 12;
              break;
            case 17:
              for (; K < 14; ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if (w.nlen = 257 + (31 & H), H >>>= 5, K -= 5, w.ndist = 1 + (31 & H), H >>>= 5, K -= 5, w.ncode = 4 + (15 & H), H >>>= 4, K -= 4, 286 < w.nlen || 30 < w.ndist) {
                B.msg = "too many length or distance symbols", w.mode = 30;
                break;
              }
              w.have = 0, w.mode = 18;
            case 18:
              for (; w.have < w.ncode; ) {
                for (; K < 3; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                w.lens[U[w.have++]] = 7 & H, H >>>= 3, K -= 3;
              }
              for (; w.have < 19; ) w.lens[U[w.have++]] = 0;
              if (w.lencode = w.lendyn, w.lenbits = 7, S = { bits: w.lenbits }, z = f(0, w.lens, 0, 19, w.lencode, 0, w.work, S), w.lenbits = S.bits, z) {
                B.msg = "invalid code lengths set", w.mode = 30;
                break;
              }
              w.have = 0, w.mode = 19;
            case 19:
              for (; w.have < w.nlen + w.ndist; ) {
                for (; De = (M = w.lencode[H & (1 << w.lenbits) - 1]) >>> 16 & 255, Be = 65535 & M, !((ke = M >>> 24) <= K); ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                if (Be < 16) H >>>= ke, K -= ke, w.lens[w.have++] = Be;
                else {
                  if (Be === 16) {
                    for (A = ke + 2; K < A; ) {
                      if (Y === 0) break e;
                      Y--, H += E[L++] << K, K += 8;
                    }
                    if (H >>>= ke, K -= ke, w.have === 0) {
                      B.msg = "invalid bit length repeat", w.mode = 30;
                      break;
                    }
                    p = w.lens[w.have - 1], ne = 3 + (3 & H), H >>>= 2, K -= 2;
                  } else if (Be === 17) {
                    for (A = ke + 3; K < A; ) {
                      if (Y === 0) break e;
                      Y--, H += E[L++] << K, K += 8;
                    }
                    K -= ke, p = 0, ne = 3 + (7 & (H >>>= ke)), H >>>= 3, K -= 3;
                  } else {
                    for (A = ke + 7; K < A; ) {
                      if (Y === 0) break e;
                      Y--, H += E[L++] << K, K += 8;
                    }
                    K -= ke, p = 0, ne = 11 + (127 & (H >>>= ke)), H >>>= 7, K -= 7;
                  }
                  if (w.have + ne > w.nlen + w.ndist) {
                    B.msg = "invalid bit length repeat", w.mode = 30;
                    break;
                  }
                  for (; ne--; ) w.lens[w.have++] = p;
                }
              }
              if (w.mode === 30) break;
              if (w.lens[256] === 0) {
                B.msg = "invalid code -- missing end-of-block", w.mode = 30;
                break;
              }
              if (w.lenbits = 9, S = { bits: w.lenbits }, z = f(d, w.lens, 0, w.nlen, w.lencode, 0, w.work, S), w.lenbits = S.bits, z) {
                B.msg = "invalid literal/lengths set", w.mode = 30;
                break;
              }
              if (w.distbits = 6, w.distcode = w.distdyn, S = { bits: w.distbits }, z = f(u, w.lens, w.nlen, w.ndist, w.distcode, 0, w.work, S), w.distbits = S.bits, z) {
                B.msg = "invalid distances set", w.mode = 30;
                break;
              }
              if (w.mode = 20, Z === 6) break e;
            case 20:
              w.mode = 21;
            case 21:
              if (6 <= Y && 258 <= ee) {
                B.next_out = F, B.avail_out = ee, B.next_in = L, B.avail_in = Y, w.hold = H, w.bits = K, l(B, ae), F = B.next_out, N = B.output, ee = B.avail_out, L = B.next_in, E = B.input, Y = B.avail_in, H = w.hold, K = w.bits, w.mode === 12 && (w.back = -1);
                break;
              }
              for (w.back = 0; De = (M = w.lencode[H & (1 << w.lenbits) - 1]) >>> 16 & 255, Be = 65535 & M, !((ke = M >>> 24) <= K); ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if (De && (240 & De) == 0) {
                for (Le = ke, O = De, $ = Be; De = (M = w.lencode[$ + ((H & (1 << Le + O) - 1) >> Le)]) >>> 16 & 255, Be = 65535 & M, !(Le + (ke = M >>> 24) <= K); ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                H >>>= Le, K -= Le, w.back += Le;
              }
              if (H >>>= ke, K -= ke, w.back += ke, w.length = Be, De === 0) {
                w.mode = 26;
                break;
              }
              if (32 & De) {
                w.back = -1, w.mode = 12;
                break;
              }
              if (64 & De) {
                B.msg = "invalid literal/length code", w.mode = 30;
                break;
              }
              w.extra = 15 & De, w.mode = 22;
            case 22:
              if (w.extra) {
                for (A = w.extra; K < A; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                w.length += H & (1 << w.extra) - 1, H >>>= w.extra, K -= w.extra, w.back += w.extra;
              }
              w.was = w.length, w.mode = 23;
            case 23:
              for (; De = (M = w.distcode[H & (1 << w.distbits) - 1]) >>> 16 & 255, Be = 65535 & M, !((ke = M >>> 24) <= K); ) {
                if (Y === 0) break e;
                Y--, H += E[L++] << K, K += 8;
              }
              if ((240 & De) == 0) {
                for (Le = ke, O = De, $ = Be; De = (M = w.distcode[$ + ((H & (1 << Le + O) - 1) >> Le)]) >>> 16 & 255, Be = 65535 & M, !(Le + (ke = M >>> 24) <= K); ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                H >>>= Le, K -= Le, w.back += Le;
              }
              if (H >>>= ke, K -= ke, w.back += ke, 64 & De) {
                B.msg = "invalid distance code", w.mode = 30;
                break;
              }
              w.offset = Be, w.extra = 15 & De, w.mode = 24;
            case 24:
              if (w.extra) {
                for (A = w.extra; K < A; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                w.offset += H & (1 << w.extra) - 1, H >>>= w.extra, K -= w.extra, w.back += w.extra;
              }
              if (w.offset > w.dmax) {
                B.msg = "invalid distance too far back", w.mode = 30;
                break;
              }
              w.mode = 25;
            case 25:
              if (ee === 0) break e;
              if (ne = ae - ee, w.offset > ne) {
                if ((ne = w.offset - ne) > w.whave && w.sane) {
                  B.msg = "invalid distance too far back", w.mode = 30;
                  break;
                }
                me = ne > w.wnext ? (ne -= w.wnext, w.wsize - ne) : w.wnext - ne, ne > w.length && (ne = w.length), we = w.window;
              } else we = N, me = F - w.offset, ne = w.length;
              for (ee < ne && (ne = ee), ee -= ne, w.length -= ne; N[F++] = we[me++], --ne; ) ;
              w.length === 0 && (w.mode = 21);
              break;
            case 26:
              if (ee === 0) break e;
              N[F++] = w.length, ee--, w.mode = 21;
              break;
            case 27:
              if (w.wrap) {
                for (; K < 32; ) {
                  if (Y === 0) break e;
                  Y--, H |= E[L++] << K, K += 8;
                }
                if (ae -= ee, B.total_out += ae, w.total += ae, ae && (B.adler = w.check = w.flags ? s(w.check, N, ae, F - ae) : a(w.check, N, ae, F - ae)), ae = ee, (w.flags ? H : g(H)) !== w.check) {
                  B.msg = "incorrect data check", w.mode = 30;
                  break;
                }
                K = H = 0;
              }
              w.mode = 28;
            case 28:
              if (w.wrap && w.flags) {
                for (; K < 32; ) {
                  if (Y === 0) break e;
                  Y--, H += E[L++] << K, K += 8;
                }
                if (H !== (4294967295 & w.total)) {
                  B.msg = "incorrect length check", w.mode = 30;
                  break;
                }
                K = H = 0;
              }
              w.mode = 29;
            case 29:
              z = 1;
              break e;
            case 30:
              z = -3;
              break e;
            case 31:
              return -4;
            case 32:
            default:
              return c;
          }
          return B.next_out = F, B.avail_out = ee, B.next_in = L, B.avail_in = Y, w.hold = H, w.bits = K, (w.wsize || ae !== B.avail_out && w.mode < 30 && (w.mode < 27 || Z !== 4)) && ue(B, B.output, B.next_out, ae - B.avail_out) ? (w.mode = 31, -4) : (le -= B.avail_in, ae -= B.avail_out, B.total_in += le, B.total_out += ae, w.total += ae, w.wrap && ae && (B.adler = w.check = w.flags ? s(w.check, N, ae, B.next_out - ae) : a(w.check, N, ae, B.next_out - ae)), B.data_type = w.bits + (w.last ? 64 : 0) + (w.mode === 12 ? 128 : 0) + (w.mode === 20 || w.mode === 15 ? 256 : 0), (le == 0 && ae === 0 || Z === 4) && z === h && (z = -5), z);
        }, i.inflateEnd = function(B) {
          if (!B || !B.state) return c;
          var Z = B.state;
          return Z.window && (Z.window = null), B.state = null, h;
        }, i.inflateGetHeader = function(B, Z) {
          var w;
          return B && B.state ? (2 & (w = B.state).wrap) == 0 ? c : ((w.head = Z).done = !1, h) : c;
        }, i.inflateSetDictionary = function(B, Z) {
          var w, E = Z.length;
          return B && B.state ? (w = B.state).wrap !== 0 && w.mode !== 11 ? c : w.mode === 11 && a(1, Z, E, 0) !== w.check ? -3 : ue(B, Z, E, E) ? (w.mode = 31, -4) : (w.havedict = 1, h) : c;
        }, i.inflateInfo = "pako inflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(r, n, i) {
        var o = r("../utils/common"), a = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], s = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], l = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], f = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
        n.exports = function(d, u, h, c, y, m, b, g) {
          var _, x, D, R, C, P, W, j, oe, ue = g.bits, B = 0, Z = 0, w = 0, E = 0, N = 0, L = 0, F = 0, Y = 0, ee = 0, H = 0, K = null, le = 0, ae = new o.Buf16(16), ne = new o.Buf16(16), me = null, we = 0;
          for (B = 0; B <= 15; B++) ae[B] = 0;
          for (Z = 0; Z < c; Z++) ae[u[h + Z]]++;
          for (N = ue, E = 15; 1 <= E && ae[E] === 0; E--) ;
          if (E < N && (N = E), E === 0) return y[m++] = 20971520, y[m++] = 20971520, g.bits = 1, 0;
          for (w = 1; w < E && ae[w] === 0; w++) ;
          for (N < w && (N = w), B = Y = 1; B <= 15; B++) if (Y <<= 1, (Y -= ae[B]) < 0) return -1;
          if (0 < Y && (d === 0 || E !== 1)) return -1;
          for (ne[1] = 0, B = 1; B < 15; B++) ne[B + 1] = ne[B] + ae[B];
          for (Z = 0; Z < c; Z++) u[h + Z] !== 0 && (b[ne[u[h + Z]]++] = Z);
          if (P = d === 0 ? (K = me = b, 19) : d === 1 ? (K = a, le -= 257, me = s, we -= 257, 256) : (K = l, me = f, -1), B = w, C = m, F = Z = H = 0, D = -1, R = (ee = 1 << (L = N)) - 1, d === 1 && 852 < ee || d === 2 && 592 < ee) return 1;
          for (; ; ) {
            for (W = B - F, oe = b[Z] < P ? (j = 0, b[Z]) : b[Z] > P ? (j = me[we + b[Z]], K[le + b[Z]]) : (j = 96, 0), _ = 1 << B - F, w = x = 1 << L; y[C + (H >> F) + (x -= _)] = W << 24 | j << 16 | oe | 0, x !== 0; ) ;
            for (_ = 1 << B - 1; H & _; ) _ >>= 1;
            if (_ !== 0 ? (H &= _ - 1, H += _) : H = 0, Z++, --ae[B] == 0) {
              if (B === E) break;
              B = u[h + b[Z]];
            }
            if (N < B && (H & R) !== D) {
              for (F === 0 && (F = N), C += w, Y = 1 << (L = B - F); L + F < E && !((Y -= ae[L + F]) <= 0); ) L++, Y <<= 1;
              if (ee += 1 << L, d === 1 && 852 < ee || d === 2 && 592 < ee) return 1;
              y[D = H & R] = N << 24 | L << 16 | C - m | 0;
            }
          }
          return H !== 0 && (y[C + H] = B - F << 24 | 64 << 16 | 0), g.bits = N, 0;
        };
      }, { "../utils/common": 41 }], 51: [function(r, n, i) {
        n.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
      }, {}], 52: [function(r, n, i) {
        var o = r("../utils/common"), a = 0, s = 1;
        function l(M) {
          for (var T = M.length; 0 <= --T; ) M[T] = 0;
        }
        var f = 0, d = 29, u = 256, h = u + 1 + d, c = 30, y = 19, m = 2 * h + 1, b = 15, g = 16, _ = 7, x = 256, D = 16, R = 17, C = 18, P = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], W = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], j = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], oe = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], ue = new Array(2 * (h + 2));
        l(ue);
        var B = new Array(2 * c);
        l(B);
        var Z = new Array(512);
        l(Z);
        var w = new Array(256);
        l(w);
        var E = new Array(d);
        l(E);
        var N, L, F, Y = new Array(c);
        function ee(M, T, U, V, q) {
          this.static_tree = M, this.extra_bits = T, this.extra_base = U, this.elems = V, this.max_length = q, this.has_stree = M && M.length;
        }
        function H(M, T) {
          this.dyn_tree = M, this.max_code = 0, this.stat_desc = T;
        }
        function K(M) {
          return M < 256 ? Z[M] : Z[256 + (M >>> 7)];
        }
        function le(M, T) {
          M.pending_buf[M.pending++] = 255 & T, M.pending_buf[M.pending++] = T >>> 8 & 255;
        }
        function ae(M, T, U) {
          M.bi_valid > g - U ? (M.bi_buf |= T << M.bi_valid & 65535, le(M, M.bi_buf), M.bi_buf = T >> g - M.bi_valid, M.bi_valid += U - g) : (M.bi_buf |= T << M.bi_valid & 65535, M.bi_valid += U);
        }
        function ne(M, T, U) {
          ae(M, U[2 * T], U[2 * T + 1]);
        }
        function me(M, T) {
          for (var U = 0; U |= 1 & M, M >>>= 1, U <<= 1, 0 < --T; ) ;
          return U >>> 1;
        }
        function we(M, T, U) {
          var V, q, te = new Array(b + 1), se = 0;
          for (V = 1; V <= b; V++) te[V] = se = se + U[V - 1] << 1;
          for (q = 0; q <= T; q++) {
            var re = M[2 * q + 1];
            re !== 0 && (M[2 * q] = me(te[re]++, re));
          }
        }
        function ke(M) {
          var T;
          for (T = 0; T < h; T++) M.dyn_ltree[2 * T] = 0;
          for (T = 0; T < c; T++) M.dyn_dtree[2 * T] = 0;
          for (T = 0; T < y; T++) M.bl_tree[2 * T] = 0;
          M.dyn_ltree[2 * x] = 1, M.opt_len = M.static_len = 0, M.last_lit = M.matches = 0;
        }
        function De(M) {
          8 < M.bi_valid ? le(M, M.bi_buf) : 0 < M.bi_valid && (M.pending_buf[M.pending++] = M.bi_buf), M.bi_buf = 0, M.bi_valid = 0;
        }
        function Be(M, T, U, V) {
          var q = 2 * T, te = 2 * U;
          return M[q] < M[te] || M[q] === M[te] && V[T] <= V[U];
        }
        function Le(M, T, U) {
          for (var V = M.heap[U], q = U << 1; q <= M.heap_len && (q < M.heap_len && Be(T, M.heap[q + 1], M.heap[q], M.depth) && q++, !Be(T, V, M.heap[q], M.depth)); ) M.heap[U] = M.heap[q], U = q, q <<= 1;
          M.heap[U] = V;
        }
        function O(M, T, U) {
          var V, q, te, se, re = 0;
          if (M.last_lit !== 0) for (; V = M.pending_buf[M.d_buf + 2 * re] << 8 | M.pending_buf[M.d_buf + 2 * re + 1], q = M.pending_buf[M.l_buf + re], re++, V === 0 ? ne(M, q, T) : (ne(M, (te = w[q]) + u + 1, T), (se = P[te]) !== 0 && ae(M, q -= E[te], se), ne(M, te = K(--V), U), (se = W[te]) !== 0 && ae(M, V -= Y[te], se)), re < M.last_lit; ) ;
          ne(M, x, T);
        }
        function $(M, T) {
          var U, V, q, te = T.dyn_tree, se = T.stat_desc.static_tree, re = T.stat_desc.has_stree, fe = T.stat_desc.elems, he = -1;
          for (M.heap_len = 0, M.heap_max = m, U = 0; U < fe; U++) te[2 * U] !== 0 ? (M.heap[++M.heap_len] = he = U, M.depth[U] = 0) : te[2 * U + 1] = 0;
          for (; M.heap_len < 2; ) te[2 * (q = M.heap[++M.heap_len] = he < 2 ? ++he : 0)] = 1, M.depth[q] = 0, M.opt_len--, re && (M.static_len -= se[2 * q + 1]);
          for (T.max_code = he, U = M.heap_len >> 1; 1 <= U; U--) Le(M, te, U);
          for (q = fe; U = M.heap[1], M.heap[1] = M.heap[M.heap_len--], Le(M, te, 1), V = M.heap[1], M.heap[--M.heap_max] = U, M.heap[--M.heap_max] = V, te[2 * q] = te[2 * U] + te[2 * V], M.depth[q] = (M.depth[U] >= M.depth[V] ? M.depth[U] : M.depth[V]) + 1, te[2 * U + 1] = te[2 * V + 1] = q, M.heap[1] = q++, Le(M, te, 1), 2 <= M.heap_len; ) ;
          M.heap[--M.heap_max] = M.heap[1], (function(pe, Re) {
            var qe, je, Ae, Oe, ut, He, ze = Re.dyn_tree, kt = Re.max_code, mt = Re.stat_desc.static_tree, dr = Re.stat_desc.has_stree, Cr = Re.stat_desc.extra_bits, fr = Re.stat_desc.extra_base, Lt = Re.stat_desc.max_length, Kt = 0;
            for (Oe = 0; Oe <= b; Oe++) pe.bl_count[Oe] = 0;
            for (ze[2 * pe.heap[pe.heap_max] + 1] = 0, qe = pe.heap_max + 1; qe < m; qe++) Lt < (Oe = ze[2 * ze[2 * (je = pe.heap[qe]) + 1] + 1] + 1) && (Oe = Lt, Kt++), ze[2 * je + 1] = Oe, kt < je || (pe.bl_count[Oe]++, ut = 0, fr <= je && (ut = Cr[je - fr]), He = ze[2 * je], pe.opt_len += He * (Oe + ut), dr && (pe.static_len += He * (mt[2 * je + 1] + ut)));
            if (Kt !== 0) {
              do {
                for (Oe = Lt - 1; pe.bl_count[Oe] === 0; ) Oe--;
                pe.bl_count[Oe]--, pe.bl_count[Oe + 1] += 2, pe.bl_count[Lt]--, Kt -= 2;
              } while (0 < Kt);
              for (Oe = Lt; Oe !== 0; Oe--) for (je = pe.bl_count[Oe]; je !== 0; ) kt < (Ae = pe.heap[--qe]) || (ze[2 * Ae + 1] !== Oe && (pe.opt_len += (Oe - ze[2 * Ae + 1]) * ze[2 * Ae], ze[2 * Ae + 1] = Oe), je--);
            }
          })(M, T), we(te, he, M.bl_count);
        }
        function p(M, T, U) {
          var V, q, te = -1, se = T[1], re = 0, fe = 7, he = 4;
          for (se === 0 && (fe = 138, he = 3), T[2 * (U + 1) + 1] = 65535, V = 0; V <= U; V++) q = se, se = T[2 * (V + 1) + 1], ++re < fe && q === se || (re < he ? M.bl_tree[2 * q] += re : q !== 0 ? (q !== te && M.bl_tree[2 * q]++, M.bl_tree[2 * D]++) : re <= 10 ? M.bl_tree[2 * R]++ : M.bl_tree[2 * C]++, te = q, he = (re = 0) === se ? (fe = 138, 3) : q === se ? (fe = 6, 3) : (fe = 7, 4));
        }
        function z(M, T, U) {
          var V, q, te = -1, se = T[1], re = 0, fe = 7, he = 4;
          for (se === 0 && (fe = 138, he = 3), V = 0; V <= U; V++) if (q = se, se = T[2 * (V + 1) + 1], !(++re < fe && q === se)) {
            if (re < he) for (; ne(M, q, M.bl_tree), --re != 0; ) ;
            else q !== 0 ? (q !== te && (ne(M, q, M.bl_tree), re--), ne(M, D, M.bl_tree), ae(M, re - 3, 2)) : re <= 10 ? (ne(M, R, M.bl_tree), ae(M, re - 3, 3)) : (ne(M, C, M.bl_tree), ae(M, re - 11, 7));
            te = q, he = (re = 0) === se ? (fe = 138, 3) : q === se ? (fe = 6, 3) : (fe = 7, 4);
          }
        }
        l(Y);
        var S = !1;
        function A(M, T, U, V) {
          ae(M, (f << 1) + (V ? 1 : 0), 3), (function(q, te, se, re) {
            De(q), le(q, se), le(q, ~se), o.arraySet(q.pending_buf, q.window, te, se, q.pending), q.pending += se;
          })(M, T, U);
        }
        i._tr_init = function(M) {
          S || ((function() {
            var T, U, V, q, te, se = new Array(b + 1);
            for (q = V = 0; q < d - 1; q++) for (E[q] = V, T = 0; T < 1 << P[q]; T++) w[V++] = q;
            for (w[V - 1] = q, q = te = 0; q < 16; q++) for (Y[q] = te, T = 0; T < 1 << W[q]; T++) Z[te++] = q;
            for (te >>= 7; q < c; q++) for (Y[q] = te << 7, T = 0; T < 1 << W[q] - 7; T++) Z[256 + te++] = q;
            for (U = 0; U <= b; U++) se[U] = 0;
            for (T = 0; T <= 143; ) ue[2 * T + 1] = 8, T++, se[8]++;
            for (; T <= 255; ) ue[2 * T + 1] = 9, T++, se[9]++;
            for (; T <= 279; ) ue[2 * T + 1] = 7, T++, se[7]++;
            for (; T <= 287; ) ue[2 * T + 1] = 8, T++, se[8]++;
            for (we(ue, h + 1, se), T = 0; T < c; T++) B[2 * T + 1] = 5, B[2 * T] = me(T, 5);
            N = new ee(ue, P, u + 1, h, b), L = new ee(B, W, 0, c, b), F = new ee(new Array(0), j, 0, y, _);
          })(), S = !0), M.l_desc = new H(M.dyn_ltree, N), M.d_desc = new H(M.dyn_dtree, L), M.bl_desc = new H(M.bl_tree, F), M.bi_buf = 0, M.bi_valid = 0, ke(M);
        }, i._tr_stored_block = A, i._tr_flush_block = function(M, T, U, V) {
          var q, te, se = 0;
          0 < M.level ? (M.strm.data_type === 2 && (M.strm.data_type = (function(re) {
            var fe, he = 4093624447;
            for (fe = 0; fe <= 31; fe++, he >>>= 1) if (1 & he && re.dyn_ltree[2 * fe] !== 0) return a;
            if (re.dyn_ltree[18] !== 0 || re.dyn_ltree[20] !== 0 || re.dyn_ltree[26] !== 0) return s;
            for (fe = 32; fe < u; fe++) if (re.dyn_ltree[2 * fe] !== 0) return s;
            return a;
          })(M)), $(M, M.l_desc), $(M, M.d_desc), se = (function(re) {
            var fe;
            for (p(re, re.dyn_ltree, re.l_desc.max_code), p(re, re.dyn_dtree, re.d_desc.max_code), $(re, re.bl_desc), fe = y - 1; 3 <= fe && re.bl_tree[2 * oe[fe] + 1] === 0; fe--) ;
            return re.opt_len += 3 * (fe + 1) + 5 + 5 + 4, fe;
          })(M), q = M.opt_len + 3 + 7 >>> 3, (te = M.static_len + 3 + 7 >>> 3) <= q && (q = te)) : q = te = U + 5, U + 4 <= q && T !== -1 ? A(M, T, U, V) : M.strategy === 4 || te === q ? (ae(M, 2 + (V ? 1 : 0), 3), O(M, ue, B)) : (ae(M, 4 + (V ? 1 : 0), 3), (function(re, fe, he, pe) {
            var Re;
            for (ae(re, fe - 257, 5), ae(re, he - 1, 5), ae(re, pe - 4, 4), Re = 0; Re < pe; Re++) ae(re, re.bl_tree[2 * oe[Re] + 1], 3);
            z(re, re.dyn_ltree, fe - 1), z(re, re.dyn_dtree, he - 1);
          })(M, M.l_desc.max_code + 1, M.d_desc.max_code + 1, se + 1), O(M, M.dyn_ltree, M.dyn_dtree)), ke(M), V && De(M);
        }, i._tr_tally = function(M, T, U) {
          return M.pending_buf[M.d_buf + 2 * M.last_lit] = T >>> 8 & 255, M.pending_buf[M.d_buf + 2 * M.last_lit + 1] = 255 & T, M.pending_buf[M.l_buf + M.last_lit] = 255 & U, M.last_lit++, T === 0 ? M.dyn_ltree[2 * U]++ : (M.matches++, T--, M.dyn_ltree[2 * (w[U] + u + 1)]++, M.dyn_dtree[2 * K(T)]++), M.last_lit === M.lit_bufsize - 1;
        }, i._tr_align = function(M) {
          ae(M, 2, 3), ne(M, x, ue), (function(T) {
            T.bi_valid === 16 ? (le(T, T.bi_buf), T.bi_buf = 0, T.bi_valid = 0) : 8 <= T.bi_valid && (T.pending_buf[T.pending++] = 255 & T.bi_buf, T.bi_buf >>= 8, T.bi_valid -= 8);
          })(M);
        };
      }, { "../utils/common": 41 }], 53: [function(r, n, i) {
        n.exports = function() {
          this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
        };
      }, {}], 54: [function(r, n, i) {
        (function(o) {
          (function(a, s) {
            if (!a.setImmediate) {
              var l, f, d, u, h = 1, c = {}, y = !1, m = a.document, b = Object.getPrototypeOf && Object.getPrototypeOf(a);
              b = b && b.setTimeout ? b : a, l = {}.toString.call(a.process) === "[object process]" ? function(D) {
                process.nextTick(function() {
                  _(D);
                });
              } : (function() {
                if (a.postMessage && !a.importScripts) {
                  var D = !0, R = a.onmessage;
                  return a.onmessage = function() {
                    D = !1;
                  }, a.postMessage("", "*"), a.onmessage = R, D;
                }
              })() ? (u = "setImmediate$" + Math.random() + "$", a.addEventListener ? a.addEventListener("message", x, !1) : a.attachEvent("onmessage", x), function(D) {
                a.postMessage(u + D, "*");
              }) : a.MessageChannel ? ((d = new MessageChannel()).port1.onmessage = function(D) {
                _(D.data);
              }, function(D) {
                d.port2.postMessage(D);
              }) : m && "onreadystatechange" in m.createElement("script") ? (f = m.documentElement, function(D) {
                var R = m.createElement("script");
                R.onreadystatechange = function() {
                  _(D), R.onreadystatechange = null, f.removeChild(R), R = null;
                }, f.appendChild(R);
              }) : function(D) {
                setTimeout(_, 0, D);
              }, b.setImmediate = function(D) {
                typeof D != "function" && (D = new Function("" + D));
                for (var R = new Array(arguments.length - 1), C = 0; C < R.length; C++) R[C] = arguments[C + 1];
                var P = { callback: D, args: R };
                return c[h] = P, l(h), h++;
              }, b.clearImmediate = g;
            }
            function g(D) {
              delete c[D];
            }
            function _(D) {
              if (y) setTimeout(_, 0, D);
              else {
                var R = c[D];
                if (R) {
                  y = !0;
                  try {
                    (function(C) {
                      var P = C.callback, W = C.args;
                      switch (W.length) {
                        case 0:
                          P();
                          break;
                        case 1:
                          P(W[0]);
                          break;
                        case 2:
                          P(W[0], W[1]);
                          break;
                        case 3:
                          P(W[0], W[1], W[2]);
                          break;
                        default:
                          P.apply(s, W);
                      }
                    })(R);
                  } finally {
                    g(D), y = !1;
                  }
                }
              }
            }
            function x(D) {
              D.source === a && typeof D.data == "string" && D.data.indexOf(u) === 0 && _(+D.data.slice(u.length));
            }
          })(typeof self > "u" ? o === void 0 ? this : o : self);
        }).call(this, typeof xi < "u" ? xi : typeof self < "u" ? self : typeof window < "u" ? window : {});
      }, {}] }, {}, [10])(10);
    });
  })(Ko)), Ko.exports;
}
P_();
var Fe = {}, lt = {}, il;
function In() {
  if (il) return lt;
  il = 1;
  function e(g, _, x) {
    if (x === void 0 && (x = Array.prototype), g && typeof x.find == "function")
      return x.find.call(g, _);
    for (var D = 0; D < g.length; D++)
      if (r(g, D)) {
        var R = g[D];
        if (_.call(void 0, R, D, g))
          return R;
      }
  }
  function t(g, _) {
    return _ === void 0 && (_ = Object), _ && typeof _.getOwnPropertyDescriptors == "function" && (g = _.create(null, _.getOwnPropertyDescriptors(g))), _ && typeof _.freeze == "function" ? _.freeze(g) : g;
  }
  function r(g, _) {
    return Object.prototype.hasOwnProperty.call(g, _);
  }
  function n(g, _) {
    if (g === null || typeof g != "object")
      throw new TypeError("target is not an object");
    for (var x in _)
      r(_, x) && (g[x] = _[x]);
    return g;
  }
  var i = t({
    allowfullscreen: !0,
    async: !0,
    autofocus: !0,
    autoplay: !0,
    checked: !0,
    controls: !0,
    default: !0,
    defer: !0,
    disabled: !0,
    formnovalidate: !0,
    hidden: !0,
    ismap: !0,
    itemscope: !0,
    loop: !0,
    multiple: !0,
    muted: !0,
    nomodule: !0,
    novalidate: !0,
    open: !0,
    playsinline: !0,
    readonly: !0,
    required: !0,
    reversed: !0,
    selected: !0
  });
  function o(g) {
    return r(i, g.toLowerCase());
  }
  var a = t({
    area: !0,
    base: !0,
    br: !0,
    col: !0,
    embed: !0,
    hr: !0,
    img: !0,
    input: !0,
    link: !0,
    meta: !0,
    param: !0,
    source: !0,
    track: !0,
    wbr: !0
  });
  function s(g) {
    return r(a, g.toLowerCase());
  }
  var l = t({
    script: !1,
    style: !1,
    textarea: !0,
    title: !0
  });
  function f(g) {
    var _ = g.toLowerCase();
    return r(l, _) && !l[_];
  }
  function d(g) {
    var _ = g.toLowerCase();
    return r(l, _) && l[_];
  }
  function u(g) {
    return g === c.HTML;
  }
  function h(g) {
    return u(g) || g === c.XML_XHTML_APPLICATION;
  }
  var c = t({
    /**
     * `text/html`, the only mime type that triggers treating an XML document as HTML.
     *
     * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
     * @see https://en.wikipedia.org/wiki/HTML Wikipedia
     * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
     * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
     *      WHATWG HTML Spec
     */
    HTML: "text/html",
    /**
     * `application/xml`, the standard mime type for XML documents.
     *
     * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType
     *      registration
     * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
     * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
     */
    XML_APPLICATION: "application/xml",
    /**
     * `text/xml`, an alias for `application/xml`.
     *
     * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
     * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
     * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
     */
    XML_TEXT: "text/xml",
    /**
     * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
     * but is parsed as an XML document.
     *
     * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType
     *      registration
     * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
     * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
     */
    XML_XHTML_APPLICATION: "application/xhtml+xml",
    /**
     * `image/svg+xml`,
     *
     * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
     * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
     * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
     */
    XML_SVG_IMAGE: "image/svg+xml"
  }), y = Object.keys(c).map(function(g) {
    return c[g];
  });
  function m(g) {
    return y.indexOf(g) > -1;
  }
  var b = t({
    /**
     * The XHTML namespace.
     *
     * @see http://www.w3.org/1999/xhtml
     */
    HTML: "http://www.w3.org/1999/xhtml",
    /**
     * The SVG namespace.
     *
     * @see http://www.w3.org/2000/svg
     */
    SVG: "http://www.w3.org/2000/svg",
    /**
     * The `xml:` namespace.
     *
     * @see http://www.w3.org/XML/1998/namespace
     */
    XML: "http://www.w3.org/XML/1998/namespace",
    /**
     * The `xmlns:` namespace.
     *
     * @see https://www.w3.org/2000/xmlns/
     */
    XMLNS: "http://www.w3.org/2000/xmlns/"
  });
  return lt.assign = n, lt.find = e, lt.freeze = t, lt.HTML_BOOLEAN_ATTRIBUTES = i, lt.HTML_RAW_TEXT_ELEMENTS = l, lt.HTML_VOID_ELEMENTS = a, lt.hasDefaultHTMLNamespace = h, lt.hasOwn = r, lt.isHTMLBooleanAttribute = o, lt.isHTMLRawTextElement = f, lt.isHTMLEscapableRawTextElement = d, lt.isHTMLMimeType = u, lt.isHTMLVoidElement = s, lt.isValidMimeType = m, lt.MIME_TYPE = c, lt.NAMESPACE = b, lt;
}
var gn = {}, ol;
function bo() {
  if (ol) return gn;
  ol = 1;
  var e = In();
  function t(h, c) {
    h.prototype = Object.create(Error.prototype, {
      constructor: { value: h },
      name: { value: h.name, enumerable: !0, writable: c }
    });
  }
  var r = e.freeze({
    /**
     * the default value as defined by the spec
     */
    Error: "Error",
    /**
     * @deprecated
     * Use RangeError instead.
     */
    IndexSizeError: "IndexSizeError",
    /**
     * @deprecated
     * Just to match the related static code, not part of the spec.
     */
    DomstringSizeError: "DomstringSizeError",
    HierarchyRequestError: "HierarchyRequestError",
    WrongDocumentError: "WrongDocumentError",
    InvalidCharacterError: "InvalidCharacterError",
    /**
     * @deprecated
     * Just to match the related static code, not part of the spec.
     */
    NoDataAllowedError: "NoDataAllowedError",
    NoModificationAllowedError: "NoModificationAllowedError",
    NotFoundError: "NotFoundError",
    NotSupportedError: "NotSupportedError",
    InUseAttributeError: "InUseAttributeError",
    InvalidStateError: "InvalidStateError",
    SyntaxError: "SyntaxError",
    InvalidModificationError: "InvalidModificationError",
    NamespaceError: "NamespaceError",
    /**
     * @deprecated
     * Use TypeError for invalid arguments,
     * "NotSupportedError" DOMException for unsupported operations,
     * and "NotAllowedError" DOMException for denied requests instead.
     */
    InvalidAccessError: "InvalidAccessError",
    /**
     * @deprecated
     * Just to match the related static code, not part of the spec.
     */
    ValidationError: "ValidationError",
    /**
     * @deprecated
     * Use TypeError instead.
     */
    TypeMismatchError: "TypeMismatchError",
    SecurityError: "SecurityError",
    NetworkError: "NetworkError",
    AbortError: "AbortError",
    /**
     * @deprecated
     * Just to match the related static code, not part of the spec.
     */
    URLMismatchError: "URLMismatchError",
    QuotaExceededError: "QuotaExceededError",
    TimeoutError: "TimeoutError",
    InvalidNodeTypeError: "InvalidNodeTypeError",
    DataCloneError: "DataCloneError",
    EncodingError: "EncodingError",
    NotReadableError: "NotReadableError",
    UnknownError: "UnknownError",
    ConstraintError: "ConstraintError",
    DataError: "DataError",
    TransactionInactiveError: "TransactionInactiveError",
    ReadOnlyError: "ReadOnlyError",
    VersionError: "VersionError",
    OperationError: "OperationError",
    NotAllowedError: "NotAllowedError",
    OptOutError: "OptOutError"
  }), n = Object.keys(r);
  function i(h) {
    return typeof h == "number" && h >= 1 && h <= 25;
  }
  function o(h) {
    return typeof h == "string" && h.substring(h.length - r.Error.length) === r.Error;
  }
  function a(h, c) {
    i(h) ? (this.name = n[h], this.message = c || "") : (this.message = h, this.name = o(c) ? c : r.Error), Error.captureStackTrace && Error.captureStackTrace(this, a);
  }
  t(a, !0), Object.defineProperties(a.prototype, {
    code: {
      enumerable: !0,
      get: function() {
        var h = n.indexOf(this.name);
        return i(h) ? h : 0;
      }
    }
  });
  for (var s = {
    INDEX_SIZE_ERR: 1,
    DOMSTRING_SIZE_ERR: 2,
    HIERARCHY_REQUEST_ERR: 3,
    WRONG_DOCUMENT_ERR: 4,
    INVALID_CHARACTER_ERR: 5,
    NO_DATA_ALLOWED_ERR: 6,
    NO_MODIFICATION_ALLOWED_ERR: 7,
    NOT_FOUND_ERR: 8,
    NOT_SUPPORTED_ERR: 9,
    INUSE_ATTRIBUTE_ERR: 10,
    INVALID_STATE_ERR: 11,
    SYNTAX_ERR: 12,
    INVALID_MODIFICATION_ERR: 13,
    NAMESPACE_ERR: 14,
    INVALID_ACCESS_ERR: 15,
    VALIDATION_ERR: 16,
    TYPE_MISMATCH_ERR: 17,
    SECURITY_ERR: 18,
    NETWORK_ERR: 19,
    ABORT_ERR: 20,
    URL_MISMATCH_ERR: 21,
    QUOTA_EXCEEDED_ERR: 22,
    TIMEOUT_ERR: 23,
    INVALID_NODE_TYPE_ERR: 24,
    DATA_CLONE_ERR: 25
  }, l = Object.entries(s), f = 0; f < l.length; f++) {
    var d = l[f][0];
    a[d] = l[f][1];
  }
  function u(h, c, y) {
    this.message = h, this.locator = c, this.cause = y, Error.captureStackTrace && Error.captureStackTrace(this, u);
  }
  return t(u), gn.DOMException = a, gn.DOMExceptionName = r, gn.ExceptionCode = s, gn.ParseError = u, gn;
}
var Qe = {}, Se = {}, al;
function mc() {
  if (al) return Se;
  al = 1;
  function e(it) {
    try {
      typeof it != "function" && (it = RegExp);
      var ct = new it("𝌆", "u").exec("𝌆");
      return !!ct && ct[0].length === 2;
    } catch {
    }
    return !1;
  }
  var t = e();
  function r(it) {
    if (it.source[0] !== "[")
      throw new Error(it + " can not be used with chars");
    return it.source.slice(1, it.source.lastIndexOf("]"));
  }
  function n(it, ct) {
    if (it.source[0] !== "[")
      throw new Error("/" + it.source + "/ can not be used with chars_without");
    if (!ct || typeof ct != "string")
      throw new Error(JSON.stringify(ct) + " is not a valid search");
    if (it.source.indexOf(ct) === -1)
      throw new Error('"' + ct + '" is not is /' + it.source + "/");
    if (ct === "-" && it.source.indexOf(ct) !== 1)
      throw new Error('"' + ct + '" is not at the first postion of /' + it.source + "/");
    return new RegExp(it.source.replace(ct, ""), t ? "u" : "");
  }
  function i(it) {
    var ct = this;
    return new RegExp(
      Array.prototype.slice.call(arguments).map(function(Xt) {
        var dn = typeof Xt == "string";
        if (dn && ct === void 0 && Xt === "|")
          throw new Error("use regg instead of reg to wrap expressions with `|`!");
        return dn ? Xt : Xt.source;
      }).join(""),
      t ? "u" : ""
    );
  }
  function o(it) {
    if (arguments.length === 0)
      throw new Error("no parameters provided");
    return i.apply(o, ["(?:"].concat(Array.prototype.slice.call(arguments), [")"]));
  }
  var a = "�", s = /[-\x09\x0A\x0D\x20-\x2C\x2E-\uD7FF\uE000-\uFFFD]/;
  t && (s = i("[", r(s), "\\u{10000}-\\u{10FFFF}", "]"));
  var l = new RegExp("[^" + r(s) + "]", t ? "u" : ""), f = /[\x20\x09\x0D\x0A]/, d = r(f), u = i(f, "+"), h = i(f, "*"), c = /[:_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
  t && (c = i("[", r(c), "\\u{10000}-\\u{10FFFF}", "]"));
  var y = r(c), m = i("[", y, r(/[-.0-9\xB7]/), r(/[\u0300-\u036F\u203F-\u2040]/), "]"), b = i(c, m, "*"), g = i("^", b, "$"), _ = i(m, "+"), x = i("&", b, ";"), D = o(/&#[0-9]+;|&#x[0-9a-fA-F]+;/), R = o(x, "|", D), C = i("%", b, ";"), P = o(
    i('"', o(/[^%&"]/, "|", C, "|", R), "*", '"'),
    "|",
    i("'", o(/[^%&']/, "|", C, "|", R), "*", "'")
  ), W = o('"', o(/[^<&"]/, "|", R), "*", '"', "|", "'", o(/[^<&']/, "|", R), "*", "'"), j = n(c, ":"), oe = n(m, ":"), ue = i(j, oe, "*"), B = i("^", ue, "$"), Z = i(ue, o(":", ue), "?"), w = i("^", Z, "$"), E = i("(", Z, ")"), N = o(/"[^"]*"|'[^']*'/), L = i(/^<\?/, "(", b, ")", o(u, "(?!", f, ")(", s, "*?)"), "?", /\?>/), F = /[\x20\x0D\x0Aa-zA-Z0-9-'()+,./:=?;!*#@$_%]/, Y = o('"', F, '*"', "|", "'", n(F, "'"), "*'"), ee = "<!--", H = "-->", K = i(ee, o(n(s, "-"), "|", i("-", n(s, "-"))), "*", H), le = "#PCDATA", ae = o(
    i(/\(/, h, le, o(h, /\|/, h, Z), "*", h, /\)\*/),
    "|",
    i(/\(/, h, le, h, /\)/)
  ), ne = /[?*+]?/, me = i(
    /\([^>]+\)/,
    ne
    /*regg(choice, '|', seq), _children_quantity*/
  ), we = o("EMPTY", "|", "ANY", "|", ae, "|", me), ke = "<!ELEMENT", De = i(ke, u, o(Z, "|", C), u, o(we, "|", C), h, ">"), Be = i("NOTATION", u, /\(/, h, b, o(h, /\|/, h, b), "*", h, /\)/), Le = i(/\(/, h, _, o(h, /\|/, h, _), "*", h, /\)/), O = o(Be, "|", Le), $ = o(/CDATA|ID|IDREF|IDREFS|ENTITY|ENTITIES|NMTOKEN|NMTOKENS/, "|", O), p = o(/#REQUIRED|#IMPLIED/, "|", o(o("#FIXED", u), "?", W)), z = o(u, b, u, $, u, p), S = "<!ATTLIST", A = i(S, u, b, z, "*", h, ">"), M = "about:legacy-compat", T = o('"' + M + '"', "|", "'" + M + "'"), U = "SYSTEM", V = "PUBLIC", q = o(o(U, u, N), "|", o(V, u, Y, u, N)), te = i(
    "^",
    o(
      o(U, u, "(?<SystemLiteralOnly>", N, ")"),
      "|",
      o(V, u, "(?<PubidLiteral>", Y, ")", u, "(?<SystemLiteral>", N, ")")
    )
  ), se = i("^", Y, "$"), re = i("^", N, "$"), fe = o(u, "NDATA", u, b), he = o(P, "|", o(q, fe, "?")), pe = "<!ENTITY", Re = i(pe, u, b, u, he, h, ">"), qe = o(P, "|", q), je = i(pe, u, "%", u, b, u, qe, h, ">"), Ae = o(Re, "|", je), Oe = i(V, u, Y), ut = i("<!NOTATION", u, b, u, o(q, "|", Oe), h, ">"), He = i(h, "=", h), ze = /1[.]\d+/, kt = i(u, "version", He, o("'", ze, "'", "|", '"', ze, '"')), mt = /[A-Za-z][-A-Za-z0-9._]*/, dr = o(u, "encoding", He, o('"', mt, '"', "|", "'", mt, "'")), Cr = o(u, "standalone", He, o("'", o("yes", "|", "no"), "'", "|", '"', o("yes", "|", "no"), '"')), fr = i(/^<\?xml/, kt, dr, "?", Cr, "?", h, /\?>/), Lt = "<!DOCTYPE", Kt = "<![CDATA[", Ln = "]]>", un = /<!\[CDATA\[/, Sr = /\]\]>/, cn = i(s, "*?", Sr), hi = i(un, cn);
  return Se.chars = r, Se.chars_without = n, Se.detectUnicodeSupport = e, Se.reg = i, Se.regg = o, Se.ABOUT_LEGACY_COMPAT = M, Se.ABOUT_LEGACY_COMPAT_SystemLiteral = T, Se.AttlistDecl = A, Se.CDATA_START = Kt, Se.CDATA_END = Ln, Se.CDSect = hi, Se.Char = s, Se.Comment = K, Se.COMMENT_START = ee, Se.COMMENT_END = H, Se.DOCTYPE_DECL_START = Lt, Se.elementdecl = De, Se.EntityDecl = Ae, Se.EntityValue = P, Se.ExternalID = q, Se.ExternalID_match = te, Se.Name = b, Se.Name_exact = g, Se.NCName_exact = B, Se.NotationDecl = ut, Se.Reference = R, Se.PEReference = C, Se.PI = L, Se.PUBLIC = V, Se.PubidLiteral = Y, Se.PubidLiteral_match = se, Se.QName = Z, Se.QName_exact = w, Se.QName_group = E, Se.S = u, Se.SChar_s = d, Se.S_OPT = h, Se.SYSTEM = U, Se.SystemLiteral = N, Se.SystemLiteral_match = re, Se.InvalidChar = l, Se.UNICODE_REPLACEMENT_CHARACTER = a, Se.UNICODE_SUPPORT = t, Se.XMLDecl = fr, Se;
}
var sl;
function gc() {
  if (sl) return Qe;
  sl = 1;
  var e = In(), t = e.find, r = e.hasDefaultHTMLNamespace, n = e.hasOwn, i = e.isHTMLMimeType, o = e.isHTMLRawTextElement, a = e.isHTMLVoidElement, s = e.MIME_TYPE, l = e.NAMESPACE, f = Symbol(), d = bo(), u = d.DOMException, h = d.DOMExceptionName, c = mc();
  function y(v) {
    if (v !== f)
      throw new TypeError("Illegal constructor");
  }
  function m(v) {
    return v !== "";
  }
  function b(v) {
    return v ? v.split(/[\t\n\f\r ]+/).filter(m) : [];
  }
  function g(v, k) {
    return n(v, k) || (v[k] = !0), v;
  }
  function _(v) {
    if (!v) return [];
    var k = b(v);
    return Object.keys(k.reduce(g, {}));
  }
  function x(v) {
    return function(k) {
      return v && v.indexOf(k) !== -1;
    };
  }
  function D(v) {
    if (!c.QName_exact.test(v))
      throw new u(u.INVALID_CHARACTER_ERR, 'invalid character in qualified name "' + v + '"');
  }
  function R(v, k) {
    D(k), v = v || null;
    var I = null, Q = k;
    if (k.indexOf(":") >= 0) {
      var ie = k.split(":");
      I = ie[0], Q = ie[1];
    }
    if (I !== null && v === null)
      throw new u(u.NAMESPACE_ERR, "prefix is non-null and namespace is null");
    if (I === "xml" && v !== e.NAMESPACE.XML)
      throw new u(u.NAMESPACE_ERR, 'prefix is "xml" and namespace is not the XML namespace');
    if ((I === "xmlns" || k === "xmlns") && v !== e.NAMESPACE.XMLNS)
      throw new u(
        u.NAMESPACE_ERR,
        'either qualifiedName or prefix is "xmlns" and namespace is not the XMLNS namespace'
      );
    if (v === e.NAMESPACE.XMLNS && I !== "xmlns" && k !== "xmlns")
      throw new u(
        u.NAMESPACE_ERR,
        'namespace is the XMLNS namespace and neither qualifiedName nor prefix is "xmlns"'
      );
    return [v, I, Q];
  }
  function C(v, k) {
    for (var I in v)
      n(v, I) && (k[I] = v[I]);
  }
  function P(v, k) {
    var I = v.prototype;
    if (!(I instanceof k)) {
      let ie = function() {
      };
      var Q = ie;
      ie.prototype = k.prototype, ie = new ie(), C(I, ie), v.prototype = I = ie;
    }
    I.constructor != v && (typeof v != "function" && console.error("unknown Class:" + v), I.constructor = v);
  }
  var W = {}, j = W.ELEMENT_NODE = 1, oe = W.ATTRIBUTE_NODE = 2, ue = W.TEXT_NODE = 3, B = W.CDATA_SECTION_NODE = 4, Z = W.ENTITY_REFERENCE_NODE = 5, w = W.ENTITY_NODE = 6, E = W.PROCESSING_INSTRUCTION_NODE = 7, N = W.COMMENT_NODE = 8, L = W.DOCUMENT_NODE = 9, F = W.DOCUMENT_TYPE_NODE = 10, Y = W.DOCUMENT_FRAGMENT_NODE = 11, ee = W.NOTATION_NODE = 12, H = e.freeze({
    DOCUMENT_POSITION_DISCONNECTED: 1,
    DOCUMENT_POSITION_PRECEDING: 2,
    DOCUMENT_POSITION_FOLLOWING: 4,
    DOCUMENT_POSITION_CONTAINS: 8,
    DOCUMENT_POSITION_CONTAINED_BY: 16,
    DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32
  });
  function K(v, k) {
    if (k.length < v.length) return K(k, v);
    var I = null;
    for (var Q in v) {
      if (v[Q] !== k[Q]) return I;
      I = v[Q];
    }
    return I;
  }
  function le(v) {
    return v.guid || (v.guid = Math.random()), v.guid;
  }
  function ae() {
  }
  ae.prototype = {
    /**
     * The number of nodes in the list. The range of valid child node indices is 0 to length-1
     * inclusive.
     *
     * @type {number}
     */
    length: 0,
    /**
     * Returns the item at `index`. If index is greater than or equal to the number of nodes in
     * the list, this returns null.
     *
     * @param index
     * Unsigned long Index into the collection.
     * @returns {Node | null}
     * The node at position `index` in the NodeList,
     * or null if that is not a valid index.
     */
    item: function(v) {
      return v >= 0 && v < this.length ? this[v] : null;
    },
    /**
     * Returns a string representation of the NodeList.
     *
     * Accepts the same `options` object as `XMLSerializer.prototype.serializeToString`
     * (`requireWellFormed`, `splitCDATASections`, `nodeFilter`). Passing a function is treated as
     * a legacy `nodeFilter` for backward compatibility.
     *
     * @param {Object | function} [options]
     * @param {boolean} [options.requireWellFormed=false]
     * @param {boolean} [options.splitCDATASections=true]
     * @param {function} [options.nodeFilter]
     * @returns {string}
     */
    toString: function(v) {
      var k;
      typeof v == "function" ? k = { requireWellFormed: !1, splitCDATASections: !0, nodeFilter: v } : v ? k = {
        requireWellFormed: !!v.requireWellFormed,
        splitCDATASections: v.splitCDATASections !== !1,
        nodeFilter: v.nodeFilter || null
      } : k = { requireWellFormed: !1, splitCDATASections: !0, nodeFilter: null };
      for (var I = [], Q = 0; Q < this.length; Q++)
        dn(this[Q], I, null, k);
      return I.join("");
    },
    /**
     * Filters the NodeList based on a predicate.
     *
     * @param {function(Node): boolean} predicate
     * - A predicate function to filter the NodeList.
     * @returns {Node[]}
     * An array of nodes that satisfy the predicate.
     * @private
     */
    filter: function(v) {
      return Array.prototype.filter.call(this, v);
    },
    /**
     * Returns the first index at which a given node can be found in the NodeList, or -1 if it is
     * not present.
     *
     * @param {Node} item
     * - The Node item to locate in the NodeList.
     * @returns {number}
     * The first index of the node in the NodeList; -1 if not found.
     * @private
     */
    indexOf: function(v) {
      return Array.prototype.indexOf.call(this, v);
    }
  }, ae.prototype[Symbol.iterator] = function() {
    var v = this, k = 0;
    return {
      next: function() {
        return k < v.length ? {
          value: v[k++],
          done: !1
        } : {
          done: !0
        };
      },
      return: function() {
        return {
          done: !0
        };
      }
    };
  };
  function ne(v, k) {
    this._node = v, this._refresh = k, me(this);
  }
  function me(v) {
    var k = v._node._inc || v._node.ownerDocument._inc;
    if (v._inc !== k) {
      var I = v._refresh(v._node);
      if (Wa(v, "length", I.length), !v.$$length || I.length < v.$$length)
        for (var Q = I.length; Q in v; Q++)
          n(v, Q) && delete v[Q];
      C(I, v), v._inc = k;
    }
  }
  ne.prototype.item = function(v) {
    return me(this), this[v] || null;
  }, P(ne, ae);
  function we() {
    this._nsIndex = /* @__PURE__ */ Object.create(null), this._noNsIndex = /* @__PURE__ */ Object.create(null);
  }
  function ke(v, k) {
    for (var I = 0; I < v.length; ) {
      if (v[I] === k)
        return I;
      I++;
    }
  }
  function De(v, k, I) {
    if (!k)
      return v._noNsIndex;
    var Q = v._nsIndex[k];
    return !Q && I && (Q = v._nsIndex[k] = /* @__PURE__ */ Object.create(null)), Q;
  }
  function Be(v, k, I) {
    var Q = De(v, k, !1), ie = Q && Q[I];
    return ie || null;
  }
  function Le(v, k) {
    De(v, k.namespaceURI, !0)[k.localName] = k;
  }
  function O(v, k) {
    var I = De(v, k.namespaceURI, !1);
    I && delete I[k.localName];
  }
  function $(v, k, I, Q) {
    if (Q ? k[ke(k, Q)] = I : (k[k.length] = I, k.length++), Le(k, I), v) {
      I.ownerElement = v;
      var ie = v.ownerDocument;
      ie && (Q && q(ie, v, Q), V(ie, v, I));
    }
  }
  function p(v, k, I) {
    var Q = ke(k, I);
    if (Q >= 0) {
      for (var ie = k.length - 1; Q <= ie; )
        k[Q] = k[++Q];
      if (k.length = ie, O(k, I), v) {
        var ce = v.ownerDocument;
        ce && q(ce, v, I), I.ownerElement = null;
      }
    }
  }
  we.prototype = {
    length: 0,
    item: ae.prototype.item,
    /**
     * Get an attribute by name. Note: Name is in lower case in case of HTML namespace and
     * document.
     *
     * @param {string} localName
     * The local name of the attribute.
     * @returns {Attr | null}
     * The attribute with the given local name, or null if no such attribute exists.
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
     */
    getNamedItem: function(v) {
      this._ownerElement && this._ownerElement._isInHTMLDocumentAndNamespace() && (v = v.toLowerCase());
      for (var k = 0; k < this.length; ) {
        var I = this[k];
        if (I.nodeName === v)
          return I;
        k++;
      }
      return null;
    },
    /**
     * Set an attribute.
     *
     * @param {Attr} attr
     * The attribute to set.
     * @returns {Attr | null}
     * The old attribute with the same local name and namespace URI as the new one, or null if no
     * such attribute exists.
     * @throws {DOMException}
     * With code:
     * - {@link INUSE_ATTRIBUTE_ERR} - If the attribute is already an attribute of another
     * element.
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
     */
    setNamedItem: function(v) {
      var k = v.ownerElement;
      if (k && k !== this._ownerElement)
        throw new u(u.INUSE_ATTRIBUTE_ERR);
      var I = Be(this, v.namespaceURI, v.localName);
      return I === v ? v : ($(this._ownerElement, this, v, I), I);
    },
    /**
     * Set an attribute, replacing an existing attribute with the same local name and namespace
     * URI if one exists.
     *
     * @param {Attr} attr
     * The attribute to set.
     * @returns {Attr | null}
     * The old attribute with the same local name and namespace URI as the new one, or null if no
     * such attribute exists.
     * @throws {DOMException}
     * Throws a DOMException with the name "InUseAttributeError" if the attribute is already an
     * attribute of another element.
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
     */
    setNamedItemNS: function(v) {
      return this.setNamedItem(v);
    },
    /**
     * Removes an attribute specified by the local name.
     *
     * @param {string} localName
     * The local name of the attribute to be removed.
     * @returns {Attr}
     * The attribute node that was removed.
     * @throws {DOMException}
     * With code:
     * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given name is found.
     * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-name
     */
    removeNamedItem: function(v) {
      var k = this.getNamedItem(v);
      if (!k)
        throw new u(u.NOT_FOUND_ERR, v);
      return p(this._ownerElement, this, k), k;
    },
    /**
     * Removes an attribute specified by the namespace and local name.
     *
     * @param {string | null} namespaceURI
     * The namespace URI of the attribute to be removed.
     * @param {string} localName
     * The local name of the attribute to be removed.
     * @returns {Attr}
     * The attribute node that was removed.
     * @throws {DOMException}
     * With code:
     * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given namespace URI and local
     * name is found.
     * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditemns
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-namespace
     */
    removeNamedItemNS: function(v, k) {
      var I = this.getNamedItemNS(v, k);
      if (!I)
        throw new u(u.NOT_FOUND_ERR, v ? v + " : " + k : k);
      return p(this._ownerElement, this, I), I;
    },
    /**
     * Get an attribute by namespace and local name.
     *
     * @param {string | null} namespaceURI
     * The namespace URI of the attribute.
     * @param {string} localName
     * The local name of the attribute.
     * @returns {Attr | null}
     * The attribute with the given namespace URI and local name, or null if no such attribute
     * exists.
     * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace
     */
    getNamedItemNS: function(v, k) {
      v || (v = null);
      for (var I = 0; I < this.length; ) {
        var Q = this[I];
        if (Q.localName === k && Q.namespaceURI === v)
          return Q;
        I++;
      }
      return null;
    }
  }, we.prototype[Symbol.iterator] = function() {
    var v = this, k = 0;
    return {
      next: function() {
        return k < v.length ? {
          value: v[k++],
          done: !1
        } : {
          done: !0
        };
      },
      return: function() {
        return {
          done: !0
        };
      }
    };
  };
  function z() {
  }
  z.prototype = {
    /**
     * Test if the DOM implementation implements a specific feature and version, as specified in
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#DOMFeatures DOM Features}.
     *
     * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given
     * feature is supported. The different implementations fairly diverged in what kind of
     * features were reported. The latest version of the spec settled to force this method to
     * always return true, where the functionality was accurate and in use.
     *
     * @deprecated
     * It is deprecated and modern browsers return true in all cases.
     * @function DOMImplementation#hasFeature
     * @param {string} feature
     * The name of the feature to test.
     * @param {string} [version]
     * This is the version number of the feature to test.
     * @returns {boolean}
     * Always returns true.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
     * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
     * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-5CED94D7 DOM Level 3 Core
     */
    hasFeature: function(v, k) {
      return !0;
    },
    /**
     * Creates a DOM Document object of the specified type with its document element. Note that
     * based on the {@link DocumentType}
     * given to create the document, the implementation may instantiate specialized
     * {@link Document} objects that support additional features than the "Core", such as "HTML"
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML}.
     * On the other hand, setting the {@link DocumentType} after the document was created makes
     * this very unlikely to happen. Alternatively, specialized {@link Document} creation methods,
     * such as createHTMLDocument
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML},
     * can be used to obtain specific types of {@link Document} objects.
     *
     * __It behaves slightly different from the description in the living standard__:
     * - There is no interface/class `XMLDocument`, it returns a `Document`
     * instance (with it's `type` set to `'xml'`).
     * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
     *
     * @function DOMImplementation.createDocument
     * @param {string | null} namespaceURI
     * The
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-namespaceURI namespace URI}
     * of the document element to create or null.
     * @param {string | null} qualifiedName
     * The
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified name}
     * of the document element to be created or null.
     * @param {DocumentType | null} [doctype=null]
     * The type of document to be created or null. When doctype is not null, its
     * {@link Node#ownerDocument} attribute is set to the document being created. Default is
     * `null`
     * @returns {Document}
     * A new {@link Document} object with its document element. If the NamespaceURI,
     * qualifiedName, and doctype are null, the returned {@link Document} is empty with no
     * document element.
     * @throws {DOMException}
     * With code:
     *
     * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
     * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
     * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed, if the qualifiedName has a
     * prefix and the namespaceURI is null, or if the qualifiedName is null and the namespaceURI
     * is different from null, or if the qualifiedName has a prefix that is "xml" and the
     * namespaceURI is different from "{@link http://www.w3.org/XML/1998/namespace}"
     * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#Namespaces XML Namespaces},
     * or if the DOM implementation does not support the "XML" feature but a non-null namespace
     * URI was provided, since namespaces were defined by XML.
     * - `WRONG_DOCUMENT_ERR`: Raised if doctype has already been used with a different document
     * or was created from a different implementation.
     * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
     * "XML" and the language exposed through the Document does not support XML Namespaces (such
     * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
     * @since DOM Level 2.
     * @see {@link #createHTMLDocument}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
     * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument DOM Living Standard
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-2-Core-DOM-createDocument DOM
     *      Level 3 Core
     * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM
     *      Level 2 Core (initial)
     */
    createDocument: function(v, k, I) {
      var Q = s.XML_APPLICATION;
      v === l.HTML ? Q = s.XML_XHTML_APPLICATION : v === l.SVG && (Q = s.XML_SVG_IMAGE);
      var ie = new U(f, { contentType: Q });
      if (ie.implementation = this, ie.childNodes = new ae(), ie.doctype = I || null, I && ie.appendChild(I), k) {
        var ce = ie.createElementNS(v, k);
        ie.appendChild(ce);
      }
      return ie;
    },
    /**
     * Creates an empty DocumentType node. Entity declarations and notations are not made
     * available. Entity reference expansions and default attribute additions do not occur.
     *
     * **This behavior is slightly different from the one in the specs**:
     * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
     * - `publicId` and `systemId` contain the raw data including any possible quotes,
     *   so they can always be serialized back to the original value
     * - `internalSubset` contains the raw string between `[` and `]` if present,
     *   but is not parsed or validated in any form.
     *
     * @function DOMImplementation#createDocumentType
     * @param {string} qualifiedName
     * The {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified
     * name} of the document type to be created.
     * @param {string} [publicId]
     * The external subset public identifier. Stored verbatim including surrounding quotes.
     * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
     * if the value is non-empty and does not match the XML `PubidLiteral` production
     * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12]). Creation-time validation is not
     * enforced — deferred to a future breaking release.
     * @param {string} [systemId]
     * The external subset system identifier. Stored verbatim including surrounding quotes.
     * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
     * if the value is non-empty and does not match the XML `SystemLiteral` production
     * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11]). Creation-time validation is not
     * enforced — deferred to a future breaking release.
     * @param {string} [internalSubset]
     * The internal subset or an empty string if it is not present. Stored verbatim.
     * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
     * if the value contains `"]>"`. Creation-time validation is not enforced.
     * @returns {DocumentType}
     * A new {@link DocumentType} node with {@link Node#ownerDocument} set to null.
     * @throws {DOMException}
     * With code:
     *
     * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
     * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
     * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed.
     * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
     * "XML" and the language exposed through the Document does not support XML Namespaces (such
     * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
     * @since DOM Level 2.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType
     *      MDN
     * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living
     *      Standard
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-3-Core-DOM-createDocType DOM
     *      Level 3 Core
     * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM
     *      Level 2 Core
     * @see https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md#050
     * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-Core-DocType-internalSubset
     * @prettierignore
     */
    createDocumentType: function(v, k, I, Q) {
      D(v);
      var ie = new Lt(f);
      return ie.name = v, ie.nodeName = v, ie.publicId = k || "", ie.systemId = I || "", ie.internalSubset = Q || "", ie.childNodes = new ae(), ie;
    },
    /**
     * Returns an HTML document, that might already have a basic DOM structure.
     *
     * __It behaves slightly different from the description in the living standard__:
     * - If the first argument is `false` no initial nodes are added (steps 3-7 in the specs are
     * omitted)
     * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
     *
     * @param {string | false} [title]
     * A string containing the title to give the new HTML document.
     * @returns {Document}
     * The HTML document.
     * @since WHATWG Living Standard.
     * @see {@link #createDocument}
     * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
     * @see https://dom.spec.whatwg.org/#html-document
     */
    createHTMLDocument: function(v) {
      var k = new U(f, { contentType: s.HTML });
      if (k.implementation = this, k.childNodes = new ae(), v !== !1) {
        k.doctype = this.createDocumentType("html"), k.doctype.ownerDocument = k, k.appendChild(k.doctype);
        var I = k.createElement("html");
        k.appendChild(I);
        var Q = k.createElement("head");
        if (I.appendChild(Q), typeof v == "string") {
          var ie = k.createElement("title");
          ie.appendChild(k.createTextNode(v)), Q.appendChild(ie);
        }
        I.appendChild(k.createElement("body"));
      }
      return k;
    }
  };
  function S(v) {
    y(v);
  }
  S.prototype = {
    /**
     * The first child of this node.
     *
     * @type {Node | null}
     */
    firstChild: null,
    /**
     * The last child of this node.
     *
     * @type {Node | null}
     */
    lastChild: null,
    /**
     * The previous sibling of this node.
     *
     * @type {Node | null}
     */
    previousSibling: null,
    /**
     * The next sibling of this node.
     *
     * @type {Node | null}
     */
    nextSibling: null,
    /**
     * The parent node of this node.
     *
     * @type {Node | null}
     */
    parentNode: null,
    /**
     * The parent element of this node.
     *
     * @type {Element | null}
     */
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === this.ELEMENT_NODE ? this.parentNode : null;
    },
    /**
     * The child nodes of this node.
     *
     * @type {NodeList}
     */
    childNodes: null,
    /**
     * The document object associated with this node.
     *
     * @type {Document | null}
     */
    ownerDocument: null,
    /**
     * The value of this node.
     *
     * @type {string | null}
     */
    nodeValue: null,
    /**
     * The namespace URI of this node.
     *
     * @type {string | null}
     */
    namespaceURI: null,
    /**
     * The prefix of the namespace for this node.
     *
     * @type {string | null}
     */
    prefix: null,
    /**
     * The local part of the qualified name of this node.
     *
     * @type {string | null}
     */
    localName: null,
    /**
     * The baseURI is currently always `about:blank`,
     * since that's what happens when you create a document from scratch.
     *
     * @type {'about:blank'}
     */
    baseURI: "about:blank",
    /**
     * Is true if this node is part of a document.
     *
     * @type {boolean}
     */
    get isConnected() {
      var v = this.getRootNode();
      return v && v.nodeType === v.DOCUMENT_NODE;
    },
    /**
     * Checks whether `other` is an inclusive descendant of this node.
     *
     * @param {Node | null | undefined} other
     * The node to check.
     * @returns {boolean}
     * True if `other` is an inclusive descendant of this node; false otherwise.
     * @see https://dom.spec.whatwg.org/#dom-node-contains
     */
    contains: function(v) {
      if (!v) return !1;
      var k = v;
      do {
        if (this === k) return !0;
        k = k.parentNode;
      } while (k);
      return !1;
    },
    /**
     * @typedef GetRootNodeOptions
     * @property {boolean} [composed=false]
     */
    /**
     * Searches for the root node of this node.
     *
     * **This behavior is slightly different from the in the specs**:
     * - ignores `options.composed`, since `ShadowRoot`s are unsupported, always returns root.
     *
     * @param {GetRootNodeOptions} [options]
     * @returns {Node}
     * Root node.
     * @see https://dom.spec.whatwg.org/#dom-node-getrootnode
     * @see https://dom.spec.whatwg.org/#concept-shadow-including-root
     */
    getRootNode: function(v) {
      var k = this;
      do {
        if (!k.parentNode)
          return k;
        k = k.parentNode;
      } while (k);
    },
    /**
     * Checks whether the given node is equal to this node.
     *
     * Two nodes are equal when they have the same type, defining characteristics (for the type),
     * and the same childNodes. The comparison is iterative to avoid stack overflows on
     * deeply-nested trees. Attribute nodes of each Element pair are also pushed onto the stack
     * and compared the same way.
     *
     * @param {Node} [otherNode]
     * @returns {boolean}
     * @see https://dom.spec.whatwg.org/#concept-node-equals
     * @see ../docs/walk-dom.md.
     */
    isEqualNode: function(v) {
      if (!v) return !1;
      for (var k = [{ node: this, other: v }]; k.length > 0; ) {
        var I = k.pop(), Q = I.node, ie = I.other;
        if (Q.nodeType !== ie.nodeType) return !1;
        switch (Q.nodeType) {
          case Q.DOCUMENT_TYPE_NODE:
            if (Q.name !== ie.name || Q.publicId !== ie.publicId || Q.systemId !== ie.systemId) return !1;
            break;
          case Q.ELEMENT_NODE:
            if (Q.namespaceURI !== ie.namespaceURI || Q.prefix !== ie.prefix || Q.localName !== ie.localName || Q.attributes.length !== ie.attributes.length) return !1;
            for (var ce = 0; ce < Q.attributes.length; ce++) {
              var Me = Q.attributes.item(ce), Ze = ie.getAttributeNodeNS(Me.namespaceURI, Me.localName);
              if (!Ze) return !1;
              k.push({ node: Me, other: Ze });
            }
            break;
          case Q.ATTRIBUTE_NODE:
            if (Q.namespaceURI !== ie.namespaceURI || Q.localName !== ie.localName || Q.value !== ie.value) return !1;
            break;
          case Q.PROCESSING_INSTRUCTION_NODE:
            if (Q.target !== ie.target || Q.data !== ie.data) return !1;
            break;
          case Q.TEXT_NODE:
          case Q.CDATA_SECTION_NODE:
          case Q.COMMENT_NODE:
            if (Q.data !== ie.data) return !1;
            break;
        }
        if (Q.childNodes.length !== ie.childNodes.length) return !1;
        for (var ce = Q.childNodes.length - 1; ce >= 0; ce--)
          k.push({ node: Q.childNodes[ce], other: ie.childNodes[ce] });
      }
      return !0;
    },
    /**
     * Checks whether or not the given node is this node.
     *
     * @param {Node} [otherNode]
     */
    isSameNode: function(v) {
      return this === v;
    },
    /**
     * Inserts a node before a reference node as a child of this node.
     *
     * @param {Node} newChild
     * The new child node to be inserted.
     * @param {Node | null} refChild
     * The reference node before which newChild will be inserted.
     * @returns {Node}
     * The new child node successfully inserted.
     * @throws {DOMException}
     * Throws a DOMException if inserting the node would result in a DOM tree that is not
     * well-formed, or if `child` is provided but is not a child of `parent`.
     * See {@link _insertBefore} for more details.
     * @since Modified in DOM L2
     */
    insertBefore: function(v, k) {
      return He(this, v, k);
    },
    /**
     * Replaces an old child node with a new child node within this node.
     *
     * @param {Node} newChild
     * The new node that is to replace the old node.
     * If it already exists in the DOM, it is removed from its original position.
     * @param {Node} oldChild
     * The existing child node to be replaced.
     * @returns {Node}
     * Returns the replaced child node.
     * @throws {DOMException}
     * Throws a DOMException if replacing the node would result in a DOM tree that is not
     * well-formed, or if `oldChild` is not a child of `this`.
     * This can also occur if the pre-replacement validity assertion fails.
     * See {@link _insertBefore}, {@link Node.removeChild}, and
     * {@link assertPreReplacementValidityInDocument} for more details.
     * @see https://dom.spec.whatwg.org/#concept-node-replace
     */
    replaceChild: function(v, k) {
      He(this, v, k, ut), k && this.removeChild(k);
    },
    /**
     * Removes an existing child node from this node.
     *
     * @param {Node} oldChild
     * The child node to be removed.
     * @returns {Node}
     * Returns the removed child node.
     * @throws {DOMException}
     * Throws a DOMException if `oldChild` is not a child of `this`.
     * See {@link _removeChild} for more details.
     */
    removeChild: function(v) {
      return se(this, v);
    },
    /**
     * Appends a child node to this node.
     *
     * @param {Node} newChild
     * The child node to be appended to this node.
     * If it already exists in the DOM, it is removed from its original position.
     * @returns {Node}
     * Returns the appended child node.
     * @throws {DOMException}
     * Throws a DOMException if appending the node would result in a DOM tree that is not
     * well-formed, or if `newChild` is not a valid Node.
     * See {@link insertBefore} for more details.
     */
    appendChild: function(v) {
      return this.insertBefore(v, null);
    },
    /**
     * Determines whether this node has any child nodes.
     *
     * @returns {boolean}
     * Returns true if this node has any child nodes, and false otherwise.
     */
    hasChildNodes: function() {
      return this.firstChild != null;
    },
    /**
     * Creates a copy of the calling node.
     *
     * @param {boolean} deep
     * If true, the contents of the node are recursively copied.
     * If false, only the node itself (and its attributes, if it is an element) are copied.
     * @returns {Node}
     * Returns the newly created copy of the node.
     * @throws {DOMException}
     * May throw a DOMException if operations within {@link Element#setAttributeNode} or
     * {@link Node#appendChild} (which are potentially invoked in this method) do not meet their
     * specific constraints.
     * @see {@link cloneNode}
     */
    cloneNode: function(v) {
      return ja(this.ownerDocument || this, this, v);
    },
    /**
     * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
     * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
     *
     * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
     * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
     * nodes.
     *
     * This method iterativly traverses all child nodes to normalize all descendent nodes within
     * the subtree.
     *
     * @throws {DOMException}
     * May throw a DOMException if operations within removeChild or appendData (which are
     * potentially invoked in this method) do not meet their specific constraints.
     * @since Modified in DOM Level 2
     * @see {@link Node.removeChild}
     * @see {@link CharacterData.appendData}
     * @see ../docs/walk-dom.md.
     */
    normalize: function() {
      T(this, null, {
        enter: function(v) {
          for (var k = v.firstChild; k; ) {
            var I = k.nextSibling;
            if (I !== null && I.nodeType === ue && k.nodeType === ue) {
              for (var Q = [], ie = I; ie !== null && ie.nodeType === ue; )
                Q.push(ie.data), ie = ie.nextSibling;
              for (var ce = k.nextSibling; ce !== ie; ) {
                var Me = ce.nextSibling;
                ce.parentNode = null, ce.previousSibling = null, ce.nextSibling = null, ce = Me;
              }
              k.nextSibling = ie, ie !== null ? ie.previousSibling = k : v.lastChild = k, k.appendData(Q.join("")), te(v.ownerDocument, v), k = ie;
            } else
              k = I;
          }
          return !0;
        }
      });
    },
    /**
     * Checks whether the DOM implementation implements a specific feature and its version.
     *
     * @deprecated
     * Since `DOMImplementation.hasFeature` is deprecated and always returns true.
     * @param {string} feature
     * The package name of the feature to test. This is the same name that can be passed to the
     * method `hasFeature` on `DOMImplementation`.
     * @param {string} version
     * This is the version number of the package name to test.
     * @returns {boolean}
     * Returns true in all cases in the current implementation.
     * @since Introduced in DOM Level 2
     * @see {@link DOMImplementation.hasFeature}
     */
    isSupported: function(v, k) {
      return this.ownerDocument.implementation.hasFeature(v, k);
    },
    /**
     * Look up the prefix associated to the given namespace URI, starting from this node.
     * **The default namespace declarations are ignored by this method.**
     * See Namespace Prefix Lookup for details on the algorithm used by this method.
     *
     * **This behavior is different from the in the specs**:
     * - no node type specific handling
     * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
     *
     * @param {string | null} namespaceURI
     * The namespace URI for which to find the associated prefix.
     * @returns {string | null}
     * The associated prefix, if found; otherwise, null.
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
     * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
     * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
     * @see https://github.com/xmldom/xmldom/issues/322
     * @prettierignore
     */
    lookupPrefix: function(v) {
      for (var k = this; k; ) {
        var I = k._nsMap;
        if (I) {
          for (var Q in I)
            if (n(I, Q) && I[Q] === v)
              return Q;
        }
        k = k.nodeType == oe ? k.ownerDocument : k.parentNode;
      }
      return null;
    },
    /**
     * This function is used to look up the namespace URI associated with the given prefix,
     * starting from this node.
     *
     * **This behavior is different from the in the specs**:
     * - no node type specific handling
     * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
     *
     * @param {string | null} prefix
     * The prefix for which to find the associated namespace URI.
     * @returns {string | null}
     * The associated namespace URI, if found; otherwise, null.
     * @since DOM Level 3
     * @see https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespaceURI
     * @prettierignore
     */
    lookupNamespaceURI: function(v) {
      for (var k = this; k; ) {
        var I = k._nsMap;
        if (I && n(I, v))
          return I[v];
        k = k.nodeType == oe ? k.ownerDocument : k.parentNode;
      }
      return null;
    },
    /**
     * Determines whether the given namespace URI is the default namespace.
     *
     * The function works by looking up the prefix associated with the given namespace URI. If no
     * prefix is found (i.e., the namespace URI is not registered in the namespace map of this
     * node or any of its ancestors), it returns `true`, implying the namespace URI is considered
     * the default.
     *
     * **This behavior is different from the in the specs**:
     * - no node type specific handling
     * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
     *
     * @param {string | null} namespaceURI
     * The namespace URI to be checked.
     * @returns {boolean}
     * Returns true if the given namespace URI is the default namespace, false otherwise.
     * @since DOM Level 3
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isDefaultNamespace
     * @see https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace
     * @prettierignore
     */
    isDefaultNamespace: function(v) {
      var k = this.lookupPrefix(v);
      return k == null;
    },
    /**
     * Compares the reference node with a node with regard to their position in the document and
     * according to the document order.
     *
     * @param {Node} other
     * The node to compare the reference node to.
     * @returns {number}
     * Returns how the node is positioned relatively to the reference node according to the
     * bitmask. 0 if reference node and given node are the same.
     * @since DOM Level 3
     * @see https://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-compare
     * @see https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
     */
    compareDocumentPosition: function(v) {
      if (this === v) return 0;
      var k = v, I = this, Q = null, ie = null;
      if (k instanceof kt && (Q = k, k = Q.ownerElement), I instanceof kt && (ie = I, I = ie.ownerElement, Q && k && I === k))
        for (var ce = 0, Me; Me = I.attributes[ce]; ce++) {
          if (Me === Q)
            return H.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + H.DOCUMENT_POSITION_PRECEDING;
          if (Me === ie)
            return H.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + H.DOCUMENT_POSITION_FOLLOWING;
        }
      if (!k || !I || I.ownerDocument !== k.ownerDocument)
        return H.DOCUMENT_POSITION_DISCONNECTED + H.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + (le(I.ownerDocument) > le(k.ownerDocument) ? H.DOCUMENT_POSITION_FOLLOWING : H.DOCUMENT_POSITION_PRECEDING);
      if (ie && k === I)
        return H.DOCUMENT_POSITION_CONTAINS + H.DOCUMENT_POSITION_PRECEDING;
      if (Q && k === I)
        return H.DOCUMENT_POSITION_CONTAINED_BY + H.DOCUMENT_POSITION_FOLLOWING;
      for (var Ze = [], st = k.parentNode; st; ) {
        if (!ie && st === I)
          return H.DOCUMENT_POSITION_CONTAINED_BY + H.DOCUMENT_POSITION_FOLLOWING;
        Ze.push(st), st = st.parentNode;
      }
      Ze.reverse();
      for (var ye = [], Dt = I.parentNode; Dt; ) {
        if (!Q && Dt === k)
          return H.DOCUMENT_POSITION_CONTAINS + H.DOCUMENT_POSITION_PRECEDING;
        ye.push(Dt), Dt = Dt.parentNode;
      }
      ye.reverse();
      var Bt = K(Ze, ye);
      for (var Yt in Bt.childNodes) {
        var Ft = Bt.childNodes[Yt];
        if (Ft === I) return H.DOCUMENT_POSITION_FOLLOWING;
        if (Ft === k) return H.DOCUMENT_POSITION_PRECEDING;
        if (ye.indexOf(Ft) >= 0) return H.DOCUMENT_POSITION_FOLLOWING;
        if (Ze.indexOf(Ft) >= 0) return H.DOCUMENT_POSITION_PRECEDING;
      }
      return 0;
    }
  };
  function A(v) {
    return v == "<" && "&lt;" || v == ">" && "&gt;" || v == "&" && "&amp;" || v == '"' && "&quot;" || "&#" + v.charCodeAt() + ";";
  }
  C(W, S), C(W, S.prototype), C(H, S), C(H, S.prototype);
  function M(v, k) {
    T(v, null, {
      enter: function(I) {
        return k(I) ? T.STOP : !0;
      }
    });
  }
  function T(v, k, I) {
    for (var Q = [{ node: v, context: k, phase: T.ENTER }]; Q.length > 0; ) {
      var ie = Q.pop();
      if (ie.phase === T.ENTER) {
        var ce = I.enter(ie.node, ie.context);
        if (ce === T.STOP)
          return T.STOP;
        if (Q.push({ node: ie.node, context: ce, phase: T.EXIT }), ce == null)
          continue;
        for (var Me = ie.node.lastChild; Me; )
          Q.push({ node: Me, context: ce, phase: T.ENTER }), Me = Me.previousSibling;
      } else
        I.exit && I.exit(ie.node, ie.context);
    }
  }
  T.STOP = Symbol("walkDOM.STOP"), T.ENTER = 0, T.EXIT = 1;
  function U(v, k) {
    y(v);
    var I = k || {};
    this.ownerDocument = this, this.contentType = I.contentType || s.XML_APPLICATION, this.type = i(this.contentType) ? "html" : "xml";
  }
  function V(v, k, I) {
    v && v._inc++;
    var Q = I.namespaceURI;
    Q === l.XMLNS && (k._nsMap[I.prefix ? I.localName : ""] = I.value);
  }
  function q(v, k, I, Q) {
    v && v._inc++;
    var ie = I.namespaceURI;
    ie === l.XMLNS && delete k._nsMap[I.prefix ? I.localName : ""];
  }
  function te(v, k, I) {
    if (v && v._inc) {
      v._inc++;
      var Q = k.childNodes;
      if (I && !I.nextSibling)
        Q[Q.length++] = I;
      else {
        for (var ie = k.firstChild, ce = 0; ie; )
          Q[ce++] = ie, ie = ie.nextSibling;
        Q.length = ce, delete Q[Q.length];
      }
    }
  }
  function se(v, k) {
    if (v !== k.parentNode)
      throw new u(u.NOT_FOUND_ERR, "child's parent is not parent");
    var I = k.previousSibling, Q = k.nextSibling;
    return I ? I.nextSibling = Q : v.firstChild = Q, Q ? Q.previousSibling = I : v.lastChild = I, te(v.ownerDocument, v), k.parentNode = null, k.previousSibling = null, k.nextSibling = null, k;
  }
  function re(v) {
    return v && (v.nodeType === S.DOCUMENT_NODE || v.nodeType === S.DOCUMENT_FRAGMENT_NODE || v.nodeType === S.ELEMENT_NODE);
  }
  function fe(v) {
    return v && (v.nodeType === S.CDATA_SECTION_NODE || v.nodeType === S.COMMENT_NODE || v.nodeType === S.DOCUMENT_FRAGMENT_NODE || v.nodeType === S.DOCUMENT_TYPE_NODE || v.nodeType === S.ELEMENT_NODE || v.nodeType === S.PROCESSING_INSTRUCTION_NODE || v.nodeType === S.TEXT_NODE);
  }
  function he(v) {
    return v && v.nodeType === S.DOCUMENT_TYPE_NODE;
  }
  function pe(v) {
    return v && v.nodeType === S.ELEMENT_NODE;
  }
  function Re(v) {
    return v && v.nodeType === S.TEXT_NODE;
  }
  function qe(v, k) {
    var I = v.childNodes || [];
    if (t(I, pe) || he(k))
      return !1;
    var Q = t(I, he);
    return !(k && Q && I.indexOf(Q) > I.indexOf(k));
  }
  function je(v, k) {
    var I = v.childNodes || [];
    function Q(ce) {
      return pe(ce) && ce !== k;
    }
    if (t(I, Q))
      return !1;
    var ie = t(I, he);
    return !(k && ie && I.indexOf(ie) > I.indexOf(k));
  }
  function Ae(v, k, I) {
    if (!re(v))
      throw new u(u.HIERARCHY_REQUEST_ERR, "Unexpected parent node type " + v.nodeType);
    if (I && I.parentNode !== v)
      throw new u(u.NOT_FOUND_ERR, "child not in parent");
    if (
      // 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
      !fe(k) || // 5. If either `node` is a Text node and `parent` is a document,
      // the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
      // || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
      // or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
      he(k) && v.nodeType !== S.DOCUMENT_NODE
    )
      throw new u(
        u.HIERARCHY_REQUEST_ERR,
        "Unexpected node type " + k.nodeType + " for parent node type " + v.nodeType
      );
  }
  function Oe(v, k, I) {
    var Q = v.childNodes || [], ie = k.childNodes || [];
    if (k.nodeType === S.DOCUMENT_FRAGMENT_NODE) {
      var ce = ie.filter(pe);
      if (ce.length > 1 || t(ie, Re))
        throw new u(u.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
      if (ce.length === 1 && !qe(v, I))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
    }
    if (pe(k) && !qe(v, I))
      throw new u(u.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
    if (he(k)) {
      if (t(Q, he))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
      var Me = t(Q, pe);
      if (I && Q.indexOf(Me) < Q.indexOf(I))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
      if (!I && Me)
        throw new u(u.HIERARCHY_REQUEST_ERR, "Doctype can not be appended since element is present");
    }
  }
  function ut(v, k, I) {
    var Q = v.childNodes || [], ie = k.childNodes || [];
    if (k.nodeType === S.DOCUMENT_FRAGMENT_NODE) {
      var ce = ie.filter(pe);
      if (ce.length > 1 || t(ie, Re))
        throw new u(u.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
      if (ce.length === 1 && !je(v, I))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
    }
    if (pe(k) && !je(v, I))
      throw new u(u.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
    if (he(k)) {
      let st = function(ye) {
        return he(ye) && ye !== I;
      };
      var Ze = st;
      if (t(Q, st))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
      var Me = t(Q, pe);
      if (I && Q.indexOf(Me) < Q.indexOf(I))
        throw new u(u.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
    }
  }
  function He(v, k, I, Q) {
    Ae(v, k, I), v.nodeType === S.DOCUMENT_NODE && (Q || Oe)(v, k, I);
    var ie = k.parentNode;
    if (ie && ie.removeChild(k), k.nodeType === Y) {
      var ce = k.firstChild;
      if (ce == null)
        return k;
      var Me = k.lastChild;
    } else
      ce = Me = k;
    var Ze = I ? I.previousSibling : v.lastChild;
    ce.previousSibling = Ze, Me.nextSibling = I, Ze ? Ze.nextSibling = ce : v.firstChild = ce, I == null ? v.lastChild = Me : I.previousSibling = Me;
    do
      ce.parentNode = v;
    while (ce !== Me && (ce = ce.nextSibling));
    return te(v.ownerDocument || v, v, k), k.nodeType == Y && (k.firstChild = k.lastChild = null), k;
  }
  U.prototype = {
    /**
     * The implementation that created this document.
     *
     * @type DOMImplementation
     * @readonly
     */
    implementation: null,
    nodeName: "#document",
    nodeType: L,
    /**
     * The DocumentType node of the document.
     *
     * @type DocumentType
     * @readonly
     */
    doctype: null,
    documentElement: null,
    _inc: 1,
    insertBefore: function(v, k) {
      if (v.nodeType === Y) {
        for (var I = v.firstChild; I; ) {
          var Q = I.nextSibling;
          this.insertBefore(I, k), I = Q;
        }
        return v;
      }
      return He(this, v, k), v.ownerDocument = this, this.documentElement === null && v.nodeType === j && (this.documentElement = v), v;
    },
    removeChild: function(v) {
      var k = se(this, v);
      return k === this.documentElement && (this.documentElement = null), k;
    },
    replaceChild: function(v, k) {
      He(this, v, k, ut), v.ownerDocument = this, k && this.removeChild(k), pe(v) && (this.documentElement = v);
    },
    /**
     * Imports a node from another document into this document, creating a new copy owned by this
     * document. The source node and its subtree are not modified.
     *
     * @param {Node} importedNode
     * The node to import.
     * @param {boolean} deep
     * If true, the contents of the node are recursively imported.
     * If false, only the node itself (and its attributes, if it is an element) are imported.
     * @returns {Node}
     * Returns the newly created import of the node.
     * @see {@link importNode}
     * @see {@link https://dom.spec.whatwg.org/#dom-document-importnode}
     */
    importNode: function(v, k) {
      return wc(this, v, k);
    },
    // Introduced in DOM Level 2:
    getElementById: function(v) {
      var k = null;
      return M(this.documentElement, function(I) {
        if (I.nodeType == j && I.getAttribute("id") == v)
          return k = I, !0;
      }), k;
    },
    /**
     * Creates a new `Element` that is owned by this `Document`.
     * In HTML Documents `localName` is the lower cased `tagName`,
     * otherwise no transformation is being applied.
     * When `contentType` implies the HTML namespace, it will be set as `namespaceURI`.
     *
     * __This implementation differs from the specification:__ - The provided name is not checked
     * against the `Name` production,
     * so no related error will be thrown.
     * - There is no interface `HTMLElement`, it is always an `Element`.
     * - There is no support for a second argument to indicate using custom elements.
     *
     * @param {string} tagName
     * @returns {Element}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
     * @see https://dom.spec.whatwg.org/#dom-document-createelement
     * @see https://dom.spec.whatwg.org/#concept-create-element
     */
    createElement: function(v) {
      var k = new ze(f);
      k.ownerDocument = this, this.type === "html" && (v = v.toLowerCase()), r(this.contentType) && (k.namespaceURI = l.HTML), k.nodeName = v, k.tagName = v, k.localName = v, k.childNodes = new ae();
      var I = k.attributes = new we();
      return I._ownerElement = k, k;
    },
    /**
     * @returns {DocumentFragment}
     */
    createDocumentFragment: function() {
      var v = new Sr(f);
      return v.ownerDocument = this, v.childNodes = new ae(), v;
    },
    /**
     * @param {string} data
     * @returns {Text}
     */
    createTextNode: function(v) {
      var k = new dr(f);
      return k.ownerDocument = this, k.childNodes = new ae(), k.appendData(v), k;
    },
    /**
     * @param {string} data
     * @returns {Comment}
     * @see https://dom.spec.whatwg.org/#dom-document-createcomment
     * @see https://www.w3.org/TR/xml/#NT-Comment XML 1.0 production [15]
     * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.3
     *
     *      Note: no validation is performed at creation time. When the resulting document is
     *      serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
     *      if the comment data contains `--` anywhere, ends with `-`, or contains characters
     *      outside the XML Char production (W3C DOM Parsing §3.2.1.3). Without that option the
     *      data is emitted verbatim.
     */
    createComment: function(v) {
      var k = new Cr(f);
      return k.ownerDocument = this, k.childNodes = new ae(), k.appendData(v), k;
    },
    /**
     * Returns a new CDATASection node whose data is `data`.
     *
     * __This implementation differs from the specification:__ - calling this method on an HTML
     * document does not throw `NotSupportedError`.
     *
     * @param {string} data
     * @returns {CDATASection}
     * @throws {DOMException}
     * With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
     * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
     */
    createCDATASection: function(v) {
      if (v.indexOf("]]>") !== -1)
        throw new u(u.INVALID_CHARACTER_ERR, 'data contains "]]>"');
      var k = new fr(f);
      return k.ownerDocument = this, k.childNodes = new ae(), k.appendData(v), k;
    },
    /**
     * Returns a ProcessingInstruction node whose target is target and data is data.
     *
     * __This behavior is slightly different from the in the specs__:
     * - it does not do any input validation on the arguments and doesn't throw
     * "InvalidCharacterError".
     *
     * Note: When the resulting document is serialized with `requireWellFormed: true`, the
     * serializer throws `InvalidStateError` if `.target` is not a valid XML `NCName` (a `Name`
     * with no colon) or is an ASCII case-insensitive match for `"xml"`, or if `.data` contains
     * `?>` or characters outside the XML Char production (W3C DOM Parsing §3.2.1.7). Without that
     * option the target and data are emitted verbatim.
     *
     * @param {string} target
     * @param {string} data
     * @returns {ProcessingInstruction}
     * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
     * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
     * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
     */
    createProcessingInstruction: function(v, k) {
      var I = new cn(f);
      return I.ownerDocument = this, I.childNodes = new ae(), I.nodeName = I.target = v, I.nodeValue = I.data = k, I;
    },
    /**
     * Creates an `Attr` node that is owned by this document.
     * In HTML Documents `localName` is the lower cased `name`,
     * otherwise no transformation is being applied.
     *
     * __This implementation differs from the specification:__ - The provided name is not checked
     * against the `Name` production,
     * so no related error will be thrown.
     *
     * @param {string} name
     * @returns {Attr}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createAttribute
     * @see https://dom.spec.whatwg.org/#dom-document-createattribute
     */
    createAttribute: function(v) {
      if (!c.QName_exact.test(v))
        throw new u(u.INVALID_CHARACTER_ERR, 'invalid character in name "' + v + '"');
      return this.type === "html" && (v = v.toLowerCase()), this._createAttribute(v);
    },
    _createAttribute: function(v) {
      var k = new kt(f);
      return k.ownerDocument = this, k.childNodes = new ae(), k.name = v, k.nodeName = v, k.localName = v, k.specified = !0, k;
    },
    /**
     * Creates an EntityReference object.
     * The current implementation does not fill the `childNodes` with those of the corresponding
     * `Entity`
     *
     * The `name` is validated against the XML `Name` production at creation time; an invalid name
     * throws `InvalidCharacterError`. When the resulting node is serialized with
     * `requireWellFormed: true`, the serializer re-validates `nodeName` against the XML `Name`
     * production and throws `InvalidStateError` if a later `nodeName` mutation made it invalid;
     * without that option the name is emitted verbatim.
     *
     * __This implementation differs from the specification:__ xmldom does not expand entities —
     * the parser resolves entity references inline and never constructs `EntityReference` nodes,
     * so this method is the only producer.
     *
     * @deprecated
     * In DOM Level 4.
     * @param {string} name
     * The name of the entity to reference. No namespace well-formedness checks are performed.
     * @returns {EntityReference}
     * @throws {DOMException}
     * With code `INVALID_CHARACTER_ERR` when `name` is not a valid XML `Name`.
     * @throws {DOMException}
     * with code `NOT_SUPPORTED_ERR` when the document is of type `html`
     * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE
     */
    createEntityReference: function(v) {
      if (!c.Name_exact.test(v))
        throw new u(u.INVALID_CHARACTER_ERR, 'not a valid xml name "' + v + '"');
      if (this.type === "html")
        throw new u("document is an html document", h.NotSupportedError);
      var k = new un(f);
      return k.ownerDocument = this, k.childNodes = new ae(), k.nodeName = v, k;
    },
    // Introduced in DOM Level 2:
    /**
     * @param {string} namespaceURI
     * @param {string} qualifiedName
     * @returns {Element}
     */
    createElementNS: function(v, k) {
      var I = R(v, k), Q = new ze(f), ie = Q.attributes = new we();
      return Q.childNodes = new ae(), Q.ownerDocument = this, Q.nodeName = k, Q.tagName = k, Q.namespaceURI = I[0], Q.prefix = I[1], Q.localName = I[2], ie._ownerElement = Q, Q;
    },
    // Introduced in DOM Level 2:
    /**
     * @param {string} namespaceURI
     * @param {string} qualifiedName
     * @returns {Attr}
     */
    createAttributeNS: function(v, k) {
      var I = R(v, k), Q = new kt(f);
      return Q.ownerDocument = this, Q.childNodes = new ae(), Q.nodeName = k, Q.name = k, Q.specified = !0, Q.namespaceURI = I[0], Q.prefix = I[1], Q.localName = I[2], Q;
    }
  }, P(U, S);
  function ze(v) {
    y(v), this._nsMap = /* @__PURE__ */ Object.create(null);
  }
  ze.prototype = {
    nodeType: j,
    /**
     * The attributes of this element.
     *
     * @type {NamedNodeMap | null}
     */
    attributes: null,
    getQualifiedName: function() {
      return this.prefix ? this.prefix + ":" + this.localName : this.localName;
    },
    _isInHTMLDocumentAndNamespace: function() {
      return this.ownerDocument.type === "html" && this.namespaceURI === l.HTML;
    },
    /**
     * Implementaton of Level2 Core function hasAttributes.
     *
     * @returns {boolean}
     * True if attribute list is not empty.
     * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-NodeHasAttrs
     */
    hasAttributes: function() {
      return !!(this.attributes && this.attributes.length);
    },
    hasAttribute: function(v) {
      return !!this.getAttributeNode(v);
    },
    /**
     * Returns element’s first attribute whose qualified name is `name`, and `null`
     * if there is no such attribute.
     *
     * @param {string} name
     * @returns {string | null}
     */
    getAttribute: function(v) {
      var k = this.getAttributeNode(v);
      return k ? k.value : null;
    },
    getAttributeNode: function(v) {
      return this._isInHTMLDocumentAndNamespace() && (v = v.toLowerCase()), this.attributes.getNamedItem(v);
    },
    /**
     * Sets the value of element’s first attribute whose qualified name is qualifiedName to value.
     *
     * @param {string} name
     * @param {string} value
     */
    setAttribute: function(v, k) {
      this._isInHTMLDocumentAndNamespace() && (v = v.toLowerCase());
      var I = this.getAttributeNode(v);
      I ? I.value = I.nodeValue = "" + k : (I = this.ownerDocument._createAttribute(v), I.value = I.nodeValue = "" + k, this.setAttributeNode(I));
    },
    removeAttribute: function(v) {
      var k = this.getAttributeNode(v);
      k && this.removeAttributeNode(k);
    },
    setAttributeNode: function(v) {
      return this.attributes.setNamedItem(v);
    },
    setAttributeNodeNS: function(v) {
      return this.attributes.setNamedItemNS(v);
    },
    removeAttributeNode: function(v) {
      return this.attributes.removeNamedItem(v.nodeName);
    },
    //get real attribute name,and remove it by removeAttributeNode
    removeAttributeNS: function(v, k) {
      var I = this.getAttributeNodeNS(v, k);
      I && this.removeAttributeNode(I);
    },
    hasAttributeNS: function(v, k) {
      return this.getAttributeNodeNS(v, k) != null;
    },
    /**
     * Returns element’s attribute whose namespace is `namespaceURI` and local name is
     * `localName`,
     * or `null` if there is no such attribute.
     *
     * @param {string} namespaceURI
     * @param {string} localName
     * @returns {string | null}
     */
    getAttributeNS: function(v, k) {
      var I = this.getAttributeNodeNS(v, k);
      return I ? I.value : null;
    },
    /**
     * Sets the value of element’s attribute whose namespace is `namespaceURI` and local name is
     * `localName` to value.
     *
     * @param {string} namespaceURI
     * @param {string} qualifiedName
     * @param {string} value
     * @see https://dom.spec.whatwg.org/#dom-element-setattributens
     */
    setAttributeNS: function(v, k, I) {
      var Q = R(v, k), ie = Q[2], ce = this.getAttributeNodeNS(v, ie);
      ce ? ce.value = ce.nodeValue = "" + I : (ce = this.ownerDocument.createAttributeNS(v, k), ce.value = ce.nodeValue = "" + I, this.setAttributeNode(ce));
    },
    getAttributeNodeNS: function(v, k) {
      return this.attributes.getNamedItemNS(v, k);
    },
    /**
     * Returns a LiveNodeList of all child elements which have **all** of the given class name(s).
     *
     * Returns an empty list if `classNames` is an empty string or only contains HTML white space
     * characters.
     *
     * Warning: This returns a live LiveNodeList.
     * Changes in the DOM will reflect in the array as the changes occur.
     * If an element selected by this array no longer qualifies for the selector,
     * it will automatically be removed. Be aware of this for iteration purposes.
     *
     * @param {string} classNames
     * Is a string representing the class name(s) to match; multiple class names are separated by
     * (ASCII-)whitespace.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
     * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
     */
    getElementsByClassName: function(v) {
      var k = _(v);
      return new ne(this, function(I) {
        var Q = [];
        return k.length > 0 && M(I, function(ie) {
          if (ie !== I && ie.nodeType === j) {
            var ce = ie.getAttribute("class");
            if (ce) {
              var Me = v === ce;
              if (!Me) {
                var Ze = _(ce);
                Me = k.every(x(Ze));
              }
              Me && Q.push(ie);
            }
          }
        }), Q;
      });
    },
    /**
     * Returns a LiveNodeList of elements with the given qualifiedName.
     * Searching for all descendants can be done by passing `*` as `qualifiedName`.
     *
     * All descendants of the specified element are searched, but not the element itself.
     * The returned list is live, which means it updates itself with the DOM tree automatically.
     * Therefore, there is no need to call `Element.getElementsByTagName()`
     * with the same element and arguments repeatedly if the DOM changes in between calls.
     *
     * When called on an HTML element in an HTML document,
     * `getElementsByTagName` lower-cases the argument before searching for it.
     * This is undesirable when trying to match camel-cased SVG elements (such as
     * `<linearGradient>`) in an HTML document.
     * Instead, use `Element.getElementsByTagNameNS()`,
     * which preserves the capitalization of the tag name.
     *
     * `Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
     * except that it only searches for elements that are descendants of the specified element.
     *
     * @param {string} qualifiedName
     * @returns {LiveNodeList}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
     * @see https://dom.spec.whatwg.org/#concept-getelementsbytagname
     */
    getElementsByTagName: function(v) {
      var k = (this.nodeType === L ? this : this.ownerDocument).type === "html", I = v.toLowerCase();
      return new ne(this, function(Q) {
        var ie = [];
        return M(Q, function(ce) {
          if (!(ce === Q || ce.nodeType !== j))
            if (v === "*")
              ie.push(ce);
            else {
              var Me = ce.getQualifiedName(), Ze = k && ce.namespaceURI === l.HTML ? I : v;
              Me === Ze && ie.push(ce);
            }
        }), ie;
      });
    },
    getElementsByTagNameNS: function(v, k) {
      return new ne(this, function(I) {
        var Q = [];
        return M(I, function(ie) {
          ie !== I && ie.nodeType === j && (v === "*" || ie.namespaceURI === v) && (k === "*" || ie.localName == k) && Q.push(ie);
        }), Q;
      });
    }
  }, U.prototype.getElementsByClassName = ze.prototype.getElementsByClassName, U.prototype.getElementsByTagName = ze.prototype.getElementsByTagName, U.prototype.getElementsByTagNameNS = ze.prototype.getElementsByTagNameNS, P(ze, S);
  function kt(v) {
    y(v), this.namespaceURI = null, this.prefix = null, this.ownerElement = null;
  }
  kt.prototype.nodeType = oe, P(kt, S);
  function mt(v) {
    y(v);
  }
  mt.prototype = {
    data: "",
    substringData: function(v, k) {
      return this.data.substring(v, v + k);
    },
    appendData: function(v) {
      v = this.data + v, this.nodeValue = this.data = v, this.length = v.length;
    },
    insertData: function(v, k) {
      this.replaceData(v, 0, k);
    },
    deleteData: function(v, k) {
      this.replaceData(v, k, "");
    },
    replaceData: function(v, k, I) {
      var Q = this.data.substring(0, v), ie = this.data.substring(v + k);
      I = Q + I + ie, this.nodeValue = this.data = I, this.length = I.length;
    }
  }, P(mt, S);
  function dr(v) {
    y(v);
  }
  dr.prototype = {
    nodeName: "#text",
    nodeType: ue,
    splitText: function(v) {
      var k = this.data, I = k.substring(v);
      k = k.substring(0, v), this.data = this.nodeValue = k, this.length = k.length;
      var Q = this.ownerDocument.createTextNode(I);
      return this.parentNode && this.parentNode.insertBefore(Q, this.nextSibling), Q;
    }
  }, P(dr, mt);
  function Cr(v) {
    y(v);
  }
  Cr.prototype = {
    nodeName: "#comment",
    nodeType: N
  }, P(Cr, mt);
  function fr(v) {
    y(v);
  }
  fr.prototype = {
    nodeName: "#cdata-section",
    nodeType: B
  }, P(fr, dr);
  function Lt(v) {
    y(v);
  }
  Lt.prototype.nodeType = F, P(Lt, S);
  function Kt(v) {
    y(v);
  }
  Kt.prototype.nodeType = ee, P(Kt, S);
  function Ln(v) {
    y(v);
  }
  Ln.prototype.nodeType = w, P(Ln, S);
  function un(v) {
    y(v);
  }
  un.prototype.nodeType = Z, P(un, S);
  function Sr(v) {
    y(v);
  }
  Sr.prototype.nodeName = "#document-fragment", Sr.prototype.nodeType = Y, P(Sr, S);
  function cn(v) {
    y(v);
  }
  cn.prototype.nodeType = E, P(cn, mt);
  function hi() {
  }
  hi.prototype.serializeToString = function(v, k) {
    return it.call(v, k);
  }, S.prototype.toString = it;
  function it(v) {
    var k;
    typeof v == "function" ? k = { requireWellFormed: !1, splitCDATASections: !0, nodeFilter: v } : v != null ? k = {
      requireWellFormed: !!v.requireWellFormed,
      splitCDATASections: v.splitCDATASections !== !1,
      nodeFilter: v.nodeFilter || null
    } : k = { requireWellFormed: !1, splitCDATASections: !0, nodeFilter: null };
    var I = [], Q = this.nodeType === L && this.documentElement || this, ie = Q.prefix, ce = Q.namespaceURI;
    if (ce && ie == null) {
      var ie = Q.lookupPrefix(ce);
      if (ie == null)
        var Me = [
          { namespace: ce, prefix: null }
          //{namespace:uri,prefix:''}
        ];
    }
    return dn(this, I, Me, k), I.join("");
  }
  function ct(v, k, I) {
    var Q = v.prefix || "", ie = v.namespaceURI;
    if (!ie || Q === "xml" && ie === l.XML || ie === l.XMLNS)
      return !1;
    for (var ce = I.length; ce--; ) {
      var Me = I[ce];
      if (Me.prefix === Q)
        return Me.namespace !== ie;
    }
    return !0;
  }
  function Xt(v, k, I, Q) {
    if (Q && !c.QName_exact.test(k))
      throw new u(
        'The attribute name "' + k + '" is not a valid XML QName',
        h.InvalidStateError
      );
    v.push(" ", k, '="', I.replace(/[<>&"\t\n\r]/g, A), '"');
  }
  function dn(v, k, I, Q) {
    I || (I = []);
    var ie = Q.nodeFilter, ce = Q.requireWellFormed, Me = Q.splitCDATASections, Ze = v.nodeType === L ? v : v.ownerDocument, st = Ze.type === "html";
    T(
      v,
      { ns: I },
      {
        enter: function(ye, Dt) {
          var Bt = Dt.ns;
          if (ie)
            if (ye = ie(ye), ye) {
              if (typeof ye == "string")
                return k.push(ye), null;
            } else
              return null;
          switch (ye.nodeType) {
            case j:
              var Yt = ye.attributes, Ft = Yt.length, Rn = ye.tagName, Fr = Rn;
              if (!st && !ye.prefix && ye.namespaceURI) {
                for (var pi, mi = 0; mi < Yt.length; mi++)
                  if (Yt.item(mi).name === "xmlns") {
                    pi = Yt.item(mi).value;
                    break;
                  }
                if (!pi)
                  for (var zr = Bt.length - 1; zr >= 0; zr--) {
                    var qr = Bt[zr];
                    if (qr.prefix === "" && qr.namespace === ye.namespaceURI) {
                      pi = qr.namespace;
                      break;
                    }
                  }
                if (pi !== ye.namespaceURI)
                  for (var zr = Bt.length - 1; zr >= 0; zr--) {
                    var qr = Bt[zr];
                    if (qr.namespace === ye.namespaceURI) {
                      qr.prefix && (Fr = qr.prefix + ":" + Rn);
                      break;
                    }
                  }
              }
              if (ce && !c.QName_exact.test(Fr))
                throw new u(
                  'The element name "' + Fr + '" is not a valid XML QName',
                  h.InvalidStateError
                );
              k.push("<", Fr);
              for (var Tr = Bt.slice(), Hr = 0; Hr < Ft; Hr++) {
                var zt = Yt.item(Hr);
                zt.prefix == "xmlns" ? Tr.push({
                  prefix: zt.localName,
                  namespace: zt.value
                }) : zt.nodeName == "xmlns" && Tr.push({ prefix: "", namespace: zt.value });
              }
              for (var Hr = 0; Hr < Ft; Hr++) {
                var zt = Yt.item(Hr);
                if (ct(zt, st, Tr)) {
                  var wo = zt.prefix || "", Bn = zt.namespaceURI;
                  Xt(k, wo ? "xmlns:" + wo : "xmlns", Bn, ce), Tr.push({ prefix: wo, namespace: Bn });
                }
                var Fn = ie ? ie(zt) : zt;
                Fn && (typeof Fn == "string" ? k.push(Fn) : Xt(k, Fn.name, Fn.value, ce));
              }
              if (Rn === Fr && ct(ye, st, Tr)) {
                var ko = ye.prefix || "", Bn = ye.namespaceURI;
                Xt(k, ko ? "xmlns:" + ko : "xmlns", Bn, ce), Tr.push({ prefix: ko, namespace: Bn });
              }
              var Mo = !ye.firstChild;
              if (Mo && (st || ye.namespaceURI === l.HTML) && (Mo = a(Rn)), Mo)
                return k.push("/>"), null;
              if (k.push(">"), st && o(Rn)) {
                for (var fn = ye.firstChild; fn; )
                  fn.data ? k.push(fn.data) : dn(fn, k, Tr.slice(), Q), fn = fn.nextSibling;
                return k.push("</", Fr, ">"), null;
              }
              return { ns: Tr, tag: Fr };
            case L:
            case Y:
              if (ce && ye.nodeType === L && ye.documentElement == null)
                throw new u("The Document has no documentElement", h.InvalidStateError);
              return { ns: Bt };
            case oe:
              return Xt(k, ye.name, ye.value, ce), null;
            case ue:
              if (ce && c.InvalidChar.test(ye.data))
                throw new u(
                  "The Text node data contains characters outside the XML Char production",
                  h.InvalidStateError
                );
              return k.push(ye.data.replace(/[<&>]/g, A)), null;
            case B:
              if (ce && ye.data.indexOf("]]>") !== -1)
                throw new u('The CDATASection data contains "]]>"', h.InvalidStateError);
              return Me ? k.push(c.CDATA_START, ye.data.replace(/]]>/g, "]]]]><![CDATA[>"), c.CDATA_END) : k.push(c.CDATA_START, ye.data, c.CDATA_END), null;
            case N:
              if (ce) {
                if (c.InvalidChar.test(ye.data))
                  throw new u(
                    "The comment node data contains characters outside the XML Char production",
                    h.InvalidStateError
                  );
                if (ye.data.indexOf("--") !== -1 || ye.data[ye.data.length - 1] === "-")
                  throw new u(
                    'The comment node data contains "--" or ends with "-"',
                    h.InvalidStateError
                  );
              }
              return k.push(c.COMMENT_START, ye.data, c.COMMENT_END), null;
            case F:
              var gi = ye.publicId, hr = ye.systemId;
              if (ce) {
                if (!c.Name_exact.test(ye.name))
                  throw new u(
                    'The doctype name "' + ye.name + '" is not a valid XML Name',
                    h.InvalidStateError
                  );
                if (gi && !c.PubidLiteral_match.test(gi))
                  throw new u("DocumentType publicId is not a valid PubidLiteral", h.InvalidStateError);
                if (hr && hr !== "." && !c.SystemLiteral_match.test(hr))
                  throw new u("DocumentType systemId is not a valid SystemLiteral", h.InvalidStateError);
                if (ye.internalSubset && ye.internalSubset.indexOf("]>") !== -1)
                  throw new u('DocumentType internalSubset contains "]>"', h.InvalidStateError);
              }
              return k.push(c.DOCTYPE_DECL_START, " ", ye.name), gi ? (k.push(" ", c.PUBLIC, " ", gi), hr && hr !== "." && k.push(" ", hr)) : hr && hr !== "." && k.push(" ", c.SYSTEM, " ", hr), ye.internalSubset && k.push(" [", ye.internalSubset, "]"), k.push(">"), null;
            case E:
              if (ce) {
                if (!c.NCName_exact.test(ye.target) || ye.target.toLowerCase() === "xml")
                  throw new u(
                    'The processing instruction target "' + ye.target + '" is not a valid XML NCName or is reserved',
                    h.InvalidStateError
                  );
                if (c.InvalidChar.test(ye.data))
                  throw new u(
                    "The ProcessingInstruction data contains characters outside the XML Char production",
                    h.InvalidStateError
                  );
                if (ye.data.indexOf("?>") !== -1)
                  throw new u('The ProcessingInstruction data contains "?>"', h.InvalidStateError);
              }
              return k.push("<?", ye.target, " ", ye.data, "?>"), null;
            case Z:
              if (ce && !c.Name_exact.test(ye.nodeName))
                throw new u(
                  'The entity reference name "' + ye.nodeName + '" is not a valid XML Name',
                  h.InvalidStateError
                );
              return k.push("&", ye.nodeName, ";"), null;
            //case ENTITY_NODE:
            //case NOTATION_NODE:
            default:
              return k.push("??", ye.nodeName), null;
          }
        },
        exit: function(ye, Dt) {
          Dt && Dt.tag && k.push("</", Dt.tag, ">");
        }
      }
    );
  }
  function wc(v, k, I) {
    var Q;
    return T(k, null, {
      enter: function(ie, ce) {
        var Me = ie.cloneNode(!1);
        Me.ownerDocument = v, Me.parentNode = null, ce === null ? Q = Me : ce.appendChild(Me);
        var Ze = ie.nodeType === oe || I;
        return Ze ? Me : null;
      }
    }), Q;
  }
  function ja(v, k, I) {
    var Q;
    return T(k, null, {
      enter: function(ie, ce) {
        var Me = new ie.constructor(f);
        for (var Ze in ie)
          if (n(ie, Ze)) {
            var st = ie[Ze];
            typeof st != "object" && st != Me[Ze] && (Me[Ze] = st);
          }
        ie.childNodes && (Me.childNodes = new ae()), Me.ownerDocument = v;
        var ye = I;
        switch (Me.nodeType) {
          case j:
            var Dt = ie.attributes, Bt = Me.attributes = new we(), Yt = Dt.length;
            Bt._ownerElement = Me;
            for (var Ft = 0; Ft < Yt; Ft++)
              Me.setAttributeNode(ja(v, Dt.item(Ft), !0));
            break;
          case oe:
            ye = !0;
        }
        return ce !== null ? ce.appendChild(Me) : Q = Me, ye ? Me : null;
      }
    }), Q;
  }
  function Wa(v, k, I) {
    v[k] = I;
  }
  function _o(v) {
    for (var k = [], I = v.firstChild; I; )
      I.nodeType === j && k.push(I), I = I.nextSibling;
    return k;
  }
  try {
    Object.defineProperty && (Object.defineProperty(ne.prototype, "length", {
      get: function() {
        return me(this), this.$$length;
      }
    }), Object.defineProperty(S.prototype, "textContent", {
      get: function() {
        if (this.nodeType === j || this.nodeType === Y) {
          var v = [];
          return T(this, null, {
            enter: function(k) {
              if (k.nodeType === j || k.nodeType === Y)
                return !0;
              if (k.nodeType === E || k.nodeType === N)
                return null;
              v.push(k.nodeValue);
            }
          }), v.join("");
        }
        return this.nodeValue;
      },
      set: function(v) {
        switch (this.nodeType) {
          case j:
          case Y:
            for (; this.firstChild; )
              this.removeChild(this.firstChild);
            (v || String(v)) && this.appendChild(this.ownerDocument.createTextNode(v));
            break;
          default:
            this.data = v, this.value = v, this.nodeValue = v;
        }
      }
    }), Object.defineProperty(mt.prototype, "data", {
      get: function() {
        return this._data != null ? this._data : "";
      },
      set: function(v) {
        this._data = v, this.length = typeof v == "string" ? v.length : 0;
      }
    }), Object.defineProperty(mt.prototype, "nodeValue", {
      get: function() {
        return this.data;
      },
      set: function(v) {
        this.data = v;
      },
      enumerable: !0,
      configurable: !0
    }), Object.defineProperty(ze.prototype, "children", {
      get: function() {
        return new ne(this, _o);
      }
    }), Object.defineProperty(U.prototype, "children", {
      get: function() {
        return new ne(this, _o);
      }
    }), Object.defineProperty(Sr.prototype, "children", {
      get: function() {
        return new ne(this, _o);
      }
    }), Wa = function(v, k, I) {
      v["$$" + k] = I;
    });
  } catch {
  }
  return Qe._updateLiveList = me, Qe.Attr = kt, Qe.CDATASection = fr, Qe.CharacterData = mt, Qe.Comment = Cr, Qe.Document = U, Qe.DocumentFragment = Sr, Qe.DocumentType = Lt, Qe.DOMImplementation = z, Qe.Element = ze, Qe.Entity = Ln, Qe.EntityReference = un, Qe.LiveNodeList = ne, Qe.NamedNodeMap = we, Qe.Node = S, Qe.NodeList = ae, Qe.Notation = Kt, Qe.Text = dr, Qe.ProcessingInstruction = cn, Qe.walkDOM = T, Qe.XMLSerializer = hi, Qe;
}
var Wr = {}, Xo = {}, ll;
function I_() {
  return ll || (ll = 1, (function(e) {
    var t = In().freeze;
    e.XML_ENTITIES = t({
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    }), e.HTML_ENTITIES = t({
      Aacute: "Á",
      aacute: "á",
      Abreve: "Ă",
      abreve: "ă",
      ac: "∾",
      acd: "∿",
      acE: "∾̳",
      Acirc: "Â",
      acirc: "â",
      acute: "´",
      Acy: "А",
      acy: "а",
      AElig: "Æ",
      aelig: "æ",
      af: "⁡",
      Afr: "𝔄",
      afr: "𝔞",
      Agrave: "À",
      agrave: "à",
      alefsym: "ℵ",
      aleph: "ℵ",
      Alpha: "Α",
      alpha: "α",
      Amacr: "Ā",
      amacr: "ā",
      amalg: "⨿",
      AMP: "&",
      amp: "&",
      And: "⩓",
      and: "∧",
      andand: "⩕",
      andd: "⩜",
      andslope: "⩘",
      andv: "⩚",
      ang: "∠",
      ange: "⦤",
      angle: "∠",
      angmsd: "∡",
      angmsdaa: "⦨",
      angmsdab: "⦩",
      angmsdac: "⦪",
      angmsdad: "⦫",
      angmsdae: "⦬",
      angmsdaf: "⦭",
      angmsdag: "⦮",
      angmsdah: "⦯",
      angrt: "∟",
      angrtvb: "⊾",
      angrtvbd: "⦝",
      angsph: "∢",
      angst: "Å",
      angzarr: "⍼",
      Aogon: "Ą",
      aogon: "ą",
      Aopf: "𝔸",
      aopf: "𝕒",
      ap: "≈",
      apacir: "⩯",
      apE: "⩰",
      ape: "≊",
      apid: "≋",
      apos: "'",
      ApplyFunction: "⁡",
      approx: "≈",
      approxeq: "≊",
      Aring: "Å",
      aring: "å",
      Ascr: "𝒜",
      ascr: "𝒶",
      Assign: "≔",
      ast: "*",
      asymp: "≈",
      asympeq: "≍",
      Atilde: "Ã",
      atilde: "ã",
      Auml: "Ä",
      auml: "ä",
      awconint: "∳",
      awint: "⨑",
      backcong: "≌",
      backepsilon: "϶",
      backprime: "‵",
      backsim: "∽",
      backsimeq: "⋍",
      Backslash: "∖",
      Barv: "⫧",
      barvee: "⊽",
      Barwed: "⌆",
      barwed: "⌅",
      barwedge: "⌅",
      bbrk: "⎵",
      bbrktbrk: "⎶",
      bcong: "≌",
      Bcy: "Б",
      bcy: "б",
      bdquo: "„",
      becaus: "∵",
      Because: "∵",
      because: "∵",
      bemptyv: "⦰",
      bepsi: "϶",
      bernou: "ℬ",
      Bernoullis: "ℬ",
      Beta: "Β",
      beta: "β",
      beth: "ℶ",
      between: "≬",
      Bfr: "𝔅",
      bfr: "𝔟",
      bigcap: "⋂",
      bigcirc: "◯",
      bigcup: "⋃",
      bigodot: "⨀",
      bigoplus: "⨁",
      bigotimes: "⨂",
      bigsqcup: "⨆",
      bigstar: "★",
      bigtriangledown: "▽",
      bigtriangleup: "△",
      biguplus: "⨄",
      bigvee: "⋁",
      bigwedge: "⋀",
      bkarow: "⤍",
      blacklozenge: "⧫",
      blacksquare: "▪",
      blacktriangle: "▴",
      blacktriangledown: "▾",
      blacktriangleleft: "◂",
      blacktriangleright: "▸",
      blank: "␣",
      blk12: "▒",
      blk14: "░",
      blk34: "▓",
      block: "█",
      bne: "=⃥",
      bnequiv: "≡⃥",
      bNot: "⫭",
      bnot: "⌐",
      Bopf: "𝔹",
      bopf: "𝕓",
      bot: "⊥",
      bottom: "⊥",
      bowtie: "⋈",
      boxbox: "⧉",
      boxDL: "╗",
      boxDl: "╖",
      boxdL: "╕",
      boxdl: "┐",
      boxDR: "╔",
      boxDr: "╓",
      boxdR: "╒",
      boxdr: "┌",
      boxH: "═",
      boxh: "─",
      boxHD: "╦",
      boxHd: "╤",
      boxhD: "╥",
      boxhd: "┬",
      boxHU: "╩",
      boxHu: "╧",
      boxhU: "╨",
      boxhu: "┴",
      boxminus: "⊟",
      boxplus: "⊞",
      boxtimes: "⊠",
      boxUL: "╝",
      boxUl: "╜",
      boxuL: "╛",
      boxul: "┘",
      boxUR: "╚",
      boxUr: "╙",
      boxuR: "╘",
      boxur: "└",
      boxV: "║",
      boxv: "│",
      boxVH: "╬",
      boxVh: "╫",
      boxvH: "╪",
      boxvh: "┼",
      boxVL: "╣",
      boxVl: "╢",
      boxvL: "╡",
      boxvl: "┤",
      boxVR: "╠",
      boxVr: "╟",
      boxvR: "╞",
      boxvr: "├",
      bprime: "‵",
      Breve: "˘",
      breve: "˘",
      brvbar: "¦",
      Bscr: "ℬ",
      bscr: "𝒷",
      bsemi: "⁏",
      bsim: "∽",
      bsime: "⋍",
      bsol: "\\",
      bsolb: "⧅",
      bsolhsub: "⟈",
      bull: "•",
      bullet: "•",
      bump: "≎",
      bumpE: "⪮",
      bumpe: "≏",
      Bumpeq: "≎",
      bumpeq: "≏",
      Cacute: "Ć",
      cacute: "ć",
      Cap: "⋒",
      cap: "∩",
      capand: "⩄",
      capbrcup: "⩉",
      capcap: "⩋",
      capcup: "⩇",
      capdot: "⩀",
      CapitalDifferentialD: "ⅅ",
      caps: "∩︀",
      caret: "⁁",
      caron: "ˇ",
      Cayleys: "ℭ",
      ccaps: "⩍",
      Ccaron: "Č",
      ccaron: "č",
      Ccedil: "Ç",
      ccedil: "ç",
      Ccirc: "Ĉ",
      ccirc: "ĉ",
      Cconint: "∰",
      ccups: "⩌",
      ccupssm: "⩐",
      Cdot: "Ċ",
      cdot: "ċ",
      cedil: "¸",
      Cedilla: "¸",
      cemptyv: "⦲",
      cent: "¢",
      CenterDot: "·",
      centerdot: "·",
      Cfr: "ℭ",
      cfr: "𝔠",
      CHcy: "Ч",
      chcy: "ч",
      check: "✓",
      checkmark: "✓",
      Chi: "Χ",
      chi: "χ",
      cir: "○",
      circ: "ˆ",
      circeq: "≗",
      circlearrowleft: "↺",
      circlearrowright: "↻",
      circledast: "⊛",
      circledcirc: "⊚",
      circleddash: "⊝",
      CircleDot: "⊙",
      circledR: "®",
      circledS: "Ⓢ",
      CircleMinus: "⊖",
      CirclePlus: "⊕",
      CircleTimes: "⊗",
      cirE: "⧃",
      cire: "≗",
      cirfnint: "⨐",
      cirmid: "⫯",
      cirscir: "⧂",
      ClockwiseContourIntegral: "∲",
      CloseCurlyDoubleQuote: "”",
      CloseCurlyQuote: "’",
      clubs: "♣",
      clubsuit: "♣",
      Colon: "∷",
      colon: ":",
      Colone: "⩴",
      colone: "≔",
      coloneq: "≔",
      comma: ",",
      commat: "@",
      comp: "∁",
      compfn: "∘",
      complement: "∁",
      complexes: "ℂ",
      cong: "≅",
      congdot: "⩭",
      Congruent: "≡",
      Conint: "∯",
      conint: "∮",
      ContourIntegral: "∮",
      Copf: "ℂ",
      copf: "𝕔",
      coprod: "∐",
      Coproduct: "∐",
      COPY: "©",
      copy: "©",
      copysr: "℗",
      CounterClockwiseContourIntegral: "∳",
      crarr: "↵",
      Cross: "⨯",
      cross: "✗",
      Cscr: "𝒞",
      cscr: "𝒸",
      csub: "⫏",
      csube: "⫑",
      csup: "⫐",
      csupe: "⫒",
      ctdot: "⋯",
      cudarrl: "⤸",
      cudarrr: "⤵",
      cuepr: "⋞",
      cuesc: "⋟",
      cularr: "↶",
      cularrp: "⤽",
      Cup: "⋓",
      cup: "∪",
      cupbrcap: "⩈",
      CupCap: "≍",
      cupcap: "⩆",
      cupcup: "⩊",
      cupdot: "⊍",
      cupor: "⩅",
      cups: "∪︀",
      curarr: "↷",
      curarrm: "⤼",
      curlyeqprec: "⋞",
      curlyeqsucc: "⋟",
      curlyvee: "⋎",
      curlywedge: "⋏",
      curren: "¤",
      curvearrowleft: "↶",
      curvearrowright: "↷",
      cuvee: "⋎",
      cuwed: "⋏",
      cwconint: "∲",
      cwint: "∱",
      cylcty: "⌭",
      Dagger: "‡",
      dagger: "†",
      daleth: "ℸ",
      Darr: "↡",
      dArr: "⇓",
      darr: "↓",
      dash: "‐",
      Dashv: "⫤",
      dashv: "⊣",
      dbkarow: "⤏",
      dblac: "˝",
      Dcaron: "Ď",
      dcaron: "ď",
      Dcy: "Д",
      dcy: "д",
      DD: "ⅅ",
      dd: "ⅆ",
      ddagger: "‡",
      ddarr: "⇊",
      DDotrahd: "⤑",
      ddotseq: "⩷",
      deg: "°",
      Del: "∇",
      Delta: "Δ",
      delta: "δ",
      demptyv: "⦱",
      dfisht: "⥿",
      Dfr: "𝔇",
      dfr: "𝔡",
      dHar: "⥥",
      dharl: "⇃",
      dharr: "⇂",
      DiacriticalAcute: "´",
      DiacriticalDot: "˙",
      DiacriticalDoubleAcute: "˝",
      DiacriticalGrave: "`",
      DiacriticalTilde: "˜",
      diam: "⋄",
      Diamond: "⋄",
      diamond: "⋄",
      diamondsuit: "♦",
      diams: "♦",
      die: "¨",
      DifferentialD: "ⅆ",
      digamma: "ϝ",
      disin: "⋲",
      div: "÷",
      divide: "÷",
      divideontimes: "⋇",
      divonx: "⋇",
      DJcy: "Ђ",
      djcy: "ђ",
      dlcorn: "⌞",
      dlcrop: "⌍",
      dollar: "$",
      Dopf: "𝔻",
      dopf: "𝕕",
      Dot: "¨",
      dot: "˙",
      DotDot: "⃜",
      doteq: "≐",
      doteqdot: "≑",
      DotEqual: "≐",
      dotminus: "∸",
      dotplus: "∔",
      dotsquare: "⊡",
      doublebarwedge: "⌆",
      DoubleContourIntegral: "∯",
      DoubleDot: "¨",
      DoubleDownArrow: "⇓",
      DoubleLeftArrow: "⇐",
      DoubleLeftRightArrow: "⇔",
      DoubleLeftTee: "⫤",
      DoubleLongLeftArrow: "⟸",
      DoubleLongLeftRightArrow: "⟺",
      DoubleLongRightArrow: "⟹",
      DoubleRightArrow: "⇒",
      DoubleRightTee: "⊨",
      DoubleUpArrow: "⇑",
      DoubleUpDownArrow: "⇕",
      DoubleVerticalBar: "∥",
      DownArrow: "↓",
      Downarrow: "⇓",
      downarrow: "↓",
      DownArrowBar: "⤓",
      DownArrowUpArrow: "⇵",
      DownBreve: "̑",
      downdownarrows: "⇊",
      downharpoonleft: "⇃",
      downharpoonright: "⇂",
      DownLeftRightVector: "⥐",
      DownLeftTeeVector: "⥞",
      DownLeftVector: "↽",
      DownLeftVectorBar: "⥖",
      DownRightTeeVector: "⥟",
      DownRightVector: "⇁",
      DownRightVectorBar: "⥗",
      DownTee: "⊤",
      DownTeeArrow: "↧",
      drbkarow: "⤐",
      drcorn: "⌟",
      drcrop: "⌌",
      Dscr: "𝒟",
      dscr: "𝒹",
      DScy: "Ѕ",
      dscy: "ѕ",
      dsol: "⧶",
      Dstrok: "Đ",
      dstrok: "đ",
      dtdot: "⋱",
      dtri: "▿",
      dtrif: "▾",
      duarr: "⇵",
      duhar: "⥯",
      dwangle: "⦦",
      DZcy: "Џ",
      dzcy: "џ",
      dzigrarr: "⟿",
      Eacute: "É",
      eacute: "é",
      easter: "⩮",
      Ecaron: "Ě",
      ecaron: "ě",
      ecir: "≖",
      Ecirc: "Ê",
      ecirc: "ê",
      ecolon: "≕",
      Ecy: "Э",
      ecy: "э",
      eDDot: "⩷",
      Edot: "Ė",
      eDot: "≑",
      edot: "ė",
      ee: "ⅇ",
      efDot: "≒",
      Efr: "𝔈",
      efr: "𝔢",
      eg: "⪚",
      Egrave: "È",
      egrave: "è",
      egs: "⪖",
      egsdot: "⪘",
      el: "⪙",
      Element: "∈",
      elinters: "⏧",
      ell: "ℓ",
      els: "⪕",
      elsdot: "⪗",
      Emacr: "Ē",
      emacr: "ē",
      empty: "∅",
      emptyset: "∅",
      EmptySmallSquare: "◻",
      emptyv: "∅",
      EmptyVerySmallSquare: "▫",
      emsp: " ",
      emsp13: " ",
      emsp14: " ",
      ENG: "Ŋ",
      eng: "ŋ",
      ensp: " ",
      Eogon: "Ę",
      eogon: "ę",
      Eopf: "𝔼",
      eopf: "𝕖",
      epar: "⋕",
      eparsl: "⧣",
      eplus: "⩱",
      epsi: "ε",
      Epsilon: "Ε",
      epsilon: "ε",
      epsiv: "ϵ",
      eqcirc: "≖",
      eqcolon: "≕",
      eqsim: "≂",
      eqslantgtr: "⪖",
      eqslantless: "⪕",
      Equal: "⩵",
      equals: "=",
      EqualTilde: "≂",
      equest: "≟",
      Equilibrium: "⇌",
      equiv: "≡",
      equivDD: "⩸",
      eqvparsl: "⧥",
      erarr: "⥱",
      erDot: "≓",
      Escr: "ℰ",
      escr: "ℯ",
      esdot: "≐",
      Esim: "⩳",
      esim: "≂",
      Eta: "Η",
      eta: "η",
      ETH: "Ð",
      eth: "ð",
      Euml: "Ë",
      euml: "ë",
      euro: "€",
      excl: "!",
      exist: "∃",
      Exists: "∃",
      expectation: "ℰ",
      ExponentialE: "ⅇ",
      exponentiale: "ⅇ",
      fallingdotseq: "≒",
      Fcy: "Ф",
      fcy: "ф",
      female: "♀",
      ffilig: "ﬃ",
      fflig: "ﬀ",
      ffllig: "ﬄ",
      Ffr: "𝔉",
      ffr: "𝔣",
      filig: "ﬁ",
      FilledSmallSquare: "◼",
      FilledVerySmallSquare: "▪",
      fjlig: "fj",
      flat: "♭",
      fllig: "ﬂ",
      fltns: "▱",
      fnof: "ƒ",
      Fopf: "𝔽",
      fopf: "𝕗",
      ForAll: "∀",
      forall: "∀",
      fork: "⋔",
      forkv: "⫙",
      Fouriertrf: "ℱ",
      fpartint: "⨍",
      frac12: "½",
      frac13: "⅓",
      frac14: "¼",
      frac15: "⅕",
      frac16: "⅙",
      frac18: "⅛",
      frac23: "⅔",
      frac25: "⅖",
      frac34: "¾",
      frac35: "⅗",
      frac38: "⅜",
      frac45: "⅘",
      frac56: "⅚",
      frac58: "⅝",
      frac78: "⅞",
      frasl: "⁄",
      frown: "⌢",
      Fscr: "ℱ",
      fscr: "𝒻",
      gacute: "ǵ",
      Gamma: "Γ",
      gamma: "γ",
      Gammad: "Ϝ",
      gammad: "ϝ",
      gap: "⪆",
      Gbreve: "Ğ",
      gbreve: "ğ",
      Gcedil: "Ģ",
      Gcirc: "Ĝ",
      gcirc: "ĝ",
      Gcy: "Г",
      gcy: "г",
      Gdot: "Ġ",
      gdot: "ġ",
      gE: "≧",
      ge: "≥",
      gEl: "⪌",
      gel: "⋛",
      geq: "≥",
      geqq: "≧",
      geqslant: "⩾",
      ges: "⩾",
      gescc: "⪩",
      gesdot: "⪀",
      gesdoto: "⪂",
      gesdotol: "⪄",
      gesl: "⋛︀",
      gesles: "⪔",
      Gfr: "𝔊",
      gfr: "𝔤",
      Gg: "⋙",
      gg: "≫",
      ggg: "⋙",
      gimel: "ℷ",
      GJcy: "Ѓ",
      gjcy: "ѓ",
      gl: "≷",
      gla: "⪥",
      glE: "⪒",
      glj: "⪤",
      gnap: "⪊",
      gnapprox: "⪊",
      gnE: "≩",
      gne: "⪈",
      gneq: "⪈",
      gneqq: "≩",
      gnsim: "⋧",
      Gopf: "𝔾",
      gopf: "𝕘",
      grave: "`",
      GreaterEqual: "≥",
      GreaterEqualLess: "⋛",
      GreaterFullEqual: "≧",
      GreaterGreater: "⪢",
      GreaterLess: "≷",
      GreaterSlantEqual: "⩾",
      GreaterTilde: "≳",
      Gscr: "𝒢",
      gscr: "ℊ",
      gsim: "≳",
      gsime: "⪎",
      gsiml: "⪐",
      Gt: "≫",
      GT: ">",
      gt: ">",
      gtcc: "⪧",
      gtcir: "⩺",
      gtdot: "⋗",
      gtlPar: "⦕",
      gtquest: "⩼",
      gtrapprox: "⪆",
      gtrarr: "⥸",
      gtrdot: "⋗",
      gtreqless: "⋛",
      gtreqqless: "⪌",
      gtrless: "≷",
      gtrsim: "≳",
      gvertneqq: "≩︀",
      gvnE: "≩︀",
      Hacek: "ˇ",
      hairsp: " ",
      half: "½",
      hamilt: "ℋ",
      HARDcy: "Ъ",
      hardcy: "ъ",
      hArr: "⇔",
      harr: "↔",
      harrcir: "⥈",
      harrw: "↭",
      Hat: "^",
      hbar: "ℏ",
      Hcirc: "Ĥ",
      hcirc: "ĥ",
      hearts: "♥",
      heartsuit: "♥",
      hellip: "…",
      hercon: "⊹",
      Hfr: "ℌ",
      hfr: "𝔥",
      HilbertSpace: "ℋ",
      hksearow: "⤥",
      hkswarow: "⤦",
      hoarr: "⇿",
      homtht: "∻",
      hookleftarrow: "↩",
      hookrightarrow: "↪",
      Hopf: "ℍ",
      hopf: "𝕙",
      horbar: "―",
      HorizontalLine: "─",
      Hscr: "ℋ",
      hscr: "𝒽",
      hslash: "ℏ",
      Hstrok: "Ħ",
      hstrok: "ħ",
      HumpDownHump: "≎",
      HumpEqual: "≏",
      hybull: "⁃",
      hyphen: "‐",
      Iacute: "Í",
      iacute: "í",
      ic: "⁣",
      Icirc: "Î",
      icirc: "î",
      Icy: "И",
      icy: "и",
      Idot: "İ",
      IEcy: "Е",
      iecy: "е",
      iexcl: "¡",
      iff: "⇔",
      Ifr: "ℑ",
      ifr: "𝔦",
      Igrave: "Ì",
      igrave: "ì",
      ii: "ⅈ",
      iiiint: "⨌",
      iiint: "∭",
      iinfin: "⧜",
      iiota: "℩",
      IJlig: "Ĳ",
      ijlig: "ĳ",
      Im: "ℑ",
      Imacr: "Ī",
      imacr: "ī",
      image: "ℑ",
      ImaginaryI: "ⅈ",
      imagline: "ℐ",
      imagpart: "ℑ",
      imath: "ı",
      imof: "⊷",
      imped: "Ƶ",
      Implies: "⇒",
      in: "∈",
      incare: "℅",
      infin: "∞",
      infintie: "⧝",
      inodot: "ı",
      Int: "∬",
      int: "∫",
      intcal: "⊺",
      integers: "ℤ",
      Integral: "∫",
      intercal: "⊺",
      Intersection: "⋂",
      intlarhk: "⨗",
      intprod: "⨼",
      InvisibleComma: "⁣",
      InvisibleTimes: "⁢",
      IOcy: "Ё",
      iocy: "ё",
      Iogon: "Į",
      iogon: "į",
      Iopf: "𝕀",
      iopf: "𝕚",
      Iota: "Ι",
      iota: "ι",
      iprod: "⨼",
      iquest: "¿",
      Iscr: "ℐ",
      iscr: "𝒾",
      isin: "∈",
      isindot: "⋵",
      isinE: "⋹",
      isins: "⋴",
      isinsv: "⋳",
      isinv: "∈",
      it: "⁢",
      Itilde: "Ĩ",
      itilde: "ĩ",
      Iukcy: "І",
      iukcy: "і",
      Iuml: "Ï",
      iuml: "ï",
      Jcirc: "Ĵ",
      jcirc: "ĵ",
      Jcy: "Й",
      jcy: "й",
      Jfr: "𝔍",
      jfr: "𝔧",
      jmath: "ȷ",
      Jopf: "𝕁",
      jopf: "𝕛",
      Jscr: "𝒥",
      jscr: "𝒿",
      Jsercy: "Ј",
      jsercy: "ј",
      Jukcy: "Є",
      jukcy: "є",
      Kappa: "Κ",
      kappa: "κ",
      kappav: "ϰ",
      Kcedil: "Ķ",
      kcedil: "ķ",
      Kcy: "К",
      kcy: "к",
      Kfr: "𝔎",
      kfr: "𝔨",
      kgreen: "ĸ",
      KHcy: "Х",
      khcy: "х",
      KJcy: "Ќ",
      kjcy: "ќ",
      Kopf: "𝕂",
      kopf: "𝕜",
      Kscr: "𝒦",
      kscr: "𝓀",
      lAarr: "⇚",
      Lacute: "Ĺ",
      lacute: "ĺ",
      laemptyv: "⦴",
      lagran: "ℒ",
      Lambda: "Λ",
      lambda: "λ",
      Lang: "⟪",
      lang: "⟨",
      langd: "⦑",
      langle: "⟨",
      lap: "⪅",
      Laplacetrf: "ℒ",
      laquo: "«",
      Larr: "↞",
      lArr: "⇐",
      larr: "←",
      larrb: "⇤",
      larrbfs: "⤟",
      larrfs: "⤝",
      larrhk: "↩",
      larrlp: "↫",
      larrpl: "⤹",
      larrsim: "⥳",
      larrtl: "↢",
      lat: "⪫",
      lAtail: "⤛",
      latail: "⤙",
      late: "⪭",
      lates: "⪭︀",
      lBarr: "⤎",
      lbarr: "⤌",
      lbbrk: "❲",
      lbrace: "{",
      lbrack: "[",
      lbrke: "⦋",
      lbrksld: "⦏",
      lbrkslu: "⦍",
      Lcaron: "Ľ",
      lcaron: "ľ",
      Lcedil: "Ļ",
      lcedil: "ļ",
      lceil: "⌈",
      lcub: "{",
      Lcy: "Л",
      lcy: "л",
      ldca: "⤶",
      ldquo: "“",
      ldquor: "„",
      ldrdhar: "⥧",
      ldrushar: "⥋",
      ldsh: "↲",
      lE: "≦",
      le: "≤",
      LeftAngleBracket: "⟨",
      LeftArrow: "←",
      Leftarrow: "⇐",
      leftarrow: "←",
      LeftArrowBar: "⇤",
      LeftArrowRightArrow: "⇆",
      leftarrowtail: "↢",
      LeftCeiling: "⌈",
      LeftDoubleBracket: "⟦",
      LeftDownTeeVector: "⥡",
      LeftDownVector: "⇃",
      LeftDownVectorBar: "⥙",
      LeftFloor: "⌊",
      leftharpoondown: "↽",
      leftharpoonup: "↼",
      leftleftarrows: "⇇",
      LeftRightArrow: "↔",
      Leftrightarrow: "⇔",
      leftrightarrow: "↔",
      leftrightarrows: "⇆",
      leftrightharpoons: "⇋",
      leftrightsquigarrow: "↭",
      LeftRightVector: "⥎",
      LeftTee: "⊣",
      LeftTeeArrow: "↤",
      LeftTeeVector: "⥚",
      leftthreetimes: "⋋",
      LeftTriangle: "⊲",
      LeftTriangleBar: "⧏",
      LeftTriangleEqual: "⊴",
      LeftUpDownVector: "⥑",
      LeftUpTeeVector: "⥠",
      LeftUpVector: "↿",
      LeftUpVectorBar: "⥘",
      LeftVector: "↼",
      LeftVectorBar: "⥒",
      lEg: "⪋",
      leg: "⋚",
      leq: "≤",
      leqq: "≦",
      leqslant: "⩽",
      les: "⩽",
      lescc: "⪨",
      lesdot: "⩿",
      lesdoto: "⪁",
      lesdotor: "⪃",
      lesg: "⋚︀",
      lesges: "⪓",
      lessapprox: "⪅",
      lessdot: "⋖",
      lesseqgtr: "⋚",
      lesseqqgtr: "⪋",
      LessEqualGreater: "⋚",
      LessFullEqual: "≦",
      LessGreater: "≶",
      lessgtr: "≶",
      LessLess: "⪡",
      lesssim: "≲",
      LessSlantEqual: "⩽",
      LessTilde: "≲",
      lfisht: "⥼",
      lfloor: "⌊",
      Lfr: "𝔏",
      lfr: "𝔩",
      lg: "≶",
      lgE: "⪑",
      lHar: "⥢",
      lhard: "↽",
      lharu: "↼",
      lharul: "⥪",
      lhblk: "▄",
      LJcy: "Љ",
      ljcy: "љ",
      Ll: "⋘",
      ll: "≪",
      llarr: "⇇",
      llcorner: "⌞",
      Lleftarrow: "⇚",
      llhard: "⥫",
      lltri: "◺",
      Lmidot: "Ŀ",
      lmidot: "ŀ",
      lmoust: "⎰",
      lmoustache: "⎰",
      lnap: "⪉",
      lnapprox: "⪉",
      lnE: "≨",
      lne: "⪇",
      lneq: "⪇",
      lneqq: "≨",
      lnsim: "⋦",
      loang: "⟬",
      loarr: "⇽",
      lobrk: "⟦",
      LongLeftArrow: "⟵",
      Longleftarrow: "⟸",
      longleftarrow: "⟵",
      LongLeftRightArrow: "⟷",
      Longleftrightarrow: "⟺",
      longleftrightarrow: "⟷",
      longmapsto: "⟼",
      LongRightArrow: "⟶",
      Longrightarrow: "⟹",
      longrightarrow: "⟶",
      looparrowleft: "↫",
      looparrowright: "↬",
      lopar: "⦅",
      Lopf: "𝕃",
      lopf: "𝕝",
      loplus: "⨭",
      lotimes: "⨴",
      lowast: "∗",
      lowbar: "_",
      LowerLeftArrow: "↙",
      LowerRightArrow: "↘",
      loz: "◊",
      lozenge: "◊",
      lozf: "⧫",
      lpar: "(",
      lparlt: "⦓",
      lrarr: "⇆",
      lrcorner: "⌟",
      lrhar: "⇋",
      lrhard: "⥭",
      lrm: "‎",
      lrtri: "⊿",
      lsaquo: "‹",
      Lscr: "ℒ",
      lscr: "𝓁",
      Lsh: "↰",
      lsh: "↰",
      lsim: "≲",
      lsime: "⪍",
      lsimg: "⪏",
      lsqb: "[",
      lsquo: "‘",
      lsquor: "‚",
      Lstrok: "Ł",
      lstrok: "ł",
      Lt: "≪",
      LT: "<",
      lt: "<",
      ltcc: "⪦",
      ltcir: "⩹",
      ltdot: "⋖",
      lthree: "⋋",
      ltimes: "⋉",
      ltlarr: "⥶",
      ltquest: "⩻",
      ltri: "◃",
      ltrie: "⊴",
      ltrif: "◂",
      ltrPar: "⦖",
      lurdshar: "⥊",
      luruhar: "⥦",
      lvertneqq: "≨︀",
      lvnE: "≨︀",
      macr: "¯",
      male: "♂",
      malt: "✠",
      maltese: "✠",
      Map: "⤅",
      map: "↦",
      mapsto: "↦",
      mapstodown: "↧",
      mapstoleft: "↤",
      mapstoup: "↥",
      marker: "▮",
      mcomma: "⨩",
      Mcy: "М",
      mcy: "м",
      mdash: "—",
      mDDot: "∺",
      measuredangle: "∡",
      MediumSpace: " ",
      Mellintrf: "ℳ",
      Mfr: "𝔐",
      mfr: "𝔪",
      mho: "℧",
      micro: "µ",
      mid: "∣",
      midast: "*",
      midcir: "⫰",
      middot: "·",
      minus: "−",
      minusb: "⊟",
      minusd: "∸",
      minusdu: "⨪",
      MinusPlus: "∓",
      mlcp: "⫛",
      mldr: "…",
      mnplus: "∓",
      models: "⊧",
      Mopf: "𝕄",
      mopf: "𝕞",
      mp: "∓",
      Mscr: "ℳ",
      mscr: "𝓂",
      mstpos: "∾",
      Mu: "Μ",
      mu: "μ",
      multimap: "⊸",
      mumap: "⊸",
      nabla: "∇",
      Nacute: "Ń",
      nacute: "ń",
      nang: "∠⃒",
      nap: "≉",
      napE: "⩰̸",
      napid: "≋̸",
      napos: "ŉ",
      napprox: "≉",
      natur: "♮",
      natural: "♮",
      naturals: "ℕ",
      nbsp: " ",
      nbump: "≎̸",
      nbumpe: "≏̸",
      ncap: "⩃",
      Ncaron: "Ň",
      ncaron: "ň",
      Ncedil: "Ņ",
      ncedil: "ņ",
      ncong: "≇",
      ncongdot: "⩭̸",
      ncup: "⩂",
      Ncy: "Н",
      ncy: "н",
      ndash: "–",
      ne: "≠",
      nearhk: "⤤",
      neArr: "⇗",
      nearr: "↗",
      nearrow: "↗",
      nedot: "≐̸",
      NegativeMediumSpace: "​",
      NegativeThickSpace: "​",
      NegativeThinSpace: "​",
      NegativeVeryThinSpace: "​",
      nequiv: "≢",
      nesear: "⤨",
      nesim: "≂̸",
      NestedGreaterGreater: "≫",
      NestedLessLess: "≪",
      NewLine: `
`,
      nexist: "∄",
      nexists: "∄",
      Nfr: "𝔑",
      nfr: "𝔫",
      ngE: "≧̸",
      nge: "≱",
      ngeq: "≱",
      ngeqq: "≧̸",
      ngeqslant: "⩾̸",
      nges: "⩾̸",
      nGg: "⋙̸",
      ngsim: "≵",
      nGt: "≫⃒",
      ngt: "≯",
      ngtr: "≯",
      nGtv: "≫̸",
      nhArr: "⇎",
      nharr: "↮",
      nhpar: "⫲",
      ni: "∋",
      nis: "⋼",
      nisd: "⋺",
      niv: "∋",
      NJcy: "Њ",
      njcy: "њ",
      nlArr: "⇍",
      nlarr: "↚",
      nldr: "‥",
      nlE: "≦̸",
      nle: "≰",
      nLeftarrow: "⇍",
      nleftarrow: "↚",
      nLeftrightarrow: "⇎",
      nleftrightarrow: "↮",
      nleq: "≰",
      nleqq: "≦̸",
      nleqslant: "⩽̸",
      nles: "⩽̸",
      nless: "≮",
      nLl: "⋘̸",
      nlsim: "≴",
      nLt: "≪⃒",
      nlt: "≮",
      nltri: "⋪",
      nltrie: "⋬",
      nLtv: "≪̸",
      nmid: "∤",
      NoBreak: "⁠",
      NonBreakingSpace: " ",
      Nopf: "ℕ",
      nopf: "𝕟",
      Not: "⫬",
      not: "¬",
      NotCongruent: "≢",
      NotCupCap: "≭",
      NotDoubleVerticalBar: "∦",
      NotElement: "∉",
      NotEqual: "≠",
      NotEqualTilde: "≂̸",
      NotExists: "∄",
      NotGreater: "≯",
      NotGreaterEqual: "≱",
      NotGreaterFullEqual: "≧̸",
      NotGreaterGreater: "≫̸",
      NotGreaterLess: "≹",
      NotGreaterSlantEqual: "⩾̸",
      NotGreaterTilde: "≵",
      NotHumpDownHump: "≎̸",
      NotHumpEqual: "≏̸",
      notin: "∉",
      notindot: "⋵̸",
      notinE: "⋹̸",
      notinva: "∉",
      notinvb: "⋷",
      notinvc: "⋶",
      NotLeftTriangle: "⋪",
      NotLeftTriangleBar: "⧏̸",
      NotLeftTriangleEqual: "⋬",
      NotLess: "≮",
      NotLessEqual: "≰",
      NotLessGreater: "≸",
      NotLessLess: "≪̸",
      NotLessSlantEqual: "⩽̸",
      NotLessTilde: "≴",
      NotNestedGreaterGreater: "⪢̸",
      NotNestedLessLess: "⪡̸",
      notni: "∌",
      notniva: "∌",
      notnivb: "⋾",
      notnivc: "⋽",
      NotPrecedes: "⊀",
      NotPrecedesEqual: "⪯̸",
      NotPrecedesSlantEqual: "⋠",
      NotReverseElement: "∌",
      NotRightTriangle: "⋫",
      NotRightTriangleBar: "⧐̸",
      NotRightTriangleEqual: "⋭",
      NotSquareSubset: "⊏̸",
      NotSquareSubsetEqual: "⋢",
      NotSquareSuperset: "⊐̸",
      NotSquareSupersetEqual: "⋣",
      NotSubset: "⊂⃒",
      NotSubsetEqual: "⊈",
      NotSucceeds: "⊁",
      NotSucceedsEqual: "⪰̸",
      NotSucceedsSlantEqual: "⋡",
      NotSucceedsTilde: "≿̸",
      NotSuperset: "⊃⃒",
      NotSupersetEqual: "⊉",
      NotTilde: "≁",
      NotTildeEqual: "≄",
      NotTildeFullEqual: "≇",
      NotTildeTilde: "≉",
      NotVerticalBar: "∤",
      npar: "∦",
      nparallel: "∦",
      nparsl: "⫽⃥",
      npart: "∂̸",
      npolint: "⨔",
      npr: "⊀",
      nprcue: "⋠",
      npre: "⪯̸",
      nprec: "⊀",
      npreceq: "⪯̸",
      nrArr: "⇏",
      nrarr: "↛",
      nrarrc: "⤳̸",
      nrarrw: "↝̸",
      nRightarrow: "⇏",
      nrightarrow: "↛",
      nrtri: "⋫",
      nrtrie: "⋭",
      nsc: "⊁",
      nsccue: "⋡",
      nsce: "⪰̸",
      Nscr: "𝒩",
      nscr: "𝓃",
      nshortmid: "∤",
      nshortparallel: "∦",
      nsim: "≁",
      nsime: "≄",
      nsimeq: "≄",
      nsmid: "∤",
      nspar: "∦",
      nsqsube: "⋢",
      nsqsupe: "⋣",
      nsub: "⊄",
      nsubE: "⫅̸",
      nsube: "⊈",
      nsubset: "⊂⃒",
      nsubseteq: "⊈",
      nsubseteqq: "⫅̸",
      nsucc: "⊁",
      nsucceq: "⪰̸",
      nsup: "⊅",
      nsupE: "⫆̸",
      nsupe: "⊉",
      nsupset: "⊃⃒",
      nsupseteq: "⊉",
      nsupseteqq: "⫆̸",
      ntgl: "≹",
      Ntilde: "Ñ",
      ntilde: "ñ",
      ntlg: "≸",
      ntriangleleft: "⋪",
      ntrianglelefteq: "⋬",
      ntriangleright: "⋫",
      ntrianglerighteq: "⋭",
      Nu: "Ν",
      nu: "ν",
      num: "#",
      numero: "№",
      numsp: " ",
      nvap: "≍⃒",
      nVDash: "⊯",
      nVdash: "⊮",
      nvDash: "⊭",
      nvdash: "⊬",
      nvge: "≥⃒",
      nvgt: ">⃒",
      nvHarr: "⤄",
      nvinfin: "⧞",
      nvlArr: "⤂",
      nvle: "≤⃒",
      nvlt: "<⃒",
      nvltrie: "⊴⃒",
      nvrArr: "⤃",
      nvrtrie: "⊵⃒",
      nvsim: "∼⃒",
      nwarhk: "⤣",
      nwArr: "⇖",
      nwarr: "↖",
      nwarrow: "↖",
      nwnear: "⤧",
      Oacute: "Ó",
      oacute: "ó",
      oast: "⊛",
      ocir: "⊚",
      Ocirc: "Ô",
      ocirc: "ô",
      Ocy: "О",
      ocy: "о",
      odash: "⊝",
      Odblac: "Ő",
      odblac: "ő",
      odiv: "⨸",
      odot: "⊙",
      odsold: "⦼",
      OElig: "Œ",
      oelig: "œ",
      ofcir: "⦿",
      Ofr: "𝔒",
      ofr: "𝔬",
      ogon: "˛",
      Ograve: "Ò",
      ograve: "ò",
      ogt: "⧁",
      ohbar: "⦵",
      ohm: "Ω",
      oint: "∮",
      olarr: "↺",
      olcir: "⦾",
      olcross: "⦻",
      oline: "‾",
      olt: "⧀",
      Omacr: "Ō",
      omacr: "ō",
      Omega: "Ω",
      omega: "ω",
      Omicron: "Ο",
      omicron: "ο",
      omid: "⦶",
      ominus: "⊖",
      Oopf: "𝕆",
      oopf: "𝕠",
      opar: "⦷",
      OpenCurlyDoubleQuote: "“",
      OpenCurlyQuote: "‘",
      operp: "⦹",
      oplus: "⊕",
      Or: "⩔",
      or: "∨",
      orarr: "↻",
      ord: "⩝",
      order: "ℴ",
      orderof: "ℴ",
      ordf: "ª",
      ordm: "º",
      origof: "⊶",
      oror: "⩖",
      orslope: "⩗",
      orv: "⩛",
      oS: "Ⓢ",
      Oscr: "𝒪",
      oscr: "ℴ",
      Oslash: "Ø",
      oslash: "ø",
      osol: "⊘",
      Otilde: "Õ",
      otilde: "õ",
      Otimes: "⨷",
      otimes: "⊗",
      otimesas: "⨶",
      Ouml: "Ö",
      ouml: "ö",
      ovbar: "⌽",
      OverBar: "‾",
      OverBrace: "⏞",
      OverBracket: "⎴",
      OverParenthesis: "⏜",
      par: "∥",
      para: "¶",
      parallel: "∥",
      parsim: "⫳",
      parsl: "⫽",
      part: "∂",
      PartialD: "∂",
      Pcy: "П",
      pcy: "п",
      percnt: "%",
      period: ".",
      permil: "‰",
      perp: "⊥",
      pertenk: "‱",
      Pfr: "𝔓",
      pfr: "𝔭",
      Phi: "Φ",
      phi: "φ",
      phiv: "ϕ",
      phmmat: "ℳ",
      phone: "☎",
      Pi: "Π",
      pi: "π",
      pitchfork: "⋔",
      piv: "ϖ",
      planck: "ℏ",
      planckh: "ℎ",
      plankv: "ℏ",
      plus: "+",
      plusacir: "⨣",
      plusb: "⊞",
      pluscir: "⨢",
      plusdo: "∔",
      plusdu: "⨥",
      pluse: "⩲",
      PlusMinus: "±",
      plusmn: "±",
      plussim: "⨦",
      plustwo: "⨧",
      pm: "±",
      Poincareplane: "ℌ",
      pointint: "⨕",
      Popf: "ℙ",
      popf: "𝕡",
      pound: "£",
      Pr: "⪻",
      pr: "≺",
      prap: "⪷",
      prcue: "≼",
      prE: "⪳",
      pre: "⪯",
      prec: "≺",
      precapprox: "⪷",
      preccurlyeq: "≼",
      Precedes: "≺",
      PrecedesEqual: "⪯",
      PrecedesSlantEqual: "≼",
      PrecedesTilde: "≾",
      preceq: "⪯",
      precnapprox: "⪹",
      precneqq: "⪵",
      precnsim: "⋨",
      precsim: "≾",
      Prime: "″",
      prime: "′",
      primes: "ℙ",
      prnap: "⪹",
      prnE: "⪵",
      prnsim: "⋨",
      prod: "∏",
      Product: "∏",
      profalar: "⌮",
      profline: "⌒",
      profsurf: "⌓",
      prop: "∝",
      Proportion: "∷",
      Proportional: "∝",
      propto: "∝",
      prsim: "≾",
      prurel: "⊰",
      Pscr: "𝒫",
      pscr: "𝓅",
      Psi: "Ψ",
      psi: "ψ",
      puncsp: " ",
      Qfr: "𝔔",
      qfr: "𝔮",
      qint: "⨌",
      Qopf: "ℚ",
      qopf: "𝕢",
      qprime: "⁗",
      Qscr: "𝒬",
      qscr: "𝓆",
      quaternions: "ℍ",
      quatint: "⨖",
      quest: "?",
      questeq: "≟",
      QUOT: '"',
      quot: '"',
      rAarr: "⇛",
      race: "∽̱",
      Racute: "Ŕ",
      racute: "ŕ",
      radic: "√",
      raemptyv: "⦳",
      Rang: "⟫",
      rang: "⟩",
      rangd: "⦒",
      range: "⦥",
      rangle: "⟩",
      raquo: "»",
      Rarr: "↠",
      rArr: "⇒",
      rarr: "→",
      rarrap: "⥵",
      rarrb: "⇥",
      rarrbfs: "⤠",
      rarrc: "⤳",
      rarrfs: "⤞",
      rarrhk: "↪",
      rarrlp: "↬",
      rarrpl: "⥅",
      rarrsim: "⥴",
      Rarrtl: "⤖",
      rarrtl: "↣",
      rarrw: "↝",
      rAtail: "⤜",
      ratail: "⤚",
      ratio: "∶",
      rationals: "ℚ",
      RBarr: "⤐",
      rBarr: "⤏",
      rbarr: "⤍",
      rbbrk: "❳",
      rbrace: "}",
      rbrack: "]",
      rbrke: "⦌",
      rbrksld: "⦎",
      rbrkslu: "⦐",
      Rcaron: "Ř",
      rcaron: "ř",
      Rcedil: "Ŗ",
      rcedil: "ŗ",
      rceil: "⌉",
      rcub: "}",
      Rcy: "Р",
      rcy: "р",
      rdca: "⤷",
      rdldhar: "⥩",
      rdquo: "”",
      rdquor: "”",
      rdsh: "↳",
      Re: "ℜ",
      real: "ℜ",
      realine: "ℛ",
      realpart: "ℜ",
      reals: "ℝ",
      rect: "▭",
      REG: "®",
      reg: "®",
      ReverseElement: "∋",
      ReverseEquilibrium: "⇋",
      ReverseUpEquilibrium: "⥯",
      rfisht: "⥽",
      rfloor: "⌋",
      Rfr: "ℜ",
      rfr: "𝔯",
      rHar: "⥤",
      rhard: "⇁",
      rharu: "⇀",
      rharul: "⥬",
      Rho: "Ρ",
      rho: "ρ",
      rhov: "ϱ",
      RightAngleBracket: "⟩",
      RightArrow: "→",
      Rightarrow: "⇒",
      rightarrow: "→",
      RightArrowBar: "⇥",
      RightArrowLeftArrow: "⇄",
      rightarrowtail: "↣",
      RightCeiling: "⌉",
      RightDoubleBracket: "⟧",
      RightDownTeeVector: "⥝",
      RightDownVector: "⇂",
      RightDownVectorBar: "⥕",
      RightFloor: "⌋",
      rightharpoondown: "⇁",
      rightharpoonup: "⇀",
      rightleftarrows: "⇄",
      rightleftharpoons: "⇌",
      rightrightarrows: "⇉",
      rightsquigarrow: "↝",
      RightTee: "⊢",
      RightTeeArrow: "↦",
      RightTeeVector: "⥛",
      rightthreetimes: "⋌",
      RightTriangle: "⊳",
      RightTriangleBar: "⧐",
      RightTriangleEqual: "⊵",
      RightUpDownVector: "⥏",
      RightUpTeeVector: "⥜",
      RightUpVector: "↾",
      RightUpVectorBar: "⥔",
      RightVector: "⇀",
      RightVectorBar: "⥓",
      ring: "˚",
      risingdotseq: "≓",
      rlarr: "⇄",
      rlhar: "⇌",
      rlm: "‏",
      rmoust: "⎱",
      rmoustache: "⎱",
      rnmid: "⫮",
      roang: "⟭",
      roarr: "⇾",
      robrk: "⟧",
      ropar: "⦆",
      Ropf: "ℝ",
      ropf: "𝕣",
      roplus: "⨮",
      rotimes: "⨵",
      RoundImplies: "⥰",
      rpar: ")",
      rpargt: "⦔",
      rppolint: "⨒",
      rrarr: "⇉",
      Rrightarrow: "⇛",
      rsaquo: "›",
      Rscr: "ℛ",
      rscr: "𝓇",
      Rsh: "↱",
      rsh: "↱",
      rsqb: "]",
      rsquo: "’",
      rsquor: "’",
      rthree: "⋌",
      rtimes: "⋊",
      rtri: "▹",
      rtrie: "⊵",
      rtrif: "▸",
      rtriltri: "⧎",
      RuleDelayed: "⧴",
      ruluhar: "⥨",
      rx: "℞",
      Sacute: "Ś",
      sacute: "ś",
      sbquo: "‚",
      Sc: "⪼",
      sc: "≻",
      scap: "⪸",
      Scaron: "Š",
      scaron: "š",
      sccue: "≽",
      scE: "⪴",
      sce: "⪰",
      Scedil: "Ş",
      scedil: "ş",
      Scirc: "Ŝ",
      scirc: "ŝ",
      scnap: "⪺",
      scnE: "⪶",
      scnsim: "⋩",
      scpolint: "⨓",
      scsim: "≿",
      Scy: "С",
      scy: "с",
      sdot: "⋅",
      sdotb: "⊡",
      sdote: "⩦",
      searhk: "⤥",
      seArr: "⇘",
      searr: "↘",
      searrow: "↘",
      sect: "§",
      semi: ";",
      seswar: "⤩",
      setminus: "∖",
      setmn: "∖",
      sext: "✶",
      Sfr: "𝔖",
      sfr: "𝔰",
      sfrown: "⌢",
      sharp: "♯",
      SHCHcy: "Щ",
      shchcy: "щ",
      SHcy: "Ш",
      shcy: "ш",
      ShortDownArrow: "↓",
      ShortLeftArrow: "←",
      shortmid: "∣",
      shortparallel: "∥",
      ShortRightArrow: "→",
      ShortUpArrow: "↑",
      shy: "­",
      Sigma: "Σ",
      sigma: "σ",
      sigmaf: "ς",
      sigmav: "ς",
      sim: "∼",
      simdot: "⩪",
      sime: "≃",
      simeq: "≃",
      simg: "⪞",
      simgE: "⪠",
      siml: "⪝",
      simlE: "⪟",
      simne: "≆",
      simplus: "⨤",
      simrarr: "⥲",
      slarr: "←",
      SmallCircle: "∘",
      smallsetminus: "∖",
      smashp: "⨳",
      smeparsl: "⧤",
      smid: "∣",
      smile: "⌣",
      smt: "⪪",
      smte: "⪬",
      smtes: "⪬︀",
      SOFTcy: "Ь",
      softcy: "ь",
      sol: "/",
      solb: "⧄",
      solbar: "⌿",
      Sopf: "𝕊",
      sopf: "𝕤",
      spades: "♠",
      spadesuit: "♠",
      spar: "∥",
      sqcap: "⊓",
      sqcaps: "⊓︀",
      sqcup: "⊔",
      sqcups: "⊔︀",
      Sqrt: "√",
      sqsub: "⊏",
      sqsube: "⊑",
      sqsubset: "⊏",
      sqsubseteq: "⊑",
      sqsup: "⊐",
      sqsupe: "⊒",
      sqsupset: "⊐",
      sqsupseteq: "⊒",
      squ: "□",
      Square: "□",
      square: "□",
      SquareIntersection: "⊓",
      SquareSubset: "⊏",
      SquareSubsetEqual: "⊑",
      SquareSuperset: "⊐",
      SquareSupersetEqual: "⊒",
      SquareUnion: "⊔",
      squarf: "▪",
      squf: "▪",
      srarr: "→",
      Sscr: "𝒮",
      sscr: "𝓈",
      ssetmn: "∖",
      ssmile: "⌣",
      sstarf: "⋆",
      Star: "⋆",
      star: "☆",
      starf: "★",
      straightepsilon: "ϵ",
      straightphi: "ϕ",
      strns: "¯",
      Sub: "⋐",
      sub: "⊂",
      subdot: "⪽",
      subE: "⫅",
      sube: "⊆",
      subedot: "⫃",
      submult: "⫁",
      subnE: "⫋",
      subne: "⊊",
      subplus: "⪿",
      subrarr: "⥹",
      Subset: "⋐",
      subset: "⊂",
      subseteq: "⊆",
      subseteqq: "⫅",
      SubsetEqual: "⊆",
      subsetneq: "⊊",
      subsetneqq: "⫋",
      subsim: "⫇",
      subsub: "⫕",
      subsup: "⫓",
      succ: "≻",
      succapprox: "⪸",
      succcurlyeq: "≽",
      Succeeds: "≻",
      SucceedsEqual: "⪰",
      SucceedsSlantEqual: "≽",
      SucceedsTilde: "≿",
      succeq: "⪰",
      succnapprox: "⪺",
      succneqq: "⪶",
      succnsim: "⋩",
      succsim: "≿",
      SuchThat: "∋",
      Sum: "∑",
      sum: "∑",
      sung: "♪",
      Sup: "⋑",
      sup: "⊃",
      sup1: "¹",
      sup2: "²",
      sup3: "³",
      supdot: "⪾",
      supdsub: "⫘",
      supE: "⫆",
      supe: "⊇",
      supedot: "⫄",
      Superset: "⊃",
      SupersetEqual: "⊇",
      suphsol: "⟉",
      suphsub: "⫗",
      suplarr: "⥻",
      supmult: "⫂",
      supnE: "⫌",
      supne: "⊋",
      supplus: "⫀",
      Supset: "⋑",
      supset: "⊃",
      supseteq: "⊇",
      supseteqq: "⫆",
      supsetneq: "⊋",
      supsetneqq: "⫌",
      supsim: "⫈",
      supsub: "⫔",
      supsup: "⫖",
      swarhk: "⤦",
      swArr: "⇙",
      swarr: "↙",
      swarrow: "↙",
      swnwar: "⤪",
      szlig: "ß",
      Tab: "	",
      target: "⌖",
      Tau: "Τ",
      tau: "τ",
      tbrk: "⎴",
      Tcaron: "Ť",
      tcaron: "ť",
      Tcedil: "Ţ",
      tcedil: "ţ",
      Tcy: "Т",
      tcy: "т",
      tdot: "⃛",
      telrec: "⌕",
      Tfr: "𝔗",
      tfr: "𝔱",
      there4: "∴",
      Therefore: "∴",
      therefore: "∴",
      Theta: "Θ",
      theta: "θ",
      thetasym: "ϑ",
      thetav: "ϑ",
      thickapprox: "≈",
      thicksim: "∼",
      ThickSpace: "  ",
      thinsp: " ",
      ThinSpace: " ",
      thkap: "≈",
      thksim: "∼",
      THORN: "Þ",
      thorn: "þ",
      Tilde: "∼",
      tilde: "˜",
      TildeEqual: "≃",
      TildeFullEqual: "≅",
      TildeTilde: "≈",
      times: "×",
      timesb: "⊠",
      timesbar: "⨱",
      timesd: "⨰",
      tint: "∭",
      toea: "⤨",
      top: "⊤",
      topbot: "⌶",
      topcir: "⫱",
      Topf: "𝕋",
      topf: "𝕥",
      topfork: "⫚",
      tosa: "⤩",
      tprime: "‴",
      TRADE: "™",
      trade: "™",
      triangle: "▵",
      triangledown: "▿",
      triangleleft: "◃",
      trianglelefteq: "⊴",
      triangleq: "≜",
      triangleright: "▹",
      trianglerighteq: "⊵",
      tridot: "◬",
      trie: "≜",
      triminus: "⨺",
      TripleDot: "⃛",
      triplus: "⨹",
      trisb: "⧍",
      tritime: "⨻",
      trpezium: "⏢",
      Tscr: "𝒯",
      tscr: "𝓉",
      TScy: "Ц",
      tscy: "ц",
      TSHcy: "Ћ",
      tshcy: "ћ",
      Tstrok: "Ŧ",
      tstrok: "ŧ",
      twixt: "≬",
      twoheadleftarrow: "↞",
      twoheadrightarrow: "↠",
      Uacute: "Ú",
      uacute: "ú",
      Uarr: "↟",
      uArr: "⇑",
      uarr: "↑",
      Uarrocir: "⥉",
      Ubrcy: "Ў",
      ubrcy: "ў",
      Ubreve: "Ŭ",
      ubreve: "ŭ",
      Ucirc: "Û",
      ucirc: "û",
      Ucy: "У",
      ucy: "у",
      udarr: "⇅",
      Udblac: "Ű",
      udblac: "ű",
      udhar: "⥮",
      ufisht: "⥾",
      Ufr: "𝔘",
      ufr: "𝔲",
      Ugrave: "Ù",
      ugrave: "ù",
      uHar: "⥣",
      uharl: "↿",
      uharr: "↾",
      uhblk: "▀",
      ulcorn: "⌜",
      ulcorner: "⌜",
      ulcrop: "⌏",
      ultri: "◸",
      Umacr: "Ū",
      umacr: "ū",
      uml: "¨",
      UnderBar: "_",
      UnderBrace: "⏟",
      UnderBracket: "⎵",
      UnderParenthesis: "⏝",
      Union: "⋃",
      UnionPlus: "⊎",
      Uogon: "Ų",
      uogon: "ų",
      Uopf: "𝕌",
      uopf: "𝕦",
      UpArrow: "↑",
      Uparrow: "⇑",
      uparrow: "↑",
      UpArrowBar: "⤒",
      UpArrowDownArrow: "⇅",
      UpDownArrow: "↕",
      Updownarrow: "⇕",
      updownarrow: "↕",
      UpEquilibrium: "⥮",
      upharpoonleft: "↿",
      upharpoonright: "↾",
      uplus: "⊎",
      UpperLeftArrow: "↖",
      UpperRightArrow: "↗",
      Upsi: "ϒ",
      upsi: "υ",
      upsih: "ϒ",
      Upsilon: "Υ",
      upsilon: "υ",
      UpTee: "⊥",
      UpTeeArrow: "↥",
      upuparrows: "⇈",
      urcorn: "⌝",
      urcorner: "⌝",
      urcrop: "⌎",
      Uring: "Ů",
      uring: "ů",
      urtri: "◹",
      Uscr: "𝒰",
      uscr: "𝓊",
      utdot: "⋰",
      Utilde: "Ũ",
      utilde: "ũ",
      utri: "▵",
      utrif: "▴",
      uuarr: "⇈",
      Uuml: "Ü",
      uuml: "ü",
      uwangle: "⦧",
      vangrt: "⦜",
      varepsilon: "ϵ",
      varkappa: "ϰ",
      varnothing: "∅",
      varphi: "ϕ",
      varpi: "ϖ",
      varpropto: "∝",
      vArr: "⇕",
      varr: "↕",
      varrho: "ϱ",
      varsigma: "ς",
      varsubsetneq: "⊊︀",
      varsubsetneqq: "⫋︀",
      varsupsetneq: "⊋︀",
      varsupsetneqq: "⫌︀",
      vartheta: "ϑ",
      vartriangleleft: "⊲",
      vartriangleright: "⊳",
      Vbar: "⫫",
      vBar: "⫨",
      vBarv: "⫩",
      Vcy: "В",
      vcy: "в",
      VDash: "⊫",
      Vdash: "⊩",
      vDash: "⊨",
      vdash: "⊢",
      Vdashl: "⫦",
      Vee: "⋁",
      vee: "∨",
      veebar: "⊻",
      veeeq: "≚",
      vellip: "⋮",
      Verbar: "‖",
      verbar: "|",
      Vert: "‖",
      vert: "|",
      VerticalBar: "∣",
      VerticalLine: "|",
      VerticalSeparator: "❘",
      VerticalTilde: "≀",
      VeryThinSpace: " ",
      Vfr: "𝔙",
      vfr: "𝔳",
      vltri: "⊲",
      vnsub: "⊂⃒",
      vnsup: "⊃⃒",
      Vopf: "𝕍",
      vopf: "𝕧",
      vprop: "∝",
      vrtri: "⊳",
      Vscr: "𝒱",
      vscr: "𝓋",
      vsubnE: "⫋︀",
      vsubne: "⊊︀",
      vsupnE: "⫌︀",
      vsupne: "⊋︀",
      Vvdash: "⊪",
      vzigzag: "⦚",
      Wcirc: "Ŵ",
      wcirc: "ŵ",
      wedbar: "⩟",
      Wedge: "⋀",
      wedge: "∧",
      wedgeq: "≙",
      weierp: "℘",
      Wfr: "𝔚",
      wfr: "𝔴",
      Wopf: "𝕎",
      wopf: "𝕨",
      wp: "℘",
      wr: "≀",
      wreath: "≀",
      Wscr: "𝒲",
      wscr: "𝓌",
      xcap: "⋂",
      xcirc: "◯",
      xcup: "⋃",
      xdtri: "▽",
      Xfr: "𝔛",
      xfr: "𝔵",
      xhArr: "⟺",
      xharr: "⟷",
      Xi: "Ξ",
      xi: "ξ",
      xlArr: "⟸",
      xlarr: "⟵",
      xmap: "⟼",
      xnis: "⋻",
      xodot: "⨀",
      Xopf: "𝕏",
      xopf: "𝕩",
      xoplus: "⨁",
      xotime: "⨂",
      xrArr: "⟹",
      xrarr: "⟶",
      Xscr: "𝒳",
      xscr: "𝓍",
      xsqcup: "⨆",
      xuplus: "⨄",
      xutri: "△",
      xvee: "⋁",
      xwedge: "⋀",
      Yacute: "Ý",
      yacute: "ý",
      YAcy: "Я",
      yacy: "я",
      Ycirc: "Ŷ",
      ycirc: "ŷ",
      Ycy: "Ы",
      ycy: "ы",
      yen: "¥",
      Yfr: "𝔜",
      yfr: "𝔶",
      YIcy: "Ї",
      yicy: "ї",
      Yopf: "𝕐",
      yopf: "𝕪",
      Yscr: "𝒴",
      yscr: "𝓎",
      YUcy: "Ю",
      yucy: "ю",
      Yuml: "Ÿ",
      yuml: "ÿ",
      Zacute: "Ź",
      zacute: "ź",
      Zcaron: "Ž",
      zcaron: "ž",
      Zcy: "З",
      zcy: "з",
      Zdot: "Ż",
      zdot: "ż",
      zeetrf: "ℨ",
      ZeroWidthSpace: "​",
      Zeta: "Ζ",
      zeta: "ζ",
      Zfr: "ℨ",
      zfr: "𝔷",
      ZHcy: "Ж",
      zhcy: "ж",
      zigrarr: "⇝",
      Zopf: "ℤ",
      zopf: "𝕫",
      Zscr: "𝒵",
      zscr: "𝓏",
      zwj: "‍",
      zwnj: "‌"
    }), e.entityMap = e.HTML_ENTITIES;
  })(Xo)), Xo;
}
var Hn = {}, ul;
function L_() {
  if (ul) return Hn;
  ul = 1;
  var e = In(), t = mc(), r = bo(), n = e.isHTMLEscapableRawTextElement, i = e.isHTMLMimeType, o = e.isHTMLRawTextElement, a = e.hasOwn, s = e.NAMESPACE, l = r.ParseError, f = r.DOMException, d = 0, u = 1, h = 2, c = 3, y = 4, m = 5, b = 6, g = 7;
  function _() {
  }
  _.prototype = {
    parse: function(E, N, L) {
      var F = this.domBuilder;
      F.startDocument(), j(N, N = /* @__PURE__ */ Object.create(null)), D(E, N, L, F, this.errorHandler), F.endDocument();
    }
  };
  var x = /&#?\w+;?/g;
  function D(E, N, L, F, Y) {
    var ee = i(F.mimeType);
    E.indexOf(t.UNICODE_REPLACEMENT_CHARACTER) >= 0 && Y.warning("Unicode replacement character detected, source encoding issues?");
    function H(Ae) {
      if (Ae > 65535) {
        Ae -= 65536;
        var Oe = 55296 + (Ae >> 10), ut = 56320 + (Ae & 1023);
        return String.fromCharCode(Oe, ut);
      } else
        return String.fromCharCode(Ae);
    }
    function K(Ae) {
      var Oe = Ae[Ae.length - 1] === ";" ? Ae : Ae + ";";
      if (!ee && Oe !== Ae)
        return Y.error("EntityRef: expecting ;"), Ae;
      var ut = t.Reference.exec(Oe);
      if (!ut || ut[0].length !== Oe.length)
        return Y.error("entity not matching Reference production: " + Ae), Ae;
      var He = Oe.slice(1, -1);
      return a(L, He) ? L[He] : He.charAt(0) === "#" ? H(parseInt(He.substring(1).replace("x", "0x"))) : (Y.error("entity not found:" + Ae), Ae);
    }
    function le(Ae) {
      if (Ae > Le) {
        var Oe = E.substring(Le, Ae).replace(x, K);
        we && ke(Le), F.characters(Oe, 0, Ae - Le), Le = Ae;
      }
    }
    var ae = 0, ne = 0, me = /\r\n?|\n|$/g, we = F.locator;
    function ke(Ae, Oe) {
      for (; Ae >= ne && (Oe = me.exec(E)); )
        ae = ne, ne = Oe.index + Oe[0].length, we.lineNumber++;
      we.columnNumber = Ae - ae + 1;
    }
    for (var De = [{ currentNSMap: N }], Be = [], Le = 0; ; ) {
      try {
        var O = E.indexOf("<", Le);
        if (O < 0) {
          if (!ee && Be.length > 0)
            return Y.fatalError("unclosed xml tag(s): " + Be.join(", "));
          if (!E.substring(Le).match(/^\s*$/)) {
            var $ = F.doc, p = $.createTextNode(E.substring(Le));
            if ($.documentElement)
              return Y.error("Extra content at the end of the document");
            $.appendChild(p), F.currentElement = p;
          }
          return;
        }
        if (O > Le) {
          var z = E.substring(Le, O);
          !ee && Be.length === 0 && (z = z.replace(new RegExp(t.S_OPT.source, "g"), ""), z && Y.error("Unexpected content outside root element: '" + z + "'")), le(O);
        }
        switch (E.charAt(O + 1)) {
          case "/":
            var he = E.indexOf(">", O + 2), S = E.substring(O + 2, he > 0 ? he : void 0);
            if (!S)
              return Y.fatalError("end tag name missing");
            var A = t.reg("^", t.QName_group, t.S_OPT, "$"), M = he > 0 && A.exec(S);
            if (!M) {
              var T = he > 0 && t.reg("^", t.QName_group).exec(S);
              if (ee && T)
                Y.warning('end tag name contains invalid trailing characters: "' + S + '"'), M = T;
              else if (
                // Backward compatibility, remove this whole `else if` arm in the next breaking release
                // (XML then falls through to the `fatalError` below, for a clean mode split: XML fatal,
                // HTML warning). A valid end-tag name followed by a line break and trailing content was
                // silently accepted while `reg` still used the `m` flag; re-adding `m` here matches exactly
                // those inputs, kept recoverable and reported.
                T && new RegExp(A.source, A.flags + "m").test(S)
              )
                Y.error('end tag name is followed by a line break and trailing content: "' + S + '"'), M = T;
              else
                return Y.fatalError('end tag name contains invalid characters: "' + S + '"');
            }
            if (!F.currentElement && !F.doc.documentElement)
              return;
            var U = Be[Be.length - 1] || F.currentElement.tagName || F.doc.documentElement.tagName || "";
            if (U !== M[1]) {
              var V = M[1].toLowerCase();
              if (!ee || U.toLowerCase() !== V)
                return Y.fatalError('Opening and ending tag mismatch: "' + U + '" != "' + S + '"');
            }
            var q = De.pop();
            Be.pop();
            var te = q.localNSMap;
            if (F.endElement(q.uri, q.localName, U), te)
              for (var se in te)
                a(te, se) && F.endPrefixMapping(se);
            he++;
            break;
          // end element
          case "?":
            we && ke(O), he = Z(E, O, F, Y);
            break;
          case "!":
            we && ke(O), he = B(E, O, F, Y, ee);
            break;
          default:
            we && ke(O);
            var re = new w(), fe = De[De.length - 1].currentNSMap, he = C(E, O, re, fe, K, Y, ee), pe = re.length;
            if (re.closed || (ee && e.isHTMLVoidElement(re.tagName) ? re.closed = !0 : Be.push(re.tagName)), we && pe) {
              for (var Re = R(we, {}), qe = 0; qe < pe; qe++) {
                var je = re[qe];
                ke(je.offset), je.locator = R(we, {});
              }
              F.locator = Re, P(re, F, fe) && De.push(re), F.locator = we;
            } else
              P(re, F, fe) && De.push(re);
            ee && !re.closed ? he = W(E, he, re.tagName, K, F) : he++;
        }
      } catch (Ae) {
        if (Ae instanceof l)
          throw Ae;
        if (Ae instanceof f)
          return Y.fatalError("Error constructing the DOM: " + Ae.name + ": " + Ae.message, Ae);
        Y.error("element parse error: " + Ae), he = -1;
      }
      he > Le ? Le = he : le(Math.max(O, Le) + 1);
    }
  }
  function R(E, N) {
    return N.lineNumber = E.lineNumber, N.columnNumber = E.columnNumber, N;
  }
  function C(E, N, L, F, Y, ee, H) {
    function K(ke, De, Be) {
      if (a(L.attributeNames, ke))
        return ee.fatalError("Attribute " + ke + " redefined");
      if (!H && De.indexOf("<") >= 0)
        return ee.fatalError("Unescaped '<' not allowed in attributes values");
      L.addValue(
        ke,
        // @see https://www.w3.org/TR/xml/#AVNormalize
        // since the xmldom sax parser does not "interpret" DTD the following is not implemented:
        // - recursive replacement of (DTD) entity references
        // - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
        De.replace(/[\t\n\r]/g, " ").replace(x, Y),
        Be
      );
    }
    for (var le, ae, ne = ++N, me = d; ; ) {
      var we = E.charAt(ne);
      if (me === d && we === "<")
        throw new Error("unexpected < in tag name: " + E.slice(N, ne));
      switch (we) {
        case "=":
          if (me === u)
            le = E.slice(N, ne), me = c;
          else if (me === h)
            me = c;
          else
            throw new Error("attribute equal must after attrName");
          break;
        case "'":
        case '"':
          if (me === c || me === u)
            if (me === u && (ee.warning('attribute value must after "="'), le = E.slice(N, ne)), N = ne + 1, ne = E.indexOf(we, N), ne > 0)
              ae = E.slice(N, ne), K(le, ae, N - 1), me = m;
            else
              throw new Error("attribute value no end '" + we + "' match");
          else if (me == y)
            ae = E.slice(N, ne), K(le, ae, N), ee.warning('attribute "' + le + '" missed start quot(' + we + ")!!"), N = ne + 1, me = m;
          else
            throw new Error('attribute value must after "="');
          break;
        case "/":
          switch (me) {
            case d:
              L.setTagName(E.slice(N, ne));
            case m:
            case b:
            case g:
              me = g, L.closed = !0;
            case y:
            case u:
              break;
            case h:
              L.closed = !0;
              break;
            //case S_EQ:
            default:
              throw new Error("attribute invalid close char('/')");
          }
          break;
        case "":
          return ee.error("unexpected end of input"), me == d && L.setTagName(E.slice(N, ne)), ne;
        case ">":
          switch (me) {
            case d:
              L.setTagName(E.slice(N, ne));
            case m:
            case b:
            case g:
              break;
            //normal
            case y:
            //Compatible state
            case u:
              ae = E.slice(N, ne), ae.slice(-1) === "/" && (L.closed = !0, ae = ae.slice(0, -1));
            case h:
              me === h && (ae = le), me == y ? (ee.warning('attribute "' + ae + '" missed quot(")!'), K(le, ae, N)) : (H || ee.warning('attribute "' + ae + '" missed value!! "' + ae + '" instead!!'), K(ae, ae, N));
              break;
            case c:
              if (!H)
                return ee.fatalError(`AttValue: ' or " expected`);
          }
          return ne;
        /*xml space '\x20' | #x9 | #xD | #xA; */
        case "":
          we = " ";
        default:
          if (we <= " ")
            switch (me) {
              case d:
                L.setTagName(E.slice(N, ne)), me = b;
                break;
              case u:
                le = E.slice(N, ne), me = h;
                break;
              case y:
                var ae = E.slice(N, ne);
                ee.warning('attribute "' + ae + '" missed quot(")!!'), K(le, ae, N);
              case m:
                me = b;
                break;
            }
          else
            switch (me) {
              //case S_TAG:void();break;
              //case S_ATTR:void();break;
              //case S_ATTR_NOQUOT_VALUE:void();break;
              case h:
                H || ee.warning('attribute "' + le + '" missed value!! "' + le + '" instead2!!'), K(le, le, N), N = ne, me = u;
                break;
              case m:
                ee.warning('attribute space is required"' + le + '"!!');
              case b:
                me = u, N = ne;
                break;
              case c:
                me = y, N = ne;
                break;
              case g:
                throw new Error("elements closed character '/' and '>' must be connected to");
            }
      }
      ne++;
    }
  }
  function P(E, N, L) {
    for (var F = E.tagName, Y = null, me = E.length; me--; ) {
      var ee = E[me], H = ee.qName, K = ee.value, we = H.indexOf(":");
      if (we > 0)
        var le = ee.prefix = H.slice(0, we), ae = H.slice(we + 1), ne = le === "xmlns" && ae;
      else
        ae = H, le = null, ne = H === "xmlns" && "";
      ee.localName = ae, ne !== !1 && (Y == null && (Y = /* @__PURE__ */ Object.create(null), L = Object.create(L)), L[ne] = Y[ne] = K, ee.uri = s.XMLNS, N.startPrefixMapping(ne, K));
    }
    for (var me = E.length; me--; )
      ee = E[me], ee.prefix && (ee.prefix === "xml" && (ee.uri = s.XML), ee.prefix !== "xmlns" && (ee.uri = L[ee.prefix]));
    var we = F.indexOf(":");
    we > 0 ? (le = E.prefix = F.slice(0, we), ae = E.localName = F.slice(we + 1)) : (le = null, ae = E.localName = F);
    var ke = E.uri = L[le || ""];
    if (N.startElement(ke, ae, F, E), E.closed) {
      if (N.endElement(ke, ae, F), Y)
        for (le in Y)
          a(Y, le) && N.endPrefixMapping(le);
    } else
      return E.currentNSMap = L, E.localNSMap = Y, !0;
  }
  function W(E, N, L, F, Y) {
    var ee = n(L);
    if (ee || o(L)) {
      var H = new RegExp("</" + L.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ">", "ig");
      H.lastIndex = N;
      var K = H.exec(E), le = K ? K.index : -1;
      if (le < 0)
        return N + 1;
      var ae = E.substring(N + 1, le);
      return ee && (ae = ae.replace(x, F)), Y.characters(ae, 0, ae.length), le;
    }
    return N + 1;
  }
  function j(E, N) {
    for (var L in E)
      a(E, L) && (N[L] = E[L]);
  }
  function oe(E, N) {
    var L = N;
    function F(ne) {
      return ne = ne || 0, E.charAt(L + ne);
    }
    function Y(ne) {
      ne = ne || 1, L += ne;
    }
    function ee() {
      for (var ne = 0; L < E.length; ) {
        var me = F();
        if (me !== " " && me !== `
` && me !== "	" && me !== "\r")
          return ne;
        ne++, Y();
      }
      return -1;
    }
    function H() {
      return E.substring(L);
    }
    function K(ne) {
      return E.substring(L, L + ne.length) === ne;
    }
    function le(ne) {
      return E.substring(L, L + ne.length).toUpperCase() === ne.toUpperCase();
    }
    function ae(ne) {
      var me = t.reg("^", ne), we = me.exec(H());
      return we ? (Y(we[0].length), we[0]) : null;
    }
    return {
      char: F,
      getIndex: function() {
        return L;
      },
      getMatch: ae,
      getSource: function() {
        return E;
      },
      skip: Y,
      skipBlanks: ee,
      substringFromIndex: H,
      substringStartsWith: K,
      substringStartsWithCaseInsensitive: le
    };
  }
  function ue(E, N) {
    function L(K, le) {
      var ae = t.PI.exec(K.substringFromIndex());
      return ae ? ae[1].toLowerCase() === "xml" ? le.fatalError(
        "xml declaration is only allowed at the start of the document, but found at position " + K.getIndex()
      ) : (K.skip(ae[0].length), ae[0]) : le.fatalError("processing instruction is not well-formed at position " + K.getIndex());
    }
    var F = E.getSource();
    if (E.char() === "[") {
      E.skip(1);
      for (var Y = E.getIndex(); E.getIndex() < F.length; ) {
        if (E.skipBlanks(), E.char() === "]") {
          var ee = F.substring(Y, E.getIndex());
          return E.skip(1), ee;
        }
        var H = null;
        if (E.char() === "<" && E.char(1) === "!")
          switch (E.char(2)) {
            case "E":
              E.char(3) === "L" ? H = E.getMatch(t.elementdecl) : E.char(3) === "N" && (H = E.getMatch(t.EntityDecl));
              break;
            case "A":
              H = E.getMatch(t.AttlistDecl);
              break;
            case "N":
              H = E.getMatch(t.NotationDecl);
              break;
            case "-":
              H = E.getMatch(t.Comment);
              break;
          }
        else if (E.char() === "<" && E.char(1) === "?")
          H = L(E, N);
        else if (E.char() === "%")
          H = E.getMatch(t.PEReference);
        else
          return N.fatalError("Error detected in Markup declaration");
        if (!H)
          return N.fatalError("Error in internal subset at position " + E.getIndex());
      }
      return N.fatalError("doctype internal subset is not well-formed, missing ]");
    }
  }
  function B(E, N, L, F, Y) {
    var ee = oe(E, N);
    switch (Y ? ee.char(2).toUpperCase() : ee.char(2)) {
      case "-":
        var H = ee.getMatch(t.Comment);
        return H ? (L.comment(H, t.COMMENT_START.length, H.length - t.COMMENT_START.length - t.COMMENT_END.length), ee.getIndex()) : F.fatalError("comment is not well-formed at position " + ee.getIndex());
      case "[":
        var K = ee.getMatch(t.CDSect);
        return K ? !Y && !L.currentElement ? F.fatalError("CDATA outside of element") : (L.startCDATA(), L.characters(K, t.CDATA_START.length, K.length - t.CDATA_START.length - t.CDATA_END.length), L.endCDATA(), ee.getIndex()) : F.fatalError("Invalid CDATA starting at position " + N);
      case "D": {
        if (L.doc && L.doc.documentElement)
          return F.fatalError("Doctype not allowed inside or after documentElement at position " + ee.getIndex());
        if (Y ? !ee.substringStartsWithCaseInsensitive(t.DOCTYPE_DECL_START) : !ee.substringStartsWith(t.DOCTYPE_DECL_START))
          return F.fatalError("Expected " + t.DOCTYPE_DECL_START + " at position " + ee.getIndex());
        if (ee.skip(t.DOCTYPE_DECL_START.length), ee.skipBlanks() < 1)
          return F.fatalError("Expected whitespace after " + t.DOCTYPE_DECL_START + " at position " + ee.getIndex());
        var le = {
          name: void 0,
          publicId: void 0,
          systemId: void 0,
          internalSubset: void 0
        };
        if (le.name = ee.getMatch(t.Name), !le.name)
          return F.fatalError("doctype name missing or contains unexpected characters at position " + ee.getIndex());
        if (Y && le.name.toLowerCase() !== "html" && F.warning("Unexpected DOCTYPE in HTML document at position " + ee.getIndex()), ee.skipBlanks(), ee.substringStartsWith(t.PUBLIC) || ee.substringStartsWith(t.SYSTEM)) {
          var ae = t.ExternalID_match.exec(ee.substringFromIndex());
          if (!ae)
            return F.fatalError("doctype external id is not well-formed at position " + ee.getIndex());
          ae.groups.SystemLiteralOnly !== void 0 ? le.systemId = ae.groups.SystemLiteralOnly : (le.systemId = ae.groups.SystemLiteral, le.publicId = ae.groups.PubidLiteral), ee.skip(ae[0].length);
        } else if (Y && ee.substringStartsWithCaseInsensitive(t.SYSTEM)) {
          if (ee.skip(t.SYSTEM.length), ee.skipBlanks() < 1)
            return F.fatalError("Expected whitespace after " + t.SYSTEM + " at position " + ee.getIndex());
          if (le.systemId = ee.getMatch(t.ABOUT_LEGACY_COMPAT_SystemLiteral), !le.systemId)
            return F.fatalError(
              "Expected " + t.ABOUT_LEGACY_COMPAT + " in single or double quotes after " + t.SYSTEM + " at position " + ee.getIndex()
            );
        }
        return Y && le.systemId && !t.ABOUT_LEGACY_COMPAT_SystemLiteral.test(le.systemId) && F.warning("Unexpected doctype.systemId in HTML document at position " + ee.getIndex()), Y || (ee.skipBlanks(), le.internalSubset = ue(ee, F)), ee.skipBlanks(), ee.char() !== ">" ? F.fatalError("doctype not terminated with > at position " + ee.getIndex()) : (ee.skip(1), L.startDTD(le.name, le.publicId, le.systemId, le.internalSubset), L.endDTD(), ee.getIndex());
      }
      default:
        return F.fatalError('Not well-formed XML starting with "<!" at position ' + N);
    }
  }
  function Z(E, N, L, F) {
    var Y = E.substring(N).match(t.PI);
    if (!Y)
      return F.fatalError("Invalid processing instruction starting at position " + N);
    if (Y[1].toLowerCase() === "xml") {
      if (N > 0)
        return F.fatalError(
          "processing instruction at position " + N + " is an xml declaration which is only at the start of the document"
        );
      if (!t.XMLDecl.test(E.substring(N)))
        return F.fatalError("xml declaration is not well-formed");
    }
    return L.processingInstruction(Y[1], Y[2]), N + Y[0].length;
  }
  function w() {
    this.attributeNames = /* @__PURE__ */ Object.create(null);
  }
  return w.prototype = {
    setTagName: function(E) {
      if (!t.QName_exact.test(E))
        throw new Error("invalid tagName:" + E);
      this.tagName = E;
    },
    addValue: function(E, N, L) {
      if (!t.QName_exact.test(E))
        throw new Error("invalid attribute:" + E);
      this.attributeNames[E] = this.length, this[this.length++] = { qName: E, value: N, offset: L };
    },
    length: 0,
    getLocalName: function(E) {
      return this[E].localName;
    },
    getLocator: function(E) {
      return this[E].locator;
    },
    getQName: function(E) {
      return this[E].qName;
    },
    getURI: function(E) {
      return this[E].uri;
    },
    getValue: function(E) {
      return this[E].value;
    }
    //	,getIndex:function(uri, localName)){
    //		if(localName){
    //
    //		}else{
    //			var qName = uri
    //		}
    //	},
    //	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
    //	getType:function(uri,localName){}
    //	getType:function(i){},
  }, Hn.XMLReader = _, Hn.parseUtils = oe, Hn.parseDoctypeCommentOrCData = B, Hn;
}
var cl;
function R_() {
  if (cl) return Wr;
  cl = 1;
  var e = In(), t = gc(), r = bo(), n = I_(), i = L_(), o = t.DOMImplementation, a = e.hasDefaultHTMLNamespace, s = e.isHTMLMimeType, l = e.isValidMimeType, f = e.MIME_TYPE, d = e.NAMESPACE, u = r.ParseError, h = i.XMLReader;
  function c(C) {
    return C.replace(/\r[\n\u0085]/g, `
`).replace(/[\r\u0085\u2028\u2029]/g, `
`);
  }
  function y(C) {
    if (C = C || {}, C.locator === void 0 && (C.locator = !0), this.assign = C.assign || e.assign, this.domHandler = C.domHandler || m, this.onError = C.onError || C.errorHandler, C.errorHandler && typeof C.errorHandler != "function")
      throw new TypeError("errorHandler object is no longer supported, switch to onError!");
    C.errorHandler && C.errorHandler("warning", "The `errorHandler` option has been deprecated, use `onError` instead!", this), this.normalizeLineEndings = C.normalizeLineEndings || c, this.locator = !!C.locator, this.xmlns = this.assign(/* @__PURE__ */ Object.create(null), C.xmlns);
  }
  y.prototype.parseFromString = function(C, P) {
    if (!l(P))
      throw new TypeError('DOMParser.parseFromString: the provided mimeType "' + P + '" is not valid.');
    var W = this.assign(/* @__PURE__ */ Object.create(null), this.xmlns), j = n.XML_ENTITIES, oe = W[""] || null;
    a(P) ? (j = n.HTML_ENTITIES, oe = d.HTML) : P === f.XML_SVG_IMAGE && (oe = d.SVG), W[""] = oe, W.xml = W.xml || d.XML;
    var ue = new this.domHandler({
      mimeType: P,
      defaultNamespace: oe,
      onError: this.onError
    }), B = this.locator ? {} : void 0;
    this.locator && ue.setDocumentLocator(B);
    var Z = new h();
    Z.errorHandler = ue, Z.domBuilder = ue;
    var w = !e.isHTMLMimeType(P);
    return w && typeof C != "string" && Z.errorHandler.fatalError("source is not a string"), Z.parse(this.normalizeLineEndings(String(C)), W, j), ue.doc.documentElement || Z.errorHandler.fatalError("missing root element"), ue.doc;
  };
  function m(C) {
    var P = C || {};
    this.mimeType = P.mimeType || f.XML_APPLICATION, this.defaultNamespace = P.defaultNamespace || null, this.cdata = !1, this.currentElement = void 0, this.doc = void 0, this.locator = void 0, this.onError = P.onError;
  }
  function b(C, P) {
    P.lineNumber = C.lineNumber, P.columnNumber = C.columnNumber;
  }
  m.prototype = {
    /**
     * Either creates an XML or an HTML document and stores it under `this.doc`.
     * If it is an XML document, `this.defaultNamespace` is used to create it,
     * and it will not contain any `childNodes`.
     * If it is an HTML document, it will be created without any `childNodes`.
     *
     * @see http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
     */
    startDocument: function() {
      var C = new o();
      this.doc = s(this.mimeType) ? C.createHTMLDocument(!1) : C.createDocument(this.defaultNamespace, "");
    },
    startElement: function(C, P, W, j) {
      var oe = this.doc, ue = oe.createElementNS(C, W || P), B = j.length;
      x(this, ue), this.currentElement = ue, this.locator && b(this.locator, ue);
      for (var Z = 0; Z < B; Z++) {
        var C = j.getURI(Z), w = j.getValue(Z), W = j.getQName(Z), E = oe.createAttributeNS(C, W);
        this.locator && b(j.getLocator(Z), E), E.value = E.nodeValue = w, ue.setAttributeNode(E);
      }
    },
    endElement: function(C, P, W) {
      this.currentElement = this.currentElement.parentNode;
    },
    startPrefixMapping: function(C, P) {
    },
    endPrefixMapping: function(C) {
    },
    processingInstruction: function(C, P) {
      var W = this.doc.createProcessingInstruction(C, P);
      this.locator && b(this.locator, W), x(this, W);
    },
    ignorableWhitespace: function(C, P, W) {
    },
    characters: function(C, P, W) {
      if (C = _.apply(this, arguments), C) {
        if (this.cdata)
          var j = this.doc.createCDATASection(C);
        else
          var j = this.doc.createTextNode(C);
        this.currentElement ? this.currentElement.appendChild(j) : /^\s*$/.test(C) && this.doc.appendChild(j), this.locator && b(this.locator, j);
      }
    },
    skippedEntity: function(C) {
    },
    endDocument: function() {
      this.doc.normalize();
    },
    /**
     * Stores the locator to be able to set the `columnNumber` and `lineNumber`
     * on the created DOM nodes.
     *
     * @param {Locator} locator
     */
    setDocumentLocator: function(C) {
      C && (C.lineNumber = 0), this.locator = C;
    },
    //LexicalHandler
    comment: function(C, P, W) {
      C = _.apply(this, arguments);
      var j = this.doc.createComment(C);
      this.locator && b(this.locator, j), x(this, j);
    },
    startCDATA: function() {
      this.cdata = !0;
    },
    endCDATA: function() {
      this.cdata = !1;
    },
    startDTD: function(C, P, W, j) {
      var oe = this.doc.implementation;
      if (oe && oe.createDocumentType) {
        var ue = oe.createDocumentType(C, P, W, j);
        this.locator && b(this.locator, ue), x(this, ue), this.doc.doctype = ue;
      }
    },
    reportError: function(C, P) {
      if (typeof this.onError == "function")
        try {
          this.onError(C, P, this);
        } catch (W) {
          throw new u("Reporting " + C + ' "' + P + '" caused ' + W, this.locator);
        }
      else
        console.error("[xmldom " + C + "]	" + P, g(this.locator));
    },
    /**
     * @see http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
     */
    warning: function(C) {
      this.reportError("warning", C);
    },
    error: function(C) {
      this.reportError("error", C);
    },
    /**
     * This function reports a fatal error and throws a ParseError.
     *
     * @param {string} message
     * - The message to be used for reporting and throwing the error.
     * @param {Error} [cause]
     * The error that caused this fatal error, preserved as the thrown `ParseError`'s `cause`.
     * @returns {never}
     * This function always throws an error and never returns a value.
     * @throws {ParseError}
     * Always throws a ParseError with the provided message.
     */
    fatalError: function(C, P) {
      throw this.reportError("fatalError", C), new u(C, this.locator, P);
    }
  };
  function g(C) {
    if (C)
      return `
@#[line:` + C.lineNumber + ",col:" + C.columnNumber + "]";
  }
  function _(C, P, W) {
    return typeof C == "string" ? C.substr(P, W) : C.length >= P + W || P ? new java.lang.String(C, P, W) + "" : C;
  }
  "endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(
    /\w+/g,
    function(C) {
      m.prototype[C] = function() {
        return null;
      };
    }
  );
  function x(C, P) {
    C.currentElement ? C.currentElement.appendChild(P) : C.doc.appendChild(P);
  }
  function D(C) {
    if (C === "error") throw "onErrorStopParsing";
  }
  function R() {
    throw "onWarningStopParsing";
  }
  return Wr.__DOMHandler = m, Wr.DOMParser = y, Wr.normalizeLineEndings = c, Wr.onErrorStopParsing = D, Wr.onWarningStopParsing = R, Wr;
}
var dl;
function B_() {
  if (dl) return Fe;
  dl = 1;
  var e = In();
  Fe.assign = e.assign, Fe.hasDefaultHTMLNamespace = e.hasDefaultHTMLNamespace, Fe.isHTMLMimeType = e.isHTMLMimeType, Fe.isValidMimeType = e.isValidMimeType, Fe.MIME_TYPE = e.MIME_TYPE, Fe.NAMESPACE = e.NAMESPACE;
  var t = bo();
  Fe.DOMException = t.DOMException, Fe.DOMExceptionName = t.DOMExceptionName, Fe.ExceptionCode = t.ExceptionCode, Fe.ParseError = t.ParseError;
  var r = gc();
  Fe.Attr = r.Attr, Fe.CDATASection = r.CDATASection, Fe.CharacterData = r.CharacterData, Fe.Comment = r.Comment, Fe.Document = r.Document, Fe.DocumentFragment = r.DocumentFragment, Fe.DocumentType = r.DocumentType, Fe.DOMImplementation = r.DOMImplementation, Fe.Element = r.Element, Fe.Entity = r.Entity, Fe.EntityReference = r.EntityReference, Fe.LiveNodeList = r.LiveNodeList, Fe.NamedNodeMap = r.NamedNodeMap, Fe.Node = r.Node, Fe.NodeList = r.NodeList, Fe.Notation = r.Notation, Fe.ProcessingInstruction = r.ProcessingInstruction, Fe.Text = r.Text, Fe.XMLSerializer = r.XMLSerializer;
  var n = R_();
  return Fe.DOMParser = n.DOMParser, Fe.normalizeLineEndings = n.normalizeLineEndings, Fe.onErrorStopParsing = n.onErrorStopParsing, Fe.onWarningStopParsing = n.onWarningStopParsing, Fe;
}
B_();
function F_(e) {
  return e === 9 || e === 10 || e === 13 || e >= 32 && e <= 55295 || e >= 57344 && e <= 65533 || e >= 65536 && e <= 1114111;
}
function z_(e) {
  for (const t of e) {
    const r = t.codePointAt(0);
    if (r == null || !F_(r))
      return !1;
  }
  return !0;
}
function q_(e, t = "XML value") {
  if (!z_(e))
    throw new Error(`${t} contains a character forbidden by XML 1.0`);
}
function H_(e, t = '"') {
  return q_(e, "XML attribute value"), e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;").replace(t === '"' ? /"/g : /'/g, t === '"' ? "&quot;" : "&apos;");
}
function U_(e) {
  return H_(e);
}
var fl;
(function(e) {
  e.OfficeDocument = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", e.FontTable = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable", e.Image = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", e.Numbering = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering", e.Styles = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", e.StylesWithEffects = "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects", e.Theme = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme", e.Settings = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings", e.WebSettings = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings", e.Hyperlink = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", e.Footnotes = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes", e.Endnotes = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes", e.Footer = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer", e.Header = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header", e.ExtendedProperties = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", e.CoreProperties = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", e.CustomProperties = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/custom-properties", e.Comments = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments", e.CommentAuthors = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors", e.CommentsExtended = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended", e.AltChunk = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk", e.Slide = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide", e.SlideLayout = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", e.SlideMaster = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", e.NotesSlide = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide", e.NotesMaster = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster", e.HandoutMaster = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/handoutMaster", e.PresentationProperties = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps", e.ViewProperties = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps", e.VbaProject = "http://schemas.microsoft.com/office/2006/relationships/vbaProject", e.CustomXml = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml", e.Tags = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tags", e.Control = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/control", e.ContentPart = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/contentPart", e.TableStyles = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles", e.Chart = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart", e.ChartStyle = "http://schemas.microsoft.com/office/2011/relationships/chartStyle", e.ChartColorStyle = "http://schemas.microsoft.com/office/2011/relationships/chartColorStyle", e.ChartUserShapes = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartUserShapes", e.DiagramData = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData", e.DiagramLayout = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout", e.DiagramQuickStyle = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle", e.DiagramColors = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors", e.DiagramDrawing = "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing";
})(fl || (fl = {}));
const V_ = ["urn:microsoft.com/office/officeart/2005/8/layout/", "urn:microsoft.com/office/officeart/2008/layout/", "urn:microsoft.com/office/officeart/2024/layout/", "urn:microsoft.com/office/officeart/2009/3/layout/", "urn:microsoft.com/office/officeart/2009/layout/", "urn:microsoft.com/office/officeart/2026/layout/"], $_ = ["flat", "hub", "grouped"], j_ = [
  ["default", "Basic Block List", 0, [["list", 400]], [0, 5, 0], 1],
  ["AlternatingHexagons", "Alternating Hexagons", 1, [["list", 1500]], [2, 3, 1], 0],
  ["pList1", "Picture Caption List", 0, [["list", 2e3], ["picture", 2500]], [0, 4, 0], 0],
  ["LinedList", "Lined List", 1, [["list", 2500], ["hierarchy", 8e3]], [1, 1, 3], 1],
  ["vList2", "Vertical Bullet List", 0, [["list", 3e3]], [2, 2, 1], 0],
  ["list1", "Vertical Box List", 0, [["list", 4e3]], [0, 3, 0], 0],
  ["hList1", "Horizontal Bullet List", 0, [["list", 5e3]], [2, 3, 2], 1],
  ["SquareAccentList", "Square Accent List", 1, [["list", 5500]], [2, 2, 3], 0],
  ["hList2", "Picture Accent List", 0, [["list", 6e3], ["relationship", 16e3], ["picture", 29e3]], [2, 3, 2], 1],
  ["bList2", "Bending Picture Accent List", 0, [["list", 7e3], ["picture", 28e3]], [0, 3, 0], 1],
  ["hList9", "Stacked List", 0, [["list", 8e3]], [2, 2, 2], 1],
  ["VerticalActionList", "Vertical Action List", 2, [["list", 8200]], [2, 5, 1], 0],
  ["IncreasingCircleProcess", "Increasing Circle Process", 1, [["process", 4300], ["list", 8300]], [2, 3, 1], 1],
  ["PieProcess", "Pie Process", 3, [["process", 4600], ["list", 8600]], [2, 3, 1], 0],
  ["hProcess7", "Detailed Process", 0, [["list", 9e3], ["process", 21e3]], [2, 3, 1], 0],
  ["lProcess2", "Grouped List", 0, [["list", 1e4], ["relationship", 13e3]], [2, 3, 2], 0],
  ["pList2", "Horizontal Picture List", 0, [["list", 11e3], ["picture", 24e3]], [0, 3, 0], 0],
  ["hList7", "Continuous Picture List", 0, [["list", 12e3], ["relationship", 14e3], ["process", 2e4], ["picture", 25e3]], [0, 3, 0], 0],
  ["PictureStrips", "Picture Strips", 1, [["list", 12500], ["picture", 13e3]], [0, 3, 0], 0],
  ["vList4", "Vertical Picture List", 0, [["list", 13e3], ["picture", 26e3]], [2, 3, 2], 0],
  ["AlternatingPictureBlocks", "Alternating Picture Blocks", 1, [["list", 13500], ["picture", 15e3]], [0, 3, 0], 0],
  ["vList3", "Vertical Picture Accent List", 0, [["list", 14e3], ["picture", 27e3]], [0, 3, 0], 0],
  ["PictureAccentList", "Picture Accent List", 1, [["picture", 14e3], ["list", 14500]], [1, 1, 2], 0],
  ["vList5", "Vertical Block List", 0, [["list", 15e3]], [2, 3, 2], 1],
  ["chevron2", "Vertical Chevron List", 0, [["process", 12e3], ["list", 16e3]], [2, 3, 2], 0],
  ["VerticalAccentList", "Vertical Accent List", 1, [["list", 16500]], [2, 3, 1], 0],
  ["vList6", "Vertical Arrow List", 0, [["list", 17e3], ["process", 22e3]], [2, 2, 2], 1],
  ["hList6", "Trapezoid List", 0, [["list", 18e3]], [2, 3, 2], 1],
  ["BlockDescendingList", "Block Descending List", 3, [["list", 18500]], [2, 3, 2], 0],
  ["IconCircleLabelList", "Icon Circle Label List", 2, [["picture", 8500], ["list", 18500]], [0, 3, 0], 1],
  ["hList3", "Table List", 0, [["list", 19e3]], [1, 1, 3], 1],
  ["process4", "Segmented Process", 0, [["process", 16e3], ["list", 2e4]], [2, 3, 2], 0],
  ["VerticalCurvedList", "Vertical Curved List", 1, [["list", 2e4]], [0, 3, 0], 0],
  ["pyramid2", "Pyramid List", 0, [["pyramid", 3e3], ["list", 21e3]], [0, 3, 0], 0],
  ["target3", "Target List", 0, [["relationship", 11e3], ["list", 22e3]], [2, 3, 2], 0],
  ["hierarchy3", "Hierarchy List", 0, [["hierarchy", 7e3], ["relationship", 15e3], ["list", 23e3]], [2, 2, 2], 0],
  ["VerticalCircleList", "Vertical Circle List", 1, [["list", 23500]], [2, 2, 2], 1],
  ["hierarchy4", "Table Hierarchy", 0, [["hierarchy", 4e3], ["relationship", 1e4], ["list", 24e3]], [2, 3, 2], 0],
  ["process1", "Basic Process", 0, [["process", 1e3]], [0, 3, 0], 1],
  ["StepUpProcess", "Step Up Process", 3, [["process", 1300]], [0, 3, 0], 0],
  ["StepDownProcess", "Step Down Process", 0, [["process", 1600]], [2, 3, 1], 0],
  ["NumberedLinearArrowProcess", "Numbered Linear Arrow Process", 2, [["process", 1700]], [0, 3, 0], 1],
  ["process3", "Accent Process", 0, [["process", 2e3]], [2, 3, 1], 1],
  ["hProcess10", "Picture Accent Process", 0, [["process", 3e3], ["picture", 3e4]], [2, 3, 2], 1],
  ["hProcess4", "Alternating Flow", 0, [["process", 4e3]], [2, 3, 2], 1],
  ["hProcess9", "Continuous Block Process", 0, [["process", 5e3]], [0, 3, 0], 1],
  ["IncreasingArrowsProcess", "Increasing Arrows Process", 3, [["process", 5500]], [2, 3, 1], 0],
  ["hProcess3", "Continuous Arrow Process", 0, [["process", 6e3]], [0, 3, 0], 0],
  ["hProcess6", "Process Arrows", 0, [["process", 7e3]], [2, 3, 2], 0],
  ["BulletTimeline", "Bullet Timeline", 2, [["timeline", 100], ["process", 7450]], [2, 5, 1], 1],
  ["BulletTimelineInverted", "Bullet Timeline Inverted", 2, [["timeline", 101], ["process", 7451]], [2, 5, 1], 1],
  ["CircleAccentTimeline", "Circle Accent Timeline", 1, [["timeline", 104], ["process", 7500]], [2, 2, 2], 1],
  ["hProcess11", "Basic Timeline", 0, [["timeline", 103], ["process", 8e3]], [0, 3, 0], 0],
  ["chevron1", "Basic Chevron Process", 0, [["process", 9e3]], [0, 3, 0], 1],
  ["hChevron3", "Closed Chevron Process", 0, [["process", 1e4]], [0, 3, 0], 1],
  ["lProcess3", "Chevron List", 0, [["process", 11e3]], [2, 3, 2], 1],
  ["SubStepProcess", "Sub Step Process", 3, [["process", 12250]], [1, 1, 2], 0],
  ["PhasedProcess", "Phased Process", 3, [["process", 12500]], [2, 3, 2], 1],
  ["RandomtoResultProcess", "Random to Result Process", 3, [["process", 12750]], [2, 2, 1], 1],
  ["process2", "Vertical Process", 0, [["process", 13e3]], [0, 3, 0], 1],
  ["vProcess5", "Staggered Process", 0, [["process", 14e3]], [0, 3, 0], 0],
  ["lProcess1", "Process List", 0, [["process", 15e3]], [2, 2, 2], 1],
  ["CircleArrowProcess", "Circle Arrow Process", 4, [["cycle", 16e3], ["process", 16500]], [0, 3, 0], 1],
  ["process5", "Basic Bending Process", 0, [["process", 17e3]], [0, 5, 0], 0],
  ["bProcess3", "Repeating Bending Process", 0, [["process", 18e3]], [0, 5, 0], 0],
  ["bProcess4", "Vertical Bending Process", 0, [["process", 19e3]], [0, 9, 0], 0],
  ["AscendingPictureAccentProcess", "Ascending Picture Accent Process", 1, [["picture", 16e3], ["process", 22500]], [0, 2, 0], 1],
  ["arrow2", "Upward Arrow", 0, [["process", 23e3]], [0, 3, 0], 1],
  ["DescendingProcess", "Descending Process", 3, [["process", 23500]], [0, 5, 0], 0],
  ["bProcess2", "Circular Bending Process", 0, [["process", 24e3]], [0, 9, 0], 0],
  ["equation1", "Equation", 0, [["relationship", 17e3], ["process", 25e3]], [0, 3, 0], 0],
  ["equation2", "Vertical Equation", 0, [["relationship", 18e3], ["process", 26e3]], [0, 3, 0], 1],
  ["funnel1", "Funnel", 0, [["relationship", 2e3], ["process", 27e3]], [0, 4, 0], 1],
  ["gear1", "Gear", 0, [["relationship", 3e3], ["cycle", 14e3], ["process", 28e3]], [0, 3, 0], 0],
  ["arrow6", "Arrow Ribbon", 0, [["relationship", 4e3], ["process", 29e3]], [0, 2, 0], 0],
  ["arrow4", "Opposing Arrows", 0, [["relationship", 8e3], ["process", 3e4]], [0, 2, 0], 0],
  ["arrow5", "Converging Arrows", 0, [["relationship", 6e3], ["process", 31e3]], [0, 2, 0], 1],
  ["arrow1", "Diverging Arrows", 0, [["relationship", 7e3], ["process", 32e3]], [0, 2, 0], 1],
  ["cycle2", "Basic Cycle", 0, [["cycle", 1e3]], [0, 5, 0], 1],
  ["cycle1", "Text Cycle", 0, [["cycle", 2e3]], [0, 5, 0], 1],
  ["cycle5", "Block Cycle", 0, [["cycle", 3e3]], [0, 5, 0], 1],
  ["cycle6", "Nondirectional Cycle", 0, [["cycle", 4e3], ["relationship", 24e3]], [0, 5, 0], 1],
  ["cycle3", "Continuous Cycle", 0, [["cycle", 5e3]], [0, 5, 0], 1],
  ["cycle7", "Multidirectional Cycle", 0, [["cycle", 6e3]], [0, 3, 0], 0],
  ["cycle8", "Segmented Cycle", 0, [["cycle", 7e3]], [0, 3, 0], 0],
  ["chart3", "Basic Pie", 0, [["cycle", 8e3], ["relationship", 27e3]], [0, 3, 0], 0],
  ["radial6", "Radial Cycle", 0, [["cycle", 9e3], ["relationship", 21e3]], [1, 1, 4], 1],
  ["radial1", "Basic Radial", 0, [["cycle", 1e4], ["relationship", 22e3]], [1, 1, 4], 1],
  ["radial5", "Diverging Radial", 0, [["cycle", 11e3], ["relationship", 23e3]], [1, 1, 4], 1],
  ["radial3", "Radial Venn", 0, [["cycle", 12e3], ["relationship", 31e3]], [1, 1, 4], 0],
  ["cycle4", "Cycle Matrix", 0, [["matrix", 4e3], ["cycle", 13e3], ["relationship", 26e3]], [2, 4, 1], 0],
  ["RadialCluster", "Radial Cluster", 1, [["cycle", 15e3], ["relationship", 19500]], [1, 1, 3], 1],
  ["orgChart1", "Organization Chart", 0, [["hierarchy", 1e3]], [1, 1, 4], 0],
  ["NameandTitleOrganizationalChart", "Name and Title Organizational Chart", 1, [["hierarchy", 1250]], [1, 1, 4], 0],
  ["HalfCircleOrganizationChart", "Half Circle Organization Chart", 1, [["hierarchy", 1500]], [1, 1, 4], 0],
  ["CirclePictureHierarchy", "Circle Picture Hierarchy", 4, [["hierarchy", 1750], ["picture", 23e3]], [2, 3, 2], 0],
  ["hierarchy1", "Hierarchy", 0, [["hierarchy", 2e3]], [2, 3, 2], 0],
  ["hierarchy6", "Labeled Hierarchy", 0, [["hierarchy", 3e3]], [2, 3, 2], 1],
  ["HorizontalOrganizationChart", "Horizontal Organization Chart", 3, [["hierarchy", 4300]], [1, 1, 4], 0],
  ["HorizontalMultiLevelHierarchy", "Horizontal Multi-Level Hierarchy", 1, [["hierarchy", 4600]], [1, 1, 3], 1],
  ["hierarchy2", "Horizontal Hierarchy", 0, [["hierarchy", 5e3]], [2, 3, 2], 0],
  ["hierarchy5", "Horizontal Labeled Hierarchy", 0, [["hierarchy", 6e3]], [2, 3, 2], 1],
  ["balance1", "Balance", 0, [["relationship", 1e3]], [2, 2, 3], 1],
  ["CircleRelationship", "Circle Relationship", 3, [["relationship", 1500]], [1, 1, 2], 1],
  ["HexagonCluster", "Hexagon Cluster", 1, [["relationship", 3200], ["picture", 21e3]], [0, 3, 0], 1],
  ["OpposingIdeas", "Opposing Ideas", 3, [["relationship", 3400]], [2, 2, 1], 0],
  ["PlusandMinus", "Plus and Minus", 3, [["relationship", 3600]], [0, 2, 0], 0],
  ["ReverseList", "Reverse List", 4, [["relationship", 3800]], [0, 2, 0], 0],
  ["arrow3", "Counterbalance Arrows", 0, [["relationship", 5e3]], [0, 2, 0], 0],
  ["pyramid4", "Segmented Pyramid", 0, [["pyramid", 4e3], ["relationship", 9e3]], [0, 4, 0], 0],
  ["target2", "Nested Target", 0, [["relationship", 12e3]], [2, 3, 2], 0],
  ["radial4", "Converging Radial", 0, [["relationship", 19e3]], [1, 1, 3], 1],
  ["radial2", "Radial List", 0, [["relationship", 2e4]], [2, 3, 2], 1],
  ["target1", "Basic Target", 0, [["relationship", 25e3]], [0, 3, 0], 0],
  ["venn1", "Basic Venn", 0, [["relationship", 28e3]], [0, 3, 0], 0],
  ["venn3", "Linear Venn", 0, [["relationship", 29e3]], [0, 4, 0], 0],
  ["venn2", "Stacked Venn", 0, [["relationship", 3e4]], [0, 4, 0], 0],
  ["matrix3", "Basic Matrix", 0, [["matrix", 1e3]], [0, 4, 0], 0],
  ["matrix1", "Titled Matrix", 0, [["matrix", 2e3]], [1, 1, 4], 0],
  ["matrix2", "Grid Matrix", 0, [["matrix", 3e3]], [0, 4, 0], 0],
  ["pyramid1", "Basic Pyramid", 0, [["pyramid", 1e3]], [0, 3, 0], 0],
  ["pyramid3", "Inverted Pyramid", 0, [["pyramid", 2e3]], [0, 3, 0], 0],
  ["AccentedPicture", "Accented Picture", 1, [["picture", 1e3]], [0, 4, 0], 1],
  ["CircularPictureCallout", "Circular Picture Callout", 1, [["picture", 2e3]], [0, 4, 0], 0],
  ["SnapshotPictureList", "Snapshot Picture List", 3, [["picture", 3e3]], [1, 1, 1], 0],
  ["SpiralPicture", "Spiral Picture", 3, [["picture", 4e3]], [0, 5, 0], 1],
  ["CaptionedPictures", "Captioned Pictures", 1, [["picture", 5e3]], [2, 3, 1], 0],
  ["BendingPictureCaption", "Bending Picture Caption", 1, [["picture", 6e3]], [0, 2, 0], 0],
  ["BendingPictureSemiTransparentText", "Bending Picture Semi-Transparent Text", 1, [["picture", 7e3]], [0, 3, 0], 0],
  ["BendingPictureBlocks", "Bending Picture Blocks", 1, [["picture", 8e3]], [0, 3, 0], 0],
  ["BendingPictureCaptionList", "Bending Picture Caption List", 1, [["picture", 9e3]], [0, 3, 0], 0],
  ["TitledPictureBlocks", "Titled Picture Blocks", 1, [["picture", 1e4]], [2, 3, 1], 0],
  ["PictureGrid", "Picture Grid", 1, [["picture", 11e3]], [0, 4, 0], 0],
  ["PictureAccentBlocks", "Picture Accent Blocks", 1, [["picture", 12e3]], [0, 3, 0], 1],
  ["AlternatingPictureCircles", "Alternating Picture Circles", 1, [["picture", 17e3]], [0, 3, 0], 1],
  ["TitlePictureLineup", "Title Picture Lineup", 1, [["picture", 18e3]], [2, 3, 1], 0],
  ["PictureLineup", "Picture Lineup", 1, [["picture", 19e3]], [0, 3, 0], 0],
  ["FramedTextPicture", "Framed Text Picture", 3, [["picture", 2e4]], [0, 1, 0], 0],
  ["BubblePictureList", "Bubble Picture List", 1, [["picture", 22e3]], [0, 3, 0], 0],
  ["AlternatingCircleProcess", "Alternating Circle Process", 2, [["timeline", 102]], [2, 5, 1], 0],
  ["NumberedDotsHorizontal", "Numbered Dots Horizontal", 5, [["timeline", 105]], [2, 5, 1], 0],
  ["NumberedDotsVertical", "Numbered Dots Vertical", 5, [["timeline", 106]], [2, 5, 1], 0],
  ["SmallDotsHorizontal", "Small Dots Horizontal", 5, [["timeline", 107]], [2, 4, 1], 0],
  ["SmallDotsVertical", "Small Dots Vertical", 5, [["timeline", 108]], [2, 4, 1], 0],
  ["MeetTheTeam", "Meet the Team", 2, [["meettheteam", 100]], [2, 4, 1], 1],
  ["MeetTheTeamCard", "Meet the Team Card", 2, [["meettheteam", 101]], [2, 4, 1], 0],
  ["MeetTheTeamCardVertical", "Meet the Team Card Vertical", 2, [["meettheteam", 102]], [2, 4, 1], 0],
  ["MeetTheTeamOval", "Meet the Team Oval", 2, [["meettheteam", 103]], [2, 4, 1], 0],
  ["TextCardSideLineNumbered", "Text Card Side Line Numbered", 5, [["textcard", 100]], [2, 3, 1], 1],
  ["TextCardSideLineIcon", "Text Card Side Line Icon", 5, [["textcard", 101]], [2, 3, 1], 1],
  ["TextCardSideLineQuote", "Text Card Side Line Quote", 5, [["textcard", 102]], [2, 3, 1], 0],
  ["TextCardSideLineWideImage", "Text Card Side Line Wide Image", 5, [["textcard", 103]], [2, 3, 1], 1],
  ["TextCardShortLine", "Text Card Short Line", 5, [["textcard", 104]], [2, 3, 1], 1],
  ["TextCardShortLineNumber", "Text Card Short Line Number", 5, [["textcard", 105]], [2, 3, 1], 1],
  ["TextCardShortLineQuote", "Text Card Short Line Quote", 5, [["textcard", 106]], [2, 3, 1], 0],
  ["TextCardShortLineWide", "Text Card Short Line Wide", 5, [["textcard", 107]], [2, 3, 1], 1],
  ["HorizontalActionList", "Horizontal Action List", 2, [["textcard", 200]], [2, 3, 1], 1],
  ["NumberedTitleCardList", "Numbered Card List", 2, [["textcard", 201]], [0, 3, 0], 0],
  ["NumberedTitleList", "Numbered Title List", 2, [["textcard", 202]], [0, 3, 0], 0]
], yc = Object.freeze(j_.map(([e, t, r, n, i, o]) => ({
  familyId: e,
  uniqueId: V_[r] + e,
  name: t,
  categories: n.map(([a, s]) => ({ category: a, priority: s })),
  sample: { shape: $_[i[0]], groups: i[1], children: i[2] },
  solverBacked: o === 1
})));
Object.freeze(yc.map((e) => e.familyId));
new Map(yc.map((e) => [e.familyId, e]));
let W_ = 0;
function vc(e) {
  return `math-${e}-${++W_}`;
}
function xe(e, t = [], r = {}) {
  return {
    id: r.id ?? vc(e),
    kind: e,
    children: t,
    ...r.text !== void 0 ? { text: r.text } : {},
    ...r.props ? { props: { ...r.props } } : {},
    ...r.style ? { style: { ...r.style } } : {},
    ...r.sourceXml ? { sourceXml: r.sourceXml } : {}
  };
}
function bc(e = [], t = {}) {
  return {
    id: t.id ?? vc("root"),
    kind: "root",
    children: e,
    display: t.display ?? !1,
    ...t.sourceXml ? { sourceXml: t.sourceXml } : {}
  };
}
const G_ = "http://www.w3.org/1998/Math/MathML";
function Ot(e) {
  return U_(String(e ?? ""));
}
function Ne(e, t = "", r = {}) {
  const n = Object.entries(r).filter(([, i]) => i != null && i !== !1 && i !== "").map(([i, o]) => ` ${i}="${Ot(o)}"`).join("");
  return `<${e}${n}>${t}</${e}>`;
}
function Je(e, t) {
  return e.children.find((r) => r.kind === t);
}
function Qt(e, t, r, n) {
  return e.children.map((i) => bn(i, t, [...r, i.id], n)).join("");
}
function Ke(e, t, r) {
  return Ne("mrow", e ? Qt(e, void 0, [...t, e.id], r) : "");
}
function K_(e) {
  return (e.match(/\d+(?:[.,]\d+)?|[\p{L}\p{M}]|\s+|./gu) ?? []).map((r) => /^\d/u.test(r) ? Ne("mn", Ot(r)) : /^[\p{L}\p{M}]$/u.test(r) ? Ne("mi", Ot(r)) : /^\s+$/u.test(r) ? Ne("mtext", Ot(r)) : Ne("mo", Ot(r))).join("");
}
function bn(e, t, r, n) {
  var o;
  const i = e.props ?? {};
  switch (e.kind) {
    case "root":
    case "row":
      return Ne("mrow", Qt(e, void 0, r, n));
    case "run": {
      const a = ((o = n.runAttributes) == null ? void 0 : o.call(n, e, r)) ?? {};
      return i.placeholder && !(e.text ?? "") ? Ne("mtext", "□", { ...a, class: n.placeholderClass }) : i.normalText ? Ne("mtext", Ot(e.text ?? ""), a) : Ne("mrow", K_(e.text ?? ""), a);
    }
    case "fraction": {
      const a = Je(e, "numerator"), s = Je(e, "denominator");
      return i.fractionType === "lin" ? Ne("mrow", `${Ke(a, r, n)}${Ne("mo", "⁄")}${Ke(s, r, n)}`) : Ne("mfrac", `${Ke(a, r, n)}${Ke(s, r, n)}`, {
        linethickness: i.fractionType === "noBar" ? 0 : void 0,
        bevelled: i.fractionType === "skw" ? "true" : void 0
      });
    }
    case "radical": {
      const a = Je(e, "base"), s = Je(e, "degree");
      return i.hideDegree || !s || !s.children.length ? Ne("msqrt", a ? Qt(a, void 0, [...r, a.id], n) : "") : Ne("mroot", `${Ke(a, r, n)}${Ke(s, r, n)}`);
    }
    case "superscript":
      return Ne("msup", `${Ke(Je(e, "base"), r, n)}${Ke(Je(e, "superArgument"), r, n)}`);
    case "subscript":
      return Ne("msub", `${Ke(Je(e, "base"), r, n)}${Ke(Je(e, "subArgument"), r, n)}`);
    case "subSuperscript":
      return Ne("msubsup", `${Ke(Je(e, "base"), r, n)}${Ke(Je(e, "subArgument"), r, n)}${Ke(Je(e, "superArgument"), r, n)}`);
    case "preSubSuper":
      return Ne("mmultiscripts", `${Ke(Je(e, "base"), r, n)}<mprescripts/>${Ke(Je(e, "subArgument"), r, n)}${Ke(Je(e, "superArgument"), r, n)}`);
    case "limitLower":
      return Ne("munder", `${Ke(Je(e, "base"), r, n)}${Ke(Je(e, "limit"), r, n)}`);
    case "limitUpper":
      return Ne("mover", `${Ke(Je(e, "base"), r, n)}${Ke(Je(e, "limit"), r, n)}`);
    case "matrix":
      return Ne("mtable", e.children.map((a) => bn(a, "matrix", [...r, a.id], n)).join(""));
    case "matrixRow":
      return Ne("mtr", e.children.map((a) => bn(a, "matrixRow", [...r, a.id], n)).join(""));
    case "base":
      return t === "matrixRow" ? Ne("mtd", Qt(e, void 0, r, n)) : Qt(e, void 0, r, n);
    case "equationArray":
      return Ne("mtable", e.children.map((a) => Ne("mtr", Ne("mtd", bn(a, void 0, [...r, a.id], n)))).join(""));
    case "delimiter": {
      const a = e.children.map((s, l) => bn(s, void 0, [...r, s.id], n) + (i.separatorChar && l < e.children.length - 1 ? Ne("mo", Ot(i.separatorChar)) : "")).join("");
      return Ne("mrow", `${Ne("mo", Ot(i.beginChar ?? "("))}${a}${Ne("mo", Ot(i.endChar ?? ")"))}`);
    }
    case "nary": {
      const a = Je(e, "base"), s = i.hideSubArgument ? void 0 : Je(e, "subArgument"), l = i.hideSuperArgument ? void 0 : Je(e, "superArgument"), f = Ne("mo", Ot(i.char ?? "∫")), d = s && l ? Ne(i.limitLocation === "subSup" ? "msubsup" : "munderover", `${f}${Ke(s, r, n)}${Ke(l, r, n)}`) : s ? Ne(i.limitLocation === "subSup" ? "msub" : "munder", `${f}${Ke(s, r, n)}`) : l ? Ne(i.limitLocation === "subSup" ? "msup" : "mover", `${f}${Ke(l, r, n)}`) : f;
      return Ne("mrow", d + (a ? Qt(a, void 0, [...r, a.id], n) : ""));
    }
    case "accent":
      return Ne("mover", `${Ke(Je(e, "base"), r, n)}${Ne("mo", Ot(i.char ?? "̂"))}`);
    case "bar":
      return Ne("mrow", Qt(e, void 0, r, n), {
        style: `text-decoration:${i.position === "bottom" ? "underline" : "overline"}`
      });
    case "borderBox":
      return Ne("menclose", Qt(e, void 0, r, n), { notation: "box" });
    case "phantom":
      return Ne(i.showPhantom ? "mrow" : "mphantom", Qt(e, void 0, r, n));
    case "groupChar":
      return Ne(i.verticalJustification === "bot" ? "mover" : "munder", `${Ke(Je(e, "base"), r, n)}${Ne("mo", Ot(i.char ?? "⏞"))}`);
    case "opaque":
      return Ne("mtext", Ot(e.text ?? ""));
    default:
      return Ne("mrow", Qt(e, void 0, r, n));
  }
}
function X_(e, t = {}) {
  return Ne("math", bn(e, void 0, [], t), {
    xmlns: G_,
    display: e.display ? "block" : void 0,
    displaystyle: e.display ? "true" : void 0
  });
}
const hl = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  pm: "±",
  times: "×",
  div: "÷",
  ne: "≠",
  le: "≤",
  ge: "≥",
  infty: "∞",
  cdot: "·",
  to: "→",
  rightarrow: "→",
  leftarrow: "←"
}, Y_ = /* @__PURE__ */ new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "log",
  "ln",
  "exp",
  "max",
  "min"
]), pl = {
  hat: "̂",
  widehat: "̂",
  vec: "⃗",
  dot: "˙",
  ddot: "¨",
  tilde: "˜"
};
class ml {
  constructor(t, r) {
    this.input = t, this.syntax = r, this.index = 0, this.errors = [];
  }
  parse() {
    const t = this.parseSequence();
    return this.index < this.input.length && this.error("unexpected-token", "Unexpected input."), bc(t, { display: !1 });
  }
  parseSequence(t) {
    const r = [];
    for (; this.index < this.input.length && (this.skipWhitespace(), !(this.index >= this.input.length || t && this.input[this.index] === t)); ) {
      if (this.input[this.index] === "}") {
        this.error("unexpected-token", "Unexpected closing brace."), this.index++;
        continue;
      }
      if (this.input[this.index] === "/" && r.length) {
        this.index++;
        const o = this.parseArgument("denominator"), a = r.pop();
        r.push(xe("fraction", [
          xe("numerator", [a]),
          xe("denominator", [o])
        ]));
        continue;
      }
      const n = this.parseAtom();
      if (!n)
        continue;
      const i = this.parseScripts(n);
      r.push(i.kind === "nary" ? this.parseNaryOperand(i, t) : i);
    }
    return t && (this.input[this.index] === t ? this.index++ : this.error("missing-delimiter", `Expected '${t}'.`)), r;
  }
  parseAtom() {
    const t = this.index, r = this.input[this.index];
    if (r === "{")
      return this.index++, xe("row", this.parseSequence("}"));
    if (r === "(")
      return this.index++, xe("delimiter", [xe("base", this.parseSequence(")"))], {
        props: { beginChar: "(", endChar: ")" }
      });
    if (r === "\\")
      return this.parseCommand();
    if (/\d/u.test(r)) {
      for (; this.index < this.input.length && /[\d.,]/u.test(this.input[this.index]); )
        this.index++;
      return xe("run", [], { text: this.input.slice(t, this.index) });
    }
    return /[\p{L}\p{M}]/u.test(r) ? (this.index++, xe("run", [], { text: r })) : (this.index++, xe("run", [], { text: r }));
  }
  parseCommand() {
    this.index, this.index++;
    const t = this.index;
    for (; this.index < this.input.length && /[A-Za-z]/u.test(this.input[this.index]); )
      this.index++;
    const r = this.input.slice(t, this.index);
    return r ? r === "left" || r === "right" ? this.parseAtom() : r === "begin" ? this.parseMatrixEnvironment() : r === "frac" ? xe("fraction", [
      xe("numerator", [this.parseArgument("numerator")]),
      xe("denominator", [this.parseArgument("denominator")])
    ]) : r === "sqrt" ? xe("radical", [xe("base", [this.parseArgument("radical")])], { props: { hideDegree: !0 } }) : Object.hasOwn(pl, r) ? xe("accent", [xe("base", [this.parseArgument("accent")])], { props: { char: pl[r] } }) : r === "bar" || r === "overline" || r === "underline" ? xe("bar", [xe("base", [this.parseArgument("bar")])], {
      props: { position: r === "underline" ? "bottom" : "top" }
    }) : r === "overbrace" || r === "underbrace" ? xe("groupChar", [xe("base", [this.parseArgument("brace")])], {
      props: {
        char: r === "overbrace" ? "⏞" : "⏟",
        verticalJustification: r === "overbrace" ? "bot" : "top"
      }
    }) : Y_.has(r) ? xe("function", [
      xe("functionName", [
        xe("run", [], { text: r, props: { normalText: !0 } })
      ]),
      xe("base", [this.parseArgument(`${r} argument`)])
    ]) : r === "sum" || r === "int" || r === "prod" || r === "lim" ? xe("nary", [], { props: { char: r === "sum" ? "∑" : r === "int" ? "∫" : r === "prod" ? "∏" : "lim" } }) : (this.syntax === "latex" && !Object.hasOwn(hl, r) && this.error("unsupported-command", `Unsupported LaTeX command \\${r}.`), xe("run", [], {
      text: hl[r] ?? r,
      props: { sourceCommand: r }
    })) : xe("run", [], { text: "\\" });
  }
  parseMatrixEnvironment() {
    this.skipWhitespace();
    const t = "{matrix}";
    if (!this.input.startsWith(t, this.index))
      return this.syntax === "latex" && this.error("unsupported-command", "Only the matrix environment is supported."), xe("run", [], { text: "begin" });
    this.index += t.length;
    const r = "\\end{matrix}", n = [];
    let i = [];
    const o = (f) => {
      const d = _c({ text: f.trim(), syntax: this.syntax }), u = d.root.children.length ? d.root.children : [xe("run", [], { text: "", props: { placeholder: !0 } })];
      i.push(xe("base", u));
    }, a = () => {
      i.length || o(""), n.push(xe("matrixRow", i)), i = [];
    };
    let s = this.index, l = 0;
    for (; this.index < this.input.length; ) {
      if (l === 0 && this.input.startsWith(r, this.index))
        return o(this.input.slice(s, this.index)), a(), this.index += r.length, xe("matrix", n);
      if (l === 0 && this.input[this.index] === "&") {
        o(this.input.slice(s, this.index)), this.index++, s = this.index;
        continue;
      }
      if (l === 0 && this.input.startsWith("\\\\", this.index)) {
        o(this.input.slice(s, this.index)), a(), this.index += 2, s = this.index;
        continue;
      }
      this.input[this.index] === "{" ? l++ : this.input[this.index] === "}" && l > 0 && l--, this.index++;
    }
    return o(this.input.slice(s)), a(), this.error("missing-delimiter", "Expected \\end{matrix}."), xe("matrix", n);
  }
  parseArgument(t) {
    if (this.skipWhitespace(), this.input[this.index] === "{")
      return this.index++, xe("row", this.parseSequence("}"));
    const r = this.parseAtom();
    return r || (this.error("missing-argument", `Expected ${t}.`), xe("row", []));
  }
  parseScripts(t) {
    let r, n;
    for (; this.input[this.index] === "_" || this.input[this.index] === "^"; ) {
      const a = this.input[this.index++], s = this.parseArgument(a === "_" ? "subscript" : "superscript");
      a === "_" ? r = s : n = s;
    }
    const i = (a) => a.kind === "row" ? a.children : [a];
    if (t.kind === "nary")
      return r && t.children.push(xe("subArgument", i(r))), n && t.children.push(xe("superArgument", i(n))), t;
    const o = xe("base", [t]);
    return r && n ? xe("subSuperscript", [
      o,
      xe("subArgument", i(r)),
      xe("superArgument", i(n))
    ]) : r ? xe("subscript", [
      o,
      xe("subArgument", i(r))
    ]) : n ? xe("superscript", [
      o,
      xe("superArgument", i(n))
    ]) : t;
  }
  parseNaryOperand(t, r) {
    this.skipWhitespace();
    const n = this.input[this.index], o = !n || n === r || n === "}" || /[+/=,;:<>]/u.test(n) ? void 0 : this.parseAtom();
    return t.children.push(xe("base", o ? [this.parseScripts(o)] : [])), t;
  }
  skipWhitespace() {
    for (; this.index < this.input.length && /\s/u.test(this.input[this.index]); )
      this.index++;
  }
  error(t, r) {
    this.errors.push({ offset: this.index, code: t, message: r });
  }
}
function Z_(e) {
  const t = e.replace(/\r\n?/g, `
`), r = [];
  let n = 0, i = 0, o = 0, a = 0;
  for (let s = 0; s < t.length; s++) {
    if (t.startsWith("\\begin{matrix}", s)) {
      a++, s += 13;
      continue;
    }
    if (t.startsWith("\\end{matrix}", s)) {
      a = Math.max(0, a - 1), s += 11;
      continue;
    }
    const l = t[s];
    l === "{" ? i++ : l === "}" ? i = Math.max(0, i - 1) : l === "(" ? o++ : l === ")" ? o = Math.max(0, o - 1) : l === `
` && i === 0 && o === 0 && a === 0 && (r.push({ text: t.slice(n, s), offset: n }), n = s + 1);
  }
  return r.push({ text: t.slice(n), offset: n }), r;
}
function _c(e) {
  const t = e.syntax ?? "unicodeMath", r = e.multiline === "equationArray" ? Z_(e.text) : [{ text: e.text, offset: 0 }];
  if (e.multiline !== "equationArray") {
    const o = new ml(r[0].text, t);
    return { root: o.parse(), errors: o.errors };
  }
  const n = [], i = r.map((o) => {
    const a = new ml(o.text, t), s = a.parse();
    n.push(...a.errors.map((f) => ({ ...f, offset: f.offset + o.offset })));
    const l = s.children.length ? s.children : [xe("run", [], { text: "", props: { placeholder: !0 } })];
    return xe("base", l);
  });
  return {
    root: bc([xe("equationArray", i)], { display: !1 }),
    errors: n
  };
}
const Q_ = "equationArray", J_ = [
  {
    id: "quadratic",
    label: "Quadratic formula",
    text: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}",
    syntax: "latex"
  },
  { id: "pythagorean", label: "Pythagorean theorem", text: "a^2+b^2=c^2", syntax: "unicodeMath" },
  { id: "euler", label: "Euler's identity", text: "e^{i\\pi}+1=0", syntax: "latex" },
  { id: "circle-area", label: "Circle area", text: "A=\\pi r^2", syntax: "latex" },
  { id: "newton", label: "Newton's second law", text: "F=ma", syntax: "unicodeMath" },
  { id: "sum", label: "Finite sum", text: "\\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}", syntax: "latex" },
  { id: "integral", label: "Definite integral", text: "\\int_{a}^{b}f(x)dx", syntax: "latex" },
  {
    id: "derivative",
    label: "Derivative limit",
    text: "f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}",
    syntax: "latex"
  },
  { id: "product", label: "Finite product", text: "\\prod_{k=1}^{n}k=n!", syntax: "latex" },
  {
    id: "bayes",
    label: "Bayes' theorem",
    text: "P(A|B)=\\frac{P(B|A)P(A)}{P(B)}",
    syntax: "latex"
  },
  {
    id: "matrix",
    label: "2 × 2 matrix",
    text: "\\begin{matrix}a&b\\\\c&d\\end{matrix}",
    syntax: "latex"
  },
  { id: "system", label: "Equation system", text: `x+y=1
x-y=0`, syntax: "unicodeMath" }
];
Object.freeze(J_.map((e) => Object.freeze({
  ...e,
  mathMl: X_(_c({
    text: e.text,
    syntax: e.syntax,
    multiline: Q_
  }).root)
})));
const e5 = /* @__PURE__ */ Ee({
  __name: "UiSelect",
  props: {
    ariaLabel: {},
    disabled: { type: Boolean, default: !1 },
    modelValue: {},
    options: {},
    placeholder: { default: "Select" }
  },
  emits: ["update:modelValue"],
  setup(e, { emit: t }) {
    const r = e, n = t, i = be(
      () => r.options.find((a) => a.value === r.modelValue)
    ), o = be(
      () => r.options.map((a) => ({
        disabled: a.disabled,
        id: a.value,
        label: a.label
      }))
    );
    return (a, s) => {
      var l, f;
      return de(), ve(O_, {
        "aria-label": e.ariaLabel,
        class: "als-ofs-ui-select",
        disabled: e.disabled,
        items: o.value,
        label: ((l = i.value) == null ? void 0 : l.label) ?? e.placeholder,
        "selected-id": (f = i.value) == null ? void 0 : f.value,
        onSelect: s[0] || (s[0] = (d) => n("update:modelValue", d.id))
      }, null, 8, ["aria-label", "disabled", "items", "label", "selected-id"]);
    };
  }
});
class t5 extends HTMLElement {
  constructor() {
    super(...arguments), this.state = /* @__PURE__ */ Sn({ value: "", options: [] });
  }
  get value() {
    return this.state.value;
  }
  set value(t) {
    this.state.value = t;
  }
  get options() {
    return this.state.options;
  }
  set options(t) {
    this.state.options = t;
  }
  connectedCallback() {
    if (!this.app) {
      for (const t of ["value", "options"])
        if (Object.prototype.hasOwnProperty.call(this, t)) {
          const r = this[t];
          delete this[t], this[t] = r;
        }
      this.hasAttribute("options") && (this.options = JSON.parse(this.getAttribute("options"))), this.hasAttribute("value") && (this.value = this.getAttribute("value")), this.app = nh({ render: () => ir(e5, { modelValue: this.state.value, options: this.state.options, ariaLabel: this.getAttribute("aria-label") || "筛选", "onUpdate:modelValue": (t) => {
        this.value = t, this.dispatchEvent(new Event("change", { bubbles: !0 }));
      } }) }), this.app.mount(this);
    }
  }
  disconnectedCallback() {
    var t;
    (t = this.app) == null || t.unmount(), this.app = void 0;
  }
}
customElements.define("cube-select", t5);
