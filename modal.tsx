const BODY_MODAL_CLASS = "has-modal-open";

const globalOpenModals = new Set<string>();

const dispatchModalChange = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("modal-manager-change", {
        detail: { openIds: Array.from(globalOpenModals) },
      })
    );
  } catch {
    // CustomEvent may throw in very old browsers; ignore
  }
};

const updateBodyClass = () => {
  if (typeof document === "undefined") return;
  if (globalOpenModals.size > 0) {
    document.body.classList.add(BODY_MODAL_CLASS);
    // preserve scroll position by fixing body
    document.body.style.overflow = "hidden";
  } else {
    document.body.classList.remove(BODY_MODAL_CLASS);
    document.body.style.overflow = "";
  }
};

export function openModal(id: string): void {
  if (!id) return;
  globalOpenModals.add(id);
  updateBodyClass();
  dispatchModalChange();
}

export function closeModal(id: string): void {
  if (!id) return;
  globalOpenModals.delete(id);
  updateBodyClass();
  dispatchModalChange();
}

let anonCounter = 0;
function generateAnonId(): string {
  anonCounter += 1;
  return `__anon_${Date.now().toString(36)}_${anonCounter}`;
}

function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rects = el.getClientRects();
  if (rects.length === 0) {
    // might still be visually available via transforms; check computed style
    const style = window.getComputedStyle(el);
    if (style && (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0)) {
      return false;
    }
    // treat as visible if it has a tabindex or is the active element
    if (el === document.activeElement) return true;
    return false;
  }
  return true;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const selectors = [
    "a[href]:not([tabindex='-1'])",
    "area[href]:not([tabindex='-1'])",
    "input:not([disabled]):not([type='hidden']):not([tabindex='-1'])",
    "select:not([disabled]):not([tabindex='-1'])",
    "textarea:not([disabled]):not([tabindex='-1'])",
    "button:not([disabled]):not([tabindex='-1'])",
    "iframe:not([tabindex='-1'])",
    "object:not([tabindex='-1'])",
    "embed:not([tabindex='-1'])",
    "[contenteditable]:not([tabindex='-1'])",
    "[tabindex]:not([tabindex='-1'])",
  ];
  const nodeList = Array.from(container.querySelectorAll<HTMLElement>(selectors.join(",")));
  return nodeList.filter((el) => isElementVisible(el));
}

export default function Modal(props: ModalProps): JSX.Element | null {
  const { id: propId, isOpen, onClose, children, ariaLabel, stopPropagation = true } = props;

  // assign a stable instance id: use provided id if present, otherwise a generated anon id
  const instanceIdRef = useRef<string>(propId ?? generateAnonId());
  // keep track if the component originally had no id and later receives one; prefer prop id when present
  useEffect(() => {
    if (propId) {
      instanceIdRef.current = propId;
    }
  }, [propId]);

  const id = instanceIdRef.current;

  const [managerOpen, setManagerOpen] = useState<boolean>(() => (propId ? globalOpenModals.has(propId) : false));
  const wasOpenRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Sync with global manager when a real id is provided (external openModal/closeModal)
  useEffect(() => {
    if (!propId) return;
    const handler = () => {
      setManagerOpen(globalOpenModals.has(propId));
    };
    // initial sync
    setManagerOpen(globalOpenModals.has(propId));
    window.addEventListener("modal-manager-change", handler as EventListener);
    return () => {
      window.removeEventListener("modal-manager-change", handler as EventListener);
    };
  }, [propId]);

  const visible = Boolean(isOpen || (propId ? managerOpen : false));

  // Manage body class for anonymous/controlled-only modals (those without a provided id)
  useEffect(() => {
    // if the modal does not have an external id, manage global set using our generated instance id
    if (!propId) {
      if (visible) {
        globalOpenModals.add(id);
      } else {
        globalOpenModals.delete(id);
      }
      updateBodyClass();
      dispatchModalChange();

      return () => {
        // ensure cleanup on unmount
        globalOpenModals.delete(id);
        updateBodyClass();
        dispatchModalChange();
      };
    }
    // if id is present, the manager (openModal/closeModal) handles body class
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, propId, id]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (!visible) {
      // restore focus if it was opened previously
      if (wasOpenRef.current && previouslyFocused.current) {
        try {
          previouslyFocused.current.focus();
        } catch {
          // ignore
        }
      }
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    previouslyFocused.current = (document.activeElement as HTMLElement) || null;

    // After render, move focus into modal using animation frame for more reliability than setTimeout(0)
    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      const contentEl = contentRef.current;
      const focusables = getFocusableElements(contentEl);
      if (focusables.length > 0) {
        try {
          (focusables[0] as HTMLElement).focus();
        } catch {
          if (contentEl) {
            try {
              contentEl.focus();
            } catch {
              // ignore
            }
          }
        }
      } else if (contentEl) {
        try {
          contentEl.focus();
        } catch {
          // ignore
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.stopPropagation();
        e.preventDefault();
        if (propId) {
          closeModal(propId);
        } else {
          // remove our instance id from manager set (if present) to update body state
          globalOpenModals.delete(id);
          updateBodyClass();
          dispatchModalChange();
        }
        if (onClose) onClose();
        return;
      }

      if (e.key === "Tab") {
        const contentEl = contentRef.current;
        const focusables = getFocusableElements(contentEl);
        if (!contentEl) return;

        if (focusables.length === 0) {
          // keep focus inside modal container
          e.preventDefault();
          try {
            contentEl.focus();
          } catch {
            // ignore
          }
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement;

        if (e.shiftKey) {
          if (active === first || active === contentEl) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
    // include onClose in deps to ensure latest ref is used
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, propId, id, onClose]);

  if (typeof document === "undefined") return null;
  if (!visible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only treat clicks that started on the overlay (not child clicks)
    if (e.target === overlayRef.current) {
      if (propId) {
        closeModal(propId);
      } else {
        globalOpenModals.delete(id);
        updateBodyClass();
        dispatchModalChange();
      }
      if (onClose) onClose();
    }
  };

  const stopContentClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
  };

  const modalNode = (
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayClick}
      role="presentation"
      aria-hidden={false}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        WebkitOverflowScrolling: "touch",
        padding: "1.25rem",
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal={true}
        aria-label={ariaLabel ?? "Modal dialog"}
        tabIndex={-1}
        onMouseDown={stopContentClick}
        onClick={stopContentClick}
        style={{
          maxWidth: 960,
          width: "100%",
          maxHeight: "100%",
          overflow: "auto",
          background: "var(--bg-panel, #fff)",
          color: "var(--text-primary, #111)",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(2,6,23,0.35)",
          padding: "1rem",
        }}
      >
        {children}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalNode, document.body);
}