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
        if (!overlay) return;

        // Move the zoom overlay to <body> so position:fixed covers the whole
        // screen (its ancestors have overflow/transform that would trap it).
        if (overlay.parentElement !== document.body) {
          document.body.appendChild(overlay);
        }
        this.zoomOverlay = overlay;

        const slides = () => Array.from(this.elements.viewer.querySelectorAll('.product__media-item'));

        const imageEl = overlay.querySelector('.mw-product-zoom__image');
        const counterEl = overlay.querySelector('.mw-product-zoom__counter');
        const stageEl = overlay.querySelector('.mw-product-zoom__stage');
        const prevBtn = overlay.querySelector('.mw-product-zoom__nav--prev');
        const nextBtn = overlay.querySelector('.mw-product-zoom__nav--next');
        const closeBtn = overlay.querySelector('.mw-product-zoom__close');
        const expandBtn = this.querySelector('.custom-gallery-expand');

        let currentIndex = -1;
        let isZoomed = false;
        let zoomScale = 1;

        const getImageForSlide = (slide) =>
          slide.querySelector('.product__media-item img, .product-media-container img, .product__media img');

        const resetImageTransform = () => {
          isZoomed = false;
          zoomScale = 1;
          imageEl.classList.remove('is-zoomed');
          imageEl.style.transform = '';
          imageEl.style.transformOrigin = '';
        };

        const open = (index) => {
          const list = slides();
          const img = getImageForSlide(list[index]);
          if (!img) return;
          currentIndex = index;
          resetImageTransform();
          imageEl.src = img.src || img.currentSrc;
          counterEl.textContent = (index + 1) + ' / ' + list.length;
          overlay.classList.add('is-open');
          document.body.classList.add('mw-zoom-open');
        };

        const close = () => {
          resetImageTransform();
          overlay.classList.remove('is-open');
          document.body.classList.remove('mw-zoom-open');
          currentIndex = -1;
        };

        const step = (dir) => {
          const list = slides();
          if (currentIndex < 0) return;
          let idx = currentIndex;
          do {
            idx = (idx + dir + list.length) % list.length;
          } while (!getImageForSlide(list[idx]) && idx !== currentIndex);
          open(idx);
        };

        // Zoom the lightbox image on click (toggle). When zoomed, the image
        // pans automatically to follow the mouse cursor over the stage.
        const zoomImage = (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (!isZoomed) {
            setZoom(2.2, event.clientX, event.clientY);
          } else {
            resetImageTransform();
          }
        };

        const setZoom = (scale, clientX, clientY) => {
          zoomScale = Math.min(Math.max(scale, 1), 5);
          isZoomed = zoomScale > 1;
          imageEl.classList.toggle('is-zoomed', isZoomed);
          if (!isZoomed) {
            imageEl.style.transform = '';
            imageEl.style.transformOrigin = '';
            return;
          }
          const stageRect = stageEl.getBoundingClientRect();
          const ox = ((clientX - stageRect.left) / stageRect.width) * 100;
          const oy = ((clientY - stageRect.top) / stageRect.height) * 100;
          imageEl.style.transformOrigin = `${ox}% ${oy}%`;
          imageEl.style.transform = `scale(${zoomScale})`;
        };

        const panTo = (clientX, clientY) => {
          if (!isZoomed) return;
          const stageRect = stageEl.getBoundingClientRect();
          const ox = ((clientX - stageRect.left) / stageRect.width) * 100;
          const oy = ((clientY - stageRect.top) / stageRect.height) * 100;
          imageEl.style.transformOrigin = `${ox}% ${oy}%`;
          imageEl.style.transform = `scale(${zoomScale})`;
        };

        // Mouse wheel controls the zoom level inside the lightbox.
        const handleZoomWheel = (event) => {
          if (!overlay.classList.contains('is-open')) return;
          event.preventDefault();
          event.stopPropagation();
          const factor = event.deltaY < 0 ? 0.15 : -0.15;
          setZoom(zoomScale + factor, event.clientX, event.clientY);
        };

        if (stageEl) {
          stageEl.addEventListener('mousemove', (event) => {
            if (isZoomed) panTo(event.clientX, event.clientY);
          });
          stageEl.addEventListener('mouseleave', () => {
            if (isZoomed) panTo(stageEl.getBoundingClientRect().width / 2, stageEl.getBoundingClientRect().height / 2);
          });
          stageEl.addEventListener('wheel', handleZoomWheel, { passive: false });
        }

        imageEl.addEventListener('click', zoomImage);

        // Click on any photo opens the zoom (including the featured one) and
        // prevents Dawn's native product modal from opening.
        const bindClick = () => {
          slides().forEach((slide) => {
            if (slide.dataset.mwZoomBound) return;
            const media = slide.querySelector('.product-media-container, .product__media');
            if (!media || !getImageForSlide(slide)) return;
            slide.dataset.mwZoomBound = 'true';
            // Capture phase so it runs before Dawn's modal-opener (bubble) handler.
            media.addEventListener(
              'click',
              (event) => {
                // Don't open while dragging or right after a drag ends.
                if (this.elements.viewer.querySelector('.product__media-list')?.classList.contains('is-dragging')) return;
                if (Date.now() - (this.lastDragEnd || 0) < 250) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                open(slides().indexOf(slide));
              },
              true
            );
          });
        };
        bindClick();

        // The existing expand button opens the zoom for the current slide.
        if (expandBtn) {
          expandBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const current = this.getCurrentSlideIndex();
            open(current);
          });
        }

        // Re-bind click and keep counter in sync when the gallery media changes.
        this.rebindZoom = () => {
          bindClick();
        };

        overlay.addEventListener('click', (event) => {
          // Close when clicking the dark background (overlay itself or the
          // stage area around the image). Clicking the image/controls doesn't
          // reach here because they stopPropagation.
          if (
            event.target === overlay ||
            event.target === stageEl ||
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

      getCurrentSlideIndex() {
        const slider = this.elements.viewer?.querySelector('[id^="Slider-"]');
        const list = Array.from(this.elements.viewer.querySelectorAll('.product__media-item'));
        if (!slider || list.length === 0) return 0;
        const slideWidth = list[0].offsetWidth || 1;
        let index = Math.round(slider.scrollLeft / slideWidth);
        if (index >= list.length) index = list.length - 1;
        if (index < 0) index = 0;
        return index;
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
        let suppressedClick = false;

        const onPointerDown = (event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          if (slider.scrollWidth <= slider.clientWidth) return;

          isDown = true;
          didDrag = false;
          startX = event.clientX;
          startScrollLeft = slider.scrollLeft;
          slider.classList.add('is-dragging');
        };

        const onPointerMove = (event) => {
          if (!isDown) return;
          const delta = event.clientX - startX;
          if (Math.abs(delta) > 8) didDrag = true;
          slider.scrollLeft = startScrollLeft - delta;
        };

        const onPointerUp = () => {
          if (!isDown) return;
          isDown = false;
          slider.classList.remove('is-dragging');
          // Only suppress/guard the following click if the user actually dragged.
          suppressedClick = didDrag;
          didDrag = false;
          if (suppressedClick) this.lastDragEnd = Date.now();
          window.setTimeout(() => {
            suppressedClick = false;
          }, 0);
        };

        slider.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

        // Suppress a click that immediately follows a drag (opens zoom otherwise).
        slider.addEventListener(
          'click',
          (event) => {
            if (!suppressedClick) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          },
          true
        );

        this.dragCleanup = () => {
          slider.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
        };
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
