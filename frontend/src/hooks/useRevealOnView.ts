import { RefObject, useEffect } from 'react';

export function useRevealOnView<T extends HTMLElement>(ref: RefObject<T>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((target) => target.classList.add('is-visible'));
      return;
    }

    const observed = new Set<HTMLElement>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          target.classList.add('is-visible');
          observer.unobserve(entry.target);
          observed.delete(target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

    function observeElement(target: HTMLElement) {
      if (target.classList.contains('is-visible') || observed.has(target)) return;
      observed.add(target);
      observer.observe(target);
    }

    function observeTargets(scope: ParentNode) {
      scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach(observeElement);
    }

    observeTargets(root);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches('[data-reveal]')) {
            observeElement(node);
          }
          observeTargets(node);
        });
      });
    });

    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      observed.clear();
    };
  }, [ref]);
}
