const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class EPGCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("epg-card-editor");
  }

  static getStubConfig() {
    return { entities: [], row_height: 100 };
  }
  set hass(hass) {
    if (!this.content) {
      this.content = document.createElement("div");
      this.content.style.padding = "16px";
      this.appendChild(this.content);
    }

    const entityIds = this.config.entities;
    const row_height = this.config.row_height || 100;
    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      this.content.innerHTML = `<b>Error:</b> No entities configured.`;
      return;
    }

    const epgData = {};

    // Aggregate EPG data from all configured entities
    entityIds.forEach((entityId) => {
      const state = hass.states[entityId];
      if (!state) {
        this.content.innerHTML = `<b>Error:</b> Entity ${entityId} not found.`;
        return;
      }

      const programs = state.attributes.today;
      if (programs) {
        epgData[state.attributes.friendly_name || entityId] = Object.keys(
          programs
        ).map((start_time) => {
          const program = programs[start_time];
          const end_time = this._calculateEndTime(
            start_time,
            Object.keys(programs)
          );
          return {
            title: program.title,
            desc: program.desc,
            start: start_time,
            end: end_time,
          };
        });
      }
    });

    // Generate timeline starting from the current time and render the card
    const timeline = this._generateTimeline();
    const channels = Object.keys(epgData);

    this.content.innerHTML = `
        <style>
            .epg-card {
                font-family: Arial, sans-serif;
                width: 100%;
                overflow-x: auto;
            }
            .timeline {
                display: flex;
                margin-bottom: 10px;
                padding-left: 10%;
            }
            .timeline div {
                flex: 1;
                text-align: center;
                font-weight: bold;
                border-right: 1px solid #ccc;
                padding: 5px 0;
                min-width: 60px;
            }
            .channel-row {
                height: ${row_height + 10}px;
                display: flex;
                align-items: center;
                margin-bottom: 5px;
            }
            .channel-name {
                width: 10%;
                font-weight: bold;
                text-align: right;
                padding-right: 10px;
            }
            .programs {
                display: flex;
                width: 90%;
                position: relative;
                height: ${row_height}px;
            }
            .program {
                position: absolute;
                height: ${row_height}px;
                background-color: gray;
                border-color: gray;
                color: white;
                border-radius: 4px;
                padding: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: normal; /* Allow text to wrap */
                cursor: pointer;
                font-size: 14px;
                word-wrap: break-word;
            }
            .program:hover {
                background-color: #0056b3;
            }
            .program-tooltip {
                display: none;
                position: fixed; /* Use fixed to break out of the parent */
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 1000; /* Ensure tooltip is always on top */
                max-width: 300px;
                word-wrap: break-word;
                line-height: 1.5;
                white-space: normal;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            }
            .program:hover .program-tooltip {
                display: block;
            }
        </style>

        <div class="epg-card">
            <div class="timeline">${timeline
              .map((time) => `<div>${time}</div>`)
              .join("")}</div>
            ${channels
              .map(
                (channel) => `
                    <div class="channel-row">
                        <div class="channel-name">${channel}</div>
                        <div class="programs">
                            ${epgData[channel]
                              .map(
                                (program) => `
                                    <div class="program"
                                        style="left: ${this._calculatePosition(
                                          program.start
                                        )}%;
                                              width: ${this._calculateWidth(
                                                program.start,
                                                program.end
                                              )}%;">
                                        ${program.title}
                                        <span class="program-tooltip">
                                          <div>  ${program.title}</div>
                                          <div> ${program.desc}</div>
                                          <div> ${program.start}-${
                                  program.end
                                }</div>
                                        </span>
                                    </div>
                                `
                              )
                              .join("")}
                        </div>
                    </div>`
              )
              .join("")}
        </div>
        `;
  }

  _generateTimeline() {
    const currentTime = new Date();
    const startHour = currentTime.getHours(); // Current hour
    const startMinute = currentTime.getMinutes(); // Current minute
    const totalMinutes = startHour * 60 + startMinute; // Start from current time in minutes
    const interval = 60; // 1-hour intervals
    const timeline = [];

    for (let i = 0; i <= 24 - startHour; i++) {
      const hour = Math.floor((totalMinutes + i * interval) / 60) % 24;
      const displayHour = hour.toString().padStart(2, "0");
      timeline.push(`${displayHour}:00`);
    }

    return timeline;
  }

  _calculatePosition(start) {
    const currentTime = new Date();
    const now = `${currentTime
      .getHours()
      .toString()
      .padStart(2, "0")}:${currentTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    if (start < now) {
      start = now;
    }
    const startOfDay = currentTime.getHours() * 60 + currentTime.getMinutes();
    const totalMinutesInDay = 1440 - startOfDay;
    const offset =
      (this._convertTimeToMinutes(start) - startOfDay + totalMinutesInDay) %
      totalMinutesInDay;

    return (offset / totalMinutesInDay) * 100;
  }

  _calculateWidth(start, end) {
    const currentTime = new Date();
    const now = `${currentTime
      .getHours()
      .toString()
      .padStart(2, "0")}:${currentTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    if (start < now) {
      start = now;
    }
    const startOfDay = currentTime.getHours() * 60 + currentTime.getMinutes();
    const totalMinutesInDay = 1440 - startOfDay;
    const duration =
      (this._convertTimeToMinutes(end) -
        this._convertTimeToMinutes(start) +
        totalMinutesInDay) %
      totalMinutesInDay;
    return (duration / totalMinutesInDay) * 100;
  }

  _convertTimeToMinutes(time) {
    const [hours, minutes] = time.split(":").map((t) => parseInt(t, 10));
    return hours * 60 + minutes;
  }

  _calculateEndTime(current, keys) {
    const times = keys.sort();
    const index = times.indexOf(current);
    if (index === -1 || index === times.length - 1) {
      return "24:00"; // Default end time if it's the last program
    }
    return times[index + 1];
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
  }

  getCardSize() {
    return 5;
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
            name: "row_height",
            selector: {
              number: { min: 50, max: 300, unit: "px", default: 100 },
            },
            default: 100,
          },
          {
            name: "entities",
            selector: {
              entity: { domain: "sensor", multiple: true, integration: "epg" },
            },
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
  preview: false, // Optional - defaults to false
  description: "A custom card for HomeAssistant-EPG!", // Optional
  documentationURL: "https://github.com/yohaybn/lovelace-epg-card", // Adds a help link in the frontend card editor
});
