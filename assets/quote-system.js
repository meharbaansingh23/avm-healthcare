/**
 * AVM Healthcare — Quote Request System
 * Intercepts "Add to Quote" form submissions, manages a localStorage cart,
 * renders a modal with product list + contact form, and submits to Shopify /contact.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'avm_quote_items';

  var quoteSystem = {
    items: [],

    /* ── Bootstrap ──────────────────────────────────────── */
    init: function () {
      this.load();
      this.updateFloatBtn();
      this.bindFormIntercept();
      this.bindStaticEvents();
    },

    /* ── Persistence ────────────────────────────────────── */
    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        this.items = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(this.items)) this.items = [];
      } catch (_) {
        this.items = [];
      }
    },

    save: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
      } catch (_) {}
    },

    /* ── Item CRUD ──────────────────────────────────────── */
    addItem: function (item) {
      /* Deduplicate by variantId, falling back to title */
      var key = item.variantId || item.title;
      var existing = null;
      for (var i = 0; i < this.items.length; i++) {
        if ((this.items[i].variantId || this.items[i].title) === key) {
          existing = this.items[i];
          break;
        }
      }

      if (existing) {
        existing.quantity += 1;
      } else {
        this.items.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          variantId: item.variantId || '',
          title: item.title || 'Product',
          image: item.image || '',
          url: item.url || '',
          quantity: 1
        });
      }

      this.save();
      this.updateFloatBtn(true);
      this.showToast('\u2713 Added to quote: ' + (item.title || 'Product').substring(0, 45));
    },

    removeItem: function (id) {
      this.items = this.items.filter(function (i) { return i.id !== id; });
      this.save();
      this.updateFloatBtn(false);
      this.renderItemsList();
    },

    updateQuantity: function (id, val) {
      var qty = parseInt(val, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i].id === id) {
          this.items[i].quantity = qty;
          break;
        }
      }
      this.save();
    },

    clearAll: function () {
      this.items = [];
      this.save();
      this.updateFloatBtn(false);
    },

    totalCount: function () {
      return this.items.reduce(function (sum, i) { return sum + i.quantity; }, 0);
    },

    /* ── Floating Button ────────────────────────────────── */
    updateFloatBtn: function (pulse) {
      var countEl = document.getElementById('quote-float-count');
      if (!countEl) return;
      countEl.textContent = this.totalCount();
      if (pulse) {
        countEl.classList.remove('pulse');
        /* Trigger reflow so animation replays */
        void countEl.offsetWidth;
        countEl.classList.add('pulse');
      }
    },

    /* ── Modal Open / Close ─────────────────────────────── */
    openModal: function () {
      var overlay = document.getElementById('quote-modal-overlay');
      if (!overlay) return;
      this.renderItemsList();
      this.resetFormState();
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      /* Focus the first input for accessibility */
      setTimeout(function () {
        var first = overlay.querySelector('input:not([disabled])');
        if (first) first.focus();
      }, 280);
    },

    closeModal: function () {
      var overlay = document.getElementById('quote-modal-overlay');
      if (!overlay) return;
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    },

    /* ── Render Items ───────────────────────────────────── */
    renderItemsList: function () {
      var listEl = document.getElementById('quote-items-list');
      var emptyEl = document.getElementById('quote-empty-state');
      if (!listEl) return;

      if (this.items.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';

      var self = this;
      listEl.innerHTML = this.items.map(function (item) {
        var img = item.image
          ? '<img class="quote-item-image" src="' + self.esc(item.image) + '" alt="' + self.esc(item.title) + '" loading="lazy">'
          : '<div class="quote-item-image-placeholder">&#128230;</div>';

        return (
          '<div class="quote-item" data-item-id="' + item.id + '">' +
            img +
            '<div class="quote-item-info">' +
              '<p class="quote-item-title" title="' + self.esc(item.title) + '">' + self.esc(item.title) + '</p>' +
              '<div class="quote-item-qty-row">' +
                '<span>Qty:</span>' +
                '<input type="number" min="1" value="' + item.quantity + '" data-item-id="' + item.id + '" class="quote-qty-input" aria-label="Quantity">' +
              '</div>' +
            '</div>' +
            '<button class="quote-item-remove" data-item-id="' + item.id + '" aria-label="Remove">&times;</button>' +
          '</div>'
        );
      }).join('');

      /* Bind events on freshly rendered nodes */
      listEl.querySelectorAll('.quote-item-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.removeItem(parseInt(btn.dataset.itemId, 10));
        });
      });

      listEl.querySelectorAll('.quote-qty-input').forEach(function (input) {
        input.addEventListener('change', function () {
          self.updateQuantity(parseInt(input.dataset.itemId, 10), input.value);
        });
      });
    },

    /* ── Static Event Bindings ──────────────────────────── */
    bindStaticEvents: function () {
      var self = this;

      /* Close on overlay click */
      var overlay = document.getElementById('quote-modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) self.closeModal();
        });
      }

      /* Close on Escape */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.closeModal();
      });

      /* Contact form submit */
      var form = document.getElementById('quote-contact-form');
      if (form) {
        form.addEventListener('submit', function (e) {
          self.submitQuote(e);
        });
      }
    },

    /* ── Intercept Shopify Add-to-Cart Forms ────────────── */
    bindFormIntercept: function () {
      var self = this;
      /*
       * Use capture phase (3rd arg = true) so our handler fires BEFORE
       * Shopify's product-form web component, which listens on the form element.
       * stopPropagation() prevents the event from propagating down to the form.
       */
      document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.getAttribute('data-type') !== 'add-to-cart-form') return;
        e.preventDefault();
        e.stopPropagation();
        var item = self.extractItem(form);
        if (item) self.addItem(item);
      }, true);
    },

    extractItem: function (form) {
      var variantInput = form.querySelector('[name="id"]') || form.querySelector('.product-variant-id');
      var variantId = variantInput ? variantInput.value : '';
      var title = '';
      var image = '';
      var url = window.location.pathname;

      /* ── Collection card context ── */
      var card = form.closest('.card-wrapper');
      if (card) {
        var cardLink = card.querySelector('.card__heading a, .card__heading--placeholder a');
        if (cardLink) {
          title = (cardLink.textContent || '').trim();
          url = cardLink.getAttribute('href') || url;
        }
        var cardImg = card.querySelector('.card__media img, img');
        if (cardImg) image = cardImg.currentSrc || cardImg.src || '';
      }

      /* ── Quick-add modal context ── */
      if (!title) {
        var qModal = form.closest('.quick-add-modal__content-info, .quick-add-modal');
        if (qModal) {
          var qTitle = qModal.querySelector('.product__title, h2, h3');
          if (qTitle) title = (qTitle.textContent || '').trim();
          var qImg = qModal.querySelector('.product__media img, img');
          if (qImg) image = qImg.currentSrc || qImg.src || '';
        }
      }

      /* ── Product page context ── */
      if (!title) {
        var h1 = document.querySelector('.product__title, h1.title, h1');
        if (h1) title = (h1.textContent || '').trim();
      }
      if (!image) {
        var mainImg = document.querySelector('.product__media img, .product-media-gallery img');
        if (mainImg) image = mainImg.currentSrc || mainImg.src || '';
      }

      title = title || 'Product';
      /* Strip Shopify size suffix for a clean URL, but keep query params */
      image = image.replace(/_(pico|icon|thumb|small|compact|medium|large|grande|original|master|[\d]+x[\d]*)(\.[a-z]+)/i, '$2');

      return { variantId: variantId, title: title, image: image, url: url };
    },

    /* ── Quote Form Submission ──────────────────────────── */
    submitQuote: function (e) {
      e.preventDefault();

      var self = this;
      var form = document.getElementById('quote-contact-form');
      var errorEl = document.getElementById('quote-form-error');
      var submitBtn = document.getElementById('quote-submit-btn');
      var submitText = document.getElementById('quote-submit-text');
      var submitLoader = document.getElementById('quote-submit-loading');

      /* Validate required fields */
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (this.items.length === 0) {
        errorEl.textContent = 'Please add at least one product to your quote before submitting.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';

      /* Gather form values */
      var data = new FormData(form);
      var name = data.get('contact[name]') || '';
      var email = data.get('contact[email]') || '';
      var phone = data.get('contact[phone]') || '';
      var company = data.get('contact[company]') || '';
      var dept = data.get('contact[department]') || '';
      var city = data.get('contact[city]') || '';
      var notes = data.get('contact[notes]') || '';

      /* Build email body */
      var productLines = this.items.map(function (item, idx) {
        return (idx + 1) + '. ' + item.title +
          '  |  Qty: ' + item.quantity +
          (item.url ? '  |  ' + window.location.origin + item.url : '');
      }).join('\n');

      var body = [
        'QUOTE REQUEST — AVM HEALTHCARE WEBSITE',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'PRODUCTS REQUESTED',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        productLines,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'CUSTOMER DETAILS',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Name            : ' + name,
        'Email           : ' + email,
        'Phone           : ' + phone,
        'Company/Hospital: ' + company,
        'Department      : ' + (dept || '—'),
        'City / Location : ' + city,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'SPECIAL INQUIRY / NOTES',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        notes || '—'
      ].join('\n');

      /* Disable submit while sending */
      submitBtn.disabled = true;
      if (submitText) submitText.style.display = 'none';
      if (submitLoader) submitLoader.style.display = 'inline';

      /* POST to Shopify /contact */
      var payload = new FormData();
      payload.append('form_type', 'contact');
      payload.append('utf8', '\u2713');
      payload.append('contact[name]', name);
      payload.append('contact[email]', email);
      payload.append('contact[body]', body);

      fetch('/contact', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: payload
      })
        .then(function (res) {
          if (res.ok) {
            self.showSuccess();
            self.clearAll();
          } else {
            throw new Error('server');
          }
        })
        .catch(function () {
          errorEl.textContent = 'Something went wrong. Please try again or contact us directly.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          if (submitText) submitText.style.display = 'inline';
          if (submitLoader) submitLoader.style.display = 'none';
        });
    },

    /* ── UI State Helpers ───────────────────────────────── */
    showSuccess: function () {
      var form = document.getElementById('quote-contact-form');
      var success = document.getElementById('quote-success');
      if (form) form.style.display = 'none';
      if (success) success.style.display = 'flex';
      this.renderItemsList();
    },

    resetAfterSuccess: function () {
      var form = document.getElementById('quote-contact-form');
      var success = document.getElementById('quote-success');
      if (form) {
        form.reset();
        form.style.display = 'block';
      }
      if (success) success.style.display = 'none';
      var errorEl = document.getElementById('quote-form-error');
      if (errorEl) errorEl.style.display = 'none';
      var submitBtn = document.getElementById('quote-submit-btn');
      var submitText = document.getElementById('quote-submit-text');
      var submitLoader = document.getElementById('quote-submit-loading');
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = 'inline';
      if (submitLoader) submitLoader.style.display = 'none';
      this.closeModal();
    },

    resetFormState: function () {
      var form = document.getElementById('quote-contact-form');
      var success = document.getElementById('quote-success');
      var errorEl = document.getElementById('quote-form-error');
      if (form) form.style.display = 'block';
      if (success) success.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
    },

    showToast: function (msg) {
      var toast = document.getElementById('quote-toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(this._toastTimer);
      var self = this;
      this._toastTimer = setTimeout(function () {
        toast.classList.remove('show');
      }, 2800);
    },

    /* ── Utility ────────────────────────────────────────── */
    esc: function (str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  /* ── Init on DOM ready ────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { quoteSystem.init(); });
  } else {
    quoteSystem.init();
  }

  /* Expose globally for inline onclick handlers in the snippet */
  window.quoteSystem = quoteSystem;
})();
