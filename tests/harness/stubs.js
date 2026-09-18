// Minimal stubs so the card can boot outside Home Assistant.
(function () {
  class FakeLitElement extends HTMLElement {}
  FakeLitElement.prototype.html = (strings, ...values) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
  FakeLitElement.prototype.css = FakeLitElement.prototype.html;
  if (!customElements.get("ha-panel-lovelace")) {
    customElements.define("ha-panel-lovelace", class extends FakeLitElement {});
  }
  if (!customElements.get("ha-card")) {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          const root = this.attachShadow({ mode: "open" });
          root.innerHTML = `<style>
            :host { display:block; background: var(--card-background-color,#fff);
              border-radius: var(--ha-card-border-radius,12px);
              box-shadow: 0 2px 6px rgba(0,0,0,.15); overflow:hidden;
              border: 1px solid var(--ha-card-border-color, transparent); }
          </style><slot></slot>`;
        }
      }
    );
  }
  if (!customElements.get("ha-icon")) {
    customElements.define(
      "ha-icon",
      class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          const root = this.attachShadow({ mode: "open" });
          root.innerHTML = `<style>:host{display:inline-flex;width:var(--mdc-icon-size,24px);
            height:var(--mdc-icon-size,24px)}svg{width:100%;height:100%;fill:currentColor}</style>
            <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/></svg>`;
        }
      }
    );
  }
})();
