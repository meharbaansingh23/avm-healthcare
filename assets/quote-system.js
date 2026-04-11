/**
 * AVM Healthcare — Quote Request System with Invisible hCaptcha
 * Pre-verifies users with invisible CAPTCHA to prevent challenge page redirects.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'avm_quote_items';
  var SUCCESS_FLAG = 'avm_quote_success';
  var HCAPTCHA_SITE_KEY = 'f06e6c50-85a8-45c8-87d0-21a2b65856fe';

  var quoteSystem = {
    items: [],
    hcaptchaWidgetId: null,
    isSubmitting: false,

    /* ── Bootstrap ──────────────────────────────────────── */
    init: function () {
      this.load();
      this.updateFloatBtn();
      this.bindFormIntercept();
      this.bindStaticEvents();
      this.checkSuccessState();
      this.initInvisibleCaptcha();
    },

    /* ── Initialize Invisible hCaptcha ───────────────────── */
    initInvisibleCaptcha: function () {
      var self = this;
      
      // Wait for hCaptcha API to load
      var checkHCaptcha = setInterval(function() {
        if (typeof hcaptcha !== 'undefined' && hcaptcha.render) {
          clearInterval(checkHCaptcha);
          
          try {
            // Render invisible hCaptcha
            self.hcaptchaWidgetId = hcaptcha.render('quote-captcha-container', {
              sitekey: HCAPTCHA_SITE_KEY,
              size: 'invisible',
              callback: function(token) {
                self.onCaptchaSuccess(token);
              },
              'error-callback': function() {
                self.onCaptchaError();
              }
            });
          } catch (e) {
            console.log('hCaptcha render skipped (Shopify may handle it):', e);
          }
        }
      }, 100);
      
      // Stop checking after 10 seconds
      setTimeout(function() {
        clearInterval(checkHCaptcha);
      }, 10000);
    },

    /* ── hCaptcha Callbacks ──────────────────────────────── */
    onCaptchaSuccess: function(token) {
      // Store token in hidden field
      var tokenField = document.getElementById('h-captcha-response');
      if (tokenField) tokenField.value = token;
      
      // Now submit the form
      var form = document.getElementById('quote-contact-form');
      if (form && this.isSubmitting) {
        this.isSubmitting = false;
        form.submit();
      }
    },

    onCaptchaError: function() {
      var errorEl = document.getElementById('quote-form-error');
      var submitBtn = document.getElementById('quote-submit-btn');
      var submitText = document.getElementById('quote-submit-text');
      var submitLoader = document.getElementById('quote-submit-loader');
      
      if (errorEl) {
        errorEl.textContent = 'Security verification failed. Please try again.';
        errorEl.style.display = 'block';
      }
      
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.style.display = 'inline';
      if (submitLoader) submitLoader.style.display = 'none';
      
      this.isSubmitting = false;
    },

    /* ── Check if we just returned from successful submission ── */
    checkSuccessState: function () {
      var params = new URLSearchParams(window.location.search);
      if (params.get('customer_posted') === 'true' || params.get('contact_posted') === 'true') {
        var successName = sessionStorage.getItem(SUCCESS_FLAG);
        if (successName) {
          sessionStorage.removeItem(SUCCESS_FLAG);
          this.clearAll();
          this.openModal();
          this.showSuccess(successName);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
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
      } catch (_) { }
    },

    /* ── Item CRUD ──────────────────────────────────────── */
    addItem: function (item) {
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
      this.showToast('✓ Added to quote: ' + (item.title || 'Product').substring(0, 45));
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
          : '<div class="quote-item-image-placeholder">📦</div>';

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

      var overlay = document.getElementById('quote-modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) self.closeModal();
        });
      }

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.closeModal();
      });

      var form = document.getElementById('quote-contact-form');
      if (form) {
        form.addEventListener('submit', function (e) {
          self.prepareSubmission(e);
        });
      }
    },

    /* ── Intercept Shopify Add-to-Cart Forms ────────────── */
    bindFormIntercept: function () {
      var self = this;
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

      if (!title) {
        var qModal = form.closest('.quick-add-modal__content-info, .quick-add-modal');
        if (qModal) {
          var qTitle = qModal.querySelector('.product__title, h2, h3');
          if (qTitle) title = (qTitle.textContent || '').trim();
          var qImg = qModal.querySelector('.product__media img, img');
          if (qImg) image = qImg.currentSrc || qImg.src || '';
        }
      }

      if (!title) {
        var h1 = document.querySelector('.product__title, h1.title, h1');
        if (h1) title = (h1.textContent || '').trim();
      }
      if (!image) {
        var mainImg = document.querySelector('.product__media img, .product-media-gallery img');
        if (mainImg) image = mainImg.currentSrc || mainImg.src || '';
      }

      title = title || 'Product';
      image = image.replace(/_(pico|icon|thumb|small|compact|medium|large|grande|original|master|[\d]+x[\d]*)(\.[a-z]+)/i, '$2');

      return { variantId: variantId, title: title, image: image, url: url };
    },

    /* ── Prepare Form for Submission ────────────────────── */
    prepareSubmission: function (e) {
      e.preventDefault();
      
      var form = document.getElementById('quote-contact-form');
      var errorEl = document.getElementById('quote-form-error');
      var submitBtn = document.getElementById('quote-submit-btn');
      var submitText = document.getElementById('quote-submit-text');
      var submitLoader = document.getElementById('quote-submit-loader');

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

      // Get form data
      var data = new FormData(form);
      var name = data.get('contact[name]') || '';
      var email = data.get('contact[email]') || '';
      var phone = data.get('contact[phone]') || '';
      var company = data.get('contact[company]') || '';
      var dept = data.get('contact[department]') || '';
      var city = data.get('contact[city]') || '';
      var notes = data.get('contact[notes]') || '';

      /* Build formatted email body */
      var productLines = this.items.map(function (item) {
        return '- ' + item.title + ' — Quantity: ' + item.quantity;
      }).join('\n');

      var divider = '================================================';

      var body = [
        divider,
        '🏥 NEW QUOTE REQUEST — AVM HEALTHCARE',
        divider,
        '',
        '📦 PRODUCTS REQUESTED:',
        productLines,
        '',
        '👤 CUSTOMER INFORMATION:',
        'Name          : ' + name,
        'Email         : ' + email,
        'Phone         : ' + phone,
        '',
        '🏢 ORGANISATION DETAILS:',
        'Company/Facility : ' + company,
        'Department       : ' + (dept || 'Not specified'),
        'City/Location    : ' + city,
        '',
        '📝 SPECIAL INQUIRY:',
        notes || 'None',
        '',
        divider,
        'Please respond within 24 hours.',
        'AVM Healthcare Quote System',
        divider
      ].join('\n');

      // Populate the hidden body field
      var bodyField = document.getElementById('quote-body-field');
      if (bodyField) bodyField.value = body;

      // Store name for success message after redirect
      sessionStorage.setItem(SUCCESS_FLAG, name);

      // Show loading state
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.style.display = 'none';
      if (submitLoader) submitLoader.style.display = 'inline';

      // Execute invisible hCaptcha
      this.isSubmitting = true;
      
      if (this.hcaptchaWidgetId !== null && typeof hcaptcha !== 'undefined') {
        try {
          hcaptcha.execute(this.hcaptchaWidgetId);
        } catch (e) {
          // If hCaptcha fails, submit anyway (Shopify will handle it)
          console.log('hCaptcha execute failed, submitting normally:', e);
          this.isSubmitting = false;
          form.submit();
        }
      } else {
        // No hCaptcha widget, submit normally
        this.isSubmitting = false;
        form.submit();
      }
    },

    /* ── UI State Helpers ───────────────────────────────── */
    showSuccess: function (name) {
      var form = document.getElementById('quote-contact-form');
      var success = document.getElementById('quote-success');
      var emptyState = document.getElementById('quote-empty-state');
      var productsList = document.getElementById('quote-items-list');
      
      if (form) form.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      if (productsList) productsList.innerHTML = '';
      
      if (success) {
        success.style.display = 'flex';
        var msg = success.querySelector('.quote-success-msg');
        if (msg && name) {
          msg.textContent = 'Thank you ' + name + '! Your quote request has been submitted successfully. Our team will contact you within 24 hours.';
        }
      }
      
      this.updateFloatBtn(false);
    },

    resetAfterSuccess: function () {
      window.location.href = '/';
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

  /* Expose globally for inline onclick handlers */
  window.quoteSystem = quoteSystem;
})();