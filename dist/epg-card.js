// --- START OF FILE epg-card.js ---

const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class EPGCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._epgData = {};
    this._searchTerm = '';
    // Create a debounced function that expects the search VALUE as an argument
    this._debouncedProcessSearch = this._debounce(this._processSearchValue.bind(this), 300);
    // Keep the debounce utility function bound correctly
    this._debounce = this._debounce.bind(this);
  }

  // Debounce function (receives value)
  _debounce(func, wait) {
    let timeout;
    return function executedFunction(value) {
      const context = this; // Capture context
      const later = () => {
        timeout = null;
        func.call(context, value); // Call the target function with the value
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static getConfigElement() {
    return document.createElement("epg-card-editor");
  }

  static getStubConfig() {
    return { entities: [], row_height: 100 };
  }

  set hass(hass) {
    if (!this.shadowRoot.querySelector(".epg-card-container")) {
        this._renderBaseLayout();
    }

    if (!hass || !this._config) {
      return;
    }

    let dataChanged = !this._hass;
    if (this._hass) {
        // Ensure entities is an array before iterating
        const entities = this._config?.entities || [];
        for (const entityId of entities) {
            if (hass.states[entityId] !== this._hass.states[entityId]) {
                dataChanged = true;
                break;
            }
        }
    }

    this._hass = hass;

    if (dataChanged) {
        this._fetchAndPrepareData();
    }

    this._renderEPG(); // Render even if data hasn't changed, search term might have
  }

  _fetchAndPrepareData() {
    const entityIds = this._config?.entities || []; // Use optional chaining and default
    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      this._epgData = {};
      console.warn("EPGCard: No entities configured or entities is not an array.");
      const errorDisplay = this.shadowRoot?.querySelector('.error-message'); // Check if shadowRoot exists
       if (errorDisplay) {
           errorDisplay.textContent = 'Error: No entities configured.';
           errorDisplay.style.display = 'block';
       }
      return;
    }

    const newEpgData = {};
    let entityError = null;

    entityIds.forEach((entityId) => {
      if (!entityId) return; // Skip if entityId is empty/null

      const state = this._hass?.states[entityId]; // Use optional chaining
      if (!state) {
        entityError = `Entity ${entityId} not found.`;
        console.warn(`EPGCard: ${entityError}`);
        // Optionally add channel key with empty data?
        // newEpgData[entityId] = [];
        return;
      }

      const channelName = state.attributes?.friendly_name || entityId; // Use optional chaining

      if (!state.attributes || typeof state.attributes.today !== 'object' || state.attributes.today === null) {
        // Handle cases where 'today' is missing, not an object, or null
        entityError = `Entity ${entityId} is missing 'today' attribute or it's not a valid object.`;
        console.warn(`EPGCard: ${entityError}`);
        newEpgData[channelName] = []; // Ensure channel exists even if data is bad
        return;
      }

      const programs = state.attributes.today;

      if (programs && typeof programs === 'object') {
        const sortedTimes = Object.keys(programs).sort((a, b) => this._convertTimeToMinutes(a) - this._convertTimeToMinutes(b));

        if (sortedTimes.length === 0) {
            newEpgData[channelName] = [];
            return;
        }

        newEpgData[channelName] = sortedTimes
          .map((start_time, index) => {
            const program = programs[start_time];
            if (!program || typeof program !== 'object') return null;

            const nextStartTime = index + 1 < sortedTimes.length ? sortedTimes[index + 1] : null;
            // Prioritize program.end, then next start time, finally 24:00
            const end_time = program.end || nextStartTime || "24:00";

            return {
              title: program.title || "No Title",
              desc: program.desc || "No Description",
              start: start_time,
              end: end_time,
            };
          }).filter(p => p !== null);
      } else {
          console.warn(`EPGCard: No valid 'today' program data found for ${entityId}`);
          newEpgData[channelName] = [];
      }
    });

    this._epgData = newEpgData;

    const errorDisplay = this.shadowRoot?.querySelector('.error-message'); // Check if shadowRoot exists
    if (errorDisplay) {
        errorDisplay.textContent = entityError || ''; // Show the last error or clear it
        errorDisplay.style.display = entityError ? 'block' : 'none';
    }
  }


   _renderBaseLayout() {
     if (!this.shadowRoot) return; // Should not happen, but safety first

     this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --epg-channel-width: 15%; /* Increase channel name width */
                    --epg-programs-width: 85%;
                    --epg-current-time-color: var(--primary-color, red);
                    --epg-search-highlight-bg: var(--primary-color, #0056b3);
                    --epg-search-highlight-text: var(--primary-text-color, white);
                    --epg-search-dim-opacity: 0.5;
                }
                .epg-card-container {
                   padding: 16px;
                   position: relative;
                   background-color: var(--card-background-color, white); /* Ensure background */
                }
                .epg-search-input {
                    width: calc(100% - 20px);
                    padding: 8px 10px;
                    margin-bottom: 15px;
                    border: 1px solid var(--divider-color, #ccc);
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                    background-color: var(--input-fill-color, var(--secondary-background-color)); /* Input background */
                    color: var(--input-ink-color, var(--primary-text-color)); /* Input text color */
                    border-color: var(--input-idle-line-color, var(--divider-color));
                }
                 .epg-search-input:focus {
                     border-color: var(--input-focused-line-color, var(--primary-color));
                     outline: none;
                 }
                .error-message {
                    color: var(--error-color, #db4437);
                    font-weight: bold;
                    margin-bottom: 10px;
                    display: none;
                }
                .epg-grid {
                    position: relative;
                    overflow-x: auto;
                    width: 100%;
                    border: 1px solid var(--divider-color, #ccc); /* Add border around grid */
                    border-radius: 4px;
                }
                .current-time-line {
                    position: absolute;
                    top: 35px; /* Adjust based on timeline height + border */
                    bottom: 0;
                    left: var(--epg-channel-width);
                    width: 2px;
                    background-color: var(--epg-current-time-color);
                    z-index: 3;
                    pointer-events: none;
                }
                .epg-card {
                    font-family: Arial, sans-serif;
                    width: 100%;
                    /* min-width needed for horizontal scrolling content */
                    min-width: fit-content; /* Or a large pixel value like 800px */
                }
                .timeline {
                    display: flex;
                    margin-bottom: 0; /* Remove margin */
                    padding-left: var(--epg-channel-width);
                    position: sticky;
                    top: 0;
                    background: var(--secondary-background-color, #f5f5f5); /* Diff background for timeline */
                    z-index: 10;
                    border-bottom: 1px solid var(--divider-color, #ccc);
                    height: 35px; /* Fixed height for timeline */
                    box-sizing: border-box;
                }
                .timeline div {
                    flex: 1 1 60px; /* Allow shrinking, basis 60px */
                    text-align: center;
                    font-weight: bold;
                    border-right: 1px solid var(--divider-color, #ccc);
                    padding: 5px 0;
                    min-width: 60px; /* Minimum width per hour slot */
                    white-space: nowrap;
                    color: var(--secondary-text-color, #727272);
                    display: flex; /* Center text vertically */
                    align-items: center;
                    justify-content: center;
                }
                 .timeline div:last-child { border-right: none; }
                 .epg-content {
                     /* Container for channel rows */
                 }
                .channel-row {
                    height: auto; /* Let height be determined by content */
                    min-height: ${this._getRowHeight() + 10}px;
                    display: flex;
                    align-items: stretch;
                    /* margin-bottom: 5px; Removed margin */
                    position: relative;
                    border-bottom: 1px solid var(--divider-color, #eee); /* Lighter border between rows */
                }
                 .channel-row:last-child {
                     border-bottom: none; /* No border on the last row */
                 }
                .channel-name {
                    width: var(--epg-channel-width);
                    font-weight: bold;
                    text-align: right;
                    padding: 5px 10px 5px 5px;
                    overflow: hidden;
                    position: sticky;
                    left: 0;
                    background: var(--card-background-color, white);
                    z-index: 5;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: flex-end;
                    border-right: 1px solid var(--divider-color, #ccc);
                    box-sizing: border-box;
                    color: var(--primary-text-color);
                }
                .channel-name-text {
                    width: 100%;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                    margin-bottom: 4px;
                }
                .channel-current-program {
                    font-size: 0.8em;
                    font-weight: normal;
                    color: var(--secondary-text-color, grey);
                    width: 100%;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                    margin-top: auto;
                }
                .programs {
                    display: flex; /* Not strictly needed with absolute positioning but keep for structure */
                    width: var(--epg-programs-width);
                    position: relative; /* Crucial for absolute positioned items */
                    height: auto;
                    min-height: ${this._getRowHeight()}px;
                }
                .program {
                    position: absolute;
                    min-height: ${this._getRowHeight()}px;
                    height: 100%;
                    background-color: var(--secondary-background-color, #e0e0e0); /* Lighter default bg */
                    border: 1px solid var(--divider-color, #ccc);
                    color: var(--primary-text-color); /* Default text color */
                    border-radius: 4px;
                    padding: 5px 8px; /* Adjust padding */
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    justify-content: flex-start;
                    overflow: hidden;
                    cursor: pointer;
                    font-size: 13px;
                    box-sizing: border-box;
                    box-shadow: 1px 1px 3px rgba(0,0,0,0.1);
                    transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease, transform 0.1s ease;
                }
                .program:hover {
                    border-color: var(--primary-color, #0056b3);
                    background-color: var(--paper-grey-300, #bdbdbd); /* Slightly darker hover */
                    z-index: 4;
                    transform: scale(1.01); /* Slight scale on hover */
                }
                .program.search-match {
                    background-color: var(--epg-search-highlight-bg);
                    border-color: var(--epg-search-highlight-bg);
                    color: var(--epg-search-highlight-text);
                    z-index: 2;
                }
                 .program.search-match:hover {
                     filter: brightness(1.1);
                     transform: scale(1.01); /* Keep scale on hover */
                 }
                .epg-card-container.is-searching .program:not(.search-match) {
                    opacity: var(--epg-search-dim-opacity);
                }

                .program-title {
                    font-weight: bold;
                    margin-bottom: 3px;
                    width: 100%;
                    white-space: normal;
                    overflow-wrap: break-word;
                    line-height: 1.3; /* Adjust line height */
                    max-height: calc(100% - 25px); /* Limit height to leave space for time */
                    overflow: hidden; /* Hide overflow for title area */
                }
                .program-time {
                    font-size: 11px;
                    opacity: 0.8;
                    width: 100%;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-top: auto;
                    padding-top: 4px;
                    color: var(--secondary-text-color); /* Ensure time color matches */
                }
                .program-tooltip {
                    display: none;
                    position: fixed;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 1000;
                    max-width: 300px;
                    word-wrap: break-word;
                    line-height: 1.5;
                    white-space: normal;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                    pointer-events: none;
                }
                 .program:hover .program-tooltip { display: block; }
                 .no-results {
                    text-align: center;
                    padding: 20px;
                    color: var(--secondary-text-color, grey);
                    display: none;
                 }
            </style>
            <div class="epg-card-container">
                <input type="search" class="epg-search-input" placeholder="Search programs (will highlight matches)..." />
                <div class="error-message"></div>
                <div class="epg-grid">
                    <div class="epg-card">
                        <div class="timeline"></div>
                        <div class="epg-content">
                            <!-- Channel rows will be rendered here -->
                        </div>
                         <div class="no-results"></div> <!-- Kept for potential error messages -->
                    </div>
                    <div class="current-time-line"></div>
                </div>
            </div>
        `;

        // Add event listener for search input
        const searchInput = this.shadowRoot.querySelector('.epg-search-input');
        if (searchInput) {
            // Good practice: Remove previous listener if this function runs again
            if (searchInput._inputListener) {
                searchInput.removeEventListener('input', searchInput._inputListener);
            }

            // Define the listener function
            const listener = (e) => {
                const value = e.target.value; // Get value immediately
                this._debouncedProcessSearch(value); // Call debounced function with the VALUE
            };

            // Add the listener
            searchInput.addEventListener('input', listener);
            // Store reference for potential removal later
            searchInput._inputListener = listener;
        } else {
            console.error("EPG Card: Could not find search input element.");
        }
   }

   // Function called by the debounced wrapper
   _processSearchValue(value) {
        // console.log("Debounced _processSearchValue called with value:", value); // Debugging
        const searchValue = value || ''; // Ensure it's a string
        this._searchTerm = searchValue.toLowerCase();

        // Add/remove class to container for dimming effect
        const container = this.shadowRoot?.querySelector('.epg-card-container');
        if (container) {
            if (this._searchTerm) {
                container.classList.add('is-searching');
            } else {
                container.classList.remove('is-searching');
            }
        } else {
            console.error("EPG Card: Could not find .epg-card-container");
        }
        this._renderEPG(); // Re-render with highlight changes
   }

  _renderEPG() {
    if (!this._hass || !this._config || !this.shadowRoot) return;

    const timelineElement = this.shadowRoot.querySelector('.timeline');
    const contentElement = this.shadowRoot.querySelector('.epg-content');
    const currentTimeLine = this.shadowRoot.querySelector('.current-time-line');

    if (!timelineElement || !contentElement || !currentTimeLine) {
        console.error("EPG Card: Core EPG elements not found in shadow DOM.");
        return;
    }

    const channels = Object.keys(this._epgData || {}).sort(); // Use default {} and sort
    const nowMinutes = this._getTimelineStartMinutes();

    // Generate timeline labels for "now" to midnight
    const timelineHours = this._generateTimeline();
    const totalTimelineMinutes = this._getTotalTimelineMinutes();

    timelineElement.innerHTML = timelineHours
      .map((time) => `<div>${time}</div>`)
      .join("");

    // Render channels and programs - NO filtering, just highlighting
    contentElement.innerHTML = channels
      .map(
        (channel) => {
          const programsForChannel = this._epgData[channel] || [];

          // Find the currently playing program
          let currentProgramTitle = '';
          for (const prog of programsForChannel) {
              if(!prog || !prog.start || !prog.end) continue; // Skip invalid program entries

              const startMins = this._convertTimeToMinutes(prog.start);
              let endMins = this._convertTimeToMinutes(prog.end);

              // Handle '24:00' / '00:00' as midnight (1440 mins)
              if (endMins === 0 || prog.end === "24:00") {
                   endMins = 24 * 60;
              }

              // Determine if the program actually crosses midnight relative to its start
              // (e.g. 23:00 start, 01:00 end -> endMins < startMins before adding 24*60)
              const crossesMidnight = endMins < startMins;

              // Check if 'now' falls within the program's time range
              let isCurrent = false;
              if (crossesMidnight) {
                    // If crosses midnight, it's current if now >= start OR now < original end time (which is < start time)
                    if (nowMinutes >= startMins || nowMinutes < this._convertTimeToMinutes(prog.end)) {
                         isCurrent = true;
                    }
                } else {
                  // Normal case: current if now >= start and now < end
                  if (nowMinutes >= startMins && nowMinutes < endMins) {
                      isCurrent = true;
                  }
              }

              if (isCurrent) {
                 currentProgramTitle = prog.title;
                 break; // Found the current program, no need to check further
              }
          }

          return `
            <div class="channel-row">
                <div class="channel-name">
                    <div class="channel-name-text" title="${channel}">${channel}</div>
                     ${currentProgramTitle ? `<div class="channel-current-program" title="${currentProgramTitle}">${currentProgramTitle}</div>` : ''}
                </div>
                <div class="programs">
                    ${programsForChannel
                      .map(
                        (program) => {
                          if(!program || !program.start || !program.end) return ''; // Skip invalid program entries

                          const left = this._calculatePosition(program.start, totalTimelineMinutes);
                          const width = this._calculateWidth(program.start, program.end, totalTimelineMinutes);

                          if (width <= 0) {
                              return ''; // Don't render programs outside the timeline view
                          }

                          // Check for search match
                          const isMatch = this._searchTerm && (
                              (program.title && program.title.toLowerCase().includes(this._searchTerm)) ||
                              (program.desc && program.desc.toLowerCase().includes(this._searchTerm))
                          );
                          const matchClass = isMatch ? 'search-match' : '';

                          return `
                            <div class="program ${matchClass}"
                                style="left: ${left}%;
                                      width: ${width}%;"
                                title=""> <!-- Tooltip provides full info -->
                                <div class="program-title">${program.title}</div>
                                <div class="program-time">${program.start}-${program.end}</div>
                                <span class="program-tooltip">
                                  <div><b>${program.title}</b></div>
                                  <div style="margin-top: 5px;">${program.desc || 'No description'}</div>
                                  <div style="margin-top: 5px; opacity: 0.8;">${program.start} - ${program.end}</div>
                                </span>
                            </div>
                          `;
                        }
                      )
                      .join("")}
                </div>
            </div>`;
      })
      .join("");

    // Show/hide current time line
    currentTimeLine.style.display = nowMinutes < (24 * 60) ? 'block' : 'none';

    this._setupTooltipPositioning();
  }

  // Tooltip positioning logic
   _setupTooltipPositioning() {
    if (!this.shadowRoot) return;
    const programs = this.shadowRoot.querySelectorAll('.program');

    programs.forEach(program => {
      const tooltip = program.querySelector('.program-tooltip');
      if (!tooltip) return;
      const PADDING = 15;

      const onMouseMove = (e) => {
          let x = e.clientX + PADDING;
          let y = e.clientY + PADDING;
          const vpWidth = window.innerWidth;
          const vpHeight = window.innerHeight;

          // Estimate tooltip size (more reliable than measuring hidden element)
          const estWidth = Math.min(300, vpWidth - 2 * PADDING); // Use max-width
          // Height estimation is trickier, depends on content
          // Let's check position based on estimated width first
          if (x + estWidth > vpWidth - PADDING) {
             x = e.clientX - estWidth - PADDING; // Position left
          }

          // Basic check for bottom boundary (less critical as it usually scrolls)
          // A better approach might involve checking if tooltip content makes it too tall
          // const estHeight = tooltip.scrollHeight; // This only works if visible
          // if (y + estHeight > vpHeight - PADDING) {
          //   y = e.clientY - estHeight - PADDING; // Position above
          // }

          // Ensure it doesn't go off the top/left
          if (x < PADDING) x = PADDING;
          if (y < PADDING) y = PADDING;


          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
       };

        // Remove previous listener if any to avoid duplicates
        if (program._mouseMoveHandler) {
            program.removeEventListener('mousemove', program._mouseMoveHandler);
        }
        program._mouseMoveHandler = onMouseMove; // Store handler reference
        program.addEventListener('mousemove', onMouseMove);

        // Ensure tooltip appears on hover even without mouse move
        if (!program._mouseEnterHandler) {
            program._mouseEnterHandler = () => { tooltip.style.display = 'block'; };
            program.addEventListener('mouseenter', program._mouseEnterHandler);
        }
        if (!program._mouseLeaveHandler) {
             program._mouseLeaveHandler = () => { tooltip.style.display = 'none'; };
             program.addEventListener('mouseleave', program._mouseLeaveHandler);
        }
    });
  }

  // --- Timeline/Time Calculation Functions ---

  _getTimelineStartMinutes() {
      const currentTime = new Date();
      return currentTime.getHours() * 60 + currentTime.getMinutes();
  }

  _getTotalTimelineMinutes() {
      const nowMinutes = this._getTimelineStartMinutes();
      const midnightMinutes = 24 * 60;
      return Math.max(1, midnightMinutes - nowMinutes);
  }

  _generateTimeline() {
    const currentTime = new Date();
    const startHour = currentTime.getHours();
    const timeline = [];
    for (let i = startHour; i < 24; i++) {
        const displayHour = i.toString().padStart(2, "0");
        timeline.push(`${displayHour}:00`);
    }
    // Always include the end marker, even if current time is exactly 23:xx
    if (startHour < 24) {
        timeline.push("24:00");
    } else {
        // If current time is exactly 24:00 (unlikely), just show that
        timeline.push("24:00");
    }
    return timeline;
  }


  _calculatePosition(start, totalTimelineMinutes) {
    const timelineStartMinutes = this._getTimelineStartMinutes();
    const programStartMinutes = this._convertTimeToMinutes(start);

    if (programStartMinutes < timelineStartMinutes) {
        return 0; // Program started before the current view window
    }
    const offsetMinutes = programStartMinutes - timelineStartMinutes;
    if (totalTimelineMinutes <= 0) return 0; // Avoid division by zero
    const position = (offsetMinutes / totalTimelineMinutes) * 100;
    return Math.max(0, Math.min(100, position)); // Clamp between 0 and 100
  }

  _calculateWidth(start, end, totalTimelineMinutes) {
    const timelineStartMinutes = this._getTimelineStartMinutes();
    const midnightMinutes = 24 * 60;

    let programStartMinutes = this._convertTimeToMinutes(start);
    let programEndMinutes = this._convertTimeToMinutes(end);

     // Treat '24:00' / '00:00' as midnight (1440)
     if (programEndMinutes === 0 || end === "24:00") {
         programEndMinutes = 24 * 60;
     }
     // Handle programs that genuinely cross midnight (e.g., 23:00 to 01:00)
     // If end minutes < start minutes (after handling 00:00 as 1440), it crosses.
     if (programEndMinutes < programStartMinutes) {
         // This case should technically not happen if 00:00/24:00 are handled correctly as 1440
         // But if it does, it means the end time was like 01:00 etc.
         // We only care about the duration until midnight for *this* view.
         programEndMinutes = 24*60; // Clamp duration end to midnight for width calculation
     }

    // Determine the visible portion within the timeline window [now, midnight]
    const effectiveStartMinutes = Math.max(timelineStartMinutes, programStartMinutes);
    const effectiveEndMinutes = Math.min(midnightMinutes, programEndMinutes);

    let visibleDurationMinutes = effectiveEndMinutes - effectiveStartMinutes;
    visibleDurationMinutes = Math.max(0, visibleDurationMinutes); // Ensure non-negative

    if (totalTimelineMinutes <= 0) return 0; // Avoid division by zero
    const width = (visibleDurationMinutes / totalTimelineMinutes) * 100;
    return Math.max(0, width); // Ensure width is not negative
  }

  // --- Utility Functions ---

  _convertTimeToMinutes(time) {
     if (typeof time !== 'string' || !time.includes(':')) {
        // console.warn(`EPGCard: Invalid time format: ${time}. Returning 0.`);
        return 0;
     }
    const parts = time.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
     if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
         // console.warn(`EPGCard: Invalid time parse: ${time}. Returning 0.`);
         return 0;
     }
     if (hours === 24 && minutes === 0) {
         return 24 * 60;
     }
     if (hours === 24 && minutes !== 0) {
          // console.warn(`EPGCard: Invalid time format 24:${minutes}. Returning 0.`);
          return 0;
     }
    return hours * 60 + minutes;
  }

  _getRowHeight() {
      // Default to 100 if config or row_height is missing or invalid
      const height = Number(this._config?.row_height);
      return !isNaN(height) && height >= 50 ? height : 100;
  }


  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || config.entities.length === 0) {
      // Allow empty entities array during setup, but throw if confirmed/saved?
      // For now, just warn. Let hass handle editor validation?
      console.warn("EPG Card: Initial config requires at least one entity.");
      // throw new Error("You need to define at least one entity.");
    }
    // Ensure row_height is a number, default to 100
    const rowHeight = Number(config.row_height);
    this._config = {
        ...config,
        row_height: !isNaN(rowHeight) && rowHeight >= 50 ? rowHeight : 100
    };

    // Re-render if hass is already available
    if (this._hass) {
        this._fetchAndPrepareData();
        // Re-render base layout if row height changed substantially? Or just let CSS handle it.
        // Let's assume CSS handles row height changes in _renderBaseLayout/styles
        this._renderEPG();
    }
  }

  getCardSize() {
     const numEntities = this._config?.entities?.length || 1;
     const heightFactor = Math.max(1, Math.ceil(this._getRowHeight() / 75));
     return Math.max(3, Math.ceil(numEntities * heightFactor) + 1); // +1 for search/header
  }
}

customElements.define("epg-card", EPGCard);

// --- Editor Class ---
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
      .warning {
          background-color: var(--warning-color, #ff9800);
          color: white; /* Or use var(--text-primary-color) based on theme */
          padding: 8px 12px;
          border-radius: 4px;
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.4;
      }
      ha-form {
          /* Add some spacing between form elements */
          --mdc-layout-grid-gap-size: 16px; /* Adjust as needed */
      }
    `;
  }

  setConfig(config) {
    // Ensure entities is an array when setting config for the editor
    this.config = { entities: [], row_height: 100, ...config };
     // Ensure row_height is a number for the form
     this.config.row_height = Number(this.config.row_height) || 100;
  }

  _valueChanged(ev) {
    if (!this.config || !this.hass) {
      return;
    }
    const newConfigValue = ev.detail.value;

    // Ensure entities is always an array
    const entities = Array.isArray(newConfigValue.entities) ? newConfigValue.entities : [];
    // Ensure row_height is a number
    const rowHeight = Number(newConfigValue.row_height);

    this.config = {
      ...this.config, // Keep existing properties
      ...newConfigValue, // Overwrite with new values from form
      entities: entities,
      row_height: !isNaN(rowHeight) && rowHeight >= 50 ? rowHeight : 100
    };

    // Fire event to let Lovelace know the config changed
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this.config } })
    );
  }

  render() {
    if (!this.hass) {
      return html``; // Don't render form if hass is not available
    }

    // Check if integration filter works - provide a hint if needed
    // This is heuristic and might not be perfect
    let entitiesPossiblyAvailable = false;
    if (this.hass.states) {
       entitiesPossiblyAvailable = Object.values(this.hass.states).some(
           state => state.entity_id.startsWith('sensor.') && state.attributes?.integration === 'epg'
       );
    }

    // Ensure data passed to ha-form has valid defaults if config is incomplete
    const formData = {
        row_height: 100,
        entities: [],
        ...this.config, // Load current config
        row_height: Number(this.config?.row_height) || 100, // Ensure number for form
        entities: Array.isArray(this.config?.entities) ? this.config.entities : [] // Ensure array for form
    };


    return html`
      <ha-form
        .hass=${this.hass}
        .data=${formData}
        .schema=${[
          {
            name: "row_height",
            label: "Row Height",
            selector: {
              number: { min: 50, max: 300, step: 10, unit_of_measurement: "px", mode: "slider" },
            },
          },
          {
            name: "entities",
            label: "EPG Sensor Entities",
            required: true, // Mark as required in UI
            selector: {
              // Attempt to filter for 'epg' integration sensors
              entity: { domain: "sensor", multiple: true, integration: "epg" },
            },
          },
        ]}
        @value-changed=${this._valueChanged}
        compute-label=${(schema) => schema.label || schema.name}
      ></ha-form>
      ${!entitiesPossiblyAvailable && this.hass.states /* Only show warning if hass is loaded */
        ? html`<div class="warning">Warning: Could not find sensors with the 'epg' integration attribute. Ensure the integration is set up correctly. The entity selector might show all sensors if filtering by integration fails.</div>`
        : ''}
    `;
  }
}
customElements.define("epg-card-editor", EPGCardEditor);

// --- Card Registration ---
window.customCards = window.customCards || [];
window.customCards.push({
  type: "epg-card",
  name: "EPG Card",
  preview: false, // Optional - true to enable preview in editor
  description: "Displays an Electronic Program Guide (EPG) from sensor entities.",
  documentationURL: "https://github.com/yohaybn/lovelace-epg-card", // Replace with your repo URL
});

// --- END OF FILE epg-card.js ---
