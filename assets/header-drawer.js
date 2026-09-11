import { Component } from '@theme/component';
import { trapFocus, removeTrapFocus } from '@theme/focus';
import { onAnimationEnd, removeWillChangeOnAnimationEnd } from '@theme/utilities';

/**
 * A custom element that manages the main menu drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDetailsElement} details - The details element.
 * @property {HTMLDivElement} menuDrawer - The slideable drawer panel containing the menu.
 *
 * @extends {Component<Refs>}
 */
class HeaderDrawer extends Component {
  requiredRefs = ['details', 'menuDrawer'];

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('keyup', this.#onKeyUp);
    this.addEventListener('click', this.#onLinkActivate);
    this.#setupAnimatedElementListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keyup', this.#onKeyUp);
    this.removeEventListener('click', this.#onLinkActivate);
  }

  /**
   * Close the main menu drawer when the Escape key is pressed
   * @param {KeyboardEvent} event
   */
  #onKeyUp = (event) => {
    if (event.key !== 'Escape') return;

    this.#close(this.#getDetailsElement(event));
  };

  /**
   * Close the main menu drawer when one of its links is activated.
   *
   * Drawer links are plain anchors, so a link to another page takes the whole
   * document — drawer included — down with it and never needed closing. A link
   * whose target is on the page we are already on does not navigate at all:
   * the browser just scrolls to the anchor, leaving the drawer sitting over
   * the section it scrolled to. That is most of this store's menu, which
   * points at #everyday, #flow, #stats and friends.
   *
   * Closing on every link covers both cases; on a real navigation the drawer
   * is simply closing as the next page loads.
   *
   * @param {MouseEvent} event
   */
  #onLinkActivate = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest('a[href]');

    // Anchors that open elsewhere leave this page — and this drawer — standing.
    if (!link || !this.contains(link)) return;
    if (link.target && link.target !== '_self') return;

    /* A link to a section on this page gets scrolled by hand rather than left
       to the browser. See #scrollToAnchor for why. */
    const target = this.#samePageTarget(link);
    if (target) {
      event.preventDefault();
      if (this.isOpen) this.close();
      this.#scrollToAnchor(target, link.hash);
      return;
    }

    if (!this.isOpen) return;

    this.close();
  };

  /**
   * The element a link points at, when it points somewhere on this very page.
   * @param {HTMLAnchorElement} link
   * @returns {HTMLElement | null}
   */
  #samePageTarget(link) {
    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (_) {
      return null;
    }
    if (url.origin !== window.location.origin) return null;
    if (url.pathname !== window.location.pathname) return null;
    if (!url.hash || url.hash === '#') return null;

    let id;
    try {
      id = decodeURIComponent(url.hash.slice(1));
    } catch (_) {
      id = url.hash.slice(1);
    }
    return document.getElementById(id);
  }

  /**
   * Scroll a same-page section to the top of the viewport, and keep it there.
   *
   * The browser's own anchor scroll lands in the wrong place on this store,
   * for two reasons that compound on a phone.
   *
   * It scrolls the target to y=0, where a sticky header is already sitting, so
   * the top of the section starts life underneath it. And it decides where to
   * stop using the layout as it is at the moment of the click — while images
   * between here and there are still lazy and still occupy no height. Each one
   * that loads afterwards pushes the target further down the document, and
   * nothing scrolls again to make up for it. The section that should have been
   * at the top of the screen ends up halfway down it, which is the report.
   *
   * So: subtract the header, then re-assert the position a few times while the
   * page settles. Corrections stop the instant the visitor touches the scroll
   * themselves — being dragged back to a place you just scrolled away from is
   * worse than the bug.
   *
   * @param {HTMLElement} target
   * @param {string} hash
   */
  #scrollToAnchor(target, hash) {
    const headerOffset = () => {
      const raw = getComputedStyle(document.body).getPropertyValue('--header-height');
      const value = parseFloat(raw);
      return Number.isFinite(value) ? value : 0;
    };
    const wanted = () => Math.max(0, target.getBoundingClientRect().top + window.scrollY - headerOffset());

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: wanted(), behavior: reduced ? 'auto' : 'smooth' });

    /* Keep the address bar honest without letting it scroll again. */
    try {
      history.replaceState(history.state, '', hash);
    } catch (_) {}

    let cancelled = false;
    const stop = () => {
      cancelled = true;
      for (const name of ['wheel', 'touchstart', 'keydown']) {
        window.removeEventListener(name, stop);
      }
    };
    for (const name of ['wheel', 'touchstart', 'keydown']) {
      window.addEventListener(name, stop, { passive: true, once: true });
    }

    /* Corrections begin only once the smooth scroll has had time to finish,
       so they are fixing late layout rather than fighting the animation. */
    let attempts = 0;
    const settle = () => {
      if (cancelled) return;
      const want = wanted();
      if (Math.abs(window.scrollY - want) > 4) window.scrollTo({ top: want, behavior: 'auto' });
      if (++attempts < 6) setTimeout(settle, 180);
      else stop();
    };
    setTimeout(settle, 650);
  }

  /**
   * @returns {boolean} Whether the main menu drawer is open
   */
  get isOpen() {
    return this.refs.details.hasAttribute('open');
  }

  /**
   * Get the closest details element to the event target
   * @param {Event | undefined} event
   * @returns {HTMLDetailsElement}
   */
  #getDetailsElement(event) {
    if (!(event?.target instanceof Element)) return this.refs.details;

    return event.target.closest('details') ?? this.refs.details;
  }

  /**
   * Toggle the main menu drawer
   */
  toggle() {
    return this.isOpen ? this.close() : this.open();
  }

  /**
   * Open the closest drawer or the main menu drawer
   * @param {string} [target]
   * @param {Event} [event]
   */
  open(target, event) {
    const details = this.#getDetailsElement(event);
    const summary = details.querySelector('summary');

    if (!summary) return;

    summary.setAttribute('aria-expanded', 'true');

    this.preventInitialAccordionAnimations(details);
    requestAnimationFrame(() => {
      details.classList.add('menu-open');

      if (target) {
        this.refs.menuDrawer.classList.add('menu-drawer--has-submenu-opened');
      }

      // Wait for the drawer animation to complete before trapping focus
      const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');
      onAnimationEnd(drawer || details, () => trapFocus(details), { subtree: false });
    });
  }

  /**
   * Go back or close the main menu drawer
   * @param {Event} [event]
   */
  back(event) {
    this.#close(this.#getDetailsElement(event));
  }

  /**
   * Close the main menu drawer
   */
  close() {
    this.#close(this.refs.details);
  }

  /**
   * Close the closest menu or submenu that is open
   *
   * @param {HTMLDetailsElement} details
   */
  #close(details) {
    const summary = details.querySelector('summary');

    if (!summary) return;

    summary.setAttribute('aria-expanded', 'false');
    details.classList.remove('menu-open');
    this.refs.menuDrawer.classList.remove('menu-drawer--has-submenu-opened');

    // Wait for the .menu-drawer element's transition, not the entire details subtree
    // This avoids waiting for child accordion/resource-card animations which can cause issues on Firefox
    const drawer = details.querySelector('.menu-drawer, .menu-drawer__submenu');

    onAnimationEnd(
      drawer || details,
      () => {
        reset(details);
        if (details === this.refs.details) {
          removeTrapFocus();
          const openDetails = this.querySelectorAll('details[open]:not(accordion-custom > details)');
          openDetails.forEach(reset);
        } else {
          trapFocus(this.refs.details);
        }
      },
      { subtree: false }
    );
  }

  /**
   * Attach animationend event listeners to all animated elements to remove will-change after animation
   * to remove the stacking context and allow submenus to be positioned correctly
   */
  #setupAnimatedElementListeners() {
    const allAnimated = this.querySelectorAll('.menu-drawer__animated-element');
    allAnimated.forEach((element) => {
      element.addEventListener('animationend', removeWillChangeOnAnimationEnd);
    });
  }

  /**
   * Temporarily disables accordion animations to prevent unwanted transitions when the drawer opens.
   * Adds a no-animation class to accordion content elements, then removes it after 100ms to
   * re-enable animations for user interactions.
   * @param {HTMLDetailsElement} details - The details element containing the accordions
   */
  preventInitialAccordionAnimations(details) {
    const content = details.querySelectorAll('accordion-custom .details-content');

    content.forEach((element) => {
      if (element instanceof HTMLElement) {
        element.classList.add('details-content--no-animation');
      }
    });
    setTimeout(() => {
      content.forEach((element) => {
        if (element instanceof HTMLElement) {
          element.classList.remove('details-content--no-animation');
        }
      });
    }, 100);
  }
}

if (!customElements.get('header-drawer')) {
  customElements.define('header-drawer', HeaderDrawer);
}

/**
 * Reset an open details element to its original state
 *
 * @param {HTMLDetailsElement} element
 */
function reset(element) {
  element.classList.remove('menu-open');
  element.removeAttribute('open');
  element.querySelector('summary')?.setAttribute('aria-expanded', 'false');
}
