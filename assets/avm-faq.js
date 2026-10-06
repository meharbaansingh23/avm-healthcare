/*
 * AVM FAQ accordion — mirrors AboutFaq.tsx: one item open at a time,
 * height + opacity animate over 0.3s easeOut.
 */
if (!customElements.get('avm-faq')) {
  customElements.define(
    'avm-faq',
    class AvmFaq extends HTMLElement {
      connectedCallback() {
        this.querySelectorAll('.avm-faq__question').forEach((button) => {
          button.addEventListener('click', () => {
            const open = button.getAttribute('aria-expanded') === 'true';
            this.querySelectorAll('.avm-faq__question[aria-expanded="true"]').forEach((other) => this.toggle(other, false));
            if (!open) this.toggle(button, true);
          });
        });
      }

      toggle(button, open) {
        const item = button.closest('.avm-faq__item');
        const panel = item.querySelector('.avm-faq__answer');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        item.classList.toggle('is-open', open);

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
          panel.hidden = !open;
          return;
        }

        if (open) {
          panel.hidden = false;
          const height = panel.scrollHeight;
          panel.animate(
            [
              { height: '0px', opacity: 0 },
              { height: `${height}px`, opacity: 1 },
            ],
            { duration: 300, easing: 'cubic-bezier(0, 0, 0.58, 1)' }
          );
        } else {
          const height = panel.scrollHeight;
          const animation = panel.animate(
            [
              { height: `${height}px`, opacity: 1 },
              { height: '0px', opacity: 0 },
            ],
            { duration: 300, easing: 'cubic-bezier(0, 0, 0.58, 1)' }
          );
          animation.onfinish = () => {
            if (button.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
          };
        }
      }
    }
  );
}
