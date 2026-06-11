/**
 * <bundle-deals>
 * Renders "buy more, save more" tier buttons on the product page. Clicking a
 * tier adds the currently selected variant to the cart at that quantity.
 *
 * The percentage discount itself is enforced at checkout with a cart discount
 * code, so this component only handles quantity, price messaging, and opening
 * the cart drawer. It piggybacks on the theme's `cart:update` event so the
 * drawer, cart icon, and line items all refresh.
 */
class BundleDeals extends HTMLElement {
  connectedCallback() {
    this.section = this.closest('.shopify-section') || document;
    this.unitPrice = Number(this.dataset.unitPrice) || 0;
    this.moneyFormat = this.dataset.moneyFormat || '${{amount}}';

    this.addEventListener('click', this.#onClick);
    this.section.addEventListener('variant:update', this.#onVariantUpdate);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.section.removeEventListener('variant:update', this.#onVariantUpdate);
  }

  /** @param {Event} event */
  #onClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest('.bundle-deals__option') : null;
    if (!button) return;
    event.preventDefault();
    this.#addBundle(button);
  };

  /** Recompute tier prices when the selected variant changes. */
  #onVariantUpdate = (event) => {
    const price = event?.detail?.resource?.price;
    if (typeof price !== 'number') return;
    this.unitPrice = price;

    for (const button of this.querySelectorAll('.bundle-deals__option')) {
      const qty = Number(button.dataset.quantity) || 1;
      const disc = Number(button.dataset.discount) || 0;
      const gross = price * qty;
      const net = Math.round((gross * (100 - disc)) / 100);

      const netEl = button.querySelector('[data-bundle-net]');
      const grossEl = button.querySelector('[data-bundle-gross]');
      if (netEl) netEl.textContent = this.#formatMoney(net);
      if (grossEl) grossEl.textContent = this.#formatMoney(gross);
    }
  };

  /** @returns {string | null} */
  #getVariantId() {
    const input = /** @type {HTMLInputElement | null} */ (
      this.section.querySelector('product-form-component input[name="id"]')
    );
    return input?.value || this.dataset.variantId || null;
  }

  /** @param {string} [message] */
  #showError(message) {
    const errorEl = this.querySelector('[data-bundle-error]');
    if (!(errorEl instanceof HTMLElement)) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  /** @param {HTMLButtonElement} button */
  async #addBundle(button) {
    const quantity = Number(button.dataset.quantity) || 1;
    const variantId = this.#getVariantId();
    if (!variantId) {
      this.#showError('Please choose an option first.');
      return;
    }

    this.#showError();
    button.setAttribute('aria-busy', 'true');

    const sectionIds = Array.from(document.querySelectorAll('cart-items-component'))
      .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : null))
      .filter(Boolean);

    const addUrl = window.Theme?.routes?.cart_add_url || '/cart/add.js';

    // FormData with a single id/quantity is the most universally reliable
    // form of the Ajax cart add endpoint.
    const body = new FormData();
    body.append('id', String(variantId));
    body.append('quantity', String(quantity));
    if (sectionIds.length) body.append('sections', sectionIds.join(','));
    body.append('sections_url', window.location.pathname);

    try {
      const response = await fetch(addUrl, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body,
      });

      const data = await response.json();

      // The Ajax API returns a `status` field only on error (e.g. 422 when the
      // requested quantity exceeds available inventory).
      if (!response.ok || data.status) {
        throw new Error(data.description || data.message || 'Could not add to cart.');
      }

      let cart = null;
      try {
        cart = await (await fetch('/cart.js')).json();
      } catch (_) {
        /* non-fatal */
      }

      document.dispatchEvent(
        new CustomEvent('cart:update', {
          bubbles: true,
          detail: {
            resource: cart,
            sourceId: this.id || 'bundle-deals',
            data: {
              source: 'bundle-deals',
              itemCount: cart?.item_count ?? quantity,
              productId: this.dataset.productId,
              sections: data.sections,
            },
          },
        })
      );

      const drawer = document.querySelector('cart-drawer-component');
      if (drawer && typeof (/** @type {any} */ (drawer).open) === 'function') {
        /** @type {any} */ (drawer).open();
      }
    } catch (error) {
      console.error('[bundle-deals]', error);
      this.#showError(error instanceof Error ? error.message : 'Could not add to cart.');
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  /**
   * Minimal port of Shopify's money formatter so tier prices stay correct when
   * the variant price changes client-side.
   * @param {number} cents
   * @returns {string}
   */
  #formatMoney(cents) {
    const format = this.moneyFormat;
    const value = (cents || 0) / 100;

    const withCommas = (number, decimals, thousands, decimalSep) => {
      const fixed = Math.abs(number).toFixed(decimals);
      const parts = fixed.split('.');
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return decimals && parts[1] ? `${intPart}${decimalSep}${parts[1]}` : intPart;
    };

    return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token) => {
      switch (token) {
        case 'amount':
          return withCommas(value, 2, ',', '.');
        case 'amount_no_decimals':
          return withCommas(value, 0, ',', '.');
        case 'amount_with_comma_separator':
          return withCommas(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return withCommas(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return withCommas(value, 2, "'", '.');
        default:
          return withCommas(value, 2, ',', '.');
      }
    });
  }
}

if (!customElements.get('bundle-deals')) {
  customElements.define('bundle-deals', BundleDeals);
}
