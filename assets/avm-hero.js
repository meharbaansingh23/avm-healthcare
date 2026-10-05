/*
 * AVM hero slideshow — mirrors HeroSlideshow.tsx:
 * all slides stacked, only opacity changes (CSS 1.5s crossfade), 6s auto-rotate,
 * dot click jumps + resets the timer, hovering the dots pauses, no auto-rotate
 * under prefers-reduced-motion.
 */
if (!customElements.get('avm-hero-slideshow')) {
  customElements.define(
    'avm-hero-slideshow',
    class AvmHeroSlideshow extends HTMLElement {
      connectedCallback() {
        this.slides = Array.from(this.querySelectorAll('.avm-hero__slide'));
        this.dots = Array.from(this.querySelectorAll('.avm-hero__dot'));
        this.dotsWrap = this.querySelector('.avm-hero__dots');
        this.activeIndex = 0;
        this.interval = null;
        this.isHovering = false;
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        this.onMotionChange = () => this.start();
        this.onDotsEnter = () => {
          this.isHovering = true;
          this.stop();
        };
        this.onDotsLeave = () => {
          this.isHovering = false;
          this.start();
        };

        this.dots.forEach((dot, i) => {
          dot.addEventListener('click', () => {
            this.show(i);
            this.start();
          });
        });
        this.dotsWrap?.addEventListener('mouseenter', this.onDotsEnter);
        this.dotsWrap?.addEventListener('mouseleave', this.onDotsLeave);
        this.motionQuery.addEventListener('change', this.onMotionChange);

        this.start();
      }

      disconnectedCallback() {
        this.stop();
        this.motionQuery?.removeEventListener('change', this.onMotionChange);
      }

      show(index) {
        this.activeIndex = index;
        this.slides.forEach((slide, i) => {
          const active = i === index;
          slide.classList.toggle('is-active', active);
          slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        });
        this.dots.forEach((dot, i) => {
          dot.setAttribute('aria-current', i === index ? 'true' : 'false');
        });
      }

      stop() {
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
      }

      start() {
        this.stop();
        if (this.slides.length < 2 || this.motionQuery.matches || this.isHovering) return;
        this.interval = setInterval(() => {
          this.show((this.activeIndex + 1) % this.slides.length);
        }, 6000);
      }
    }
  );
}

/* Reveal-on-scroll wrapper — mirrors framer-motion whileInView (once, margin -100px). */
if (!customElements.get('avm-reveal')) {
  customElements.define(
    'avm-reveal',
    class AvmReveal extends HTMLElement {
      connectedCallback() {
        if (!('IntersectionObserver' in window)) {
          this.classList.add('is-visible');
          return;
        }
        this.observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              this.classList.add('is-visible');
              this.observer.disconnect();
            }
          },
          { rootMargin: '-100px' }
        );
        this.observer.observe(this);
      }

      disconnectedCallback() {
        this.observer?.disconnect();
      }
    }
  );
}
