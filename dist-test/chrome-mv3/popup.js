(() => {
  // src/core/ext.js
  var TARGET = true ? "chrome-mv3" : "firefox";
  var IS_MV2 = TARGET === "chrome-mv2";
  var g = globalThis;
  var base = typeof g.browser !== "undefined" && g.browser.runtime ? g.browser : g.chrome;
  var SYNC = /* @__PURE__ */ new Set(["getURL", "getManifest", "connect", "connectNative", "getViews", "getBackgroundPage_sync"]);
  function promisified(obj) {
    return new Proxy(obj, {
      get(t, k) {
        const v = t[k];
        if (typeof k !== "string") return v;
        if (typeof v === "function" && SYNC.has(k)) return v.bind(t);
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
        if (sv == null || sv === false) continue;
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
  var iconNames = ["user", "briefcase", "home", "heart", "star", "bolt", "cart", "game", "code", "book", "cloud", "shield", "gift", "camera", "music", "flask"];
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
  var COLORS = ["#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#64748b"];
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
  var modeLabel = { default: "Default session", remember: "Remember last", ask: "Ask every time" };
  function proxyLabel(p) {
    return p ? `${p.type.toUpperCase()} ${p.host}:${p.port}` : "";
  }
  function sheet(build, { center = false, host = document.body } = {}) {
    const scrim = h("div", { class: "scrim" + (center ? " center" : ""), onclick: (e) => {
      if (e.target === scrim) close();
    } });
    const close = () => {
      scrim.style.opacity = "0";
      scrim.style.transition = "opacity .18s";
      setTimeout(() => scrim.remove(), 170);
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const s = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, build(close));
    scrim.append(s);
    host.append(scrim);
    setTimeout(() => s.querySelector("input,button")?.focus(), 60);
    return { close };
  }

  // src/ui/account-editor.js
  function openAccountEditor({ account, serviceId, serviceName, target, onDone, host, withProxy = false }) {
    const editing = !!account;
    const st = {
      name: account?.name || "",
      color: account?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      icon: account?.icon || iconNames[Math.floor(Math.random() * iconNames.length)],
      proxyOn: !!account?.proxy || withProxy,
      proxy: { type: "http", host: "", port: "", username: "", password: "", ...account?.proxy || {} }
    };
    return sheet((close) => {
      const preview = h("div", { class: "row" });
      const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Color" });
      const icons = h("div", { class: "icons", role: "radiogroup", "aria-label": "Icon" });
      const proxyBox = h("div", { class: "grid", style: { display: "grid", gap: "10px" } });
      const nameIn = h("input", { class: "input", id: "acc-name", placeholder: `e.g. ${serviceName} work`, value: st.name, maxlength: 40, oninput: (e) => {
        st.name = e.target.value;
        paintPreview();
      } });
      function paintPreview() {
        preview.replaceChildren(avatar({ color: st.color, icon: st.icon }), h("div", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, st.name || "New account"), h("div", { class: "muted" }, serviceName)));
        sw.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === st.color)));
        ic.forEach((b) => {
          b.setAttribute("aria-checked", String(b.dataset.i === st.icon));
          b.style.setProperty("--c", st.color);
        });
      }
      const sw = COLORS.map((c) => h("button", { class: "swatch", type: "button", role: "radio", "data-c": c, "aria-label": c, style: { "--c": c }, onclick: () => {
        st.color = c;
        paintPreview();
      } }));
      const ic = iconNames.map((i) => h("button", { class: "iconpick", type: "button", role: "radio", "data-i": i, "aria-label": i, onclick: () => {
        st.icon = i;
        paintPreview();
      } }, icon(i)));
      swatches.append(...sw);
      icons.append(...ic);
      function paintProxy() {
        proxyBox.replaceChildren();
        if (!st.proxyOn) return;
        const p = st.proxy;
        const note = target === "firefox" ? h("div", { class: "banner", style: { background: "var(--bg2)" } }, icon("shield"), h("div", {}, "Applied exactly and only to this account\u2019s tabs. A dead proxy blocks the request \u2014 it never falls back to your own IP.")) : h("div", { class: "banner warn" }, icon("warn"), h("div", {}, "Best effort on Chrome: the proxy is applied to this service\u2019s hosts for the whole browser while this account is open. Box tells you whenever that can\u2019t be guaranteed for a tab."));
        proxyBox.append(
          note,
          h(
            "div",
            { class: "grid2" },
            h("div", { class: "field" }, h("label", { for: "px-type" }, "Type"), h("select", { class: "input", id: "px-type", onchange: (e) => {
              p.type = e.target.value;
            } }, ["http", "https", "socks5"].map((t) => h("option", { value: t, selected: p.type === t }, t === "socks5" ? "SOCKS5" : t.toUpperCase())))),
            h("div", { class: "field" }, h("label", { for: "px-port" }, "Port"), h("input", { class: "input", id: "px-port", inputmode: "numeric", placeholder: "8080", value: p.port, oninput: (e) => {
              p.port = e.target.value;
            } }))
          ),
          h("div", { class: "field" }, h("label", { for: "px-host" }, "Host"), h("input", { class: "input", id: "px-host", placeholder: "proxy.example.com", value: p.host, oninput: (e) => {
            p.host = e.target.value;
          } })),
          h(
            "div",
            { class: "grid2" },
            h("div", { class: "field" }, h("label", { for: "px-user" }, "Username"), h("input", { class: "input", id: "px-user", autocomplete: "off", value: p.username, oninput: (e) => {
              p.username = e.target.value;
            } })),
            h("div", { class: "field" }, h("label", { for: "px-pass" }, "Password"), h("input", { class: "input", id: "px-pass", type: "password", autocomplete: "new-password", value: p.password, oninput: (e) => {
              p.password = e.target.value;
            } }))
          )
        );
      }
      const proxySwitch = h("button", { class: "switch", id: "px-on", type: "button", role: "switch", "aria-checked": String(st.proxyOn), "aria-label": "Use a proxy", onclick: (e) => {
        st.proxyOn = !st.proxyOn;
        e.currentTarget.setAttribute("aria-checked", String(st.proxyOn));
        paintProxy();
      } });
      const save = h("button", { class: "btn primary", id: "acc-save", type: "button", onclick: async () => {
        save.disabled = true;
        try {
          const proxy = st.proxyOn && st.proxy.host ? { ...st.proxy, port: Number(st.proxy.port) || void 0 } : null;
          const payload = { name: st.name.trim(), color: st.color, icon: st.icon, proxy };
          const res = editing ? await api("updateAccount", { id: account.id, patch: payload }) : await api("createAccount", { serviceId, ...payload });
          close();
          onDone?.(editing ? "updated" : "created", res);
        } catch (e) {
          toast(e.message);
          save.disabled = false;
        }
      } }, editing ? "Save changes" : "Create account");
      const del = editing ? h("button", { class: "btn danger", id: "acc-delete", type: "button", onclick: () => confirmDelete() }, icon("trash"), "Delete") : null;
      function confirmDelete() {
        sheet((c2) => [
          h("h3", {}, `Delete \u201C${account.name}\u201D?`),
          h("p", { class: "muted", style: { margin: 0 } }, "All cookies, local storage, IndexedDB, caches and other data stored for this account are permanently erased. Open tabs in this account move back to your default session. This cannot be undone."),
          h(
            "div",
            { class: "row", style: { justifyContent: "flex-end" } },
            h("button", { class: "btn", type: "button", onclick: c2 }, "Cancel"),
            h("button", { class: "btn danger solid", id: "acc-delete-confirm", type: "button", onclick: async () => {
              try {
                await api("deleteAccount", { id: account.id });
                c2();
                close();
                onDone?.("deleted");
              } catch (e) {
                toast(e.message);
              }
            } }, icon("trash"), "Delete forever")
          )
        ], { center: true, host });
      }
      paintPreview();
      paintProxy();
      return [
        h("div", { class: "row" }, h("h3", { class: "grow" }, editing ? "Edit account" : `New ${serviceName} account`), h("button", { class: "iconbtn", type: "button", "aria-label": "Close", onclick: close }, icon("x"))),
        preview,
        h("div", { class: "field" }, h("label", { for: "acc-name" }, "Name"), nameIn),
        h("div", { class: "field" }, h("span", { class: "label" }, "Color"), swatches),
        h("div", { class: "field" }, h("span", { class: "label" }, "Icon"), icons),
        h("div", { class: "row" }, icon("network"), h("div", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, "Proxy"), h("div", { class: "muted" }, "Route this account through its own proxy")), proxySwitch),
        proxyBox,
        h("div", { class: "row", style: { justifyContent: "space-between" } }, del || h("span"), h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: close }, "Cancel"), save))
      ];
    }, { host });
  }

  // src/ui/popup.js
  var app = document.getElementById("app");
  var info = null;
  var tabId = null;
  var busy = false;
  async function currentTabId() {
    const p = params().get("tab");
    if (p) return Number(p);
    const [t] = await ext.tabs.query({ active: true, currentWindow: true });
    return t && t.id;
  }
  async function load() {
    tabId = tabId ?? await currentTabId();
    info = await api("tabInfo", { tabId });
    render();
  }
  function statusBanner() {
    const s = info.status;
    if (!s || !s.messages || !s.messages.length) return null;
    if (s.level === "ok") return null;
    return h(
      "div",
      { class: "banner " + (s.level === "fail" ? "fail" : "warn"), style: { margin: "0 14px 6px" }, role: "alert" },
      icon("warn"),
      h(
        "div",
        { class: "grow" },
        s.messages.map((m) => h("div", { style: { marginBottom: "4px" } }, m)),
        s.action === "restoreIsolation" ? h("button", { class: "btn sm primary", id: "restore-isolation", style: { marginTop: "6px" }, onclick: async () => {
          try {
            await api("restoreIsolation", { tabId });
            toast("Isolation restored");
            await load();
          } catch (e) {
            toast(e.message);
          }
        } }, "Restore isolation") : null
      )
    );
  }
  function render() {
    const first = !app.firstChild;
    app.replaceChildren();
    if (!info || !info.service) {
      app.append(
        h(
          "header",
          {},
          h("div", { class: "site" }, icon("layers")),
          h("div", { class: "grow" }, h("h1", {}, "Box"), h("div", { class: "muted" }, "Isolated accounts per tab")),
          h("button", { class: "iconbtn", id: "open-settings", "aria-label": "Settings", onclick: openSettings }, icon("gear"))
        ),
        h("div", { class: "empty enter" }, h("div", { class: "avatar globe" }, icon("globe")), h("div", { style: { fontWeight: 700 } }, "Open a website to use accounts"), h("div", { class: "muted" }, "Box works on web pages. Navigate to a site, then pick or create an account for this tab."))
      );
      return;
    }
    const svc = info.service;
    const hostName = info.host || "";
    const site = h("div", { class: "site" }, info.favIconUrl && !/^data:/.test(info.favIconUrl) ? h("img", { src: info.favIconUrl, alt: "", onerror: (e) => {
      e.target.replaceWith(document.createTextNode(svc.name.charAt(0).toUpperCase()));
    } }) : svc.name.charAt(0).toUpperCase());
    const others = svc.domains.filter((d) => hostName !== d && !hostName.endsWith("." + d));
    const doms = h("div", { class: "domains" }, h("span", { class: "chip" }, hostName), others.length ? h("span", { class: "chip" }, `+${others.length} more`) : null);
    const header = h(
      "header",
      {},
      site,
      h("div", { class: "grow" }, h("h1", { id: "svc-name" }, svc.name), doms),
      h("button", { class: "iconbtn", id: "open-settings", "aria-label": "Settings", title: "Settings", onclick: openSettings }, icon("gear"))
    );
    const cur = info.accountId;
    const list = h("div", { class: "list", role: "radiogroup", "aria-label": "Account for this tab" });
    let i = 0;
    const row = (acc) => {
      const sel = (acc ? acc.id : null) === (cur || null);
      const warn = acc && acc.proxy && info.status && info.status.level !== "ok" && sel ? info.status.level : null;
      const el = h(
        "div",
        {
          class: "card enter" + (sel ? " selected" : ""),
          role: "radio",
          "aria-checked": String(sel),
          tabindex: 0,
          "data-account": acc ? acc.id : "default",
          style: { "--c": acc ? acc.color : "#7b8499", "--i": i++ },
          onclick: () => choose(acc ? acc.id : null),
          onkeydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(acc ? acc.id : null);
            }
          }
        },
        avatar(acc, { warn }),
        h(
          "div",
          { class: "grow" },
          h("div", { class: "title" }, acc ? acc.name : "Default session"),
          h("div", { class: "sub" }, acc ? acc.proxy ? `via ${proxyLabel(acc.proxy)}` : "Isolated account" : "Your normal browser session")
        ),
        acc ? h("button", { class: "iconbtn more", "aria-label": `Edit ${acc.name}`, "data-edit": acc.id, onclick: (e) => {
          e.stopPropagation();
          edit(acc);
        } }, icon("edit")) : null,
        h("span", { class: "radio" }, h("svg", { viewBox: "0 0 24 24", __svg: true, html: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' }))
      );
      return el;
    };
    list.append(
      row(null),
      ...info.accounts.map(row),
      h("button", { class: "card add enter", id: "new-account", style: { "--i": i++ }, onclick: () => edit(null) }, icon("plus"), `New ${svc.name} account`)
    );
    const modeSeg = h(
      "div",
      { class: "seg", role: "radiogroup", "aria-label": "Entry mode for this service" },
      [["inherit", "Global"], ["default", "Default"], ["remember", "Remember"], ["ask", "Ask"]].map(([m, label]) => {
        const active = (info.modeOverride || "inherit") === m;
        return h("button", { type: "button", role: "radio", "aria-checked": String(active), "data-mode": m, onclick: async () => {
          await api("setServiceMode", { serviceId: svc.id, mode: m });
          await load();
          toast(m === "inherit" ? `Using the global mode (${modeLabel[info.defaultMode]})` : `${svc.name}: ${modeLabel[m]}`);
        } }, label);
      })
    );
    const footer = h(
      "footer",
      {},
      h("div", { class: "row" }, icon("sliders"), h("div", { class: "grow" }, h("div", { style: { fontWeight: 700, fontSize: "12.5px" } }, "When opening " + svc.name), h("div", { class: "muted", style: { fontSize: "12px" } }, info.modeOverride ? modeLabel[info.mode] : `Global: ${modeLabel[info.defaultMode]}`))),
      modeSeg
    );
    app.append(header, ...[statusBanner()].filter(Boolean), list, footer);
  }
  async function choose(accountId) {
    if (busy || (accountId || null) === (info.accountId || null)) return;
    busy = true;
    try {
      const r = await api("setTabAccount", { tabId, accountId });
      tabId = r.tabId ?? tabId;
      await load();
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }
  function edit(acc) {
    openAccountEditor({
      account: acc,
      serviceId: info.serviceId,
      serviceName: info.service.name,
      target: info.target,
      onDone: async (kind, res) => {
        await load();
        if (kind === "created" && res) {
          await choose(res.id);
          toast(`Created \u201C${res.name}\u201D`);
        } else if (kind === "deleted") toast("Account deleted and its data erased");
      }
    });
  }
  function openSettings() {
    ext.runtime.openOptionsPage();
    window.close?.();
  }
  applyTheme();
  load().catch((e) => {
    app.replaceChildren(h("div", { class: "empty" }, h("div", { class: "banner fail" }, e.message)));
  });
  ext.tabs.onUpdated?.addListener?.((id, ch) => {
    if (id === tabId && (ch.status === "complete" || ch.url)) load().catch(() => {
    });
  });
})();
