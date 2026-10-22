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
  var modeLabel = { default: "Default session", remember: "Remember last", ask: "Ask every time" };
  var modeHelp = {
    default: "Open services in your normal browser session. Switch accounts from the popup whenever you want.",
    remember: "Open each service in the account you used last time.",
    ask: "Show a picker before the page loads so you choose the account each time."
  };
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
  function openAccountEditor({ account, serviceId, serviceName: serviceName2, target, onDone, host }) {
    const editing = !!account;
    const st2 = {
      name: account?.name || "",
      color: account?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      icon: account?.icon || iconNames[Math.floor(Math.random() * iconNames.length)],
      proxyOn: !!account?.proxy,
      proxy: { type: "http", host: "", port: "", username: "", password: "", ...account?.proxy || {} }
    };
    return sheet((close) => {
      const preview = h("div", { class: "row" });
      const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Color" });
      const icons = h("div", { class: "icons", role: "radiogroup", "aria-label": "Icon" });
      const proxyBox = h("div", { class: "grid", style: { display: "grid", gap: "10px" } });
      const nameIn = h("input", { class: "input", id: "acc-name", placeholder: `e.g. ${serviceName2} work`, value: st2.name, maxlength: 40, oninput: (e) => {
        st2.name = e.target.value;
        paintPreview();
      } });
      function paintPreview() {
        preview.replaceChildren(avatar({ color: st2.color, icon: st2.icon }), h("div", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, st2.name || "New account"), h("div", { class: "muted" }, serviceName2)));
        sw.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.c === st2.color)));
        ic.forEach((b) => {
          b.setAttribute("aria-checked", String(b.dataset.i === st2.icon));
          b.style.setProperty("--c", st2.color);
        });
      }
      const sw = COLORS.map((c) => h("button", { class: "swatch", type: "button", role: "radio", "data-c": c, "aria-label": c, style: { "--c": c }, onclick: () => {
        st2.color = c;
        paintPreview();
      } }));
      const ic = iconNames.map((i) => h("button", { class: "iconpick", type: "button", role: "radio", "data-i": i, "aria-label": i, onclick: () => {
        st2.icon = i;
        paintPreview();
      } }, icon(i)));
      swatches.append(...sw);
      icons.append(...ic);
      function paintProxy() {
        proxyBox.replaceChildren();
        if (!st2.proxyOn) return;
        const p = st2.proxy;
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
      const proxySwitch = h("button", { class: "switch", id: "px-on", type: "button", role: "switch", "aria-checked": String(st2.proxyOn), "aria-label": "Use a proxy", onclick: (e) => {
        st2.proxyOn = !st2.proxyOn;
        e.currentTarget.setAttribute("aria-checked", String(st2.proxyOn));
        paintProxy();
      } });
      const save = h("button", { class: "btn primary", id: "acc-save", type: "button", onclick: async () => {
        save.disabled = true;
        try {
          const proxy2 = st2.proxyOn && st2.proxy.host ? { ...st2.proxy, port: Number(st2.proxy.port) || void 0 } : null;
          const payload = { name: st2.name.trim(), color: st2.color, icon: st2.icon, proxy: proxy2 };
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
        h("div", { class: "row" }, h("h3", { class: "grow" }, editing ? "Edit account" : `New ${serviceName2} account`), h("button", { class: "iconbtn", type: "button", "aria-label": "Close", onclick: close }, icon("x"))),
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

  // src/ui/settings.js
  var SECTIONS = [["general", "General", "sliders"], ["services", "Services", "layers"], ["accounts", "Accounts", "user"], ["proxy", "Proxy", "network"], ["about", "About", "info"]];
  var st = null;
  var section = (location.hash || "#general").slice(1);
  var selectedService = null;
  var query = "";
  var main = document.getElementById("main");
  var nav = document.getElementById("nav");
  async function refresh(keep = true) {
    st = await api("state");
    if (st.settings.theme === "light" || st.settings.theme === "dark") document.documentElement.setAttribute("data-theme", st.settings.theme);
    else document.documentElement.removeAttribute("data-theme");
    render();
  }
  function render() {
    nav.replaceChildren(
      h("div", { class: "brand" }, h("span", { class: "mark" }, icon("layers")), "Box"),
      ...SECTIONS.map(([id, label, ic]) => h("button", { class: "navbtn", "data-section": id, "aria-current": section === id ? "page" : null, onclick: () => {
        section = id;
        location.hash = id;
        render();
      } }, icon(ic), label))
    );
    main.replaceChildren(({ general, services, accounts, proxy, about }[section] || general)());
  }
  var serviceName = (id) => st.services.find((s) => s.id === id)?.name || id;
  function general() {
    const s = st.settings;
    const modeCard = (m, ic) => h(
      "button",
      {
        class: "card mode" + (s.defaultMode === m ? " selected" : ""),
        type: "button",
        role: "radio",
        "aria-checked": String(s.defaultMode === m),
        "data-mode": m,
        onclick: async () => {
          await api("setSettings", { patch: { defaultMode: m } });
          await refresh();
        }
      },
      h("div", { class: "title" }, icon(ic), modeLabel[m]),
      h("div", { class: "sub" }, modeHelp[m])
    );
    const toggle = (key, label, desc) => h(
      "div",
      { class: "row" },
      h("div", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, label), h("div", { class: "muted" }, desc)),
      h("button", { class: "switch", type: "button", role: "switch", "data-setting": key, "aria-checked": String(!!s[key]), "aria-label": label, onclick: async () => {
        await api("setSettings", { patch: { [key]: !s[key] } });
        await refresh();
      } })
    );
    const overrides = Object.entries(s.modes);
    const addSel = h(
      "select",
      { class: "input", id: "override-service", style: { maxWidth: "260px" } },
      h("option", { value: "" }, "Add a service override\u2026"),
      st.services.filter((x) => !s.modes[x.id]).map((x) => h("option", { value: x.id }, x.name))
    );
    addSel.onchange = async () => {
      if (addSel.value) {
        await api("setServiceMode", { serviceId: addSel.value, mode: s.defaultMode === "default" ? "ask" : "default" });
        await refresh();
      }
    };
    return h(
      "section",
      {},
      h("div", {}, h("h1", {}, "General"), h("p", { class: "lead" }, "How Box behaves when you open a service from outside an account.")),
      h("div", { class: "panel" }, h("h2", {}, "When entering a service"), h("div", { class: "cards3", role: "radiogroup", "aria-label": "Default entry mode" }, modeCard("default", "globe"), modeCard("remember", "pin"), modeCard("ask", "ask"))),
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Per-service overrides"),
        overrides.length ? h("table", {}, overrides.map(([id, m]) => h(
          "tr",
          { "data-override": id },
          h("td", {}, h("b", {}, serviceName(id))),
          h("td", {}, h("div", { class: "seg", role: "radiogroup" }, ["default", "remember", "ask"].map((mm) => h("button", { type: "button", role: "radio", "data-mode": mm, "aria-checked": String(m === mm), onclick: async () => {
            await api("setServiceMode", { serviceId: id, mode: mm });
            await refresh();
          } }, modeLabel[mm].split(" ")[0])))),
          h("td", { style: { textAlign: "right" } }, h("button", { class: "iconbtn", "aria-label": "Remove override", onclick: async () => {
            await api("setServiceMode", { serviceId: id, mode: "inherit" });
            await refresh();
          } }, icon("x")))
        ))) : h("p", { class: "muted", style: { margin: 0 } }, "No overrides. Every service follows the global mode."),
        addSel
      ),
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Appearance & identity"),
        h(
          "div",
          { class: "row" },
          h("div", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, "Theme")),
          h("div", { class: "seg", role: "radiogroup" }, [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => h("button", { type: "button", role: "radio", "data-theme-opt": v, "aria-checked": String(s.theme === v), onclick: async () => {
            await api("setSettings", { patch: { theme: v } });
            await refresh();
          } }, l)))
        ),
        toggle("border", "Page border", "Draw a colored frame with the account name around pages in an account."),
        toggle("badge", "Favicon badge", "Add a small dot in the account color to the site\u2019s icon."),
        toggle("tabGroups", "Tab groups", "Group tabs of the same account and color the group.")
      )
    );
  }
  function services() {
    const list = st.services.filter((s) => !query || (s.name + " " + s.domains.join(" ")).toLowerCase().includes(query.toLowerCase()));
    const sel = st.services.find((s) => s.id === selectedService) || list[0];
    if (sel) selectedService = sel.id;
    const search = h("input", { class: "input", id: "svc-search", placeholder: "Search services or domains", value: query, oninput: (e) => {
      query = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const i = document.getElementById("svc-search");
      i.focus();
      i.setSelectionRange(pos, pos);
    } });
    return h(
      "section",
      {},
      h(
        "div",
        { class: "row" },
        h("div", { class: "grow" }, h("h1", {}, "Services"), h("p", { class: "lead" }, "A service is a group of domains that share one login. Accounts and switching work per service.")),
        h("button", { class: "btn primary", id: "new-service", onclick: newService }, icon("plus"), "New service")
      ),
      h(
        "div",
        { class: "svcgrid" },
        h("div", { class: "panel", style: { padding: "12px" } }, search, h("div", { class: "svclist", id: "svclist" }, list.map((s) => h(
          "button",
          { class: "svc", "data-service": s.id, "aria-current": String(s.id === selectedService), onclick: () => {
            selectedService = s.id;
            render();
          } },
          h("span", { class: "ico" }, s.name.charAt(0).toUpperCase()),
          h("span", { class: "grow" }, h("div", { style: { fontWeight: 700 } }, s.name), h("div", { class: "muted", style: { fontSize: "12px" } }, `${s.domains.length} domain${s.domains.length === 1 ? "" : "s"}${s.accounts ? ` \xB7 ${s.accounts} account${s.accounts === 1 ? "" : "s"}` : ""}`)),
          s.kind === "user" ? h("span", { class: "chip" }, "yours") : null
        )))),
        sel ? serviceDetail(sel) : h("div", { class: "panel muted" }, "No service selected.")
      )
    );
  }
  function serviceDetail(s) {
    const others = st.services.filter((x) => x.id !== s.id);
    const nameIn = h("input", { class: "input", id: "svc-name", value: s.name, onchange: async (e) => {
      await api("serviceEdit", { op: "rename", args: { id: s.id, name: e.target.value.trim() || s.name } });
      await refresh();
      toast("Renamed");
    } });
    const addIn = h("input", { class: "input", id: "svc-add-domain", placeholder: "Add a domain, e.g. example.org" });
    const add = async () => {
      const v = addIn.value.trim();
      if (!v) return;
      await api("serviceEdit", { op: "assign", args: { id: s.id, domains: [v] } });
      await refresh();
      toast(`${v} now belongs to ${s.name}`);
    };
    addIn.onkeydown = (e) => {
      if (e.key === "Enter") add();
    };
    return h(
      "div",
      { class: "panel", id: "svc-detail", "data-service": s.id },
      h("div", { class: "row" }, h("div", { class: "grow field" }, h("label", { for: "svc-name" }, "Name"), nameIn), h("span", { class: "chip" }, s.kind === "catalog" ? "built-in" : s.kind === "user" ? "custom" : "automatic")),
      h(
        "div",
        { class: "field" },
        h("span", { class: "label" }, "Domains (sub-domains are included)"),
        s.domains.length ? s.domains.map((d) => h(
          "div",
          { class: "domain", "data-domain": d },
          icon("link"),
          h("span", { class: "d" }, d),
          h("button", { class: "btn sm", type: "button", "data-split": d, title: "Move this domain to its own service", onclick: () => splitDomain(s, d) }, icon("split"), "Split off"),
          others.length ? h("button", { class: "btn sm", type: "button", "data-move": d, title: "Move this domain into another service", onclick: () => moveDomain(s, d) }, icon("merge"), "Move\u2026") : null
        )) : h("div", { class: "muted" }, "No domains.")
      ),
      h("div", { class: "row" }, addIn, h("button", { class: "btn", id: "svc-add", onclick: add }, icon("plus"), "Add")),
      h(
        "div",
        { class: "row wrap", style: { justifyContent: "space-between" } },
        h("button", { class: "btn", id: "svc-merge", onclick: () => mergeInto(s) }, icon("merge"), "Merge into another service\u2026"),
        s.kind === "user" ? h("button", { class: "btn danger", id: "svc-delete", onclick: async () => {
          await api("serviceEdit", { op: "delete", args: { id: s.id } });
          selectedService = null;
          await refresh();
          toast("Service deleted");
        } }, icon("trash"), "Delete service") : null
      )
    );
  }
  function serviceSelect(id, services2) {
    return h("select", { class: "input", id }, services2.map((x) => h("option", { value: x.id }, `${x.name} \u2014 ${x.domains.slice(0, 2).join(", ")}`)));
  }
  function newService() {
    sheet((close) => {
      const name = h("input", { class: "input", id: "ns-name", placeholder: "e.g. Work apps" });
      const doms = h("input", { class: "input", id: "ns-domains", placeholder: "domains, separated by commas" });
      return [
        h("h3", {}, "New service"),
        h("div", { class: "field" }, h("label", {}, "Name"), name),
        h("div", { class: "field" }, h("label", {}, "Domains"), doms),
        h("div", { class: "row", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", id: "ns-save", onclick: async () => {
          const r = await api("serviceEdit", { op: "create", args: { name: name.value.trim() || "New service", domains: doms.value.split(/[,\s]+/).filter(Boolean) } });
          selectedService = r.id;
          close();
          await refresh();
        } }, "Create"))
      ];
    }, { center: true });
  }
  function splitDomain(s, d) {
    sheet((close) => {
      const name = h("input", { class: "input", id: "split-name", value: d.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()) });
      return [
        h("h3", {}, `Split ${d} off`),
        h("p", { class: "muted", style: { margin: 0 } }, `${d} (and its sub-domains) will become a separate service with its own accounts, no longer part of ${s.name}.`),
        h("div", { class: "field" }, h("label", {}, "New service name"), name),
        h("div", { class: "row", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", id: "split-save", onclick: async () => {
          const r = await api("serviceEdit", { op: "split", args: { name: name.value.trim() || d, domains: [d] } });
          selectedService = r.id;
          close();
          await refresh();
          toast(`${d} is now its own service`);
        } }, "Split"))
      ];
    }, { center: true });
  }
  function moveDomain(s, d) {
    sheet((close) => {
      const sel = serviceSelect("move-target", st.services.filter((x) => x.id !== s.id));
      return [
        h("h3", {}, `Move ${d}`),
        h("div", { class: "field" }, h("label", {}, "Into service"), sel),
        h("div", { class: "row", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", id: "move-save", onclick: async () => {
          await api("serviceEdit", { op: "assign", args: { id: sel.value, domains: [d] } });
          selectedService = sel.value;
          close();
          await refresh();
          toast("Moved");
        } }, "Move"))
      ];
    }, { center: true });
  }
  function mergeInto(s) {
    sheet((close) => {
      const sel = serviceSelect("merge-target", st.services.filter((x) => x.id !== s.id));
      return [
        h("h3", {}, `Merge ${s.name}`),
        h("p", { class: "muted", style: { margin: 0 } }, `All of ${s.name}\u2019s domains and accounts move into the service you choose. Logins are kept per account.`),
        h("div", { class: "field" }, h("label", {}, "Merge into"), sel),
        h("div", { class: "row", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", id: "merge-save", onclick: async () => {
          await api("serviceEdit", { op: "merge", args: { from: s.id, to: sel.value } });
          selectedService = sel.value;
          close();
          await refresh();
          toast("Merged");
        } }, "Merge"))
      ];
    }, { center: true });
  }
  function accounts() {
    const byService = /* @__PURE__ */ new Map();
    for (const a of st.accounts) {
      if (!byService.has(a.serviceId)) byService.set(a.serviceId, []);
      byService.get(a.serviceId).push(a);
    }
    const addSel = h("select", { class: "input", id: "add-account-service", style: { maxWidth: "280px" } }, h("option", { value: "" }, "Create an account for\u2026"), st.services.map((s) => h("option", { value: s.id }, s.name)));
    addSel.onchange = () => {
      if (addSel.value) {
        const s = st.services.find((x) => x.id === addSel.value);
        addSel.value = "";
        edit(null, s.id);
      }
    };
    return h(
      "section",
      {},
      h("div", { class: "row" }, h("div", { class: "grow" }, h("h1", {}, "Accounts"), h("p", { class: "lead" }, "Every account is an isolated identity for one service. Deleting one erases all of its data.")), addSel),
      byService.size ? [...byService.entries()].map(([sid, list]) => h(
        "div",
        { class: "panel", "data-service-group": sid },
        h("div", { class: "row" }, h("h2", { class: "grow" }, serviceName(sid)), h("button", { class: "btn sm", onclick: () => edit(null, sid) }, icon("plus"), "Add")),
        list.map((a) => h(
          "div",
          { class: "card", style: { "--c": a.color, cursor: "default" }, "data-account": a.id },
          avatar(a),
          h("div", { class: "grow" }, h("div", { class: "title" }, a.name), h("div", { class: "sub" }, a.proxy ? `via ${proxyLabel(a.proxy)}` : "No proxy")),
          h("button", { class: "btn sm", "data-edit": a.id, onclick: () => edit(a, sid) }, icon("edit"), "Edit")
        ))
      )) : h("div", { class: "panel", style: { textAlign: "center", padding: "40px" } }, h("div", { class: "muted" }, "No accounts yet. Open a website and create one from the Box popup, or use the menu above."))
    );
  }
  function edit(acc, sid) {
    openAccountEditor({ account: acc, serviceId: sid, serviceName: serviceName(sid), target: st.target, onDone: async () => {
      await refresh();
    } });
  }
  function proxy() {
    const ff = st.target === "firefox";
    const withProxy = st.accounts.filter((a) => a.proxy);
    return h(
      "section",
      {},
      h("div", {}, h("h1", {}, "Proxy"), h("p", { class: "lead" }, "Each account can use its own HTTP, HTTPS or SOCKS5 proxy (with authentication).")),
      h(
        "div",
        { class: "panel" },
        h("h2", {}, ff ? "Exact per-account routing (Firefox)" : "Best effort (Chrome)"),
        ff ? h("p", { class: "muted", style: { margin: 0 } }, "Firefox decides the proxy per request from the container of the requesting tab, so a proxy applies exactly and only to that account\u2019s tabs. DNS is resolved by the proxy, WebRTC is forced through relays, and a failing proxy blocks the request instead of falling back to your own IP.") : h("div", { class: "banner warn" }, icon("warn"), h("div", {}, "Chrome has a single, browser-wide proxy setting. Box generates a proxy auto-config script that sends the hosts used by proxied accounts through their proxy. This is shared with any other tab (including your default session) that visits those hosts, and a host first contacted before Box learns it may connect directly. Whenever that can happen the popup, the page label and the extension badge show a warning \u2014 Box never fails silently."))
      ),
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Accounts with a proxy"),
        withProxy.length ? withProxy.map((a) => h("div", { class: "card", style: { "--c": a.color, cursor: "default" } }, avatar(a), h("div", { class: "grow" }, h("div", { class: "title" }, a.name), h("div", { class: "sub" }, `${serviceName(a.serviceId)} \xB7 ${proxyLabel(a.proxy)}`)), h("button", { class: "btn sm", onclick: () => edit(a, a.serviceId) }, icon("edit"), "Edit"))) : h("p", { class: "muted", style: { margin: 0 } }, "None yet. Open an account\u2019s settings and switch on \u201CProxy\u201D.")
      )
    );
  }
  function about() {
    const mf = ext.runtime.getManifest();
    return h(
      "section",
      {},
      h("div", {}, h("h1", {}, "About Box"), h("p", { class: "lead" }, `Version ${mf.version} \xB7 ${{ firefox: "Firefox", "chrome-mv3": "Chrome (Manifest V3)", "chrome-mv2": "Chrome (Manifest V2)" }[st.target]}`)),
      h("div", { class: "panel" }, h("h2", {}, "Privacy"), h("p", { class: "muted", style: { margin: 0 } }, "Box makes no network requests of its own and has no telemetry. The built-in service catalog ships with the extension and changes only with extension updates. Everything \u2014 accounts, proxies, your edits \u2014 stays in this browser.")),
      h("div", { class: "panel" }, h("h2", {}, "How isolation works here"), h("p", { class: "muted", style: { margin: 0 } }, st.target === "firefox" ? "Each account is a Firefox container: cookies, storage, service workers and cache are separated by the browser itself." : "Chrome has no per-tab sessions, so Box keeps each account\u2019s cookies in its own jar and namespaces web storage per account inside every page. See the README for what is and is not covered."))
    );
  }
  applyTheme();
  refresh().catch((e) => main.replaceChildren(h("div", { class: "banner fail" }, e.message)));
})();
