"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { tooltipPosition, type ChartTooltipData } from "@/lib/chart-tooltip";

/** The invisible hit geometry stays still while the visible section lifts. */
export function ChartMark({
  data,
  color = "#a77a35",
  group,
  lift = [0, -3],
  hit,
  children,
}: {
  data: ChartTooltipData;
  color?: string;
  group?: string;
  lift?: [number, number];
  hit?: ReactNode;
  children: ReactNode;
}) {
  return (
    <g
      className="chart-mark"
      data-chart-mark={JSON.stringify(data)}
      data-chart-color={color}
      data-chart-group={group}
      tabIndex={0}
      role="img"
      aria-label={[
        data.title,
        data.subtitle,
        ...data.rows.map((r) => `${r.label}: ${r.value}`),
      ]
        .filter(Boolean)
        .join(" · ")}
      style={
        {
          "--chart-lift-x": `${lift[0]}px`,
          "--chart-lift-y": `${lift[1]}px`,
        } as CSSProperties
      }
    >
      <g className="chart-mark-visual" pointerEvents="none">
        {children}
      </g>
      <g
        data-chart-hit="true"
        opacity="0"
        pointerEvents="painted"
        aria-hidden="true"
      >
        {hit ?? children}
      </g>
    </g>
  );
}

export function useChartTooltip(
  svg: RefObject<SVGSVGElement>,
  version: unknown,
) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [content, setContent] = useState<{
    data: ChartTooltipData;
    color: string;
  } | null>(null);
  const place = () => {
    const element = box.current;
    if (!element) return;
    const p = tooltipPosition(
      pointer.current.x,
      pointer.current.y,
      element.offsetWidth,
      element.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    );
    element.style.transform = `translate3d(${Math.round(p.x)}px,${Math.round(p.y)}px,0)`;
  };
  useLayoutEffect(place, [content]);
  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    let active: Element | null = null,
      frame = 0;
    const marks = () =>
      Array.from(root.querySelectorAll<SVGGElement>("[data-chart-mark]"));
    const resetMarks = () => {
      active = null;
      root.removeAttribute("data-chart-hover");
      marks().forEach((mark) => {
        mark.removeAttribute("data-chart-active");
        mark.removeAttribute("aria-describedby");
      });
    };
    const clear = () => {
      if (!active) return;
      resetMarks();
      setContent(null);
    };
    const markAt = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<SVGGElement>("[data-chart-mark]")
        : null;
    const move = (event: PointerEvent) => {
      if (!active) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
        });
    };
    const show = (mark: SVGGElement, x: number, y: number) => {
      pointer.current = { x, y };
      if (active === mark) {
        place();
        return;
      }
      active = mark;
      const group = mark.dataset.chartGroup;
      root.setAttribute("data-chart-hover", "true");
      marks().forEach((item) => {
        if (item === mark || (group && item.dataset.chartGroup === group))
          item.setAttribute("data-chart-active", "true");
        else item.removeAttribute("data-chart-active");
        item.removeAttribute("aria-describedby");
      });
      mark.setAttribute("aria-describedby", id);
      setContent({
        data: JSON.parse(mark.dataset.chartMark!) as ChartTooltipData,
        color: mark.dataset.chartColor || "#a77a35",
      });
    };
    const enter = (event: PointerEvent) => {
      const mark = markAt(event.target);
      if (mark) show(mark, event.clientX, event.clientY);
    };
    const leave = (event: PointerEvent) => {
      const from = markAt(event.target),
        to = markAt(event.relatedTarget);
      if (from && from !== to) clear();
    };
    const focus = (event: FocusEvent) => {
      const mark = markAt(event.target);
      if (mark) {
        const r = mark.getBoundingClientRect();
        show(mark, r.x + r.width / 2, r.y + r.height / 2);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    const click = (event: MouseEvent) => {
      const mark = markAt(event.target);
      if (mark) show(mark, event.clientX, event.clientY);
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) clear();
    };
    const scrolled = () => {
      if (!active) return;
      if (document.activeElement === active) {
        const r = active.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) {
          clear();
          return;
        }
        pointer.current = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      } else if (
        markAt(
          document.elementFromPoint(pointer.current.x, pointer.current.y),
        ) !== active
      ) {
        clear();
        return;
      }
      place();
    };
    root.addEventListener("pointerover", enter);
    root.addEventListener("pointerout", leave);
    root.addEventListener("pointermove", move);
    root.addEventListener("focusin", focus);
    root.addEventListener("focusout", clear);
    root.addEventListener("keydown", key);
    root.addEventListener("click", click);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", clear);
    document.addEventListener("pointerdown", outside);
    setContent(null);
    return () => {
      cancelAnimationFrame(frame);
      resetMarks();
      root.removeEventListener("pointerover", enter);
      root.removeEventListener("pointerout", leave);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("focusin", focus);
      root.removeEventListener("focusout", clear);
      root.removeEventListener("keydown", key);
      root.removeEventListener("click", click);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", clear);
      document.removeEventListener("pointerdown", outside);
    };
  }, [svg, version, id]);
  return (
    content &&
    createPortal(
      <div
        id={id}
        ref={box}
        role="tooltip"
        className="chart-tooltip"
        style={{ "--tooltip-color": content.color } as CSSProperties}
      >
        <div className="chart-tooltip-heading">
          <i aria-hidden="true" />
          <strong>{content.data.title}</strong>
        </div>
        {content.data.subtitle && <p>{content.data.subtitle}</p>}
        <dl>
          {content.data.rows.map((row, i) => (
            <div key={i}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>,
      document.body,
    )
  );
}
