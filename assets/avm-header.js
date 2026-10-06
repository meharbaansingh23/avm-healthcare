/*
 * AVM header: mobile menu toggle, plus the optional quote icon.
 * The quote icon uses the quote system's public API (window.quoteSystem) and
 * mirrors its count from #quote-float-count, which quote-system.js keeps
 * up to date even while the floating tab is hidden. Nothing in the quote
 * system itself is changed.
 */
if (!customElements.get('avm-header')) {
  customElements.define(
    'avm-header',
    class AvmHeader extends HTMLElement {
      connectedCallback() {
        this.toggle = this.querySelector('[data-avm-menu-toggle]');
        this.panel = this.querySelector('.avm-header__mobile');

        this.toggle?.addEventListener('click', () => this.setOpen(this.toggle.getAttribute('aria-expanded') !== 'true'));
        this.panel?.addEventListener('click', (event) => {
          if (event.target.closest('a')) this.setOpen(false);
        });

        this.querySelectorAll('[data-avm-quote-open]').forEach((button) => {
          button.addEventListener('click', () => window.quoteSystem?.openModal());
        });

        this.syncQuoteCount();
      }

      disconnectedCallback() {
        this.countObserver?.disconnect();
      }

      setOpen(open) {
        this.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.panel.hidden = !open;
      }

      syncQuoteCount() {
        const badges = this.querySelectorAll('[data-avm-quote-count]');
        const source = document.getElementById('quote-float-count');
        if (!badges.length || !source) return;

        const update = () => {
          const count = parseInt(source.textContent, 10) || 0;
          badges.forEach((badge) => {
            badge.textContent = count;
            badge.hidden = count === 0;
          });
        };

        update();
        this.countObserver = new MutationObserver(update);
        this.countObserver.observe(source, { childList: true, characterData: true, subtree: true });
      }
    }
  );
}
