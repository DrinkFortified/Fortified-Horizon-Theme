/* Flavour picker for a product card.

   Clicking a flavour has to change three things, or the card starts lying
   about what Add to Cart will do:

     1. the variant the card's form submits
     2. which thumbnail reads as chosen
     3. the pack shot on the card

   (3) is not a src swap. Horizon already renders every variant image as its
   own slide, tagged variant-image and hidden except the first — see
   snippets/card-gallery.liquid. Switching flavours means unhiding the slide
   whose slide-id matches the variant's media and hiding its siblings, which
   is exactly what product-card.js does in #updateVariantImages for the native
   swatch path. That method is private and expects a swatches variant picker,
   so the same handful of steps live here, against the public slideshow API.

   Price is only touched when the flavours are actually priced differently.
   The strings come from Liquid's money filter, so currency and formatting are
   Shopify's, not a guess made in JavaScript. */
(function () {
  var TAG = 'ftd-card-flavors';
  if (!window.customElements || customElements.get(TAG)) return;

  /* Where the card keeps the variant it will add. buy-buttons.liquid renders
     ref="variantId"; the name attribute is the fallback for any other form
     shape that ends up inside a card. */
  function variantInput(card) {
    return card.querySelector('input[ref="variantId"]') || card.querySelector('form input[name="id"]');
  }

  function showVariantSlide(card, mediaId) {
    if (!mediaId) return;
    var slideshow = card.querySelector('slideshow-component');
    if (!slideshow || !slideshow.refs) return;

    var slides = slideshow.refs.slides || [];
    var found = false;
    for (var i = 0; i < slides.length; i++) {
      var slide = slides[i];
      if (slide.getAttribute('variant-image') == null) continue;
      var mine = slide.getAttribute('slide-id') === mediaId;
      slide.hidden = !mine;
      if (mine) found = true;
    }

    /* Only drive the slideshow to a slide that is actually there. A product
       whose variant image was never rendered (the gallery caps how many
       slides it builds) keeps whatever it was showing rather than jumping to
       a blank frame. */
    if (found && typeof slideshow.select === 'function') {
      try {
        slideshow.select({ id: mediaId }, undefined, { animate: false });
      } catch (e) {
        /* A slideshow mid-morph can reject a select; the slide is already
           unhidden, so the card is still showing the right flavour. */
      }
    }
  }

  function updatePrice(card, money) {
    if (!money) return;
    var el = card.querySelector('.price-item__group.price');
    if (el) el.textContent = money;
  }

  function pricesVary(buttons) {
    for (var i = 1; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-price') !== buttons[0].getAttribute('data-price')) return true;
    }
    return false;
  }

  class FtdCardFlavors extends HTMLElement {
    connectedCallback() {
      /* Delegated, so the listener survives the card being re-rendered and
         morphed underneath us. */
      this.addEventListener('click', this.#onClick);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#onClick);
    }

    get buttons() {
      return Array.from(this.querySelectorAll('button[data-variant-id]'));
    }

    #onClick = (event) => {
      const button = event.target.closest?.('button[data-variant-id]');
      if (!button || button.disabled || !this.contains(button)) return;
      this.pick(button);
    };

    pick(button) {
      const card = this.closest('product-card');
      if (!card) return;

      const input = variantInput(card);
      if (input) {
        input.value = button.getAttribute('data-variant-id');
        input.disabled = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const all = this.buttons;
      for (const other of all) {
        other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
      }

      showVariantSlide(card, button.getAttribute('data-media-id'));
      if (pricesVary(all)) updatePrice(card, button.getAttribute('data-price'));
    }
  }

  customElements.define(TAG, FtdCardFlavors);
})();
