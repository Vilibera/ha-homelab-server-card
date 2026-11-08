/* Homelab Server Card for Home Assistant
 * https://github.com/Vilibera/ha-homelab-server-card
 *
 * Host metrics: Prometheus (node_exporter) via HA REST sensors (see examples/rest_sensors.yaml).
 * Home Assistant VM: Supervisor API + System Monitor sensors. Containers: HA "Portainer" integration.
 * Backups: Proxmox Backup Server (pbs_*) and Borg (homelab_borg_*) metrics in Prometheus.
 * License: MIT */

const VERSION = "1.0.0";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "") => `<ha-icon class="${cls}" icon="mdi:${name}"></ha-icon>`;
const num = (v) => (v == null || isNaN(v) ? null : Number(v));
const LOADED_FROM = import.meta.url;
const ADD_URL = "/config/integrations/dashboard/add?domain=";
const STALE_MS = 3 * 60 * 1000;

/* 1 server, 2 servers. */
const plural = (n, one, many) => (n === 1 ? one : many);
function fmtBytes(b) {
  b = num(b);
  if (b == null) return "–";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1000 && i < units.length - 1) { b /= 1000; i++; }
  return `${b.toFixed(i > 0 && b < 10 ? 1 : 0)} ${units[i]}`;
}
const fmtRate = (b) => (num(b) == null ? "–" : `${fmtBytes(b)}/s`);
function fmtUptime(s) {
  s = num(s);
  if (s == null) return "–";
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  return `${Math.max(1, Math.floor(s / 60))} min`;
}
function fmtAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
function fmtDur(s) {
  s = num(s);
  if (s == null) return "–";
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}
const fmtWhen = (ts) => (num(ts) == null ? "–" : new Date(ts * 1000).toLocaleString(undefined, { year: new Date(ts * 1000).getFullYear() === new Date().getFullYear() ? undefined : "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
const level = (p, warn = 70, crit = 90) => (p == null ? "#94a3b8" : p >= crit ? "#f87171" : p >= warn ? "#facc15" : "#4ade80");
const tempLevel = (t) => level(t, 65, 80);

function gauge(label, pct, sub) {
  const r = 26; const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return `<div class="gauge"><div class="g-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="g-track"/><circle cx="32" cy="32" r="${r}" class="g-val" stroke="${level(pct)}" stroke-dasharray="${((c * p) / 100).toFixed(1)} ${c.toFixed(1)}"/></svg><b>${pct == null ? "–" : `${Math.round(pct)}%`}</b></div><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
}

function spark(values, color, max) {
  const v = (values || []).filter((x) => num(x) != null).map(Number);
  if (v.length < 2) return `<div class="spark empty muted">No data yet</div>`;
  const hi = max ?? (Math.max(...v) * 1.15 || 1);
  const W = 200; const H = 44;
  const pts = v.map((x, i) => [(i * W) / (v.length - 1), H - (Math.min(x, hi) / hi) * (H - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${line}L${W} ${H}L0 ${H}Z" fill="${color}" opacity=".16"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

const fact = (ic, text, title, color) => `<span class="fact" title="${esc(title)}"${color ? ` style="--fc:${color}"` : ""}>${icon(ic)}${esc(text)}</span>`;

const CSS = `
:host{display:block;--glass:rgba(22,14,38,.46);--glass2:rgba(255,255,255,.07);--line:rgba(255,255,255,.1);--tx:#f6f3fb;--mut:rgba(240,235,250,.68);color:var(--tx);font-family:Roboto,"Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}ha-icon{--mdc-icon-size:20px;display:inline-flex}
.bg{min-height:calc(100vh - var(--header-height,56px));padding:22px;background:radial-gradient(70% 90% at 0% 0%,#1d7387 0%,transparent 62%),radial-gradient(70% 90% at 100% 18%,#a2384f 0%,transparent 62%),radial-gradient(70% 80% at 62% 100%,#8a2d6f 0%,transparent 60%),linear-gradient(135deg,#123e5e,#2a1a68 55%,#571f4e);container-type:inline-size}
.page{max-width:1720px;margin:auto}
@container (max-width:740px){.bg{padding:14px}}
h1{font-size:27px;font-weight:400;margin:2px 0 4px}.sub{color:var(--mut);font-size:14px;min-height:18px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
h2{font-size:15px;font-weight:600;margin:0}
.sec{font-size:13px;font-weight:600;color:var(--mut);margin:22px 0 10px;text-transform:uppercase;letter-spacing:.06em}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.links{display:flex;gap:7px;flex-wrap:wrap}
button.chip{cursor:pointer}.chip.speed{gap:8px}.chip.speed span{display:inline-flex;align-items:center;gap:3px}.chip.speed ha-icon{color:var(--fc)}.chip.speed .u{margin-left:-4px;color:var(--mut);font-weight:500}button.chip:focus-visible{outline:2px solid #fff;outline-offset:2px}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--glass);border:1px solid var(--line);color:var(--tx);border-radius:99px;padding:8px 13px;font:600 12.5px Roboto,system-ui,sans-serif;text-decoration:none}
.chip ha-icon{--mdc-icon-size:16px}.chip:hover{background:rgba(255,255,255,.18)}a:focus-visible{outline:2px solid #fff;outline-offset:2px}
.card{background:var(--glass);border:1px solid var(--line);border-radius:18px;padding:16px;backdrop-filter:blur(8px);min-width:0}
.hosts{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px}
.ibadge{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--tint,rgba(255,255,255,.12));color:var(--ic,#fff);flex:none}.ibadge ha-icon{--mdc-icon-size:23px}
.row{display:flex;align-items:center;gap:11px}.grow{flex:1;min-width:0}.grow h2,.grow .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.muted{color:var(--mut);font-size:12.5px}
.state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;background:var(--glass2);border-radius:99px;padding:5px 10px;flex:none}.state i{width:8px;height:8px;border-radius:50%;background:var(--sc,#94a3b8);box-shadow:0 0 0 3px color-mix(in srgb,var(--sc,#94a3b8) 25%,transparent)}
.state.ok{--sc:#4ade80}.state.bad{--sc:#f87171}.state.old{--sc:#facc15}
.state.ok i{animation:pulse 2.4s ease-in-out infinite}
.gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}
.gauge{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}.g-ring{position:relative;width:74px;height:74px}.g-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.g-track{fill:none;stroke:rgba(255,255,255,.12);stroke-width:6}.g-val{fill:none;stroke-width:6;stroke-linecap:round;transition:stroke-dasharray .8s}
.g-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:16px;font-weight:600}
.gauge span{font-size:12.5px;font-weight:600;margin-top:4px}.gauge small{font-size:11px;color:var(--mut);margin-top:1px;overflow-wrap:anywhere}
.facts{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}.fact{display:inline-flex;align-items:center;gap:5px;background:var(--glass2);border-radius:99px;padding:5px 10px;font-size:12px;white-space:nowrap}.fact ha-icon{--mdc-icon-size:15px;color:var(--fc,var(--mut))}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.charts>div{background:var(--glass2);border-radius:12px;padding:8px 10px 6px;min-width:0}.charts .muted{font-size:11px;display:flex;justify-content:space-between;gap:6px}
.spark{display:block;width:100%;height:44px;margin-top:4px}.spark.empty{display:grid;place-items:center;font-size:11px}
.extra{margin-top:12px;display:grid;gap:7px}.xrow{display:flex;align-items:center;gap:9px;background:var(--glass2);border-radius:12px;padding:9px 11px;font-size:12.5px}.xrow ha-icon{--mdc-icon-size:18px;color:var(--mut)}.xrow b{font-weight:600}
.bar{height:6px;background:rgba(255,255,255,.14);border-radius:9px;margin-top:6px;overflow:hidden}.bar i{display:block;height:100%;border-radius:9px}
.pending{display:flex;flex-direction:column;justify-content:center;border-style:dashed;background:rgba(22,14,38,.28)}
.note{font-size:12.5px;color:var(--mut);background:var(--glass2);border-radius:12px;padding:11px;line-height:1.45;margin-top:12px}
.svc{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:10px}
.tile{display:flex;align-items:center;gap:11px;background:var(--glass);border:1px solid var(--line);border-radius:15px;padding:12px;min-width:0}.tile>div:last-child{min-width:0}.tile b{display:block;font-size:14px;font-weight:600}.tile .muted{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .ibadge{width:40px;height:40px;border-radius:12px}
.st{font-size:11.5px;font-weight:600;color:var(--sc,#cbd5e1);display:flex;align-items:center;gap:5px;margin-top:2px}.st i{width:7px;height:7px;border-radius:50%;background:currentColor}
.others{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.btn{display:inline-flex;gap:6px;align-items:center;justify-content:center;background:#fff;color:#3b1c4f;border-radius:12px;padding:10px 14px;font-size:13px;font-weight:600;text-decoration:none;margin-top:10px}.btn ha-icon{--mdc-icon-size:18px}
.bkstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:10px}
.stat{background:var(--glass2);border-radius:14px;padding:12px 14px;min-width:0}.stat .muted{display:flex;align-items:center;gap:6px}.stat .muted ha-icon{--mdc-icon-size:16px}
.stat b{display:block;font-size:22px;font-weight:600;margin-top:4px}.stat small{display:block;font-size:11.5px;color:var(--mut);margin-top:2px}
.bklist{display:grid;gap:8px;margin-top:12px}
.bkrow{display:grid;grid-template-columns:40px minmax(0,1.3fr) minmax(0,2.6fr) 140px;gap:12px;align-items:center;background:var(--glass2);border-radius:14px;padding:10px 12px}
.bkrow .ibadge{width:40px;height:40px;border-radius:12px}.bkrow b{font-size:14px;font-weight:600}
.kvs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.kv{min-width:0}.kv small{display:block;font-size:11px;color:var(--mut)}.kv span{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kv em{display:block;font-style:normal;font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bkrow.warn{box-shadow:inset 3px 0 0 #facc15}.bkrow.bad{box-shadow:inset 3px 0 0 #f87171}
.bkrow>.state{justify-self:end}
.bksub{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--mut);margin:18px 2px -2px}.bksub ha-icon{--mdc-icon-size:17px}
@container (max-width:740px){.bkrow{grid-template-columns:40px minmax(0,1fr) auto}.bkrow>.state{grid-row:1;grid-column:3}.kvs{grid-column:1/-1}}
@keyframes pulse{50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--sc) 0%,transparent)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

class HomelabServerCard extends HTMLElement {
  setConfig(config) {
    if (!config.metrics) throw new Error("Please set the `metrics` sensor");
    this._cfg = config;
    this._sig = null;
    this._ha = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).addEventListener("click", (ev) => {
        const b = ev.composedPath().find((n) => n.dataset?.entity);
        if (b) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: b.dataset.entity }, bubbles: true, composed: true }));
      });
      this.shadowRoot.innerHTML = `<style>${CSS}</style><div class="bg"><div class="page">
        <div class="top"><div><h1>${esc(config.title || "Homelab")}</h1><div class="sub" id="sum"></div></div><div class="links" id="links"></div></div>
        <div class="sec">Servers</div><div class="hosts" id="hosts"></div>
        ${config.backups ? `<div class="sec">Backups</div><div id="bk"></div>` : ""}
        ${config.services ? `<div class="sec">Services</div><div id="svc"></div>` : ""}
      </div></div>`;
    }
  }

  getCardSize() { return 12; }

  connectedCallback() {
    this._tick = setInterval(() => { this._sig = null; this._render(); }, 15000);
    this._onVisible = () => { if (!document.hidden) { this._reloadIfOutdated(); this._pollHa(); } };
    document.addEventListener("visibilitychange", this._onVisible);
    if (this._hass) this._start();
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    clearTimeout(this._haTimer);
    clearTimeout(this._histTimer);
    document.removeEventListener("visibilitychange", this._onVisible);
    this._started = false;
  }

  set hass(h) {
    this._hass = h;
    if (!this._started && this.isConnected) this._start();
    this._render();
  }

  _start() {
    this._started = true;
    this._reloadIfOutdated();
    this._pollHa();
    this._pollHaHistory();
  }

  /* The HA VM has no node_exporter, so its charts are built from System Monitor sensor history. */
  async _pollHaHistory() {
    clearTimeout(this._histTimer);
    const s = (this._cfg.hosts || []).find((h) => h.ha)?.sensors;
    if (!s || !this._hass) return;
    const ids = [s.cpu, s.rx, s.tx].filter(Boolean);
    const span = 6 * 3600 * 1000; const step = 600 * 1000;
    const start = Date.now() - span;
    try {
      const r = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false });
      const buckets = (id, scale = 1) => {
        const sums = Array(36).fill(0); const counts = Array(36).fill(0);
        for (const p of r[id] || []) {
          const v = parseFloat(p.s); const t = (p.lu ?? p.lc) * 1000;
          if (isNaN(v) || t < start) continue;
          const i = Math.min(35, Math.floor((t - start) / step));
          sums[i] += v * scale; counts[i]++;
        }
        const avg = sums.map((x, i) => (counts[i] ? x / counts[i] : null));
        // With less than an hour of history, show raw samples so the chart appears right away.
        if (avg.filter((x) => x != null).length >= 6) return avg;
        return (r[id] || []).map((p) => parseFloat(p.s) * scale).filter((x) => !isNaN(x)).slice(-60);
      };
      const rx = buckets(s.rx, 1e6); const tx = buckets(s.tx, 1e6);
      const len = Math.min(rx.length, tx.length);
      const net = rx.length === tx.length ? rx.map((x, i) => (x == null && tx[i] == null ? null : (x || 0) + (tx[i] || 0))) : rx.slice(-len).map((x, i) => x + tx.slice(-len)[i]);
      this._haHist = { cpu: buckets(s.cpu), net };
    } catch { /* Charts are optional: the card works without them. */ }
    this._sig = null;
    this._render();
    if (this.isConnected) this._histTimer = setTimeout(() => this._pollHaHistory(), 300000);
  }

  /* The mobile app keeps an old card version until the page is reloaded. */
  async _reloadIfOutdated() {
    try {
      const resources = await this._hass.callWS({ type: "lovelace/resources" });
      const current = resources.find((r) => r.url.includes("homelab-server-card.js"));
      if (!current) return;
      const target = new URL(current.url, location.origin).href;
      if (target === LOADED_FROM || sessionStorage.getItem("hsc-reloaded-for") === target) return;
      sessionStorage.setItem("hsc-reloaded-for", target);
      location.reload();
    } catch { /* Convenience only: the card works without it. */ }
  }

  /* HA VM data from the Supervisor; available to admin users only. */
  async _pollHa() {
    clearTimeout(this._haTimer);
    if (!this._hass || document.hidden) return;
    if (!(this._cfg.hosts || []).some((h) => h.ha)) return;
    const get = (endpoint) => this._hass.callWS({ type: "supervisor/api", endpoint, method: "get" });
    try {
      const [host, core, os] = await Promise.all([get("/host/info"), get("/core/stats"), get("/os/info")]);
      this._ha = { host, core, os, at: Date.now() };
    } catch { this._ha = this._ha || { failed: true }; }
    this._sig = null;
    this._render();
    if (this.isConnected) this._haTimer = setTimeout(() => this._pollHa(), 30000);
  }

  /* --- data --- */
  _metrics() {
    const s = this._hass.states[this._cfg.metrics];
    const out = {};
    for (const r of s?.attributes?.result || []) {
      const m = r.metric || {};
      let key = m.m;
      if (m.mountpoint) key += `:${m.mountpoint}`;
      if (m.disk) key += `:${m.disk}`;
      if (m.chip) key += `:${m.chip}`;
      (out[m.instance] ||= {})[key] = num(parseFloat(r.value?.[1]));
    }
    return { data: out, state: s, fresh: s && !["unavailable", "unknown"].includes(s.state) && Date.now() - new Date(s.last_updated) < STALE_MS };
  }

  _history(id) {
    const out = {};
    for (const r of this._hass.states[id]?.attributes?.result || []) out[r.metric?.instance] = (r.values || []).map((v) => num(parseFloat(v[1])));
    return out;
  }

  _containers() {
    const ents = Object.values(this._hass.entities || {}).filter((e) => e.platform === "portainer");
    if (!ents.length) return null;
    const devices = this._hass.devices || {};
    const byDev = {};
    for (const e of ents) (byDev[e.device_id] ||= []).push(e.entity_id);
    let list = Object.entries(byDev).map(([id, ids]) => ({ dev: devices[id], ids }));
    if (list.some((c) => c.dev?.via_device_id)) list = list.filter((c) => c.dev?.via_device_id);
    return list.map(({ dev, ids }) => {
      const states = ids.map((i) => [i.split(".")[0], this._hass.states[i]?.state]);
      let running = null;
      const st = states.find(([, v]) => ["running", "exited", "paused", "restarting", "dead", "created"].includes(v));
      if (st) running = st[1] === "running";
      else {
        const b = states.find(([d, v]) => (d === "binary_sensor" || d === "switch") && (v === "on" || v === "off"));
        if (b) running = b[1] === "on";
      }
      return { name: dev?.name_by_user || dev?.name || ids[0], running };
    });
  }

  /* --- rendering --- */
  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const c = this._cfg;
    const st = (id) => this._hass.states[id]?.last_updated || "-";
    const portSig = Object.values(this._hass.entities || {}).filter((e) => e.platform === "portainer").map((e) => this._hass.states[e.entity_id]?.state).join(",");
    const haSensors = Object.values((c.hosts || []).find((h) => h.ha)?.sensors || {}).map(st).join(",");
    const speedSig = Object.values(c.speedtest || {}).map(st).join(",");
    const sig = [st(c.metrics), st(c.cpu_history), st(c.net_history), st(c.backups), speedSig, portSig, this._ha?.at, haSensors, this._haHist?.cpu?.join()].join("|");
    if (sig === this._sig) return;
    this._sig = sig;

    const M = this._metrics();
    const cpuH = this._history(c.cpu_history);
    const netH = this._history(c.net_history);
    const root = this.shadowRoot;

    root.getElementById("links").innerHTML = (c.links || []).map((l) => `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener">${icon(l.icon || "open-in-new")}${esc(l.name)}</a>`).join("") + this._speedHtml();
    root.getElementById("hosts").innerHTML = (c.hosts || []).map((h) => this._hostCard(h, M, cpuH, netH)).join("");
    const bk = root.getElementById("bk");
    if (bk) bk.innerHTML = this._backupsHtml(M);
    const svc = root.getElementById("svc");
    if (svc) svc.innerHTML = this._servicesHtml();
    root.getElementById("sum").innerHTML = this._summary(M);
  }

  /* Internet speed (HA Speedtest.net integration). Click opens the history dialog. */
  _speedHtml() {
    const sp = this._cfg.speedtest;
    if (!sp) return "";
    const items = [["download", "arrow-down-bold", "#38bdf8", "Download"], ["upload", "arrow-up-bold", "#f0abfc", "Upload"], ["ping", "timer-outline", "#facc15", "Latency (ping)"]];
    const parts = []; const tips = []; let at = null; let ping = "";
    for (const [k, ic, color, label] of items) {
      const s = this._hass.states[sp[k]];
      const v = parseFloat(s?.state);
      // Speedtest reports a failed ping as 1800000 ms (30 min): hide such values
      if (!s || isNaN(v) || (k === "ping" && v >= 60000)) continue;
      const text = `${v >= 10 ? Math.round(v) : v.toFixed(1)}${k === "ping" ? " ms" : ""}`;
      const part = `<span style="--fc:${color}">${icon(ic)}${esc(text)}</span>`;
      if (k === "ping") ping = part; else parts.push(part);
      tips.push(`${label}: ${s.state} ${s.attributes.unit_of_measurement || ""}`);
      if (k !== "ping") at = Math.max(at || 0, new Date(s.last_reported || s.last_updated).getTime());
    }
    if (!parts.length && !ping) return "";
    // One chip: ↓ 209 ↑ 62 Mbit/s · ⏱ 5 ms
    const tip = `Internet speed${at ? `, measured ${fmtAgo(Date.now() - at)}` : ""}\n${tips.join("\n")}`;
    return `<button class="chip speed" data-entity="${esc(sp.download)}" title="${esc(tip)}" aria-label="${esc(tip)}">${parts.join("")}${parts.length ? `<span class="u">Mbit/s</span>` : ""}${ping}</button>`;
  }

  _hostUp(h, M) {
    if (h.pending) return null;
    if (h.ha) return true; // this page is served by Home Assistant itself
    if (!M.fresh) return null;
    return M.data[h.instance]?.up === 1;
  }

  _summary(M) {
    const hosts = (this._cfg.hosts || []).filter((h) => !h.pending);
    if (!M.state) return `${icon("alert-circle-outline")} Sensor not found: ${esc(this._cfg.metrics)}`;
    if (!M.fresh) return `${icon("clock-alert-outline")} Prometheus data unavailable or stale`;
    const down = hosts.filter((h) => this._hostUp(h, M) === false);
    const ago = fmtAgo(Date.now() - new Date(M.state.last_updated));
    if (!down.length) return `<span class="state ok"><i></i>All ${hosts.length} ${plural(hosts.length, "server is up", "servers are up")}</span><span>Updated ${ago}</span>`;
    return `<span class="state bad"><i></i>Unreachable: ${down.map((h) => esc(h.name)).join(", ")}</span><span>Updated ${ago}</span>`;
  }

  _head(h, up, extraState) {
    const tint = h.color || "#a78bfa";
    const [cls, text] = up == null ? (h.pending ? ["", "Pending"] : ["old", "Unknown"]) : up ? ["ok", "Online"] : ["bad", "Offline"];
    return `<div class="row"><div class="ibadge" style="--tint:${tint}2e;--ic:${tint}">${icon(h.icon || "server")}</div>
      <div class="grow"><h2>${esc(h.name)}</h2><div class="muted">${esc([h.role, h.ip].filter(Boolean).join(" · "))}</div></div>
      <span class="state ${cls}"><i></i>${extraState || text}</span></div>`;
  }

  _hostCard(h, M, cpuH, netH) {
    if (h.pending) {
      return `<div class="card pending">${this._head(h, null)}<div class="note">${esc(h.note || "Install node_exporter on this server and it will show up here.")}</div></div>`;
    }
    if (h.ha) return this._haCard(h);
    const d = M.data[h.instance] || {};
    const up = this._hostUp(h, M);
    const ramUsed = d.ram != null && d.ram_total != null ? (d.ram / 100) * d.ram_total : null;
    const root = d["disk:/"]; const rootSize = d["disk_size:/"];
    const cores = d.cores;
    const facts = [
      d.temp != null ? fact("thermometer", `${d.temp.toFixed(0)}°C`, "CPU temperature", tempLevel(d.temp)) : "",
      fact("arrow-down-bold", fmtRate(d.rx), "Network in", "#38bdf8"),
      fact("arrow-up-bold", fmtRate(d.tx), "Network out", "#f0abfc"),
      d.load != null ? fact("gauge", `Load ${d.load.toFixed(2)}`, "1-minute load average") : "",
      fact("clock-outline", fmtUptime(d.uptime), "Uptime"),
    ].join("");
    return `<div class="card">${this._head(h, up)}
      <div class="gauges">${gauge("CPU", d.cpu, cores ? `${cores} ${plural(cores, "core", "cores")}` : "")}${gauge("RAM", d.ram, ramUsed != null ? `${fmtBytes(ramUsed)} / ${fmtBytes(d.ram_total)}` : "")}${gauge("Disk", root, rootSize ? `${fmtBytes((root / 100) * rootSize)} / ${fmtBytes(rootSize)}` : "")}</div>
      <div class="facts">${facts}</div>
      ${this._charts(cpuH[h.instance], netH[h.instance])}
      ${this._extras(h, d)}</div>`;
  }

  _charts(cpuSeries, netSeries) {
    const cpu = (cpuSeries || []).filter((x) => num(x) != null);
    const net = (netSeries || []).filter((x) => num(x) != null);
    const cpuAvg = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : null;
    const netMax = net.length ? Math.max(...net) : null;
    return `<div class="charts"><div><div class="muted"><span>CPU, 6h</span><span>avg ${cpuAvg == null ? "–" : `${cpuAvg.toFixed(0)}%`}</span></div>${spark(cpu, "#a78bfa", Math.min(100, Math.max(20, ...cpu.map((x) => x * 1.3))))}</div>
      <div><div class="muted"><span>Network, 6h</span><span>max ${fmtRate(netMax)}</span></div>${spark(net, "#38bdf8")}</div></div>`;
  }

  _extras(h, d) {
    const rows = [];
    for (const [mount, label] of Object.entries(h.storage || {})) {
      const p = d[`disk:${mount}`]; const size = d[`disk_size:${mount}`];
      if (p == null) continue;
      rows.push(`<div class="xrow" style="display:block"><div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">${icon("harddisk")}<b>${esc(label)}</b></span><span class="muted">${fmtBytes((p / 100) * size)} / ${fmtBytes(size)}</span></div><div class="bar"><i style="width:${p.toFixed(1)}%;background:${level(p, 80, 92)}"></i></div></div>`);
    }
    for (const disk of h.disks || []) {
      const ok = d[`disk_ok:${disk.dev}`];
      const t = disk.chip ? d[`nvme_temp:${disk.chip}`] : d[`disk_temp:${disk.dev}`];
      const okText = ok == null ? "Health unknown" : ok === 1 ? "SMART: healthy" : "SMART: problem!";
      rows.push(`<div class="xrow">${icon(disk.icon || "harddisk")}<div class="grow"><b>${esc(disk.name)}</b><div class="muted" style="color:${ok === 0 ? "#fca5a5" : ""}">${okText}</div></div>${t != null ? fact("thermometer", `${t.toFixed(0)}°C`, "Disk temperature", tempLevel(t)) : ""}</div>`);
    }
    if (h.power) {
      const flag = (now, boot, okText, nowText, bootText) => (now == null ? null : now ? [nowText, "#f87171"] : boot ? [bootText, "#facc15"] : [okText, "#4ade80"]);
      const items = [
        ["flash", "Power", flag(d.undervoltage, d.undervoltage_boot, "Voltage OK", "Undervoltage now!", "Undervoltage since boot")],
        ["speedometer", "CPU", flag(d.throttling, d.throttling_boot, "Not throttled", "Throttled now!", "Throttled since boot")],
      ].filter((x) => x[2]);
      for (const [ic, label, [text, color]] of items) {
        rows.push(`<div class="xrow">${icon(ic)}<div class="grow"><b>${label}</b><div class="muted">${text}</div></div><span class="state" style="--sc:${color}"><i></i></span></div>`);
      }
    }
    return rows.length ? `<div class="extra">${rows.join("")}</div>` : "";
  }

  _haCard(h) {
    const ha = this._ha;
    if (!ha || ha.failed) {
      return `<div class="card">${this._head(h, true)}<div class="note">${ha?.failed ? "Home Assistant VM details are visible to admin users only." : "Loading…"}</div></div>`;
    }
    const { host, core, os } = ha;
    const s = h.sensors || {};
    const n = (id) => { const v = parseFloat(this._hass.states[id]?.state); return isNaN(v) ? null : v; };
    // Whole-VM figures from System Monitor; until they exist, show the HA Core process itself.
    const cpu = n(s.cpu) ?? core.cpu_percent;
    const ram = n(s.ram) ?? core.memory_percent;
    const memUsed = n(s.ram_used) != null ? n(s.ram_used) * 1048576 : core.memory_usage;
    const memLimit = core.memory_limit;
    const diskP = host.disk_total ? (host.disk_used / host.disk_total) * 100 : null;
    const uptime = host.boot_timestamp ? Date.now() / 1000 - host.boot_timestamp / 1e6 : null;
    const rx = n(s.rx); const tx = n(s.tx); const load = n(s.load);
    const facts = [
      rx != null ? fact("arrow-down-bold", fmtRate(rx * 1e6), "Network in", "#38bdf8") : "",
      tx != null ? fact("arrow-up-bold", fmtRate(tx * 1e6), "Network out", "#f0abfc") : "",
      load != null ? fact("gauge", `Load ${load.toFixed(2)}`, "1-minute load average") : "",
      fact("clock-outline", fmtUptime(uptime), "Uptime"),
      fact("home-assistant", `HA ${this._hass.config.version}`, "Home Assistant version", "#41bdf5"),
      fact("chip", `OS ${os.version}`, "Home Assistant OS version"),
    ].join("");
    return `<div class="card">${this._head(h, true)}
      <div class="gauges">${gauge("CPU", cpu, `${core.online_cpus} ${plural(core.online_cpus, "core", "cores")}`)}${gauge("RAM", ram, `${fmtBytes(memUsed)} / ${fmtBytes(memLimit)}`)}${gauge("Disk", diskP, `${host.disk_used} / ${host.disk_total} GB`)}</div>
      <div class="facts">${facts}</div>
      ${this._charts(this._haHist?.cpu, this._haHist?.net)}</div>`;
  }

  /* --- backups: Proxmox Backup Server (pbs_*) and Borg (homelab_borg_*, one row per repo) --- */
  _backups() {
    const s = this._hass.states[this._cfg.backups];
    const guests = {}; const stores = {}; const repos = {}; const vms = {}; const pbsVerify = {};
    let pbsRun = null;
    for (const r of s?.attributes?.result || []) {
      const m = r.metric || {}; const n = m.__name__ || ""; const v = num(parseFloat(r.value?.[1]));
      if (n.startsWith("homelab_borg_")) {
        if (!m.repo) continue;
        const rp = (repos[m.repo] ||= { repo: m.repo, host: m.host, instance: m.instance });
        rp[n.slice(13)] = v;
        if (n === "homelab_borg_drill_last_success" && m.mode) rp.drill_mode = m.mode;
      } else if (n.startsWith("homelab_restore_drill_vm_")) {
        // VM restore drill in Proxmox (vmid, mode monthly|quarterly)
        if (m.vmid == null) continue;
        const vm = (vms[m.vmid] ||= { vmid: String(m.vmid) });
        vm[n.slice(25)] = v;
        if (m.mode) vm.mode = m.mode;
      } else if (n.startsWith("homelab_pbs_verify_drill_")) (pbsVerify[m.store || ""] ||= { store: m.store })[n.slice(25)] = v;
      else if (n.startsWith("pbs_datastore_")) (stores[m.store] ||= {})[n.slice(14)] = v;
      else if (n === "pbs_exporter_last_run_timestamp_seconds") pbsRun = v;
      else if (m.id != null) {
        // Guests are keyed by id; the name comes from snapshots (pbs_guest_*), task metrics may lack it
        const g = (guests[`${m.store}/${m.type}/${m.id}`] ||= { type: m.type, id: m.id });
        if (m.name && (!g.name || n.startsWith("pbs_guest_"))) g.name = m.name;
        g[n.replace(/^pbs_(guest_|backup_)?/, "")] = v;
      }
    }
    return { state: s, guests: Object.values(guests), stores: Object.values(stores), repos, vms, pbsVerify: Object.values(pbsVerify), pbsRun };
  }

  _backupsHtml(M) {
    const B = this._backups();
    const c = this._cfg;
    if (!B.state) return `<div class="card note">Sensor not found: ${esc(c.backups)}</div>`;
    const now = Date.now() / 1000;
    const maxAge = (c.backup_max_age_h || 36) * 3600;
    // Stable VM names by id: PBS `name` comes from the latest snapshot comment
    const names = { ...Object.fromEntries(Object.entries(c.restore_vms || {}).map(([k, v]) => [k, v.name])), ...(c.backup_names || {}) };
    const host = (c.hosts || []).find((h) => h.backup) || {};
    const d = M.data[host.instance] || {};

    // Total usage: PBS datastores; if none yet, the backup disk usage
    const sum = (k) => { const v = B.stores.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    let used = sum("used_bytes"); let total = sum("total_bytes");
    if (used == null && d["disk:/backup"] != null) { total = d["disk_size:/backup"]; used = (d["disk:/backup"] / 100) * total; }
    const index = sum("index_bytes") || null; const disk = sum("disk_bytes") || null; // 0 until PBS has run GC
    const snaps = sum("snapshots");
    const pct = used != null && total ? (used / total) * 100 : null;
    const repoList = Object.values(B.repos);
    const borgSize = repoList.reduce((a, r) => (r.repo_unique_compressed_bytes != null ? (a ?? 0) + r.repo_unique_compressed_bytes : a), null);
    const borgArchives = repoList.reduce((a, r) => a + (r.archives || 0), 0);

    const lastTs = Math.max(...B.guests.map((g) => g.last_snapshot_timestamp_seconds || 0), ...repoList.map((r) => r.backup_last_success_timestamp_seconds || 0)) || null;
    const stat = (ic, label, value, sub, extra = "") => `<div class="stat"><div class="muted">${icon(ic)}${esc(label)}</div><b>${esc(value)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}${extra}</div>`;
    const stats = [
      stat("database", "Total backup usage", fmtBytes(used), total ? `of ${fmtBytes(total)} (${pct.toFixed(0)}%)` : "", pct != null ? `<div class="bar"><i style="width:${pct.toFixed(1)}%;background:${level(pct, 80, 92)}"></i></div>` : ""),
      index != null ? stat("layers-triple", "Logical size", fmtBytes(index), disk ? `Deduplication ×${(index / disk).toFixed(1)}` : "") : "",
      snaps != null ? stat("content-copy", "VM snapshots (PBS)", String(snaps), `${B.guests.length} ${plural(B.guests.length, "guest", "guests")}`) : "",
      repoList.length ? stat("archive-lock", "File backups (Borg)", fmtBytes(borgSize), `${repoList.length} ${plural(repoList.length, "repo", "repos")} · ${borgArchives} ${plural(borgArchives, "archive", "archives")}`) : "",
      stat("history", "Latest backup", lastTs ? fmtAgo((now - lastTs) * 1000) : "–", lastTs ? fmtWhen(lastTs) : ""),
    ].join("");

    const rows = [];
    const kv = (label, value, sub) => `<div class="kv"><small>${esc(label)}</small><span>${esc(value)}</span>${sub ? `<em>${esc(sub)}</em>` : "<em>&nbsp;</em>"}</div>`;
    const row = (ic, color, title, sub, kvs, [stText, stColor], cls = "") => `<div class="bkrow ${cls}"><div class="ibadge" style="--tint:${color}2e;--ic:${color}">${icon(ic)}</div>
      <div style="min-width:0"><b>${esc(title)}</b><div class="muted">${esc(sub)}</div></div><div class="kvs">${kvs}</div>
      <span class="state" style="--sc:${stColor}"><i></i>${esc(stText)}</span></div>`;

    const guests = B.guests.slice().sort((a, b) => String(names[a.id] || a.name).localeCompare(String(names[b.id] || b.name)));
    for (const g of guests) {
      const start = g.last_start_timestamp_seconds ?? g.last_snapshot_timestamp_seconds;
      const age = start != null ? now - start : null;
      let st = ["Success", "#4ade80"]; let cls = "";
      if (g.running === 1) st = ["Running now", "#38bdf8"];
      else if (g.last_success === 0) { st = ["Failed", "#f87171"]; cls = "bad"; }
      else if (g.last_verify_ok === 0) { st = ["Verify failed", "#f87171"]; cls = "bad"; }
      else if (age == null || age > maxAge) { st = ["Outdated", "#facc15"]; cls = "warn"; }
      const changed = g.running === 1 ? null : g.last_upload_bytes;
      const src = g.last_source_bytes ?? g.last_snapshot_size_bytes;
      rows.push(row(g.type === "ct" ? "package-variant-closed" : "monitor", "#a78bfa", names[g.id] || g.name || `VM ${g.id}`,
        `${g.type === "ct" ? "LXC" : "VM"} ${g.id}${g.snapshots != null ? ` · ${g.snapshots} ${plural(g.snapshots, "snapshot", "snapshots")}` : ""}`,
        kv("Last", fmtWhen(start), age != null ? fmtAgo(age * 1000) : "") +
        kv("Took", g.running === 1 ? "running…" : fmtDur(g.last_duration_seconds), "") +
        kv("Changed", changed != null ? fmtBytes(changed) : "–", src != null ? `of ${fmtBytes(src)}${changed != null && src ? ` (${((changed / src) * 100).toFixed(changed / src < 0.1 ? 1 : 0)}%)` : ""}` : ""),
        st, cls));
    }

    // Borg: one row per repo. Configured repos without data yet are shown as pending.
    const guestRows = rows.splice(0);
    const borgMax = (c.borg_max_age_h || 26) * 3600;
    const repoCfg = c.borg_repos || {};
    const repoKeys = [...new Set([...Object.keys(repoCfg), ...Object.keys(B.repos)])];
    for (const key of repoKeys) {
      const r = B.repos[key]; const rc = repoCfg[key] || {};
      const title = rc.name || key;
      if (!r) {
        rows.push(row(rc.icon || "archive-lock", "#94a3b8", title, `Borg · repo ${key}`, kv("Last", "–", "") + kv("Took", "–", "") + kv("Changed", "–", ""), ["Waiting for first backup", "#94a3b8"]));
        continue;
      }
      const run = r.backup_last_run_timestamp_seconds ?? r.backup_last_success_timestamp_seconds;
      const okTs = r.backup_last_success_timestamp_seconds;
      const age = okTs != null ? now - okTs : null;
      const restoreOk = r.restore_test_last_success;
      let st = ["Success", "#4ade80"]; let cls = "";
      if (r.backup_last_success === 0) { st = ["Failed", "#f87171"]; cls = "bad"; }
      else if (restoreOk === 0) { st = ["Restore failed", "#f87171"]; cls = "bad"; }
      else if (age == null || age > borgMax) { st = ["Outdated", "#facc15"]; cls = "warn"; }
      // Drill results are shown under "Restore drills"; here only the backup itself
      const sub = `Borg${r.archives != null ? ` · ${r.archives} ${plural(r.archives, "archive", "archives")}` : ""}`;
      const changed = r.backup_last_deduplicated_bytes; const orig = r.backup_last_original_bytes;
      const lastText = r.backup_last_success === 0 && okTs != null ? `last success ${fmtAgo((now - okTs) * 1000)}` : run != null ? fmtAgo((now - run) * 1000) : "";
      rows.push(row(rc.icon || "archive-lock", rc.color || "#34d399", title, sub,
        kv("Last", fmtWhen(run), lastText) +
        kv("Took", fmtDur(r.backup_last_duration_seconds), r.backup_last_files != null ? `${r.backup_last_files} ${plural(r.backup_last_files, "file", "files")}` : "") +
        kv("Changed", changed != null ? fmtBytes(changed) : "–", orig != null ? `of ${fmtBytes(orig)}${changed != null && orig ? ` (${((changed / orig) * 100).toFixed(changed / orig < 0.1 ? 1 : 0)}%)` : ""}` : ""),
        st, cls));
    }

    // Restore drills: monthly on the first Sunday, extended ones in January, April, July and October
    const MONTH = (c.drill_max_age_d || 36) * 86400; const QUARTER = (c.quarterly_max_age_d || 98) * 86400;
    const firstSun = (y, mo) => { const x = new Date(y, mo, 1); x.setDate(1 + ((7 - x.getDay()) % 7)); return x; };
    const nextRun = (months) => {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      for (let i = 0; i < 15; i++) {
        const mo = (t.getMonth() + i) % 12; const y = t.getFullYear() + Math.floor((t.getMonth() + i) / 12);
        if (months && !months.includes(mo)) continue;
        const x = firstSun(y, mo); if (x >= t) return x;
      }
      return null;
    };
    const fmtDay = (x) => (x ? x.toLocaleDateString() : "–");
    const nextM = fmtDay(nextRun(null)); const nextQ = fmtDay(nextRun([0, 3, 6, 9]));
    const mark = (ok) => (ok === 1 ? "✓" : ok === 0 ? "✗" : "–");
    const maxTs = (arr) => Math.max(0, ...arr.filter((x) => x != null)) || null;
    const ago = (ts) => (ts != null ? fmtAgo((now - ts) * 1000) : "");
    const drillState = (oks, ts, limit, wait) => {
      if (!oks.length) return [[wait, "#94a3b8"], ""];
      if (oks.some((x) => x === 0)) return [["Failed", "#f87171"], "bad"];
      if (ts == null || now - ts > limit) return [["Outdated", "#facc15"], "warn"];
      return [["Passed", "#4ade80"], ""];
    };
    const drills = [];

    // Daily: after every Borg backup a sample of files is restored from the newest archive
    const daily = repoKeys.map((k) => B.repos[k]).filter((r) => r && r.restore_test_last_success != null);
    const dTs = maxTs(daily.map((r) => r.restore_test_last_run_timestamp_seconds));
    let [dSt, dCls] = drillState(daily.map((r) => r.restore_test_last_success), dTs, borgMax, "Pending");
    if (dCls === "" && daily.some((r) => r.restore_test_last_run_timestamp_seconds == null || now - r.restore_test_last_run_timestamp_seconds > borgMax)) [dSt, dCls] = [["Outdated", "#facc15"], "warn"];
    const shortName = (r) => (repoCfg[r.repo]?.name || r.repo).replace(/\s*\(.*\)$/, "");
    drills.push(row("restore", "#38bdf8", "Daily test", "Borg · after every nightly backup",
      kv("Repos", daily.length ? `${daily.filter((r) => r.restore_test_last_success === 1).length}/${daily.length} passed` : "–", daily.map((r) => `${shortName(r)} ${mark(r.restore_test_last_success)}`).join(" ")) +
      kv("Last", dTs ? fmtWhen(dTs) : "–", dTs ? ago(dTs) : "") +
      kv("Took", daily.length ? fmtDur(daily.reduce((a, r) => a + (r.restore_test_duration_seconds || 0), 0)) : "–", "all repos combined"),
      dSt, dCls));

    // VM restore from PBS into Proxmox
    const vmCfg = c.restore_vms || {};
    const vmIds = [...new Set([...Object.keys(vmCfg), ...Object.keys(B.vms)])].sort((a, b) => Number(a) - Number(b));
    const vmList = Object.values(B.vms);
    const vmTs = maxTs(vmList.map((v) => v.last_run_timestamp_seconds));
    const vmStale = vmList.some((v) => v.last_run_timestamp_seconds != null && now - v.last_run_timestamp_seconds > (vmCfg[v.vmid]?.quarterly ? QUARTER : MONTH));
    let [vmSt, vmCls] = drillState(vmList.map((v) => v.success), vmTs, MONTH, "Pending");
    if (vmCls === "" && vmList.length && vmStale) [vmSt, vmCls] = [["Outdated", "#facc15"], "warn"];
    drills.push(row("backup-restore", "#a78bfa", "VM restore", "PBS → Proxmox, network isolated",
      vmIds.map((id) => {
        const v = B.vms[id]; const g = B.guests.find((x) => String(x.id) === id); const vc = vmCfg[id] || {};
        const label = `${vc.name || g?.name || "VM"} (${id})`;
        if (!v) return kv(label, "–", vc.quarterly ? `quarterly only · ${nextQ}` : `next ${nextM}`);
        return kv(label, `${mark(v.success)} ${fmtDur(v.duration_seconds)}`, `${ago(v.last_run_timestamp_seconds)}${v.mode === "quarterly" ? " · quarterly" : ""}`);
      }).join(""), vmSt, vmCls));

    // Borg: restore of random files from every repo
    const drilled = repoList.filter((r) => r.drill_last_success != null);
    const sumK = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
    const bTs = maxTs(drilled.map((r) => r.drill_last_run_timestamp_seconds));
    const [bSt, bCls] = drillState(drilled.map((r) => r.drill_last_success), bTs, MONTH, "Pending");
    const diff = sumK(drilled, "drill_files_diff");
    drills.push(row("file-restore", "#34d399", "File restore", "Borg · monthly, random files",
      kv("Files", drilled.length ? `${sumK(drilled, "drill_files_ok")}/${sumK(drilled, "drill_files_checked")}` : "–", drilled.length ? `${diff ? `${diff} differ` : "all match"} · ${drilled.filter((r) => r.drill_last_success === 1).length}/${drilled.length} repos` : "") +
      kv("Last", bTs ? fmtWhen(bTs) : "–", bTs ? ago(bTs) : `next ${nextM}`) +
      kv("Took", drilled.length ? fmtDur(sumK(drilled, "drill_duration_seconds")) : "–", drilled.length ? "all repos combined" : ""),
      bSt, bCls));

    // PBS full verify
    const pv = B.pbsVerify;
    const pvTs = maxTs(pv.map((x) => x.last_run_timestamp_seconds));
    const [pvSt, pvCls] = drillState(pv.map((x) => x.success), pvTs, MONTH, "Pending");
    drills.push(row("shield-check", "#60a5fa", "PBS full verify", `verify · ${pv.map((x) => x.store).filter(Boolean).join(", ") || "all chunks"}`,
      kv("Last", pvTs ? fmtWhen(pvTs) : "–", pvTs ? ago(pvTs) : `next ${nextM}`) +
      kv("Took", pv.length ? fmtDur(maxTs(pv.map((x) => x.duration_seconds))) : "–", "") +
      kv("Result", !pv.length ? "–" : pv.every((x) => x.success === 1) ? "No errors" : "Errors found", ""),
      pvSt, pvCls));

    // Monthly: summary of all monthly drills (VM, Borg files, PBS verify)
    const mOks = [...vmList.filter((v) => !vmCfg[v.vmid]?.quarterly).map((v) => v.success), ...drilled.map((r) => r.drill_last_success), ...pv.map((x) => x.success)];
    const mTs = maxTs([...vmList.filter((v) => !vmCfg[v.vmid]?.quarterly).map((v) => v.last_run_timestamp_seconds), bTs, pvTs]);
    const [mSt, mCls] = drillState(mOks, mTs, MONTH, "Pending");
    const mDur = vmList.filter((v) => !vmCfg[v.vmid]?.quarterly).reduce((a, v) => a + (v.duration_seconds || 0), 0) + sumK(drilled, "drill_duration_seconds") + pv.reduce((a, x) => a + (x.duration_seconds || 0), 0);
    drills.push(row("calendar-clock", "#facc15", "Monthly drill", "First Sunday of every month",
      kv("Tests", mOks.length ? `${mOks.filter((x) => x === 1).length}/${mOks.length} passed` : "–", `next ${nextM}`) +
      kv("Last", mTs ? fmtWhen(mTs) : "–", mTs ? ago(mTs) : "") +
      kv("Took", mOks.length ? fmtDur(mDur) : "–", mOks.length ? "VM, files, PBS combined" : ""),
      mSt, mCls));

    // Quarterly: Borg verify-data and full directory restore
    const vd = repoList.filter((r) => r.verify_data_success != null); const fd = repoList.filter((r) => r.drill_full_dir_success != null);
    const qTs = maxTs([...vd.map((r) => r.verify_data_last_run_timestamp_seconds), ...fd.map((r) => r.drill_full_dir_last_run_timestamp_seconds)]);
    const [qSt, qCls] = drillState([...vd.map((r) => r.verify_data_success), ...fd.map((r) => r.drill_full_dir_success)], qTs, QUARTER, "Pending");
    const okOf = (arr, k) => (arr.length ? `${arr.filter((r) => r[k] === 1).length}/${arr.length} repos` : "–");
    drills.push(row("calendar-check", "#f472b6", "Quarterly drill", "January, April, July, October",
      kv("Borg verify-data", okOf(vd, "verify_data_success"), qTs ? fmtWhen(qTs) : `next ${nextQ}`) +
      kv("Full directory", okOf(fd, "drill_full_dir_success"), fd.length ? `${sumK(fd, "drill_full_dir_files")} ${plural(sumK(fd, "drill_full_dir_files"), "file", "files")}` : "") +
      kv("Took", vd.length ? fmtDur(sumK(vd, "verify_data_duration_seconds")) : "–", qTs ? `next ${nextQ}` : ""),
      qSt, qCls));
    // Separate section, like "Servers", "Backups" and "Services"
    const drillHtml = c.drills === false ? "" : `<div class="sec">Restore drills</div><div class="card"><div class="bklist" style="margin-top:0">${drills.join("")}</div></div>`;

    let note = "";
    if (!B.guests.length) note = `<div class="note">${icon("information-outline")} No VM backup data from Proxmox Backup Server yet. It appears once a PBS exporter publishes <b>pbs_*</b> metrics to Prometheus.</div>`;
    else if (B.pbsRun != null && now - B.pbsRun > 1800) note = `<div class="note" style="color:#fde68a">${icon("clock-alert-outline")} PBS data has not been updated for ${fmtAgo((now - B.pbsRun) * 1000).replace(" ago", "")}: check the PBS exporter.</div>`;

    return `<div class="card"><div class="bkstats">${stats}</div>${guestRows.length ? `<div class="bksub">${icon("monitor-multiple")}Full VM images · Proxmox Backup Server</div><div class="bklist">${guestRows.join("")}</div>` : ""}${rows.length ? `<div class="bksub">${icon("folder-zip-outline")}Important files and configs · Borg</div><div class="bklist">${rows.join("")}</div>` : ""}${note}</div>${drillHtml}`;
  }

  _servicesHtml() {
    const services = this._cfg.services || [];
    const containers = this._containers();
    const used = new Set();
    // When Portainer is down every entity becomes "unavailable": that is a Portainer problem, not the containers'.
    const portIds = Object.values(this._hass.entities || {}).filter((e) => e.platform === "portainer" && /^(binary_sensor|sensor|switch)\./.test(e.entity_id)).map((e) => e.entity_id);
    const offline = portIds.length > 0 && portIds.every((i) => [undefined, "unavailable"].includes(this._hass.states[i]?.state));
    if (offline) {
      const tiles = services.map((s) => { const tint = s.color || "#a78bfa"; return `<div class="tile"><div class="ibadge" style="--tint:${tint}2e;--ic:${tint}">${icon(s.icon || "docker")}</div><div><b>${esc(s.name)}</b><div class="muted">${esc(s.desc || "")}</div><div class="st" style="--sc:#facc15"><i></i>Portainer unreachable</div></div></div>`; }).join("");
      return `<div class="svc">${tiles}</div><div class="card" style="margin-top:12px"><div class="row" style="color:#facc15">${icon("alert")}<h2>Portainer is not responding</h2></div><div class="note" style="margin-top:8px">Home Assistant can't read container states because Portainer${this._cfg.portainer_url ? ` (${esc(this._cfg.portainer_url)})` : ""} is unreachable. The services themselves may still be running. Start the Portainer container and states will come back automatically.</div></div>`;
    }
    const tiles = services.map((s) => {
      let cls = ""; let text = "State unknown"; let color = "#94a3b8";
      if (containers) {
        const re = new RegExp(s.match || s.name, "i");
        const mine = containers.filter((c) => re.test(c.name));
        mine.forEach((c) => used.add(c));
        const known = mine.filter((c) => c.running != null);
        const run = known.filter((c) => c.running).length;
        if (!mine.length) text = "Container not found";
        else if (!known.length) text = "State unknown";
        else if (run === known.length) { cls = "ok"; color = "#4ade80"; text = known.length > 1 ? `Running (${run}/${known.length})` : "Running"; }
        else if (run === 0) { cls = "bad"; color = "#f87171"; text = "Stopped"; }
        else { cls = "old"; color = "#facc15"; text = `${run} of ${known.length} running`; }
      }
      const tint = s.color || "#a78bfa";
      return `<div class="tile"><div class="ibadge" style="--tint:${tint}2e;--ic:${tint}">${icon(s.icon || "docker")}</div><div><b>${esc(s.name)}</b><div class="muted">${esc(s.desc || "")}</div><div class="st ${cls}" style="--sc:${color}"><i></i>${esc(text)}</div></div></div>`;
    }).join("");
    let after = "";
    if (!containers) {
      after = `<div class="card" style="margin-top:12px"><div class="row">${icon("docker")}<h2>Container states</h2></div>
        <div class="note" style="margin-top:8px">To see whether each container is running, connect Portainer: in Portainer open <b>My account → Access tokens → Add access token</b>, then click the button below and enter your Portainer URL${this._cfg.portainer_url ? ` (<b>${esc(this._cfg.portainer_url)}</b>)` : ""} and the token.</div>
        <a class="btn" href="${ADD_URL}portainer">${icon("link-plus")}Connect Portainer</a></div>`;
    } else {
      const others = containers.filter((c) => !used.has(c));
      if (others.length) {
        after = `<div class="others">${others.map((c) => `<span class="fact" title="${c.running == null ? "State unknown" : c.running ? "Running" : "Stopped"}" style="--fc:${c.running == null ? "#94a3b8" : c.running ? "#4ade80" : "#f87171"}">${icon(c.running === false ? "stop-circle" : "circle-medium")}${esc(c.name)}</span>`).join("")}</div>`;
      }
    }
    return `<div class="svc">${tiles}</div>${after}`;
  }
}

customElements.define("homelab-server-card", HomelabServerCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "homelab-server-card", name: "Homelab Server Card", description: "Homelab status from Prometheus, Home Assistant, Portainer, Proxmox Backup Server and Borg", documentationURL: "https://github.com/Vilibera/ha-homelab-server-card" });
console.info(`%c HOMELAB-SERVER-CARD %c v${VERSION} `, "color:#fff;background:#7c3aed;font-weight:700", "color:#7c3aed;background:#fff");
