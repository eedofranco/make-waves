if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        this.initDragToSlide();
        this.initZoomHover();
        this.initCustomCounter();
        if (!this.elements.thumbnails) return;

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
          mediaToSwitch
            .querySelector('button')
            .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
        });
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
      }

      onSlideChanged(event) {
        const thumbnail = this.elements.thumbnails?.querySelector(
          `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      initZoomHover() {
        const overlay = this.querySelector('[data-mw-zoom]');
        const slides = Array.from(this.elements.viewer.querySelectorAll('.product__media-item'));
        if (!overlay || slides.length === 0) return;

        const imageEl = overlay.querySelector('.mw-product-zoom__image');
        const counterEl = overlay.querySelector('.mw-product-zoom__counter');
        const prevBtn = overlay.querySelector('.mw-product-zoom__nav--prev');
        const nextBtn = overlay.querySelector('.mw-product-zoom__nav--next');
        const closeBtn = overlay.querySelector('.mw-product-zoom__close');

        const zoomable = slides.map((slide) => slide.querySelector('.product__media-item img, .product-media-container img'));

        let currentIndex = -1;

        const open = (index) => {
          const img = zoomable[index];
          if (!img) return;
          currentIndex = index;
          imageEl.src = img.src || img.currentSrc;
          counterEl.textContent = (index + 1) + ' / ' + slides.length;
          overlay.classList.add('is-open');
        };

        const close = () => {
          overlay.classList.remove('is-open');
          currentIndex = -1;
        };

        const step = (dir) => {
          if (currentIndex < 0) return;
          let idx = currentIndex;
          do {
            idx = (idx + dir + slides.length) % slides.length;
          } while (!zoomable[idx] && idx !== currentIndex);
          open(idx);
        };

        slides.forEach((slide, index) => {
          const media = slide.querySelector('.product-media-container');
          if (!media || !zoomable[index]) return;
          media.addEventListener('mouseenter', () => open(index));
        });

        overlay.addEventListener('click', (event) => {
          if (
            event.target === overlay ||
            event.target === imageEl ||
            event.target.closest('.mw-product-zoom__close')
          ) {
            close();
          }
        });

        prevBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          step(-1);
        });
        nextBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          step(1);
        });

        overlay.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') close();
          if (event.key === 'ArrowLeft') step(-1);
          if (event.key === 'ArrowRight') step(1);
        });
      }

      initCustomCounter() {
        this.counterCurrent = this.querySelector('.mw-gallery-counter-current');
        this.counterTotal = this.querySelector('.mw-gallery-counter-total');
        if (!this.counterCurrent && !this.counterTotal) return;

        const slider = this.elements.viewer?.querySelector('[id^="Slider-"]');
        if (!slider) return;

        const updateCounter = () => {
          const slides = Array.from(slider.querySelectorAll('.slider__slide')).filter(
            (slide) => slide.clientWidth > 0
          );
          if (slides.length === 0) return;

          const total = slides.length;
          const slideWidth = slides[0].offsetWidth;
          let current = Math.round(slider.scrollLeft / slideWidth) + 1;
          if (current > total) current = total;
          if (current < 1) current = 1;

          if (this.counterTotal) this.counterTotal.textContent = total;
          if (this.counterCurrent) this.counterCurrent.textContent = current;
        };

        this.updateCustomCounter = updateCounter;
        slider.addEventListener('scroll', updateCounter, { passive: true });
        this.elements.viewer?.addEventListener('slideChanged', updateCounter);
        updateCounter();

        if (window.ResizeObserver) {
          this.counterObserver = new ResizeObserver(updateCounter);
          this.counterObserver.observe(slider);
        }
      }

      initDragToSlide() {
        const slider = this.elements.viewer.querySelector('[id^="Slider-"]');
        if (!slider) return;

        // Prevent the native image drag (ghost) that keeps the cursor "stuck"
        slider.querySelectorAll('img').forEach((img) => {
          img.setAttribute('draggable', 'false');
          img.style.webkitUserDrag = 'none';
          img.style.userSelect = 'none';
        });

        let isDown = false;
        let didDrag = false;
        let startX = 0;
        let startScrollLeft = 0;

        slider.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          if (slider.scrollWidth <= slider.clientWidth) return;

          isDown = true;
          didDrag = false;
          startX = event.clientX;
          startScrollLeft = slider.scrollLeft;
          slider.classList.add('is-dragging');
        });

        window.addEventListener('pointermove', (event) => {
          if (!isDown) return;
          const delta = event.clientX - startX;
          if (Math.abs(delta) > 8) didDrag = true;
          slider.scrollLeft = startScrollLeft - delta;
        });

        const endDrag = () => {
          if (!isDown) return;
          isDown = false;
          slider.classList.remove('is-dragging');
        };

        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);

        // After a real drag, suppress the click that would open the zoom modal
        slider.addEventListener(
          'click',
          (event) => {
            if (!didDrag) return;
            didDrag = false;
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          },
          true
        );
      }

      setActiveMedia(mediaId, prepend) {
        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');

        if (prepend) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        });
        if (typeof this.updateCustomCounter === 'function') {
          window.setTimeout(() => this.updateCustomCounter(), 50);
        }
        this.playActiveMedia(activeMedia);

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}
