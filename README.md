

# Lovelace EPG Card

This is a custom Lovelace card for Home Assistant that displays Electronic Program Guide (EPG) data. It is designed to work in conjunction with the custom Home Assistant integration available at [https://github.com/yohaybn/HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG).  **You must install this integration for the card to function correctly.** The card fetches program information from the sensors provided by this integration and presents it in a user-friendly timeline format.

## Features

* Displays EPG data for multiple channels, with channel icons and names.
* Dynamic timeline starting from the current time, with hour ticks.
* Highlights the program airing right now on each channel, with a progress bar.
* Tooltips on program entries showing title, description, and start/end times (hover or keyboard focus).
* Follows your Home Assistant theme automatically, including dark mode.
* Full RTL support for right-to-left languages such as Hebrew and Arabic.
* Loading skeleton, empty-channel, unavailable-channel and error states.
* Responsive: horizontal scrolling with sticky channel names on narrow screens.
* Accessible: keyboard-focusable programs with aria labels, and reduced-motion support.
* Easy configuration through the Lovelace UI editor.
![screenshot](/images/screenshot.png)
## Installation

1. **Manual Installation:**
   - Copy the `epg-card.js` file to your `/config/www/` directory (or any other directory served by your Home Assistant frontend).
   - Add the following to your `configuration.yaml` file (adjust the path if necessary):

     ```yaml
     lovelace:
       resources:
         - url: /local/epg-card.js?v=1.0.0 # Add a version number to the URL for cache busting
           type: module
     ```

2. **HACS Installation (Recommended):**
   - Add the following repository to HACS as a custom repository: `https://github.com/yohaybn/lovelace-epg-card`
   - Search for "Lovelace EPG Card" in HACS and install it.  HACS will handle the resource inclusion automatically.

## Configuration

You can configure the card through the Lovelace UI editor.  Just add the card to your dashboard and click "Edit".

The following options are available:

* **`entities` (Required):** A list of entity IDs representing your EPG sensors.  These sensors are created and managed by the [HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG) integration.
* **`title` (Optional):** A title shown at the top of the card.
* **`row_height` (Optional):** The height of each program row in pixels. Defaults to 72px.
* **`hour_width` (Optional):** The minimum width in pixels allocated to one hour on the timeline. Increase it to spread programs out on wide screens. Defaults to 110px.

## Example Card Configuration

```yaml
type: custom:epg-card
entities:
  - sensor.epg_channel_1
  - sensor.epg_channel_2
row_height: 120

```


## Styling

The card follows your active Home Assistant theme, including dark mode, so no extra styling is required. If you want to customize it further, it exposes a few CSS custom properties you can override with [card-mod](https://github.com/thomasloven/lovelace-card-mod):

* `--epg-channel-width` - width of the channel name column (default 120px, 76px on mobile).
* `--epg-program-border-radius` - corner radius of program blocks (default 10px).
* `--epg-program-background` - background of upcoming programs.
* `--epg-current-background` - background of the program airing now.
* `--epg-current-color` - text color of the program airing now.

## Development

The card is a single dependency-free JavaScript file (`dist/epg-card.js`). The `tests/` directory contains a small harness that renders the card outside Home Assistant with mock data and verifies the markup:

```bash
tests/run.sh   # requires google-chrome
```

It writes screenshots for desktop, mobile, dark mode, RTL and the loading/empty/error states into `tests/screenshots/`, and runs DOM assertions for the key behaviors.



## Troubleshooting

-   **"Error: No entities configured"**: Make sure you have configured at least one entity in the card configuration.
-   **"Error: Entity [entity_id] not found"**: Double-check that the entity ID is correct and that the entity exists in your Home Assistant instance. Ensure the [HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG) integration is correctly configured and working.
-   **EPG Data not showing**: Verify the [HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG) integration is providing data to the sensors. Check the Developer Tools -> States menu in Home Assistant to inspect the sensor data.



## Contributing

Contributions are welcome! Please submit pull requests for bug fixes, new features, or improvements, especially for styling enhancements!


### Donate
[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/yohaybn)

If you find it helpful or interesting, consider supporting me by buying me a coffee or starring the project on GitHub! ☕⭐
Your support helps me improve and maintain this project while keeping me motivated. Thank you! ❤️
