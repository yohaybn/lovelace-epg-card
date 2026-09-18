/*
 * Lovelace EPG Card
 * A theme-aware, RTL-ready timeline card for the HomeAssistant-EPG integration.
 * https://github.com/yohaybn/lovelace-epg-card
 */

// In some setups the Lovelace panel element is not registered yet when this
// module loads. Fall back gracefully so the card itself still works instead
// of failing with "Custom element doesn't exist".
const HaPanelLovelace = customElements.get("ha-panel-lovelace");
const LitElement = HaPanelLovelace
  ? Object.getPrototypeOf(HaPanelLovelace)
  : HTMLElement;
const _templateFallback = (strings, ...values) =>
  strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
const html = LitElement.prototype.html || _templateFallback;
const css = LitElement.prototype.css || html || _templateFallback;

const DEFAULT_ROW_HEIGHT = 72;
const DEFAULT_HOUR_WIDTH = 110;
const MISSING_GRACE_MS = 5000;

class EPGCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("epg-card-editor");
  }

  static getStubConfig() {
    return { entities: [], row_height: DEFAULT_ROW_HEIGHT };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._firstMissingAt = null;
    this._lastRenderKey = null;
    this._channelCount = 0;
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("mouseover", (ev) => this._onHover(ev));
    this.shadowRoot.addEventListener("mouseout", (ev) => this._onHoverOut(ev));
    this.shadowRoot.addEventListener("focusin", (ev) => this._onHover(ev));
    this.shadowRoot.addEventListener("focusout", (ev) => this._onHoverOut(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this._hideTooltip();
    });
    // The tooltip is viewport-positioned; hide it when anything scrolls so it
    // never floats detached from its program (issue #7).
    this._onWindowScroll = () => this._hideTooltip();
    window.addEventListener("scroll", this._onWindowScroll, true);
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this._onWindowScroll, true);
  }

  setConfig(config) {
    if (
      !config.entities ||
      !Array.isArray(config.entities) ||
      config.entities.length === 0
    ) {
      throw new Error("You need to define at least one entity.");
    }
    this.config = config;
    this._lastRenderKey = null;
  }

  getCardSize() {
    return Math.min(Math.max(this._channelCount + 1, 3), 12);
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  /* ---------------- data ---------------- */

  _collectChannels() {
    const channels = [];
    const missing = [];
    for (const entityId of this.config.entities) {
      const state = this._hass.states[entityId];
      if (!state) {
        missing.push(entityId);
        continue;
      }
      const unavailable = state.state === "unavailable" || state.state === "unknown";
      const programs = [];
      const today = state.attributes.today || {};
      const starts = Object.keys(today).sort();
      for (const start of starts) {
        programs.push(this._normalizeProgram(today[start], start, false, starts));
      }
      // The integration exposes tomorrow's schedule when its full_schedule
      // option is enabled; append those programs after midnight.
      const tomorrow = state.attributes.tomorrow || {};
      const tomorrowStarts = Object.keys(tomorrow).sort();
      for (const start of tomorrowStarts) {
        programs.push(
          this._normalizeProgram(tomorrow[start], start, true, tomorrowStarts)
        );
      }
      channels.push({
        entityId,
        name:
          state.attributes.channel_display_name ||
          state.attributes.friendly_name ||
          entityId,
        icon: state.attributes.channel_icon || null,
        programs: programs.filter(Boolean),
        unavailable,
      });
    }
    return { channels, missing };
  }

  // Converts HH:MM strings into absolute minutes so programs that cross
  // midnight (end smaller than start) and tomorrow's schedule line up after
  // today's on one continuous timeline.
  _normalizeProgram(program, start, isTomorrow, siblingStarts) {
    const now = this._nowMinutes();
    const end = program.end || this._calculateEndTime(start, siblingStarts);
    const dayOffset = isTomorrow ? 1440 : 0;
    const rawStart = this._convertTimeToMinutes(start) + dayOffset;
    let endAbs = this._convertTimeToMinutes(end) + dayOffset;
    if (endAbs <= rawStart) endAbs += 1440;
    let startAbs = rawStart;
    if (!isTomorrow && startAbs < now) {
      if (endAbs <= now) return null; // already over
      startAbs = now; // airing right now: clamp to the left edge
    }
    return {
      title: program.title || "",
      desc: program.desc || "",
      subTitle: program.sub_title || "",
      start,
      end,
      startAbs,
      endAbs,
    };
  }

  _windowEnd(channels) {
    let maxEnd = 1440;
    for (const channel of channels) {
      for (const program of channel.programs) {
        if (program.endAbs > maxEnd) maxEnd = program.endAbs;
      }
    }
    return maxEnd;
  }

  _renderKey(channels, missing) {
    const minuteStamp = Math.floor(Date.now() / 60000);
    return JSON.stringify([
      minuteStamp,
      missing,
      this.config.row_height || null,
      this.config.title || null,
      channels.map((c) => [c.entityId, c.name, c.icon, c.unavailable, c.programs]),
    ]);
  }

  /* ---------------- render ---------------- */

  _render() {
    if (!this.config) return;
    const { channels, missing } = this._collectChannels();
    const allMissing = channels.length === 0 && missing.length > 0;
    const pastGrace =
      allMissing &&
      this._firstMissingAt !== null &&
      Date.now() - this._firstMissingAt >= MISSING_GRACE_MS;
    const phase = allMissing ? (pastGrace ? "error" : "loading") : "guide";

    const renderKey = phase + this._renderKey(channels, missing);
    if (renderKey === this._lastRenderKey) return;
    this._lastRenderKey = renderKey;
    this._hideTooltip();

    const rowHeight = Number(this.config.row_height) || DEFAULT_ROW_HEIGHT;
    const title = this.config.title;

    if (allMissing) {
      if (this._firstMissingAt === null) {
        this._firstMissingAt = Date.now();
      }
      if (!pastGrace) {
        this._channelCount = 3;
        this._setContent(this._skeletonTemplate(rowHeight), title);
        this._scheduleRetry();
        return;
      }
      this._setContent(
        this._messageTemplate(
          "error",
          "Entities not found",
          missing
            .map((id) => `${id} - check that it exists and the EPG integration is configured.`)
            .join(" ")
        ),
        title
      );
      return;
    }
    this._firstMissingAt = null;

    this._channelCount = channels.length;
    this._setContent(
      this._guideTemplate(channels, missing, rowHeight, this._windowEnd(channels)),
      title
    );
  }

  _scheduleRetry() {
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      if (this._hass) this._render();
    }, MISSING_GRACE_MS);
  }

  _setContent(bodyTemplate, title) {
    const oldScroll = this.shadowRoot.querySelector(".epg-scroll");
    const scrollLeft = oldScroll ? oldScroll.scrollLeft : 0;
    this.shadowRoot.innerHTML = `
      ${this._styles()}
      <ha-card>
        ${title ? `<div class="card-header">${this._escape(title)}</div>` : ""}
        ${bodyTemplate}
        <div class="epg-tooltip" role="tooltip" hidden></div>
      </ha-card>
    `;
    const newScroll = this.shadowRoot.querySelector(".epg-scroll");
    if (newScroll) newScroll.scrollLeft = scrollLeft;
  }

  _styles() {
    return `
    <style>
      :host {
        display: block;
      }
      ha-card {
        overflow: hidden;
      }
      .card-header {
        padding: 16px 16px 4px;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-xl, 20px);
        font-weight: var(--ha-font-weight-medium, 500);
        color: var(--primary-text-color);
      }
      .epg-scroll {
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding: 12px 16px 16px;
        scrollbar-width: thin;
      }
      .epg-inner {
        min-width: 100%;
      }
      .epg-row {
        display: flex;
        align-items: stretch;
      }
      .epg-row + .epg-row {
        margin-top: 6px;
      }
      .timeline-row {
        margin-bottom: 8px;
      }
      .channel-cell {
        flex: 0 0 var(--epg-channel-width, 120px);
        position: sticky;
        inset-inline-start: 0;
        z-index: 2;
        background: var(--card-background-color, white);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px 8px;
        text-align: center;
      }

      .channel-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        object-fit: contain;
        background: var(--secondary-background-color);
      }
      .channel-fallback {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
      }
      .channel-name {
        font-size: 12px;
        line-height: 1.2;
        color: var(--primary-text-color);
        max-width: 100%;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow-wrap: anywhere;
      }
      .track-wrap {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
      }
      .timeline-track {
        position: relative;
        height: 22px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }
      .hour-tick {
        position: absolute;
        inset-inline-start: var(--pos);
        transform: translateX(-50%);
        font-size: 11px;
        color: var(--secondary-text-color);
        white-space: nowrap;
        top: 0;
      }
      .hour-tick.edge-start {
        transform: none;
      }
      .hour-tick.edge-end {
        transform: translateX(-100%);
      }
      :host-context([dir="rtl"]) .hour-tick.edge-end {
        transform: translateX(100%);
      }
      .hour-tick.half {
        opacity: 0.55;
        font-size: 10px;
      }
      .hour-tick::after {
        content: "";
        position: absolute;
        top: 100%;
        inset-inline-start: 50%;
        width: 1px;
        height: 4px;
        background: var(--divider-color, #e0e0e0);
      }
      .programs-track {
        position: relative;
        border-radius: var(--epg-program-border-radius, 10px);
      }
      .program {
        position: absolute;
        inset-inline-start: var(--pos);
        width: var(--width);
        top: 0;
        bottom: 0;
        box-sizing: border-box;
        background: var(--epg-program-background, var(--secondary-background-color));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: var(--epg-program-border-radius, 10px);
        padding: 6px 8px;
        overflow: hidden;
        cursor: default;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        transition: box-shadow 120ms ease, border-color 120ms ease;
      }
      .program:hover,
      .program:focus-visible {
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        outline: none;
        z-index: 3;
      }
      .program.current {
        background: var(--epg-current-background, var(--primary-color));
        color: var(--epg-current-color, var(--text-primary-color, #fff));
        border-color: transparent;
      }
      .program-title {
        font-size: 13px;
        font-weight: 500;
        line-height: 1.25;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow-wrap: anywhere;
      }
      .program-time {
        font-size: 11px;
        opacity: 0.75;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .program.narrow .program-time {
        display: none;
      }
      .program-progress {
        position: absolute;
        inset-inline-start: 0;
        bottom: 0;
        height: 3px;
        width: var(--progress);
        background: currentColor;
        opacity: 0.55;
        border-radius: 0 2px 2px 0;
      }
      .programs-track.empty {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed var(--divider-color, #e0e0e0);
        border-radius: var(--epg-program-border-radius, 10px);
        color: var(--secondary-text-color);
        font-size: 12px;
      }
      .programs-track.empty span {
        position: sticky;
        inset-inline-start: 16px;
        inset-inline-end: 16px;
      }
      .channel-cell.unavailable .channel-name {
        color: var(--secondary-text-color);
      }
      .banner {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 16px 8px;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        background: color-mix(in srgb, var(--warning-color, #ffc107) 18%, transparent);
        color: var(--primary-text-color);
      }
      .banner ha-icon {
        color: var(--warning-color, #ffc107);
        flex: 0 0 auto;
      }
      .state-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 32px 16px;
        text-align: center;
        color: var(--secondary-text-color);
      }
      .state-block ha-icon {
        --mdc-icon-size: 40px;
      }
      .state-block.error ha-icon {
        color: var(--error-color, #db4437);
      }
      .state-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .state-text {
        font-size: 13px;
        max-width: 480px;
      }
      .skeleton-row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      .skeleton-block {
        border-radius: 10px;
        background: linear-gradient(
          90deg,
          var(--secondary-background-color) 25%,
          var(--divider-color, #e0e0e0) 50%,
          var(--secondary-background-color) 75%
        );
        background-size: 200% 100%;
        animation: epg-shimmer 1.4s linear infinite;
      }
      @keyframes epg-shimmer {
        from { background-position: 200% 0; }
        to { background-position: -200% 0; }
      }
      .epg-tooltip {
        position: fixed;
        z-index: 1000;
        max-width: min(320px, 80vw);
        background: var(--card-background-color, #1c1c1c);
        color: var(--primary-text-color, #fff);
        border: 1px solid var(--divider-color, transparent);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        line-height: 1.45;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        pointer-events: none;
      }
      .tooltip-title {
        font-weight: 600;
        margin-bottom: 2px;
      }
      .tooltip-time {
        color: var(--secondary-text-color);
        font-size: 12px;
        margin-bottom: 6px;
      }
      .tooltip-desc {
        overflow-wrap: anywhere;
      }
      @media (max-width: 600px) {
        .epg-scroll {
          padding: 8px 8px 12px;
        }
        .channel-cell {
          flex-basis: var(--epg-channel-width, 76px);
        }
        .channel-icon,
        .channel-fallback {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          font-size: 11px;
        }
        .channel-name {
          font-size: 11px;
        }
        .program {
          padding: 4px 6px;
        }
        .program-title {
          font-size: 12px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .skeleton-block {
          animation: none;
        }
        .program {
          transition: none;
        }
      }
    </style>`;
  }

  _skeletonTemplate(rowHeight) {
    const rows = [0, 1, 2]
      .map(
        () => `
        <div class="skeleton-row">
          <div class="skeleton-block" style="width: var(--epg-channel-width, 120px); height: ${rowHeight}px;"></div>
          <div class="skeleton-block" style="flex: 1; height: ${rowHeight}px;"></div>
        </div>`
      )
      .join("");
    return `<div class="epg-scroll" aria-busy="true" aria-label="Loading TV guide">${rows}</div>`;
  }

  _messageTemplate(kind, titleText, bodyText) {
    const icon =
      kind === "error" ? "mdi:alert-circle-outline" : "mdi:information-outline";
    return `
      <div class="state-block ${kind}" role="${kind === "error" ? "alert" : "status"}">
        <ha-icon icon="${icon}"></ha-icon>
        <div class="state-title">${this._escape(titleText)}</div>
        <div class="state-text">${this._escape(bodyText)}</div>
      </div>`;
  }

  _guideTemplate(channels, missing, rowHeight, windowEnd) {
    const { ticks, trackMinWidth } = this._timelineTicks(windowEnd);
    const warning = missing.length
      ? `<div class="banner"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${this._escape(
          `Some entities were not found: ${missing.join(", ")}`
        )}</span></div>`
      : "";

    const rows = channels
      .map((channel) => {
        const programs = channel.programs
          .map((program) => this._programTemplate(program, rowHeight, windowEnd))
          .join("");
        const track = channel.unavailable
          ? `<div class="programs-track empty" style="height: ${rowHeight}px;"><span>Unavailable</span></div>`
          : channel.programs.length === 0
            ? `<div class="programs-track empty" style="height: ${rowHeight}px;"><span>No programs scheduled</span></div>`
            : `<div class="programs-track" style="height: ${rowHeight}px;">${programs}</div>`;
        return `
          <div class="epg-row">
            <div class="channel-cell ${channel.unavailable ? "unavailable" : ""}" title="${this._escape(channel.name)}">
              ${this._channelIconTemplate(channel)}
              <div class="channel-name">${this._escape(channel.name)}</div>
            </div>
            <div class="track-wrap">${track}</div>
          </div>`;
      })
      .join("");

    return `
      ${warning}
      <div class="epg-scroll">
        <div class="epg-inner" style="min-width: ${trackMinWidth}px;">
          <div class="epg-row timeline-row" aria-hidden="true">
            <div class="channel-cell"></div>
            <div class="track-wrap">
              <div class="timeline-track">${ticks}</div>
            </div>
          </div>
          ${rows}
        </div>
      </div>`;
  }

  _channelIconTemplate(channel) {
    if (channel.icon) {
      return `<img class="channel-icon" src="${this._escape(channel.icon)}" alt=""
        onerror="this.outerHTML=this.dataset.fallback" data-fallback='${this._fallbackIconHtml(channel.name)}'>`;
    }
    return this._fallbackIconHtml(channel.name);
  }

  _fallbackIconHtml(name) {
    const initials = (name || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return `<div class="channel-fallback">${this._escape(initials)}</div>`;
  }

  _programTemplate(program, rowHeight, windowEnd) {
    const now = this._nowMinutes();
    const span = Math.max(windowEnd - now, 1);
    const pos = ((program.startAbs - now) / span) * 100;
    const width = ((program.endAbs - program.startAbs) / span) * 100;
    if (width <= 0) return "";
    const isCurrent = program.startAbs <= now && now < program.endAbs;
    const progress = isCurrent
      ? Math.min(
          100,
          Math.max(
            0,
            ((now - program.startAbs) /
              Math.max(program.endAbs - program.startAbs, 1)) *
              100
          )
        )
      : 0;
    const narrow = width < 9;
    const label = `${program.title}, ${program.start} to ${program.end}${
      program.desc ? `. ${program.desc}` : ""
    }`;
    return `
      <div class="program ${isCurrent ? "current" : ""} ${narrow ? "narrow" : ""}"
           style="--pos: ${pos}%; --width: ${width}%;"
           tabindex="0"
           data-title="${this._escape(program.title)}"
           data-time="${this._escape(`${program.start} - ${program.end}`)}"
           data-desc="${this._escape([program.subTitle, program.desc].filter(Boolean).join(" | "))}"
           aria-label="${this._escape(label)}">
        <div class="program-title">${this._escape(program.title)}</div>
        <div class="program-time">${this._escape(program.start)} - ${this._escape(program.end)}</div>
        ${isCurrent ? `<div class="program-progress" style="--progress: ${progress}%" aria-hidden="true"></div>` : ""}
      </div>`;
  }

  /* ---------------- tooltip ---------------- */

  _onHover(ev) {
    const program = ev.target.closest && ev.target.closest(".program");
    if (!program) return;
    const tooltip = this.shadowRoot.querySelector(".epg-tooltip");
    if (!tooltip) return;
    tooltip.innerHTML = `
      <div class="tooltip-title"></div>
      <div class="tooltip-time"></div>
      <div class="tooltip-desc"></div>`;
    tooltip.querySelector(".tooltip-title").textContent = program.dataset.title;
    tooltip.querySelector(".tooltip-time").textContent = program.dataset.time;
    const descEl = tooltip.querySelector(".tooltip-desc");
    descEl.textContent = program.dataset.desc;
    if (!program.dataset.desc) descEl.remove();
    tooltip.hidden = false;
    this._positionTooltip(program, tooltip);
  }

  _onHoverOut(ev) {
    const program = ev.target.closest && ev.target.closest(".program");
    if (!program) return;
    if (ev.type === "mouseout" && program.contains(ev.relatedTarget)) return;
    this._hideTooltip();
  }

  _hideTooltip() {
    const tooltip = this.shadowRoot.querySelector(".epg-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  _positionTooltip(program, tooltip) {
    const rect = program.getBoundingClientRect();
    const rtl = getComputedStyle(this).direction === "rtl";
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 8;
    let top = rect.top - tipRect.height - margin;
    if (top < margin) top = rect.bottom + margin;
    tooltip.style.top = `${top}px`;
    if (rtl) {
      let right = window.innerWidth - rect.right;
      right = Math.max(margin, Math.min(right, window.innerWidth - tipRect.width - margin));
      tooltip.style.right = `${right}px`;
      tooltip.style.left = "auto";
    } else {
      let left = rect.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
      tooltip.style.left = `${left}px`;
      tooltip.style.right = "auto";
    }
  }

  /* ---------------- time helpers ---------------- */

  _nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  _timelineTicks(windowEnd) {
    const now = this._nowMinutes();
    const span = Math.max(windowEnd - now, 1);
    const hourWidth =
      Number(this.config.hour_width) > 0
        ? Number(this.config.hour_width)
        : DEFAULT_HOUR_WIDTH;
    const trackMinWidth = Math.max(320, (span / 60) * hourWidth);
    const stepMinutes = hourWidth >= 160 ? 30 : 60;
    const ticks = [];
    const first = Math.ceil(now / stepMinutes) * stepMinutes;
    for (let minute = first; minute < windowEnd; minute += stepMinutes) {
      const clock = minute % 1440;
      const label = `${Math.floor(clock / 60)
        .toString()
        .padStart(2, "0")}:${(clock % 60).toString().padStart(2, "0")}`;
      const pos = ((minute - now) / span) * 100;
      const edge = pos < 4 ? " edge-start" : pos > 96 ? " edge-end" : "";
      const half = minute % 60 !== 0 ? " half" : "";
      ticks.push(
        `<div class="hour-tick${edge}${half}" style="--pos: ${pos}%">${label}</div>`
      );
    }
    return { ticks: ticks.join(""), trackMinWidth };
  }

  _convertTimeToMinutes(time) {
    const [hours, minutes] = String(time).split(":").map((t) => parseInt(t, 10));
    return (hours || 0) * 60 + (minutes || 0);
  }

  _calculateEndTime(current, keys) {
    const times = [...keys].sort();
    const index = times.indexOf(current);
    if (index === -1 || index === times.length - 1) {
      return "24:00";
    }
    return times[index + 1];
  }

  _escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("epg-card", EPGCard);

class EPGCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
    };
  }

  constructor() {
    super();
    this.config = {};
  }

  static get styles() {
    return css`
      :host {
        display: block;
        padding: 16px;
      }
    `;
  }

  setConfig(config) {
    this.config = config;
  }

  _valueChanged(ev) {
    const newValue = ev.detail.value;
    this.config = { ...this.config, ...newValue };
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this.config } })
    );
  }

  render() {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${[
          {
            name: "title",
            selector: { text: {} },
          },
          {
            name: "entities",
            selector: {
              entity: { domain: "sensor", multiple: true, integration: "epg" },
            },
          },
          {
            name: "row_height",
            selector: {
              number: { min: 48, max: 300, unit: "px", default: DEFAULT_ROW_HEIGHT },
            },
            default: DEFAULT_ROW_HEIGHT,
          },
          {
            name: "hour_width",
            selector: {
              number: { min: 60, max: 400, unit: "px", default: DEFAULT_HOUR_WIDTH },
            },
            default: DEFAULT_HOUR_WIDTH,
          },
        ]}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}
customElements.define("epg-card-editor", EPGCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "epg-card",
  name: "EPG Card",
  preview: false,
  description:
    "Timeline TV guide for the HomeAssistant-EPG integration, with channel icons, now-playing highlight and full theme support.",
  documentationURL: "https://github.com/yohaybn/lovelace-epg-card",
});
