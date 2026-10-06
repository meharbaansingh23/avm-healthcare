/*
 * AVM careers form handler — mirrors the Next.js CareersForm.tsx.
 * (Contact, innovation and catalogue use Shopify's native contact form instead;
 * see snippets/avm-native-form-state.liquid.)
 *
 *   - native required/type validation (the browser's own messages)
 *   - CV checked against data-max-bytes (5 MB) before sending
 *   - spam guard fields: honeypot "company_website" + "form_started_at" (ms)
 *   - multipart POST to the section's "Form action URL"; the CV is only sent if chosen
 *   - "Sending…" state, error banner, success state that replaces the form
 *
 * Markup (sections/avm-careers-form.liquid):
 * <avm-form-handler data-action="https://…" data-error-message="…">
 *   <form>…</form>
 *   [data-avm-form-success]   success state (starts hidden)
 *   [data-avm-form-error]     error banner (inside the form)
 * </avm-form-handler>
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

      setSubmitting(submitting) {
        this.form.setAttribute('aria-busy', submitting ? 'true' : 'false');
        if (!this.submitButton) return;
        this.submitButton.disabled = submitting;
        this.submitButton.textContent = submitting ? 'Sending…' : this.submitLabel;
      }

      async onSubmit(event) {
        event.preventDefault();
        if (this.errorEl) this.errorEl.hidden = true;

        const genericError = this.dataset.errorMessage || 'Something went wrong. Please try again.';

        // Reject CVs over the limit before sending.
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
          console.warn('AVM careers form: no action URL is set in the section settings.');
          this.showError(genericError);
          return;
        }

        const body = new FormData(this.form);
        // Only send a CV when one was chosen.
        this.form.querySelectorAll('input[type="file"]').forEach((input) => {
          if (!input.files || input.files.length === 0) body.delete(input.name);
        });

        this.setSubmitting(true);
        try {
          const res = await fetch(action, { method: 'POST', body });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) throw new Error();
          this.form.hidden = true;
          if (this.successEl) {
            this.successEl.hidden = false;
            this.successEl.focus?.();
          }
        } catch {
          this.showError(genericError);
        } finally {
          this.setSubmitting(false);
        }
      }
    }
  );
}
