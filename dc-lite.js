/* dc-lite: minimal runtime for exported Solaris pages (templates with {{holes}}, sc-if, sc-for). */
(function () {
  function DCLogic() { this.state = {}; this._q = 0; }
  DCLogic.prototype.setState = function (o) {
    this.state = Object.assign({}, this.state, o);
    var self = this;
    if (!this._q) this._q = requestAnimationFrame(function () { self._q = 0; self._render(); });
  };
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g, WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function get(scope, path) {
    if (path === 'true') return true; if (path === 'false') return false;
    var v = scope, p = path.split('.');
    for (var i = 0; i < p.length; i++) { if (v == null) return undefined; v = v[p[i]]; }
    return v;
  }
  var dynCache = new WeakMap();
  function dyn(n) {
    if (n.nodeType === 3) return /\{\{/.test(n.nodeValue);
    if (n.nodeType !== 1) return false;
    if (dynCache.has(n)) return dynCache.get(n);
    var d = /^sc-/i.test(n.tagName) || n.hasAttribute('data-scfor-list');
    if (!d) for (var i = 0; i < n.attributes.length; i++) if (n.attributes[i].value.indexOf('{{') > -1) { d = true; break; }
    if (!d) for (var c = n.firstChild; c; c = c.nextSibling) if (dyn(c)) { d = true; break; }
    dynCache.set(n, d); return d;
  }
  var EV = { onclick: 'click', onsubmit: 'submit', onchange: 'change' };
  function render(nodes, scope, out) {
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      if (n.nodeType === 8) continue;
      if (n.nodeType === 3) {
        if (!dyn(n)) { out.push({ s: n.nodeValue, tpl: n }); continue; }
        out.push({ s: n.nodeValue.replace(HOLE, function (_, p) { var v = get(scope, p); return v == null || v === false ? '' : String(v); }) });
        continue;
      }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (tag === 'sc-if') {
        var m = WHOLE.exec(n.getAttribute('value') || '');
        if (m ? get(scope, m[1]) : false) render(n.childNodes, scope, out);
        continue;
      }
      if (tag === 'sc-for') {
        var lm = WHOLE.exec(n.getAttribute('list') || ''), as = n.getAttribute('as') || 'item', list = lm ? get(scope, lm[1]) : [];
        (list || []).forEach(function (it, i) {
          var sc = Object.create(scope); sc[as] = it; sc.index = i; render(n.childNodes, sc, out);
        });
        continue;
      }
      if (!dyn(n)) { out.push({ tag: tag, tpl: n, st: true }); continue; }
      if (n.hasAttribute('data-scfor-list')) {
        var l2 = get(scope, n.getAttribute('data-scfor-list')), as2 = n.getAttribute('data-as');
        (l2 || []).forEach(function (it, i) { var sc2 = Object.create(scope); sc2[as2] = it; sc2.index = i; out.push(elv(n, tag, sc2)); });
        continue;
      }
      out.push(elv(n, tag, scope));
    }
    return out;
  }
  function elv(n, tag, scope) {
      var attrs = {}, handlers = null;
      for (var i = 0; i < n.attributes.length; i++) {
        var a = n.attributes[i], name = a.name, val = a.value;
        if (name.indexOf('hint-') === 0 || name.indexOf('data-scfor') === 0 || name === 'data-as') continue;
        if (EV[name]) { var mm = WHOLE.exec(val); var fn = mm ? get(scope, mm[1]) : null; if (fn) { (handlers = handlers || {})[name] = fn; } continue; }
        var w = WHOLE.exec(val);
        if (w) attrs[name] = get(scope, w[1]);
        else if (val.indexOf('{{') > -1) attrs[name] = val.replace(HOLE, function (_, p) { var v = get(scope, p); return v == null ? '' : v; });
        else attrs[name] = val;
      }
      var kids = []; render(n.childNodes, scope, kids);
      return { tag: tag, tpl: n, attrs: attrs, h: handlers, kids: kids };
  }
  function setAttr(el, name, v) {
    if (name === 'value') { var s = v == null ? '' : String(v); if (el.value !== s) el.value = s; return; }
    if (name === 'disabled' || name === 'checked' || name === 'hidden') { v ? el.setAttribute(name, '') : el.removeAttribute(name); return; }
    if (v === false && !/^(aria|data)-/.test(name) || v == null) { el.removeAttribute(name); return; }
    if (el.getAttribute(name) !== String(v)) el.setAttribute(name, String(v));
  }
  var CH = { text: 1, textarea: 1, email: 1, tel: 1, range: 1, search: 1, number: 1, url: 1, password: 1 };
  function bind(el, v) {
    el.__h = v.h || {};
    if (el.__bound) return; el.__bound = 1;
    ['click', 'submit', 'change'].forEach(function (t) {
      var key = 'on' + t;
      var dom = t;
      if (t === 'change' && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && CH[(el.type || 'text')]))) dom = 'input';
      el.addEventListener(dom, function (e) { var f = el.__h[key]; if (f) f(e); });
    });
  }
  function mount(v) {
    var el;
    if (v.s !== undefined && !v.tag) { el = document.createTextNode(v.s); v.node = el; return el; }
    if (v.st) { el = v.tpl.cloneNode(true); v.node = el; return el; }
    el = v.tpl.namespaceURI && v.tpl.namespaceURI !== 'http://www.w3.org/1999/xhtml' ? document.createElementNS(v.tpl.namespaceURI, v.tag) : document.createElement(v.tag);
    v.node = el;
    for (var k = 0; k < v.kids.length; k++) el.appendChild(mount(v.kids[k]));
    for (var a in v.attrs) if (a !== 'value') setAttr(el, a, v.attrs[a]);
    if ('value' in v.attrs) setAttr(el, 'value', v.attrs.value);
    bind(el, v);
    return el;
  }
  function patch(o, v) {
    var el = v.node = o.node;
    if (v.s !== undefined && !v.tag) { if (o.s !== v.s && el.parentNode) el.nodeValue = v.s; return; }
    if (v.st) { return; }
    if (o.st || o.tag !== v.tag || o.s !== undefined && !o.tag) { var nn = mount(v); el.parentNode && el.parentNode.replaceChild(nn, el); return; }
    var oa = o.attrs;
    for (var a in oa) if (!(a in v.attrs)) el.removeAttribute(a);
    for (var b in v.attrs) if (b !== 'value' && oa[b] !== v.attrs[b]) setAttr(el, b, v.attrs[b]);
    var ok = o.kids, nk = v.kids, i, n = Math.min(ok.length, nk.length);
    for (i = 0; i < n; i++) {
      if (ok[i].node === undefined) continue;
      if ((ok[i].tag || '') !== (nk[i].tag || '') || ok[i].st !== nk[i].st || (ok[i].st && ok[i].tpl !== nk[i].tpl)) {
        var nn2 = mount(nk[i]); var on = ok[i].node; on.parentNode ? on.parentNode.replaceChild(nn2, on) : el.appendChild(nn2);
      } else patch(ok[i], nk[i]);
    }
    for (i = n; i < ok.length; i++) { var x = ok[i].node; if (x && x.parentNode) x.parentNode.removeChild(x); }
    for (i = n; i < nk.length; i++) el.appendChild(mount(nk[i]));
    if ('value' in v.attrs) setAttr(el, 'value', v.attrs.value);
    bind(el, v);
  }
  function boot() {
    var host = document.querySelector('x-dc');
    if (!host) return;
    var helm = host.querySelector('helmet');
    if (helm) { while (helm.firstChild) document.head.appendChild(helm.firstChild); helm.remove(); }
    var tpl = [].slice.call(host.childNodes);
    var sc = document.querySelector('script[data-dc-script]');
    if (!sc) { return; }
    var Comp = new Function('DCLogic', sc.textContent + '\n;return Component;')(DCLogic);
    var inst = new Comp(); inst.state = inst.state || {};
    var prev = null, root = document.createElement('div'); root.style.display = 'contents';
    root.id = 'dc-root';
    host.textContent = ''; host.style.display = 'block'; host.appendChild(root);
    inst._render = function () {
      var vals = inst.renderVals ? inst.renderVals() : {};
      var scope = Object.create(vals);
      var kids = render(tpl, scope, []);
      var v = { tag: 'div', tpl: root, attrs: {}, kids: kids, node: root };
      if (!prev) { for (var i = 0; i < kids.length; i++) root.appendChild(mount(kids[i])); }
      else patch(prev, v);
      prev = v;
    };
    inst._render();
  }
  window.DCLogic = DCLogic;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
