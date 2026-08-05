if (!customElements.get('mw-lifestyle-gallery')) {
  customElements.define(
    'mw-lifestyle-gallery',
    class MwLifestyleGallery extends HTMLElement {
      constructor() {
        super();
        this.viewport = null;
        this.track = null;
        this.scrollbar = null;
        this.thumb = null;
        this.dragState = null;
        this.thumbDragState = null;
        this.observer = null;
        this.unsubscribeVariantChange = null;
      }

      connectedCallback() {
        this.viewport = this.querySelector('.mw-lifestyle-gallery__viewport');
        this.track = this.querySelector('.mw-lifestyle-gallery__track');
        this.scrollbar = this.querySelector('.mw-lifestyle-gallery__scrollbar');
        this.thumb = this.querySelector('.mw-lifestyle-gallery__thumb');
        if (!this.viewport || !this.track) return;

        this.bindEvents();

        if (typeof PUB_SUB_EVENTS !== 'undefined' && typeof subscribe === 'function') {
          this.unsubscribeVariantChange = subscribe(
            PUB_SUB_EVENTS.variantChange,
            this.handleVariantChange.bind(this)
          );
        }

        this.observer = new ResizeObserver(this.updateScrollbar.bind(this));
        this.observer.observe(this.viewport);
        this.observer.observe(this.track);

        if (this.track && typeof this.track.addEventListener === 'function') {
          this.track.querySelectorAll('img').forEach((img) => {
            if (img.complete) this.onImageReady();
            else img.addEventListener('load', this.onImageReady.bind(this), { once: true });
          });
        }

        this.updateScrollbar();
      }

      disconnectedCallback() {
        this.unbindEvents();
        this.unsubscribeVariantChange?.();
        this.observer?.disconnect();
      }

      bindEvents() {
        this.onScroll = this.updateScrollbar.bind(this);
        this.onWheel = this.handleWheel.bind(this);
        this.onKeydown = this.handleKeydown.bind(this);
        this.onPointerDown = this.handlePointerDown.bind(this);
        this.onPointerMove = this.handlePointerMove.bind(this);
        this.onPointerUp = this.handlePointerUp.bind(this);
        this.onPointerLeave = this.handlePointerUp.bind(this);
        this.onThumbPointerDown = this.handleThumbPointerDown.bind(this);

        this.viewport.addEventListener('scroll', this.onScroll, { passive: true });
        this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
        this.viewport.addEventListener('keydown', this.onKeydown);
        this.viewport.addEventListener('pointerdown', this.onPointerDown);

        this.thumb.addEventListener('pointerdown', this.onThumbPointerDown);
      }

      unbindEvents() {
        if (!this.viewport) return;
        this.viewport.removeEventListener('scroll', this.onScroll);
        this.viewport.removeEventListener('wheel', this.onWheel);
        this.viewport.removeEventListener('keydown', this.onKeydown);
        this.viewport.removeEventListener('pointerdown', this.onPointerDown);
        this.viewport.removeEventListener('pointermove', this.onPointerMove);
        this.viewport.removeEventListener('pointerup', this.onPointerUp);
        this.viewport.removeEventListener('pointercancel', this.onPointerUp);
        this.viewport.removeEventListener('pointerleave', this.onPointerLeave);

        this.thumb.removeEventListener('pointerdown', this.onThumbPointerDown);

        if (this.thumbDragHandlers) {
          window.removeEventListener('pointermove', this.thumbDragHandlers.move);
          window.removeEventListener('pointerup', this.thumbDragHandlers.up);
          window.removeEventListener('pointercancel', this.thumbDragHandlers.up);
          this.thumbDragHandlers = null;
        }
      }

      handleWheel(event) {
        const maxScroll = this.maxScrollLeft();
        if (maxScroll <= 0) return;

        const canScrollLeft = this.viewport.scrollLeft > 0;
        const canScrollRight = this.viewport.scrollLeft < maxScroll;

        // Trackpads already emit deltaX; let native horizontal scroll work for it.
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          if (
            (event.deltaX < 0 && canScrollLeft) ||
            (event.deltaX > 0 && canScrollRight)
          ) {
            event.preventDefault();
          }
          return;
        }

        if ((event.deltaY < 0 && canScrollLeft) || (event.deltaY > 0 && canScrollRight)) {
          event.preventDefault();
          this.viewport.scrollLeft += event.deltaY;
        }
      }

      handleKeydown(event) {
        const maxScroll = this.maxScrollLeft();
        if (maxScroll <= 0) return;

        const step = Math.max(this.viewport.clientWidth * 0.8, 300);
        switch (event.key) {
          case 'ArrowRight':
            event.preventDefault();
            this.viewport.scrollBy({ left: step, behavior: 'smooth' });
            break;
          case 'ArrowLeft':
            event.preventDefault();
            this.viewport.scrollBy({ left: -step, behavior: 'smooth' });
            break;
          case 'Home':
            event.preventDefault();
            this.viewport.scrollTo({ left: 0, behavior: 'smooth' });
            break;
          case 'End':
            event.preventDefault();
            this.viewport.scrollTo({ left: maxScroll, behavior: 'smooth' });
            break;
        }
      }

      handlePointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        this.dragState = {
          startX: event.clientX,
          startScrollLeft: this.viewport.scrollLeft,
          moved: false,
        };
        this.viewport.classList.add('is-dragging');
        this.viewport.setPointerCapture?.(event.pointerId);
        this.viewport.addEventListener('pointermove', this.onPointerMove);
        this.viewport.addEventListener('pointerup', this.onPointerUp);
        this.viewport.addEventListener('pointercancel', this.onPointerUp);
      }

      handlePointerMove(event) {
        if (!this.dragState) return;
        const delta = event.clientX - this.dragState.startX;
        if (Math.abs(delta) > 5) this.dragState.moved = true;
        this.viewport.scrollLeft = this.dragState.startScrollLeft - delta;
      }

      handlePointerUp(event) {
        if (!this.dragState) return;
        this.viewport.classList.remove('is-dragging');
        this.viewport.removeEventListener('pointermove', this.onPointerMove);
        this.viewport.removeEventListener('pointerup', this.onPointerUp);
        this.viewport.removeEventListener('pointercancel', this.onPointerUp);
        this.dragState = null;
      }

      handleThumbPointerDown(event) {
        event.preventDefault();
        event.stopPropagation();
        const maxScroll = this.maxScrollLeft();
        if (maxScroll <= 0) return;

        const thumbMaxLeft = this.scrollbar.clientWidth - this.thumb.clientWidth;
        this.thumb.classList.add('is-dragging');

        const move = (moveEvent) => {
          const relX = moveEvent.clientX - this.scrollbar.getBoundingClientRect().left;
          const ratio = Math.min(Math.max(relX / this.scrollbar.clientWidth, 0), 1);
          this.viewport.scrollLeft = ratio * maxScroll;
        };

        const up = () => {
          this.thumb.classList.remove('is-dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };

        this.thumbDragHandlers = { move, up };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      handleVariantChange(event) {
        const data = event?.data;
        if (!data || !data.html) return;
        const gallery = data.html.querySelector(
          `mw-lifestyle-gallery[data-section-id="${this.dataset.sectionId}"]`
        );

        if (!gallery) {
          this.hidden = true;
          return;
        }

        const newColor = gallery.dataset.colorId || '';
        const currentColor = this.dataset.colorId || '';
        if (newColor === currentColor && newColor !== '') return;

        const newTrack = gallery.querySelector('.mw-lifestyle-gallery__track');
        if (newTrack && this.track) {
          this.track.innerHTML = newTrack.innerHTML;
        }

        this.dataset.colorId = newColor;
        this.dataset.colorValue = gallery.dataset.colorValue || '';

        this.viewport.scrollLeft = 0;
        this.hidden = false;

        this.updateScrollbar();
        this.track.querySelectorAll('img').forEach((img) => {
          if (img.complete) this.onImageReady();
          else img.addEventListener('load', this.onImageReady.bind(this), { once: true });
        });
      }

      onImageReady() {
        this.updateScrollbar();
      }

      maxScrollLeft() {
        return this.track.scrollWidth - this.viewport.clientWidth;
      }

      updateScrollbar() {
        if (!this.scrollbar || !this.thumb) return;
        const maxScroll = this.maxScrollLeft();
        if (maxScroll <= 0) {
          this.scrollbar.classList.add('is-hidden');
          return;
        }

        this.scrollbar.classList.remove('is-hidden');

        const trackWidth = this.track.scrollWidth;
        const viewportWidth = this.viewport.clientWidth;
        const thumbWidth = Math.max((viewportWidth / trackWidth) * this.scrollbar.clientWidth, 48);
        this.thumb.style.width = thumbWidth + 'px';

        const scrollRatio = this.viewport.scrollLeft / maxScroll;
        const thumbMaxLeft = this.scrollbar.clientWidth - thumbWidth;
        this.thumb.style.transform = `translateX(${scrollRatio * thumbMaxLeft}px)`;
      }
    }
  );
}
