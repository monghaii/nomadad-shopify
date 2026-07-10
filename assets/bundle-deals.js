/**
 * <bundle-deals>
 * Renders "buy more, save more" tiers as radio options on the product page.
 * Selecting a tier writes its quantity into the product form's quantity input
 * so the theme's own Add to cart (AJAX) and dynamic checkout (Buy with Shop)
 * buttons submit the chosen quantity. The percentage discount itself is
 * enforced at checkout with a cart discount code, so this component only
 * handles quantity selection and price messaging.
 */
class BundleDeals extends HTMLElement {
  connectedCallback() {
    this.section = this.closest('.shopify-section') || document;
    this.unitPrice = Number(this.dataset.unitPrice) || 0;
    this.moneyFormat = this.dataset.moneyFormat || '${{amount}}';

    this.addEventListener('change', this.#onChange);
    this.section.addEventListener('variant:update', this.#onVariantUpdate);

    // Hide the theme's default quantity stepper — the radios control quantity now.
    this.#hideNativeQuantity();

    // Apply the initial selection once the form has rendered.
    requestAnimationFrame(() => this.#syncQuantity());
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onChange);
    this.section.removeEventListener('variant:update', this.#onVariantUpdate);
  }

  /** @param {Event} event */
  #onChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.classList.contains('bundle-deals__input')) return;
    this.#syncQuantity();
  };

  /** Re-apply the selected quantity (and refresh prices) after a variant change. */
  #onVariantUpdate = (event) => {
    const price = event?.detail?.resource?.price;
    if (typeof price === 'number') {
      this.unitPrice = price;
      for (const option of this.querySelectorAll('.bundle-deals__option')) {
        const qty = Number(option.getAttribute('data-quantity')) || 1;
        const disc = Number(option.getAttribute('data-discount')) || 0;
        const gross = price * qty;
        const net = Math.round((gross * (100 - disc)) / 100);
        const netEl = option.querySelector('[data-bundle-net]');
        const grossEl = option.querySelector('[data-bundle-gross]');
        if (netEl) netEl.textContent = this.#formatMoney(net);
        if (grossEl) grossEl.textContent = this.#formatMoney(gross);
      }
    }
    // The theme resets quantity to the variant minimum on change — re-apply ours.
    requestAnimationFrame(() => this.#syncQuantity());
  };

  /** @returns {number} the currently selected tier quantity */
  #selectedQuantity() {
    const checked = /** @type {HTMLInputElement | null} */ (
      this.querySelector('.bundle-deals__input:checked')
    );
    return Number(checked?.value) || 1;
  }

  /** @returns {HTMLInputElement | null} */
  #quantityInput() {
    return /** @type {HTMLInputElement | null} */ (
      this.section.querySelector('product-form-component input[name="quantity"]')
    );
  }

  /** Write the selected quantity into the product form so both buttons use it. */
  #syncQuantity() {
    const quantity = this.#selectedQuantity();
    const input = this.#quantityInput();
    if (!input) return;
    if (Number(input.value) === quantity) return;
    input.value = String(quantity);
    // Notify the theme's quantity-selector component and form serializers.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Hide the theme's quantity stepper within this product form. */
  #hideNativeQuantity() {
    const input = this.#quantityInput();
    const wrapper = input?.closest('.quantity-selector-wrapper');
    const label = this.section.querySelector('.quantity-label');
    if (wrapper instanceof HTMLElement) wrapper.style.display = 'none';
    if (label instanceof HTMLElement) label.style.display = 'none';
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
