// Builds a mock `hass` object with programs anchored to the current clock.
(function () {
  function hhmm(totalMinutes) {
    const m = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  function makePrograms(specs) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = {};
    let cursor = nowMin - 45;
    for (const spec of specs) {
      const start = hhmm(cursor);
      today[start] = {
        title: spec.title,
        desc: spec.desc || "",
        sub_title: spec.sub || "",
        start,
        end: hhmm(cursor + spec.dur),
      };
      cursor += spec.dur;
    }
    return today;
  }
  function sensor(entityId, name, icon, programs, state) {
    return {
      entity_id: entityId,
      state: state || (programs.length ? "ok" : "ok"),
      attributes: {
        friendly_name: name,
        channel_display_name: name,
        channel_icon: icon,
        today: makePrograms(programs),
      },
    };
  }
  const longDesc =
    "A long-form documentary exploring the coastline, its wildlife and the people who live there. ".repeat(2);
  window.mockHass = function (variant) {
    if (variant === "rtl") {
      return {
        states: {
          "sensor.epg_kan11": sensor("sensor.epg_kan11", "כאן 11", null, [
            { title: "חדשות הערב", dur: 90, desc: "מהדורת חדשות מרכזית", sub: "מהדורה מורחבת" },
            { title: "תחקיר לילה", dur: 75, desc: longDesc },
            { title: "סרט דוקומנטרי קצרצר מאוד מאוד ארוך שם תוכנית", dur: 120 },
            { title: "לילה טוב", dur: 240 },
          ]),
          "sensor.epg_reshet13": sensor("sensor.epg_reshet13", "רשת 13", null, [
            { title: "אח גדול", dur: 105, desc: "ריאליטי" },
            { title: "המועדון", dur: 90 },
            { title: "ספורט יומי", dur: 60 },
            { title: "מהדורה מרכזית", dur: 150 },
          ]),
        },
      };
    }
    return {
      states: {
        "sensor.epg_bbc_one": sensor("sensor.epg_bbc_one", "BBC One", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/BBC_One_logo_2021.svg/320px-BBC_One_logo_2021.svg.png", [
          { title: "Morning Live", dur: 75, desc: "Magazine show with guests." },
          { title: "Coastlines", dur: 90, desc: longDesc, sub: "Episode 4" },
          { title: "Afternoon News", dur: 30, desc: "National and international news." },
          { title: "The Great Quiz", dur: 60, desc: "Quiz show." },
          { title: "Evening Drama Premiere With A Very Long Title That Wraps", dur: 120, desc: "New series." },
          { title: "Late Film", dur: 150 },
        ]),
        "sensor.epg_arte": sensor("sensor.epg_arte", "Arte", null, [
          { title: "Journal", dur: 45 },
          { title: "Tracks", dur: 60, desc: "Music and pop culture." },
          { title: "Documentary: Deep Sea", dur: 105, desc: longDesc },
          { title: "Cinema Night", dur: 200 },
        ]),
        "sensor.epg_empty": sensor("sensor.epg_empty", "Empty Channel", null, []),
        "sensor.epg_down": {
          entity_id: "sensor.epg_down",
          state: "unavailable",
          attributes: { friendly_name: "Offline Channel", today: {} },
        },
      },
    };
  };
})();
