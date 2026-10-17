/* ============================================================
   Studio runtime — lets the engine mount and unmount cleanly.

   The engine was written for a page of its own: it binds listeners on
   window/document, starts observers and timers, and appends popups to
   <body>. Inside the admin it lives next to the Blog Admin, so leaving
   the Social Media workspace (a client-side navigation) must remove all
   of that. bootStudio() shadows these globals with the tracked versions
   below; destroy() undoes everything they recorded.
   ============================================================ */

const capture = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));

export function createRuntime() {
  const listeners = []; // [target, type, fn, options]
  const timeouts = new Set();
  const intervals = new Set();
  const frames = new Set();
  const observers = new Set();
  const created = new WeakSet(); // elements the engine created (popups appended to <body>)
  const windowProps = new Set(); // globals the engine assigned (window.x = …)
  const bodyClasses = new Set(document.body.classList);
  let alive = true;

  /** Wraps an EventTarget so listeners added through it are recorded. Other members pass through. */
  const tracked = (target, extra = {}) => {
    const bound = new Map();
    const own = {
      addEventListener(type, fn, opts) {
        if (!alive) return;
        listeners.push([target, type, fn, opts]);
        target.addEventListener(type, fn, opts);
      },
      removeEventListener(type, fn, opts) {
        target.removeEventListener(type, fn, opts);
        const i = listeners.findIndex(([t, ty, f, o]) => t === target && ty === type && f === fn && capture(o) === capture(opts));
        if (i >= 0) listeners.splice(i, 1);
      },
      ...extra,
    };
    return new Proxy(target, {
      get(t, p) {
        if (Object.prototype.hasOwnProperty.call(own, p)) return own[p];
        const v = Reflect.get(t, p, t);
        if (typeof v !== 'function') return v;
        if (!bound.has(v)) bound.set(v, v.bind(t));
        return bound.get(v);
      },
      set(t, p, v) {
        if (t === window) windowProps.add(p);
        return Reflect.set(t, p, v, t);
      },
    });
  };

  // MediaQueryList: legacy addListener/removeListener too
  const trackedQuery = (q) => {
    const mql = window.matchMedia(q);
    const p = tracked(mql, {
      addListener(fn) { p.addEventListener('change', fn); },
      removeListener(fn) { p.removeEventListener('change', fn); },
    });
    return p;
  };

  const doc = tracked(document, {
    createElement(...a) {
      const el = document.createElement(...a);
      created.add(el);
      return el;
    },
  });
  const win = tracked(window, {
    document: doc,
    matchMedia: trackedQuery,
  });

  const RealMO = window.MutationObserver;
  const RealRO = window.ResizeObserver;
  class MutationObserver extends RealMO {
    constructor(cb) { super(cb); observers.add(this); }
  }
  class ResizeObserver extends (RealRO || Object) {
    constructor(cb) { super(cb); observers.add(this); }
  }

  const scope = {
    window: win,
    document: doc,
    addEventListener: win.addEventListener,
    removeEventListener: win.removeEventListener,
    visualViewport: window.visualViewport ? tracked(window.visualViewport) : undefined,
    matchMedia: trackedQuery,
    MutationObserver,
    ResizeObserver: RealRO ? ResizeObserver : undefined,
    setTimeout(fn, ms, ...a) {
      if (!alive) return 0;
      const id = window.setTimeout(() => { timeouts.delete(id); fn(...a); }, ms);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); window.clearTimeout(id); },
    setInterval(fn, ms, ...a) {
      if (!alive) return 0;
      const id = window.setInterval(fn, ms, ...a);
      intervals.add(id);
      return id;
    },
    clearInterval(id) { intervals.delete(id); window.clearInterval(id); },
    requestAnimationFrame(fn) {
      if (!alive) return 0;
      const id = window.requestAnimationFrame((t) => { frames.delete(id); fn(t); });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); window.cancelAnimationFrame(id); },
  };

  function destroy() {
    if (!alive) return;
    alive = false;
    listeners.splice(0).forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    observers.forEach((o) => o.disconnect());
    observers.clear();
    timeouts.forEach((id) => window.clearTimeout(id));
    intervals.forEach((id) => window.clearInterval(id));
    frames.forEach((id) => window.cancelAnimationFrame(id));
    timeouts.clear(); intervals.clear(); frames.clear();
    // popups, menus and toasts the engine appended to <body>
    [...document.body.children].forEach((el) => created.has(el) && el.remove());
    // body flags such as in-editor / ftb-on
    [...document.body.classList].forEach((c) => !bodyClasses.has(c) && document.body.classList.remove(c));
    windowProps.forEach((p) => { try { delete window[p]; } catch (e) {} });
  }

  return { scope, destroy };
}
