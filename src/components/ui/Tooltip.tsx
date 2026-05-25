'use client';

import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface TooltipProps {
  /** The tooltip text/content shown on hover or focus. */
  label: ReactNode;
  /** A single focusable element (button/link/span) that triggers the tooltip. */
  children: ReactElement;
  placement?: 'top' | 'bottom';
  /**
   * Horizontal anchoring of the bubble relative to the trigger. Use 'start'
   * for triggers near the left viewport edge (e.g. the leftmost nav item) so
   * the bubble doesn't clip off-screen. Defaults to 'center'.
   */
  align?: 'center' | 'start' | 'end';
  /** Hover-intent delay in ms. Keyboard focus always shows immediately. */
  delay?: number;
  className?: string;
}

/**
 * Accessible tooltip. Shows on pointer hover (after a short intent delay) and
 * immediately on keyboard focus; dismisses on blur, mouse-leave, or Escape.
 * The bubble carries role="tooltip" and is wired to the trigger via
 * aria-describedby so screen readers announce it. Styling + transitions live
 * in globals.css (.tip / .tip-bubble); honors prefers-reduced-motion there.
 */
export function Tooltip({
  label,
  children,
  placement = 'top',
  align = 'center',
  delay = 350,
  className,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const show = (immediate = false) => {
    clear();
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': open ? id : undefined,
      })
    : children;

  return (
    <span
      className={className ? `tip ${className}` : 'tip'}
      data-open={open ? 'true' : 'false'}
      onMouseEnter={() => show()}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className="tip-bubble"
        data-placement={placement}
        data-align={align}
        aria-hidden={!open}
      >
        {label}
      </span>
    </span>
  );
}

export default Tooltip;
