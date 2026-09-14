import { cloneElement, useId, useState, type ReactElement } from 'react';

type TooltipProps = {
  content: string;
  /** A focusable element; the tooltip becomes its description. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
};

/** Supplementary hint on hover and keyboard focus. Never the only place an action is explained. */
export function Tooltip({ content, children }: TooltipProps): React.JSX.Element {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="ui-tooltip-anchor"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setVisible(false);
      }}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span role="tooltip" id={id} className="ui-tooltip" data-visible={visible}>
        {content}
      </span>
    </span>
  );
}
