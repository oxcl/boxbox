(() => {
  // src/core/ext.js
  var TARGET = true ? "firefox" : "firefox";
  var IS_MV2 = TARGET === "chrome-mv2";
  var g = globalThis;
  var base = typeof g.browser !== "undefined" && g.browser.runtime ? g.browser : g.chrome;
  function promisified(obj) {
    return new Proxy(obj, {
      get(t, k) {
        const v = t[k];
        if (typeof k !== "string") return v;
        if (typeof v === "function") {
          return (...args) => {
            if (typeof args[args.length - 1] === "function") return v.apply(t, args);
            return new Promise((resolve, reject) => {
              try {
                v.call(t, ...args, (res) => {
                  const e = g.chrome.runtime.lastError;
                  if (e) reject(new Error(e.message));
                  else resolve(res);
                });
              } catch (e) {
                reject(e);
              }
            });
          };
        }
        if (v && typeof v === "object" && !/^on[A-Z]/.test(k)) return promisified(v);
        return v;
      }
    });
  }
  var ext = IS_MV2 ? promisified(base) : base;

  // src/ui/lib.js
  var SVG = "http://www.w3.org/2000/svg";
  function h(tag, props, ...kids) {
    const el = tag === "svg" || props?.__svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === "__svg" || v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  var P = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L22 7H6"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M16 11h.01M18.5 14h.01"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 18z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2.5 0-4-1-4-2.5S9.5 3 11 4c.8.5 1 2 1 4zm0 0c2.5 0 4-1 4-2.5S14.5 3 13 4c-.8.5-1 2-1 4z"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.5 15h9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
    warn: '<path d="M12 3L2 20h20zM12 10v4M12 17h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1"/>',
    merge: '<path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v2M6 4h0M18 4v6"/>',
    split: '<path d="M12 21v-8M12 13L5 6M12 13l7-7M5 6v4M5 6h4M19 6v4M19 6h-4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
    network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4.5M12 12l-6 5M12 12l6 5"/>'
  };
  function icon(name, cls = "") {
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ic " + cls);
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = P[name] || P.user;
    return s;
  }
  function avatar(account, { size, warn } = {}) {
    const a = h("div", { class: "avatar" + (account ? "" : " globe"), style: { "--c": account ? account.color : void 0, width: size && size + "px", height: size && size + "px" } }, icon(account ? account.icon : "globe"));
    if (warn) a.append(h("span", { class: "warnpip" + (warn === "fail" ? " fail" : "") }, "!"));
    return a;
  }
  async function api(type, payload = {}) {
    const r = await ext.runtime.sendMessage({ type, ...payload });
    if (r && r.error) throw new Error(r.error);
    return r;
  }
  function toast(msg, ms = 2200) {
    document.querySelectorAll(".toast").forEach((t2) => t2.remove());
    const t = h("div", { class: "toast", role: "status" }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), ms);
  }
  async function applyTheme() {
    try {
      const s = await api("state");
      const t = s.settings.theme;
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
      else document.documentElement.removeAttribute("data-theme");
    } catch {
    }
  }
  function params() {
    return new URLSearchParams(location.search);
  }
  function proxyLabel(p) {
    return p ? `${p.type.toUpperCase()} ${p.host}:${p.port}` : "";
  }

  // src/ui/picker.js
  var app = document.getElementById("app");
  var tabId = Number(params().get("tab"));
  var remember = false;
  var chosen = false;
  async function main() {
    await applyTheme();
    const p = await api("picker", { tabId });
    if (!p) {
      app.replaceChildren(h("div", { class: "banner warn" }, icon("info"), "Nothing to choose here. This tab no longer has a pending navigation."));
      return;
    }
    let host = "";
    try {
      host = new URL(p.url).host;
    } catch {
    }
    document.title = `Open ${p.service.name} as\u2026 \xB7 Box`;
    const opts = [{ id: null, acc: null }, ...p.accounts.map((a) => ({ id: a.id, acc: a }))];
    const tiles = h(
      "div",
      { class: "tiles", role: "radiogroup", "aria-label": "Account" },
      opts.map((o, i) => h(
        "button",
        { class: "card tile enter", type: "button", role: "radio", "aria-checked": "false", "data-account": o.id || "default", style: { "--c": o.acc ? o.acc.color : "#7b8499", "--i": i + 1 }, onclick: () => pick(o.id) },
        h("span", { class: "key" }, i < 9 ? String(i + 1) : ""),
        avatar(o.acc),
        h("div", {}, h("div", { class: "title" }, o.acc ? o.acc.name : "Default session"), h("div", { class: "sub" }, o.acc ? o.acc.proxy ? `via ${proxyLabel(o.acc.proxy)}` : "Isolated account" : "Your normal session"))
      ))
    );
    const rem = h("input", { type: "checkbox", id: "remember", onchange: (e) => {
      remember = e.target.checked;
    } });
    app.replaceChildren(
      h("div", { class: "brand" }, h("div", { class: "logo" }, p.service.name.charAt(0).toUpperCase()), h("div", { class: "grow" }, h("h1", {}, `Open ${p.service.name} as\u2026`), h("div", { class: "url", id: "target-url" }, p.url))),
      tiles,
      h("label", { class: "opts checkbox" }, rem, h("span", {}, "Always open this service in the account I used last"), h("span", { class: "grow" }), h("span", { class: "chip" }, host))
    );
    document.addEventListener("keydown", (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) pick(opts[n - 1].id);
      const btns = [...tiles.querySelectorAll("button")], i = btns.indexOf(document.activeElement);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        btns[(i + 1) % btns.length].focus();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        btns[(i - 1 + btns.length) % btns.length].focus();
      }
    });
    tiles.querySelector("button")?.focus();
    async function pick(id) {
      if (chosen) return;
      chosen = true;
      tiles.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.account === (id || "default"))));
      try {
        await api("pickerChoice", { tabId, accountId: id, remember });
      } catch (e) {
        chosen = false;
        toast(e.message);
      }
    }
  }
  main().catch((e) => app.replaceChildren(h("div", { class: "banner fail" }, e.message)));
})();
