/*
 * AVM form handler — mirrors the Next.js ContactForm / CareersForm /
 * InnovationForm / CatalogueForm components:
 *   - native required/type validation (the browser's own messages)
 *   - spam guard fields: honeypot "company_website" + "form_started_at" (ms)
 *   - POST to the section's action URL as JSON, or multipart for the CV upload
 *   - "Sending…" state, error banner, and either an inline success banner
 *     (contact: fields cleared) or a success state that replaces the form
 *
 * Markup (see sections/avm-*-form.liquid):
 * <avm-form-handler
 *   data-action="https://…"            endpoint; empty = submissions fail with the error message
 *   data-encoding="json|multipart"
 *   data-ok-key="ok|success"            response flag the endpoint sets to false on failure
 *   data-success="inline|replace"
 *   data-server-errors                  show the endpoint's "error" text (contact form)
 *   data-error-message="…">             fallback error text
 *   <form>…</form>
 *   [data-avm-form-success]             banner (inline) or success state (replace)
 *   [data-avm-form-error]               error banner
 * </avm-form-handler>
 *
 * This never touches Shopify's /contact endpoint or any {% form 'contact' %}.
 */
if (!customElements.get('avm-form-handler')) {
  customElements.define(
    'avm-form-handler',
    class AvmFormHandler extends HTMLElement {
      connectedCallback() {
        this.form = this.querySelector('form');
        if (!this.form) return;

        this.submitButton = this.form.querySelector('[type="submit"]');
        this.submitLabel = this.submitButton ? this.submitButton.textContent.trim() : '';
        this.successEl = this.querySelector('[data-avm-form-success]');
        this.errorEl = this.querySelector('[data-avm-form-error]');
        this.startedAt = this.form.querySelector('input[name="form_started_at"]');

        // useSpamGuard: timestamp taken when the form first renders on the client.
        if (this.startedAt) this.startedAt.value = String(Date.now());

        this.form.querySelectorAll('[data-avm-file]').forEach((input) => {
          const nameEl = this.form.querySelector(`[data-avm-file-name="${input.id}"]`);
          input.addEventListener('change', () => {
            if (nameEl) nameEl.textContent = input.files?.[0]?.name || nameEl.dataset.placeholder;
          });
        });

        this.form.addEventListener('submit', (event) => this.onSubmit(event));
      }

      showError(message) {
        if (!this.errorEl) return;
        this.errorEl.textContent = message;
        this.errorEl.hidden = false;
      }

      clearMessages() {
        if (this.errorEl) this.errorEl.hidden = true;
        if (this.successEl && this.dataset.success === 'inline') this.successEl.hidden = true;
      }

      setSubmitting(submitting) {
        this.form.setAttribute('aria-busy', submitting ? 'true' : 'false');
        if (!this.submitButton) return;
        this.submitButton.disabled = submitting;
        this.submitButton.textContent = submitting ? 'Sending…' : this.submitLabel;
      }

      buildBody() {
        const data = new FormData(this.form);

        // Only send a CV when one was chosen (matches CareersForm).
        this.form.querySelectorAll('input[type="file"]').forEach((input) => {
          if (!input.files || input.files.length === 0) data.delete(input.name);
        });

        if (this.dataset.encoding === 'multipart') return { body: data, headers: {} };

        const json = {};
        data.forEach((value, key) => {
          if (typeof value === 'string') json[key] = value;
        });
        return { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } };
      }

      async onSubmit(event) {
        event.preventDefault();
        this.clearMessages();

        const genericError = this.dataset.errorMessage || 'Something went wrong. Please try again.';

        // CareersForm: reject CVs over the limit before sending.
        for (const input of this.form.querySelectorAll('[data-avm-file]')) {
          const file = input.files?.[0];
          const max = parseInt(input.dataset.maxBytes, 10);
          if (file && max && file.size > max) {
            this.showError(input.dataset.tooLargeMessage || genericError);
            return;
          }
        }

        const action = (this.dataset.action || '').trim();
        if (!action) {
          console.warn('AVM form: no action URL is set in this section\'s settings.');
          this.showError(genericError);
          return;
        }

        this.setSubmitting(true);
        try {
          const { body, headers } = this.buildBody();
          const res = await fetch(action, { method: 'POST', headers, body });
          const data = await res.json().catch(() => ({}));
          const okKey = this.dataset.okKey || 'success';
          if (!res.ok || data[okKey] === false) {
            throw new Error((this.hasAttribute('data-server-errors') && data.error) || '');
          }
          this.onSuccess();
        } catch (error) {
          const message = this.hasAttribute('data-server-errors') && error.message ? error.message : genericError;
          this.showError(message);
        } finally {
          this.setSubmitting(false);
        }
      }

      onSuccess() {
        if (this.dataset.success === 'inline') {
          // ContactForm: banner above the fields, fields cleared, form stays.
          this.form.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach((field) => {
            if (field.name === 'company_website') return;
            field.value = '';
          });
          if (this.successEl) this.successEl.hidden = false;
          return;
        }

        // Other forms: the success state replaces the form.
        this.form.hidden = true;
        if (this.successEl) {
          this.successEl.hidden = false;
          this.successEl.focus?.();
        }
      }
    }
  );
}
