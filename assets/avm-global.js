/*
 * AVM global behaviours, loaded on every page:
 * - [data-avm-reveal]: fade-in-up once in view (FadeInWhenVisible.tsx);
 *   [data-avm-reveal="card"] uses the WhyCard timing (y 28, 0.5s, margin -15%)
 * - [data-avm-counter]: count-up once in view (AnimatedCounter.tsx)
 * Re-scans when the theme editor re-renders a section.
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasIO = 'IntersectionObserver' in window;

  if (hasIO) document.documentElement.classList.add('avm-reveal-ready');

  function makeRevealObserver(rootMargin) {
    if (!hasIO) return null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: rootMargin }
    );
    return observer;
  }

  // Default reveal (FadeInWhenVisible: margin -100px); "card" = WhyCard (margin -15%).
  var revealObserver = makeRevealObserver('-100px');
  var cardRevealObserver = makeRevealObserver('-15%');

  function formatCount(value, thousands) {
    return thousands ? value.toLocaleString() : String(value);
  }

  function runCounter(el) {
    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var thousands = el.hasAttribute('data-thousands');
    var duration = parseInt(el.getAttribute('data-duration'), 10) || 2000;

    if (reducedMotion.matches) {
      el.textContent = formatCount(target, thousands) + suffix;
      return;
    }

    var steps = 60;
    var step = 0;
    var timer = setInterval(function () {
      step++;
      var ease = 1 - Math.pow(1 - step / steps, 3); // ease-out cubic
      var value = step >= steps ? target : Math.floor(ease * target);
      el.textContent = formatCount(value, thousands) + suffix;
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
  }

  var counterObserver = hasIO
    ? new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            counterObserver.unobserve(entry.target);
            runCounter(entry.target);
          });
        },
        { threshold: 0.3 }
      )
    : null;

  function scan(root) {
    root.querySelectorAll('[data-avm-reveal]:not(.is-revealed)').forEach(function (el) {
      var observer = el.getAttribute('data-avm-reveal') === 'card' ? cardRevealObserver : revealObserver;
      if (observer) observer.observe(el);
    });

    root.querySelectorAll('[data-avm-counter]:not([data-avm-counter-ready])').forEach(function (el) {
      el.setAttribute('data-avm-counter-ready', '');
      if (!counterObserver) return;
      // Start from zero like the live site; the final value stays in the HTML without JS.
      el.textContent = '0' + (el.getAttribute('data-suffix') || '');
      counterObserver.observe(el);
    });
  }

  function init() {
    scan(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (event) {
    scan(event.target);
  });
})();
